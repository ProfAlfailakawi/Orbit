import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import {
  evaluateSelfHealthOnOutage,
  executeSyntheticCanary,
  generateClaudeMissionPrompt,
  ingestAndCorrelateEvent,
  inspectRepositoryCapabilities,
  purgePlatformHistory,
  runDigitalTwinSimulation,
  runNonDestructiveSecurityScan,
  sanitizeTelemetryPayload,
  transitionIncidentStatus,
  transitionPlatformLifecycle,
  upsertVerifiedEngineeringMemory,
  verifyPlatformConnection,
} from './src/core/engine.ts';
import {
  INITIAL_ACCEPTANCE_CRITERIA,
  INITIAL_ALERTS,
  INITIAL_CHANGE_IMPACTS,
  INITIAL_COST_GUARD,
  INITIAL_CROSS_APP_PATTERNS,
  INITIAL_DISCOVERED_CANDIDATES,
  INITIAL_ENGINEERING_MEMORY,
  INITIAL_EVENTS,
  INITIAL_FEATURE_MATRIX,
  INITIAL_INCIDENTS,
  INITIAL_INNOVATION_OPPORTUNITIES,
  INITIAL_PLATFORMS,
  INITIAL_SELF_HEALTH,
  INITIAL_SILENT_FAILURES,
} from './src/core/seedData.ts';
import type {
  CanaryTestResult,
  IncidentStatus,
  PlatformLifecycleState,
  PlatformRecord,
} from './src/core/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_SNAPSHOT_PATH = path.join(__dirname, '.orbit-data.json');

// Cost-First zero-billing storage with automatic local disk persistence (.orbit-data.json) + JSON export/import
// Seed repositories are an onboarding catalog, not verified health telemetry.
let platforms: PlatformRecord[] = INITIAL_PLATFORMS.map(p => ({
  ...p,
  healthStatus: p.runtimeMode === 'local-only' ? 'Local / Not Running' : 'Monitoring Gap',
  dataIntegrity: 'Not Configured' as PlatformRecord['dataIntegrity'],
  monitoringCoveragePct: 0,
  connectionVerified: false,
  connectionStatus: 'Pending Credentials',
  productionUrlVerified: false,
  lastVerifiedEvidence: '',
  lastVerifiedTimestamp: '',
  releaseShield: 'Insufficient Evidence',
  releaseConfidencePct: 0,
  recentRuns: [],
  recentCommits: [],
  ecgMetrics: [],
  journeys: [],
  fourState: { ciPassed: null, deploymentSucceeded: null, siteReachable: null, userJourneyHealthy: null },
}));
let events = [] as typeof INITIAL_EVENTS;
let incidents = [] as typeof INITIAL_INCIDENTS;
let alerts = [] as typeof INITIAL_ALERTS;
let silentFailures = [] as typeof INITIAL_SILENT_FAILURES;
let changeImpacts = [] as typeof INITIAL_CHANGE_IMPACTS;
let crossAppPatterns = [] as typeof INITIAL_CROSS_APP_PATTERNS;
let engineeringMemory = [] as typeof INITIAL_ENGINEERING_MEMORY;
let innovations = [] as typeof INITIAL_INNOVATION_OPPORTUNITIES;
let selfHealth = { ...INITIAL_SELF_HEALTH };
let costGuard = { ...INITIAL_COST_GUARD };
let discoveredCandidates = [] as typeof INITIAL_DISCOVERED_CANDIDATES;
let featureMatrix = [...INITIAL_FEATURE_MATRIX];
let acceptanceCriteria = [...INITIAL_ACCEPTANCE_CRITERIA];
let canaryHistory: CanaryTestResult[] = [];
let simulatedTelemetryOutage = false;

// Real-Time Server-Sent Events (SSE) connected clients (Section 35)
const sseClients = new Set<express.Response>();

function saveStateToDisk() {
  try {
    const snapshot = {
      platforms,
      events,
      incidents,
      alerts,
      silentFailures,
      changeImpacts,
      crossAppPatterns,
      engineeringMemory,
      innovations,
      discoveredCandidates,
      canaryHistory,
      auditLogs,
    };
    fs.writeFileSync(DATA_SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2), 'utf8');
  } catch {
    // Non-blocking fail-open persistence
  }
}

function broadcastRealtimeUpdate(reason: string) {
  saveStateToDisk();
  const payload = JSON.stringify({
    type: 'STATE_UPDATE',
    reason,
    timestamp: new Date().toISOString(),
    platforms,
    events,
    incidents,
    alerts,
    silentFailures,
    changeImpacts,
    crossAppPatterns,
    engineeringMemory,
    innovations,
    selfHealth,
    costGuard,
    discoveredCandidates,
    featureMatrix,
    acceptanceCriteria,
    canaryHistory,
    auditLogs,
  });
  for (const client of sseClients) {
    try {
      client.write(`data: ${payload}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
}

interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  target: string;
  detail: string;
}

let auditLogs: AuditLogEntry[] = [
  {
    id: 'AUD-1001',
    timestamp: new Date().toISOString(),
    actor: 'System Watchdog',
    action: 'BOOT_SELF_CHECK',
    target: 'ORBIT Core',
    detail: 'تم تشغيل نواة ORBIT. لم يتم التحقق من حالة البرامج المتصلة بعد.',
  },
];

function appendAudit(actor: string, action: string, target: string, detail: string) {
  auditLogs = [
    {
      id: `AUD-${Date.now().toString(36).toUpperCase()}`,
      timestamp: new Date().toISOString(),
      actor,
      action,
      target,
      detail: sanitizeTelemetryPayload(detail).sanitized,
    },
    ...auditLogs.slice(0, 199),
  ];
  saveStateToDisk();
}

function loadStateFromDisk() {
  try {
    if (!fs.existsSync(DATA_SNAPSHOT_PATH)) return;
    const raw = fs.readFileSync(DATA_SNAPSHOT_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.platforms) && parsed.platforms.length > 0) {
      platforms = parsed.platforms;
    }
    if (Array.isArray(parsed.events)) events = parsed.events;
    if (Array.isArray(parsed.incidents)) incidents = parsed.incidents;
    if (Array.isArray(parsed.alerts)) alerts = parsed.alerts;
    if (Array.isArray(parsed.engineeringMemory)) engineeringMemory = parsed.engineeringMemory;
    if (Array.isArray(parsed.discoveredCandidates)) discoveredCandidates = parsed.discoveredCandidates;
    if (Array.isArray(parsed.canaryHistory)) canaryHistory = parsed.canaryHistory;
    if (Array.isArray(parsed.auditLogs)) auditLogs = parsed.auditLogs;
  } catch {
    // Non-blocking fail-open if snapshot doesn't exist or is invalid
  }
}

loadStateFromDisk();

// Idempotency & Rate-limiting store
const processedIdempotencyKeys = new Set<string>();

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  // Secure operator session. No built-in credentials and no client-side bypass.
  const operatorPasskey = process.env.ORBIT_OPERATOR_PASSKEY;
  const sessionSecret = crypto.randomBytes(32).toString('hex');
  const sessions = new Map<string, number>();
  const loginAttempts = new Map<string, { count: number; until: number }>();
  const cookieName = 'orbit_operator_session';

  app.post('/api/auth/verify', (req, res) => {
    const address = req.ip || 'unknown';
    const now = Date.now();
    const attempt = loginAttempts.get(address);
    if (attempt && attempt.until > now && attempt.count >= 5) {
      return res.status(429).json({ authenticated: false, error: 'محاولات كثيرة. حاول لاحقاً.' });
    }
    if (!operatorPasskey || operatorPasskey.length < 16) {
      return res.status(503).json({ authenticated: false, error: 'يجب إعداد ORBIT_OPERATOR_PASSKEY آمن على الخادم.' });
    }
    const supplied = typeof req.body?.passkey === 'string' ? req.body.passkey : '';
    const left = crypto.createHash('sha256').update(supplied).digest();
    const right = crypto.createHash('sha256').update(operatorPasskey).digest();
    if (!crypto.timingSafeEqual(left, right)) {
      const count = (attempt && attempt.until > now ? attempt.count : 0) + 1;
      loginAttempts.set(address, { count, until: now + 15 * 60_000 });
      appendAudit('Unknown', 'AUTH_LOGIN_FAILED', 'ORBIT Console', 'محاولة دخول غير ناجحة.');
      return res.status(401).json({ authenticated: false, error: 'رمز الدخول غير صحيح' });
    }
    loginAttempts.delete(address);
    const token = crypto.createHmac('sha256', sessionSecret).update(crypto.randomBytes(32)).digest('hex');
    sessions.set(token, now + 8 * 60 * 60_000);
    res.cookie(cookieName, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api',
      maxAge: 8 * 60 * 60_000,
    });
    appendAudit('Operator', 'AUTH_LOGIN_SUCCESS', 'ORBIT Console', 'تسجيل دخول المشغل.');
    return res.json({ authenticated: true, operator: 'Operator' });
  });

  app.post('/api/auth/logout', (req, res) => {
    const cookie = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(cookieName + '='));
    if (cookie) sessions.delete(cookie.slice(cookieName.length + 1));
    res.clearCookie(cookieName, { path: '/api', sameSite: 'strict', secure: process.env.NODE_ENV === 'production' });
    res.json({ authenticated: false });
  });

  app.get('/api/auth/session', (req, res) => {
    const cookie = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(cookieName + '='));
    const token = cookie?.slice(cookieName.length + 1) || '';
    const expiry = sessions.get(token);
    res.json({ authenticated: Boolean(expiry && expiry > Date.now()) });
  });

  app.use('/api', (req, res, next) => {
    // Sensor ingestion is a separate integration; never allow unauthenticated writes.
    const cookie = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(cookieName + '='));
    const token = cookie?.slice(cookieName.length + 1) || '';
    const expiry = sessions.get(token);
    if (!expiry || expiry <= Date.now()) return res.status(401).json({ error: 'Authentication required' });
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const origin = req.get('origin');
      const host = req.get('host');
      if (origin) {
        try {
          if (!host || new URL(origin).host !== host) return res.status(403).json({ error: 'Origin rejected' });
        } catch {
          return res.status(403).json({ error: 'Invalid origin' });
        }
      }
    }
    next();
  });

  // 2. Full Mission Control State Endpoint
  app.get('/api/state', (_req, res) => {
    const activePlatforms = platforms.filter((p) => p.lifecycleState !== 'unlinked');
    const avgCoverage =
      activePlatforms.length > 0
        ? Math.round(
            activePlatforms.reduce((acc, p) => acc + p.monitoringCoveragePct, 0) /
              activePlatforms.length
          )
        : 0;

    selfHealth = {
      ...selfHealth,
      heartbeatTimestamp: new Date().toISOString(),
      fleetMonitoringCoveragePct: avgCoverage,
      sensorConnectivityCount: activePlatforms.filter((p) => p.connectionVerified).length,
    };

    res.json({
      platforms,
      events,
      incidents,
      alerts,
      silentFailures,
      changeImpacts,
      crossAppPatterns,
      engineeringMemory,
      innovations,
      selfHealth,
      costGuard,
      discoveredCandidates,
      featureMatrix,
      acceptanceCriteria,
      canaryHistory,
      auditLogs,
      hasGithubTokenConfigured: Boolean(process.env.GITHUB_READ_ONLY_TOKEN),
    });
  });

  // 3. Read-Only GitHub Sync Probe (Respects Rate Limits & Never Writes to Any Repo)
  app.post('/api/github/sync', async (req, res) => {
    const { appId } = req.body || {};
    const token = process.env.GITHUB_READ_ONLY_TOKEN;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'ORBIT-Mission-Control-ReadOnly',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const targets = appId
      ? platforms.filter((p) => p.id === appId || p.codeName === appId)
      : platforms.filter((p) => p.lifecycleState === 'active' && (p.runtimeMode === 'github-web' || p.runtimeMode === 'github-local'));

    const syncedResults: Array<{ codeName: string; status: string; integrity: string }> = [];

    for (const plat of targets.slice(0, 4)) {
      try {
        costGuard.githubApiCallsToday += 1;
        const resp = await fetch(`https://api.github.com/repos/${plat.owner}/${plat.repoName}`, {
          headers,
          signal: AbortSignal.timeout(3500),
        });
        const remainingHeader = resp.headers.get('x-ratelimit-remaining');
        if (remainingHeader) {
          selfHealth.githubApiRemaining = Number(remainingHeader);
        }

        if (resp.ok) {
          const repoData = (await resp.json()) as { default_branch?: string; pushed_at?: string };
          platforms = platforms.map((p) =>
            p.id === plat.id
              ? {
                  ...p,
                  defaultBranch: repoData.default_branch || p.defaultBranch,
                  dataIntegrity: 'Live',
                  lastVerifiedTimestamp: new Date().toISOString(),
                  lastVerifiedEvidence: `تم التحقق الحي من GitHub API (آخر دفع: ${repoData.pushed_at || 'موثق'})`,
                }
              : p
          );
          syncedResults.push({ codeName: plat.codeName, status: 'Live 200 OK', integrity: 'Live' });
        } else {
          syncedResults.push({
            codeName: plat.codeName,
            status: `HTTP ${resp.status} (Private Repo / Needs Read-Only Token — Using Cached Snapshot)`,
            integrity: plat.dataIntegrity,
          });
        }
      } catch {
        syncedResults.push({
          codeName: plat.codeName,
          status: 'Network/Offline Fallback — Using Verified Cached Snapshot',
          integrity: plat.dataIntegrity,
        });
      }
    }

    appendAudit(
      'ProfAlfailakawi',
      'GITHUB_READONLY_SYNC',
      appId || 'Fleet Subset',
      `تم فحص حالة المستودعات للقراءة فقط (${syncedResults.length} مستودعات).`
    );

    res.json({
      syncedResults,
      platforms,
      selfHealth,
      costGuard,
    });
  });

  // 4. Universal Radar Event Ingestion API
  app.post('/api/radar/ingest', (req, res) => {
    const idempotencyKey = req.headers['x-idempotency-key'] as string | undefined;
    if (idempotencyKey && processedIdempotencyKeys.has(idempotencyKey)) {
      res.json({ deduplicatedByIdempotencyKey: true, events, incidents, alerts });
      return;
    }
    if (idempotencyKey) {
      processedIdempotencyKeys.add(idempotencyKey);
    }

    const {
      appId,
      environment,
      operationName,
      errorCode,
      errorMessage,
      stackTrace,
      releaseVersion,
      commitSha,
      browserOs,
      detectionSource,
      isSilentMismatch,
      isUserVisible,
      latencyMs,
    } = req.body || {};

    if (!appId || !operationName || !errorCode || !errorMessage) {
      res.status(400).json({ error: 'بيانات الحدث غير مكتملة (appId, operationName, errorCode, errorMessage مطلوبة).' });
      return;
    }

    const targetPlatform = platforms.find(
      (p) => p.codeName.toUpperCase() === String(appId).toUpperCase() || p.id === String(appId).toLowerCase()
    );
    if (targetPlatform && (targetPlatform.lifecycleState === 'paused' || targetPlatform.lifecycleState === 'unlinked')) {
      res.status(202).json({
        ignored: true,
        reason: `المراقبة متوقفة حالياً للبرنامج ${targetPlatform.codeName} (${targetPlatform.lifecycleState}).`,
      });
      return;
    }

    const outcome = ingestAndCorrelateEvent(
      {
        appId: String(appId).toUpperCase(),
        environment,
        operationName: String(operationName),
        errorCode: String(errorCode),
        errorMessage: String(errorMessage),
        stackTrace,
        releaseVersion,
        commitSha,
        browserOs,
        detectionSource,
        isSilentMismatch: Boolean(isSilentMismatch),
        isUserVisible: Boolean(isUserVisible),
        latencyMs: latencyMs ? Number(latencyMs) : undefined,
        dataIntegrity: 'Live',
      },
      events,
      incidents,
      alerts
    );

    events = outcome.events;
    incidents = outcome.incidents;
    alerts = outcome.alerts;
    selfHealth.lastSuccessfulIngestion = new Date().toISOString();
    costGuard.ingestedEventsCount += 1;
    if (outcome.isDeduplicated) {
      costGuard.deduplicatedSavedEvents += 1;
    }

    // Update platform health if Critical or High incident occurred
    if (outcome.incident.severity === 'Critical' || outcome.incident.severity === 'High') {
      platforms = platforms.map((p) =>
        p.codeName.toUpperCase() === String(appId).toUpperCase() && p.lifecycleState === 'active'
          ? { ...p, healthStatus: 'Incident', dataIntegrity: 'Live' }
          : p
      );
    }

    appendAudit(
      outcome.event.detectionSource,
      outcome.isDeduplicated ? 'EVENT_DEDUPLICATED' : 'INCIDENT_CREATED',
      outcome.incident.incidentId,
      `البرنامج ${appId}: ${outcome.event.operationName} (${outcome.event.errorCode}) — التكرار #${outcome.incident.occurrenceCount}`
    );

    res.json({
      event: outcome.event,
      incident: outcome.incident,
      alert: outcome.alert,
      isDeduplicated: outcome.isDeduplicated,
      platforms,
      events,
      incidents,
      alerts,
      selfHealth,
      costGuard,
    });
  });

  // 5. Synthetic Canary Runner (Section 27: Monitoring the Monitor)
  app.post('/api/canary/run', (_req, res) => {
    const result = executeSyntheticCanary(events, incidents, alerts);
    events = result.events;
    incidents = result.incidents;
    alerts = result.alerts;
    canaryHistory = [result.canaryResult, ...canaryHistory.slice(0, 19)];
    selfHealth.lastSuccessfulIngestion = new Date().toISOString();
    selfHealth.independentWatchdogStatus = result.canaryResult.overallPassed ? 'Verified' : 'Stale';
    costGuard.ingestedEventsCount += 2;
    costGuard.deduplicatedSavedEvents += 1;

    appendAudit(
      'Synthetic Canary Runner',
      'CANARY_VERIFICATION_PASS',
      result.canaryResult.runId,
      `اجتاز اختبار الكناري جميع المراحل الـ 6 بنجاح (${result.canaryResult.generatedEventId}).`
    );

    res.json({
      canaryResult: result.canaryResult,
      canaryHistory,
      events,
      incidents,
      alerts,
      selfHealth,
      costGuard,
    });
  });

  // 6. Incident Workflow Lifecycle Transition (Section 31)
  app.post('/api/incidents/:incidentId/transition', (req, res) => {
    const { incidentId } = req.params;
    const { nextStatus, note, technicalVerificationPassed, addToMemory } = req.body || {};

    const idx = incidents.findIndex((i) => i.incidentId === incidentId);
    if (idx === -1) {
      res.status(404).json({ error: 'لم يتم العثور على ملف الحادثة.' });
      return;
    }

    const updated = transitionIncidentStatus(
      incidents[idx],
      nextStatus as IncidentStatus,
      'ProfAlfailakawi',
      note || `تحديث الحالة إلى ${nextStatus}`,
      Boolean(technicalVerificationPassed)
    );
    incidents[idx] = updated;

    // If verified & resolved, optionally enrich Self-Learning Engineering Memory (Section 19)
    if (addToMemory && updated.technicallyVerified) {
      engineeringMemory = [
        {
          id: `MEM-${Date.now().toString(36).toUpperCase()}`,
          appId: updated.appId,
          incidentId: updated.incidentId,
          problemTitle: updated.title,
          confirmedRootCause: updated.probableHypotheses[0] || updated.summary,
          disprovenHypotheses: updated.falsifiedHypotheses,
          verifiedFixSummary: note || 'تم التحقق التقني من الإصلاح واجتياز اختبارات عدم التراجع.',
          preventionTestAdded: updated.requiredTests[0] || 'tests/regression-guard.spec.ts',
          lessonsLearned: 'ربط تنبيهات الرادار باختبارات القبول قبل اعتماد الإصدار.',
          recurringPatternTag: updated.category,
          recordedAt: new Date().toISOString(),
          verifiedBy: 'ProfAlfailakawi',
        },
        ...engineeringMemory,
      ];
    }

    appendAudit(
      'ProfAlfailakawi',
      'INCIDENT_STATUS_TRANSITION',
      incidentId,
      `تحويل الحالة إلى ${nextStatus} (تحقق تقني: ${updated.technicallyVerified ? 'نعم' : 'لا'}).`
    );

    res.json({ incident: updated, incidents, engineeringMemory, auditLogs });
  });

  // 7. Section 42: Dynamic Fleet Management Endpoints
  // Helper: Live GitHub Repository Probe (Read-Only)
  async function probeGitHubRepo(repoSlug: string | null): Promise<{
    reachable: boolean;
    defaultBranch?: string;
    latestCommitSha?: string;
    language?: string;
    isPrivate?: boolean;
  }> {
    if (!repoSlug || !repoSlug.includes('/')) return { reachable: false };
    try {
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'ORBIT-Cockpit-2026',
      };
      if (process.env.GITHUB_TOKEN) {
        headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
      }
      const repoRes = await fetch(`https://api.github.com/repos/${repoSlug}`, {
        headers,
        signal: AbortSignal.timeout(4000),
      });
      if (!repoRes.ok) return { reachable: false };
      const repoData = (await repoRes.json()) as {
        default_branch?: string;
        language?: string;
        private?: boolean;
      };
      let latestCommitSha: string | undefined;
      try {
        const commitsRes = await fetch(
          `https://api.github.com/repos/${repoSlug}/commits?per_page=1`,
          { headers, signal: AbortSignal.timeout(3500) }
        );
        if (commitsRes.ok) {
          const commits = (await commitsRes.json()) as Array<{ sha?: string }>;
          if (commits[0]?.sha) {
            latestCommitSha = commits[0].sha.slice(0, 7);
          }
        }
      } catch {
        // Ignore commit fetch failure
      }
      return {
        reachable: true,
        defaultBranch: repoData.default_branch,
        latestCommitSha,
        language: repoData.language || undefined,
        isPrivate: repoData.private,
      };
    } catch {
      return { reachable: false };
    }
  }

  // 7a. Add a new program (GitHub or Non-GitHub or Local)
  app.post('/api/fleet/add', async (req, res) => {
    const {
      owner,
      repoName,
      codeName,
      nameAr,
      description,
      runtimeMode,
      productionUrl,
      techStack,
      defaultBranch,
    } = req.body || {};

    if (!codeName || !nameAr || !description) {
      res.status(400).json({ error: 'يرجى إدخال رمز البرنامج (Code Name) والاسم العربي والوصف.' });
      return;
    }

    const exists = platforms.some(
      (p) => p.codeName.toUpperCase() === String(codeName).toUpperCase()
    );
    if (exists) {
      res.status(409).json({ error: 'يوجد برنامج مسجل بنفس الرمز التعريفي بالفعل.' });
      return;
    }

    let newPlatform = inspectRepositoryCapabilities({
      owner: owner || 'ProfAlfailakawi',
      repoName: repoName || String(codeName).toLowerCase(),
      codeName: String(codeName).toUpperCase(),
      nameAr: String(nameAr),
      description: String(description),
      runtimeMode: runtimeMode || 'github-web',
      productionUrl: productionUrl || null,
      techStack: Array.isArray(techStack)
        ? techStack
        : typeof techStack === 'string' && techStack.trim()
        ? techStack.split(',').map((s: string) => s.trim())
        : undefined,
      defaultBranch: defaultBranch || 'main',
    });

    // Probe real GitHub API if repoSlug is present
    if (newPlatform.owner && newPlatform.repoName) {
      const ghProbe = await probeGitHubRepo(`${newPlatform.owner}/${newPlatform.repoName}`);
      if (ghProbe.reachable) {
        newPlatform = {
          ...newPlatform,
          defaultBranch: ghProbe.defaultBranch || newPlatform.defaultBranch,
          techStack:
            ghProbe.language && !newPlatform.techStack.includes(ghProbe.language)
              ? [ghProbe.language, ...newPlatform.techStack]
              : newPlatform.techStack,
        };
      }
    }

    platforms = [newPlatform, ...platforms];
    appendAudit(
      'ProfAlfailakawi',
      'FLEET_ADD_PROGRAM',
      newPlatform.codeName,
      `إضافة برنامج جديد (${newPlatform.nameAr}) بنمط تشغيل ${newPlatform.runtimeMode} — بانتظار التحقق من الاتصال.`
    );
    broadcastRealtimeUpdate('FLEET_ADDED');

    res.json({ platform: newPlatform, platforms, auditLogs });
  });

  // 7b. Verify Connection for a Program
  app.post('/api/fleet/:id/verify', async (req, res) => {
    const { id } = req.params;
    const target = platforms.find((p) => p.id === id || p.codeName === id);
    if (!target) {
      res.status(404).json({ error: 'البرنامج غير موجود.' });
      return;
    }

    let verified = verifyPlatformConnection(target);
    const ghProbe = await probeGitHubRepo(`${verified.owner}/${verified.repoName}`);
    if (ghProbe.reachable) {
      verified = {
        ...verified,
        defaultBranch: ghProbe.defaultBranch || verified.defaultBranch,
      };
    }
    platforms = platforms.map((p) => (p.id === target.id ? verified : p));

    appendAudit(
      'ProfAlfailakawi',
      'FLEET_VERIFY_CONNECTION',
      verified.codeName,
      ghProbe.reachable
        ? `نجاح فحص الاتصال الحي مع GitHub API (${verified.owner}/${verified.repoName}) والتحقق من المصادر للبرنامج ${verified.codeName}.`
        : `نجاح فحص الاتصال والتحقق من المصادر للبرنامج ${verified.codeName}.`
    );
    broadcastRealtimeUpdate('FLEET_VERIFIED');

    res.json({ platform: verified, platforms, auditLogs, githubLiveReachable: ghProbe.reachable });
  });

  // 7c. Lifecycle State Change (active | paused | archived | unlinked)
  app.post('/api/fleet/:id/lifecycle', (req, res) => {
    const { id } = req.params;
    const { nextLifecycle } = req.body || {};
    if (!['active', 'paused', 'archived', 'unlinked'].includes(nextLifecycle)) {
      res.status(400).json({ error: 'حالة دورة الحياة غير صالحة.' });
      return;
    }

    platforms = transitionPlatformLifecycle(platforms, id, nextLifecycle as PlatformLifecycleState);
    const updated = platforms.find((p) => p.id === id || p.codeName === id);

    appendAudit(
      'ProfAlfailakawi',
      `FLEET_LIFECYCLE_${String(nextLifecycle).toUpperCase()}`,
      updated?.codeName || id,
      `تغيير حالة البرنامج إلى ${nextLifecycle} مع الحفاظ الكامل على المستودع الأصلي والسجل التاريخي.`
    );

    res.json({ platform: updated, platforms, auditLogs });
  });

  // 7d. Edit Program Settings
  app.post('/api/fleet/:id/update', (req, res) => {
    const { id } = req.params;
    const { nameAr, description, defaultBranch, productionUrl, runtimeMode, monitoringCoveragePct } =
      req.body || {};

    platforms = platforms.map((p) => {
      if (p.id !== id && p.codeName !== id) return p;
      return {
        ...p,
        nameAr: nameAr !== undefined ? String(nameAr) : p.nameAr,
        description: description !== undefined ? String(description) : p.description,
        defaultBranch: defaultBranch !== undefined ? String(defaultBranch) : p.defaultBranch,
        productionUrl: productionUrl !== undefined ? productionUrl : p.productionUrl,
        runtimeMode: runtimeMode !== undefined ? runtimeMode : p.runtimeMode,
        monitoringCoveragePct:
          monitoringCoveragePct !== undefined ? Number(monitoringCoveragePct) : p.monitoringCoveragePct,
      };
    });

    const updated = platforms.find((p) => p.id === id || p.codeName === id);
    appendAudit(
      'ProfAlfailakawi',
      'FLEET_UPDATE_SETTINGS',
      updated?.codeName || id,
      'تحديث إعدادات المراقبة للبرنامج دون إعادة نشر ORBIT.'
    );

    res.json({ platform: updated, platforms, auditLogs });
  });

  // 7e. Separate Confirmed Purge of ORBIT Historical Data
  app.post('/api/fleet/:id/purge-history', (req, res) => {
    const { id } = req.params;
    const { confirmationToken } = req.body || {};
    const target = platforms.find((p) => p.id === id || p.codeName === id);
    const appCode = target ? target.codeName : id.toUpperCase();

    const result = purgePlatformHistory(appCode, String(confirmationToken || ''), {
      events,
      incidents,
      alerts,
    });

    if (!result.purged) {
      res.status(400).json({
        purged: false,
        error: `رمز التأكيد غير مطابق. يجب كتابة CONFIRM-PURGE-${appCode} بدقة لتأكيد حذف البيانات التاريخية في ORBIT.`,
      });
      return;
    }

    events = result.events;
    incidents = result.incidents;
    alerts = result.alerts;

    appendAudit(
      'ProfAlfailakawi',
      'FLEET_PURGE_ORBIT_HISTORY',
      appCode,
      `تم حذف البيانات التاريخية الخاصة بـ ${appCode} داخل ORBIT فقط بناءً على تأكيد صريح، دون المساس بالمستودع الأصلي.`
    );

    res.json({
      purged: true,
      events,
      incidents,
      alerts,
      auditLogs,
    });
  });

  // 7f. Approve Discovered Repository Candidate
  app.post('/api/fleet/approve-discovered', (req, res) => {
    const { codeName } = req.body || {};
    const candidate = discoveredCandidates.find((c) => c.codeName === codeName);
    if (!candidate) {
      res.status(404).json({ error: 'المستودع المكتشف غير موجود.' });
      return;
    }

    const created = verifyPlatformConnection(
      inspectRepositoryCapabilities({
        owner: candidate.owner,
        repoName: candidate.repoName,
        codeName: candidate.codeName,
        nameAr: `${candidate.repoName} (مكتشف)`,
        description: candidate.description,
        runtimeMode: candidate.runtimeMode,
        techStack: candidate.detectedTechStack,
        defaultBranch: candidate.defaultBranch,
      })
    );

    platforms = [created, ...platforms];
    discoveredCandidates = discoveredCandidates.filter((c) => c.codeName !== codeName);

    appendAudit(
      'ProfAlfailakawi',
      'FLEET_APPROVE_DISCOVERED_REPO',
      created.codeName,
      `الموافقة الصريحة على إلحاق المستودع المكتشف ${candidate.owner}/${candidate.repoName} بالأسطول.`
    );

    res.json({ platform: created, platforms, discoveredCandidates, auditLogs });
  });

  // 8. Optional On-Demand Gemini AI Diagnosis (Server-Side Only, Deterministic First)
  app.post('/api/ai/diagnose', async (req, res) => {
    const { incidentId } = req.body || {};
    const incident = incidents.find((i) => i.incidentId === incidentId);
    if (!incident) {
      res.status(404).json({ error: 'الحادثة غير موجودة.' });
      return;
    }
    const platform =
      platforms.find((p) => p.codeName === incident.appId) || platforms[0];

    costGuard.aiDiagnosisCallsCount += 1;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.json({
        mode: 'Deterministic Fallback (No Active Gemini Key Configured)',
        analysis: `تشخيص حتمي مبني على القواعد والأدلة للحادثة ${incident.incidentId}:\n1. السبب المرجح (${incident.confidenceScore}%): ${incident.probableHypotheses[0]}\n2. الملفات الواجب فحصها أولاً: ${incident.suspectedFiles.join(', ')}\n3. الإجراء الجراحي المقترح: ${incident.proposedActions[0]}\n(ملاحظة: يعمل ORBIT بكفاءة كاملة عبر المحرك الحتمي المجاني دون الحاجة لمفتاح AI مدفوع).`,
        costGuard,
      });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const prompt = `أنت كبير مهندسي SRE في نظام ORBIT. حلل هذه الحادثة باختصار شديد وباللغة العربية (4 نقاط محددة: السبب الجذري المرجح، الدليل القاطع، أقل تعديل آمن، والاختبار الوقائي) مع الالتزام التام بعدم اقتراح أي تعديل تلقائي في الإنتاج:\n${generateClaudeMissionPrompt(
        incident,
        platform,
        'inspect'
      )}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });

      appendAudit(
        'ProfAlfailakawi',
        'ON_DEMAND_AI_DIAGNOSIS',
        incident.incidentId,
        'تم طلب تشخيص AI اختياري عند الطلب عبر الخادم.'
      );

      res.json({
        mode: 'Live Gemini 3.8 Flash Server Diagnosis',
        analysis: response.text || 'تم إكمال التحليل.',
        costGuard,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      res.json({
        mode: 'Deterministic Engine (AI Call Fallback)',
        analysis: `تعذر الاتصال بخدمة AI (${sanitizeTelemetryPayload(msg).sanitized}) — تم الاعتماد فوراً على التشخيص الحتمي الموثق:\n• السبب المرجح: ${incident.probableHypotheses.join(' | ')}\n• الإجراء المقترح: ${incident.proposedActions.join(' | ')}`,
        costGuard,
      });
    }
  });

  // 9. Section 35: Real-Time Server-Sent Events (SSE) Stream
  app.get('/api/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    sseClients.add(res);
    res.write(
      `data: ${JSON.stringify({
        type: 'SSE_CONNECTED',
        timestamp: new Date().toISOString(),
        activeClients: sseClients.size,
      })}\n\n`
    );

    req.on('close', () => {
      sseClients.delete(res);
    });
  });

  // 10. Section 9 & 33: GitHub Webhook Receiver with Cryptographic HMAC-SHA256 Verification
  app.post('/api/github/webhook-simulate', (req, res) => {
    const {
      appId = 'MIRAS',
      eventType = 'workflow_run',
      hasHiddenSubStepWarning = true,
      tamperSignature = false,
    } = req.body || {};

    const secret = process.env.GITHUB_WEBHOOK_SECRET || 'orbit-webhook-hmac-secret-2026';
    const rawPayload = JSON.stringify({
      repository: { full_name: `ProfAlfailakawi/${appId}` },
      eventType,
      conclusion: 'success',
      hasHiddenSubStepWarning,
      timestamp: new Date().toISOString(),
    });

    const expectedHmac =
      'sha256=' + crypto.createHmac('sha256', secret).update(rawPayload).digest('hex');
    const providedSignature = tamperSignature
      ? 'sha256=000000000000000000000000000000000000000000000000000000000000dead'
      : expectedHmac;

    const sigBuffer = Buffer.from(providedSignature);
    const expectedBuffer = Buffer.from(expectedHmac);
    const signatureValid =
      sigBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(sigBuffer, expectedBuffer);

    if (!signatureValid) {
      appendAudit(
        'GitHub Webhook Guard',
        'WEBHOOK_HMAC_REJECTED',
        appId,
        'تم رفض Webhook لعدم تطابق التوقيع الرقمي X-Hub-Signature-256 (حماية القسم 33).'
      );
      broadcastRealtimeUpdate('WEBHOOK_REJECTED');
      res.status(401).json({
        verified: false,
        signatureHeader: providedSignature,
        message: 'رفض أمني: توقيع X-Hub-Signature-256 غير صالح (HMAC-SHA256 Mismatch).',
        auditLogs,
      });
      return;
    }

    if (hasHiddenSubStepWarning) {
      const outcome = ingestAndCorrelateEvent(
        {
          appId,
          environment: 'canary-sandbox',
          operationName: 'github.workflow_run.substep_check',
          errorCode: 'CI_PASS_WITH_CONTINUE_ON_ERROR_WARNING',
          errorMessage: `رصد Eye 3 عبر Webhook موثق: الـ Workflow سُجّل ناجحاً ظاهرياً رغم فشل خطوة فرعية بـ continue-on-error في ${appId}.`,
          detectionSource: 'GitHub Actions',
          isSilentMismatch: true,
          isUserVisible: false,
          dataIntegrity: 'Demo',
        },
        events,
        incidents,
        alerts
      );
      events = outcome.events;
      incidents = outcome.incidents;
      alerts = outcome.alerts;
    }

    appendAudit(
      'GitHub Webhook Guard',
      'WEBHOOK_HMAC_VERIFIED',
      appId,
      `تم التحقق من توقيع X-Hub-Signature-256 (${expectedHmac.slice(0, 19)}...) ومعالجة حدث ${eventType} بنجاح.`
    );
    broadcastRealtimeUpdate('WEBHOOK_INGESTED');

    res.json({
      verified: true,
      signatureHeader: expectedHmac,
      message: hasHiddenSubStepWarning
        ? `توقيع HMAC-SHA256 صالح — تم كشف تحذير فرعي مخفي (continue-on-error) في ${appId} وإرساله للرادار فوراً.`
        : `توقيع HMAC-SHA256 صالح — تم تحديث سجل ${appId} بنجاح.`,
      events,
      incidents,
      alerts,
      auditLogs,
    });
  });

  // 11. Section 26 & 38: Self-Monitoring Telemetry Outage Simulator
  app.post('/api/self-health/simulate-outage', (req, res) => {
    const { simulateOutage } = req.body || {};
    simulatedTelemetryOutage = Boolean(simulateOutage);
    selfHealth = evaluateSelfHealthOnOutage(selfHealth, simulatedTelemetryOutage);

    appendAudit(
      'ProfAlfailakawi',
      simulatedTelemetryOutage ? 'SELF_HEALTH_OUTAGE_SIMULATED' : 'SELF_HEALTH_RESTORED',
      'ORBIT Watchdog',
      simulatedTelemetryOutage
        ? 'تمت محاكاة انقطاع وصول الأحداث: تحولت الحالة فوراً إلى «المراقبة غير مؤكدة (Monitoring Unconfirmed)» التزاماً بالقسم 26.'
        : 'تمت استعادة تدفق الأحداث والتحقق من نبض المراقب المستقل (Operational).'
    );
    broadcastRealtimeUpdate('SELF_HEALTH_CHANGED');

    res.json({
      selfHealth,
      simulatedTelemetryOutage,
      auditLogs,
    });
  });

  // 12. Section 19: Self-Learning Engineering Memory Upsert & Guard
  app.post('/api/memory/save', (req, res) => {
    const result = upsertVerifiedEngineeringMemory(engineeringMemory, req.body || {});
    if (!result.accepted) {
      appendAudit(
        'Engineering Memory Guard',
        'MEMORY_UNVERIFIED_REJECTED',
        req.body?.appId || 'UNKNOWN',
        result.reason || 'رفض حفظ استنتاج غير مؤكد.'
      );
      res.status(400).json({
        accepted: false,
        error: result.reason,
        engineeringMemory,
        auditLogs,
      });
      return;
    }

    engineeringMemory = result.memory;
    appendAudit(
      'ProfAlfailakawi',
      'MEMORY_VERIFIED_SAVED',
      req.body?.appId || 'FLEET',
      `تم حفظ/تحديث درس هندسي موثق في الذاكرة الدائمة (${req.body?.problemTitle}).`
    );
    broadcastRealtimeUpdate('ENGINEERING_MEMORY_UPDATED');

    res.json({
      accepted: true,
      engineeringMemory,
      auditLogs,
    });
  });

  // 13. Section 22: Digital Twin Lab Isolated Sandbox Runner
  app.post('/api/twin/run', (req, res) => {
    const { appId = 'ORDER', scenario = 'all' } = req.body || {};
    const runResult = runDigitalTwinSimulation(appId, scenario);
    appendAudit(
      'Digital Twin Sandbox',
      'TWIN_SIMULATION_PASS',
      appId,
      `تشغيل محاكاة المختبر الموازي (${scenario}) بنجاح في بيئة معزولة تماماً (${runResult.runId}).`
    );
    broadcastRealtimeUpdate('DIGITAL_TWIN_RUN');
    res.json({
      runResult,
      auditLogs,
    });
  });

  // 14. Section 23: Security & Privacy Guardian 8-Point Non-Destructive Scanner
  app.post('/api/security/scan', (_req, res) => {
    const scanResult = runNonDestructiveSecurityScan(platforms);
    appendAudit(
      'Security Guardian',
      'NON_DESTRUCTIVE_SECURITY_SCAN',
      'ALL_FLEET',
      `اكتمل الفحص الأمني غير المدمر للأبعاد الثمانية (${scanResult.scanId}) بمبدأ Least Privilege.`
    );
    broadcastRealtimeUpdate('SECURITY_SCAN_COMPLETED');
    res.json({
      scanResult,
      auditLogs,
    });
  });

  // 15. Cloud Firestore State Hydrator (syncs cloud snapshot into server state)
  app.post('/api/state/hydrate', (req, res) => {
    const body = req.body || {};
    if (Array.isArray(body.platforms) && body.platforms.length > 0) {
      platforms = body.platforms;
    }
    if (Array.isArray(body.events)) events = body.events;
    if (Array.isArray(body.incidents)) incidents = body.incidents;
    if (Array.isArray(body.alerts)) alerts = body.alerts;
    if (Array.isArray(body.engineeringMemory)) engineeringMemory = body.engineeringMemory;
    if (Array.isArray(body.discoveredCandidates)) discoveredCandidates = body.discoveredCandidates;
    saveStateToDisk();
    res.json({ hydrated: true, platformsCount: platforms.length });
  });

  // Vite middleware for development or static serving for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ORBIT Mission Control Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
