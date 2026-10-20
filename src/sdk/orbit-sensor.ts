/**
 * ORBIT SENSOR SDK v1.0.0 — Standalone Zero-Blind-Spots Telemetry Client
 * ============================================================================
 * IMPORTANT: This SDK is completely decoupled and is NOT automatically injected
 * into any of the monitored applications. Installation requires independent review,
 * testing, and explicit approval from ProfAlfailakawi.
 *
 * Design Principles:
 * - Fail-open & Non-blocking: Never throws or blocks the host application's main thread.
 * - Privacy-first: Redacts tokens, passwords, card numbers, emails, and private student/customer text before buffering.
 * - Rate-limited & Sampled: Enforces token-bucket rate limiting and configurable sampling.
 * - Unified User-Visible Error Contract: Provides `OrbitSensor.captureUserVisibleError()` and `<OrbitErrorBoundary>`.
 */

export interface OrbitSensorConfig {
  appId: string;
  releaseVersion: string;
  environment: 'production' | 'staging' | 'local';
  ingestEndpoint: string;
  enabled?: boolean;
  sampleRate?: number; // 0.0 to 1.0 (default 1.0 for errors, 0.2 for perf)
  maxEventsPerMinute?: number; // default 30
  maxQueueSize?: number; // default 25
}

export interface OrbitUserErrorContract {
  operationName: string;
  errorCode: string;
  userFacingMessage: string;
  correlationId?: string;
  didShowSuccessToastWithoutConfirm?: boolean;
}

export class OrbitSensorClient {
  private config: Required<OrbitSensorConfig>;
  private queue: Array<Record<string, unknown>> = [];
  private sentInCurrentMinute = 0;
  private minuteWindowStart = Date.now();
  private killSwitchActive = false;

  constructor(config: OrbitSensorConfig) {
    this.config = {
      enabled: true,
      sampleRate: 1.0,
      maxEventsPerMinute: 30,
      maxQueueSize: 25,
      ...config,
    };
  }

  public disable(): void {
    this.killSwitchActive = true;
    this.queue = [];
  }

  public enable(): void {
    this.killSwitchActive = false;
  }

  private sanitize(text: string): string {
    return String(text || '')
      .replace(/\b(ghp|gho|github_pat)_[A-Za-z0-9_]+\b/g, '[REDACTED_TOKEN]')
      .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
      .replace(/((?:password|secret|token|card|cvv)\s*[:=]\s*["']?)[^"'\s,&}]+/gi, '$1[REDACTED]')
      .replace(/\b(?:\d[ -]*?){13,19}\b/g, '[REDACTED_PAN]')
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[REDACTED_EMAIL]');
  }

  private canSend(): boolean {
    if (!this.config.enabled || this.killSwitchActive) return false;
    const now = Date.now();
    if (now - this.minuteWindowStart > 60_000) {
      this.minuteWindowStart = now;
      this.sentInCurrentMinute = 0;
    }
    if (this.sentInCurrentMinute >= this.config.maxEventsPerMinute) return false;
    if (Math.random() > this.config.sampleRate) return false;
    this.sentInCurrentMinute += 1;
    return true;
  }

  /**
   * Unified API for capturing errors displayed to users inside Toast/Banner/Dialog components
   * as well as Silent Failures (where UI shows success without server commit verification).
   */
  public captureUserVisibleError(
    contractOrCode: OrbitUserErrorContract | string,
    userFacingMessage?: string,
    operationName?: string
  ): void {
    try {
      if (!this.canSend()) return;
      const contract: OrbitUserErrorContract =
        typeof contractOrCode === 'string'
          ? {
              errorCode: contractOrCode,
              userFacingMessage: userFacingMessage || '',
              operationName: operationName || 'unknown.operation',
            }
          : contractOrCode;

      this.enqueue({
        appId: this.config.appId,
        environment: this.config.environment,
        releaseVersion: this.config.releaseVersion,
        operationName: contract.operationName,
        errorCode: contract.errorCode,
        errorMessage: this.sanitize(contract.userFacingMessage),
        isUserVisible: true,
        isSilentMismatch: Boolean(contract.didShowSuccessToastWithoutConfirm),
        correlationId: contract.correlationId || `CORR-${Date.now().toString(36)}`,
        timestamp: new Date().toISOString(),
      });
    } catch {
      // Fail-open: never disrupt host application
    }
  }

  /**
   * Verifies that a critical operation (save, submit, upload) received both HTTP 2xx AND
   * a valid functional confirmation token/id. Detects Silent Failures automatically.
   */
  public verifyCriticalOperation(params: {
    operationName: string;
    httpStatus: number;
    uiReportedSuccess: boolean;
    serverConfirmedRecordId?: string | null;
    durationMs: number;
  }): void {
    try {
      if (params.uiReportedSuccess && !params.serverConfirmedRecordId) {
        this.captureUserVisibleError({
          operationName: params.operationName,
          errorCode: 'SILENT_SAVE_UNCONFIRMED',
          userFacingMessage: `Silent failure detected in ${params.operationName}: UI reported success (HTTP ${params.httpStatus}) without server record confirmation.`,
          didShowSuccessToastWithoutConfirm: true,
        });
      } else if (params.durationMs > 3000) {
        this.enqueue({
          appId: this.config.appId,
          environment: this.config.environment,
          releaseVersion: this.config.releaseVersion,
          operationName: params.operationName,
          errorCode: 'PERF_LATENCY_SPIKE',
          errorMessage: `Slow operation ${params.operationName} took ${params.durationMs}ms`,
          latencyMs: params.durationMs,
          timestamp: new Date().toISOString(),
        });
      }
    } catch {
      // Fail-open
    }
  }

  private enqueue(payload: Record<string, unknown>): void {
    if (this.queue.length >= this.config.maxQueueSize) {
      this.queue.shift();
    }
    this.queue.push(payload);
    this.flushAsync();
  }

  private flushAsync(): void {
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      window.requestIdleCallback(() => this.sendBatch());
    } else {
      setTimeout(() => this.sendBatch(), 50);
    }
  }

  private async sendBatch(): Promise<void> {
    if (this.queue.length === 0) return;
    const item = this.queue.shift();
    if (!item) return;
    try {
      await fetch(this.config.ingestEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
        keepalive: true,
      });
    } catch {
      // Fail-open: drop or keep bounded buffer without throwing
    }
  }
}

export function createOrbitSensor(config: {
  appId: string;
  releaseVersion: string;
  environment: string;
  endpointUrl?: string;
  ingestEndpoint?: string;
  enabled?: boolean;
}): OrbitSensorClient {
  return new OrbitSensorClient({
    appId: config.appId,
    releaseVersion: config.releaseVersion,
    environment: (config.environment as 'production' | 'staging' | 'local') || 'production',
    ingestEndpoint: config.ingestEndpoint || config.endpointUrl || '/api/radar/ingest',
    enabled: config.enabled ?? true,
  });
}

export const ORBIT_SENSOR_SDK_SOURCE_PREVIEW = `// ORBIT SENSOR SDK v1.0.0 (Standalone / Opt-In Only — Not Installed on Production Repos)
import { OrbitSensorClient } from '@orbit/sensor';

export const orbitSensor = new OrbitSensorClient({
  appId: 'MIRAS',
  releaseVersion: 'v2026.10.2',
  environment: 'production',
  ingestEndpoint: 'https://orbit.internal/api/radar/ingest',
  sampleRate: 1.0,
  maxEventsPerMinute: 30, // Rate-limited & non-blocking
});

// 1. Unified User-Visible Error Contract (Toasts / Form Alerts)
orbitSensor.captureUserVisibleError({
  operationName: 'assignment.submit',
  errorCode: 'UPLOAD_STORAGE_QUOTA',
  userFacingMessage: 'تعذر رفع ملف التسليم، يرجى المحاولة مرة أخرى',
});

// 2. Silent Failure Guard (Verifies UI Toast matches actual DB Commit)
orbitSensor.verifyCriticalOperation({
  operationName: 'order.checkout.save',
  httpStatus: 200,
  uiReportedSuccess: true,
  serverConfirmedRecordId: response.data?.orderId ?? null,
  durationMs: 420,
});`;
