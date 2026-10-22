/**
 * Browser sensor reports: tiny error notes sent by a program's own pages (public/orbit-sensor.js).
 * Reports come from the open internet, so nothing is trusted: parsed defensively, tied to a known program by Origin,
 * rate-limited, and raised as a problem only when several different visitors hit the same error.
 */
import { sanitizeTelemetryPayload } from './engine.ts';
import type { PlatformRecord } from './types.ts';

export interface SensorReport {
  kind: 'error' | 'rejection' | 'resource' | 'request' | 'console';
  message: string; page: string; session: string;
  /** Where it threw (first frames, no query strings) and what the visitor did just before. Only for errors. */
  stack: string[]; steps: string[];
  /** An uncaught error thrown by the program's own code, as opposed to a failing network or third-party script. */
  own: boolean;
}

const KINDS = new Set(['error', 'rejection', 'resource', 'request', 'console']);
export const SENSOR_MAX_BODY = 16_000;
const MAX_BODY = SENSOR_MAX_BODY;
/** Noise every site has: not worth a phone alert. */
const BENIGN = /ResizeObserver loop|^script error\.?$|(?:chrome|moz|safari)-extension:|Non-Error promise rejection/i;

const strip = (value: string) => sanitizeTelemetryPayload(value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/https?:\/\/[^\s)'"]+/g, u => u.split(/[?#]/)[0])).sanitized.trim();

const lines = (value: unknown, count: number, width: number): string[] =>
  Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string').slice(0, count).map(x => strip(x).slice(0, width)).filter(Boolean) : [];

/** Parse the beacon body (text/plain JSON). Returns up to 5 clean reports; garbage returns []. */
export function parseSensorBody(raw: unknown): SensorReport[] {
  if (typeof raw !== 'string' || raw.length > MAX_BODY) return [];
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return []; }
  const list = (data as { r?: unknown })?.r;
  const session = (data as { s?: unknown })?.s;
  if (!Array.isArray(list) || typeof session !== 'string' || !/^[A-Za-z0-9_-]{6,40}$/.test(session)) return [];
  const out: SensorReport[] = [];
  for (const item of list.slice(0, 5)) {
    const r = item as { k?: unknown; m?: unknown; p?: unknown; t?: unknown; b?: unknown; o?: unknown } | null;
    if (!r || typeof r.k !== 'string' || !KINDS.has(r.k) || typeof r.m !== 'string') continue;
    const message = strip(r.m).slice(0, 160);
    if (!message || BENIGN.test(message)) continue;
    let page = '/';
    if (typeof r.p === 'string') { try { page = new URL(r.p, 'https://x.invalid').pathname.slice(0, 80); } catch { /* keep "/" */ } }
    const isError = r.k === 'error' || r.k === 'rejection';
    out.push({
      kind: r.k as SensorReport['kind'], message, page, session,
      stack: isError ? lines(r.t, 4, 110) : [], steps: isError ? lines(r.b, 12, 70) : [],
      own: isError && r.o === 1,
    });
  }
  return out;
}

export function originOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try { const u = new URL(url); return u.protocol === 'https:' ? u.origin : null; } catch { return null; }
}

const KIND_LABEL: Record<SensorReport['kind'], string> = {
  error: 'خطأ برمجي ظهر لزوّار الموقع', rejection: 'عملية داخل الموقع فشلت عند الزوّار', resource: 'ملف لا يُحمَّل عند الزوّار', request: 'طلب من الموقع يفشل عند الزوّار',
  console: 'رسالة خطأ يطلقها الموقع في المتصفح',
};
export interface SensorFinding { text: string; page: string; visitors: number; stack: string[]; steps: string[] }
export const SENSOR_WINDOW_MS = 24 * 3_600_000;
export const SENSOR_CORROBORATION = 2;

/** In-memory hub: counts distinct visitors per error and exposes the corroborated ones. */
export function createSensorHub(now: () => number = Date.now) {
  type Entry = { sessions: Map<string, number>; text: string; page: string; stack: string[]; steps: string[]; own: boolean };
  const seen = new Map<string, Map<string, Entry>>(); // program -> signature -> evidence
  const hits = new Map<string, number[]>(); // rate limit key -> timestamps

  function allow(key: string, limit: number, windowMs: number): boolean {
    const t = now();
    const recent = (hits.get(key) || []).filter(x => t - x < windowMs);
    if (recent.length >= limit) { hits.set(key, recent); return false; }
    recent.push(t); hits.set(key, recent);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(x => t - x < windowMs)) hits.delete(k);
    return true;
  }

  function add(programId: string, reports: SensorReport[]) {
    const t = now();
    const bucket = seen.get(programId) || new Map<string, Entry>();
    seen.set(programId, bucket);
    for (const r of reports) {
      const signature = `${r.kind}|${r.message}`;
      const entry = bucket.get(signature) || { sessions: new Map<string, number>(), text: `${KIND_LABEL[r.kind]}: ${r.message}`, page: r.page, stack: [], steps: [], own: false };
      entry.sessions.set(r.session, t);
      entry.own = entry.own || r.own;
      if (r.stack.length || r.steps.length) { entry.stack = r.stack; entry.steps = r.steps; entry.page = r.page; } // the latest trail wins
      bucket.set(signature, entry);
    }
    if (bucket.size > 60) { // bound memory: drop the oldest evidence
      const oldest = [...bucket.entries()].sort((a, b) => Math.max(...a[1].sessions.values()) - Math.max(...b[1].sessions.values()))[0];
      if (oldest) bucket.delete(oldest[0]);
    }
  }

  /**
   * Findings for a program: an error needs ≥2 different visitors, except an uncaught error thrown by the program's own
   * code, which is a real defect on first sight. At most 4, most visitors first.
   */
  function findings(programId: string): SensorFinding[] {
    const t = now();
    const out: SensorFinding[] = [];
    for (const entry of seen.get(programId)?.values() || []) {
      for (const [s, at] of entry.sessions) if (t - at > SENSOR_WINDOW_MS) entry.sessions.delete(s);
      if (entry.sessions.size >= (entry.own ? 1 : SENSOR_CORROBORATION)) out.push({ text: entry.text, page: entry.page, visitors: entry.sessions.size, stack: entry.stack, steps: entry.steps });
    }
    return out.sort((a, b) => b.visitors - a.visitors).slice(0, 4);
  }

  const problems = (programId: string) => findings(programId).map(describeFinding);
  return { allow, add, findings, problems };
}

export const describeFinding = (f: SensorFinding) => `${f.text} (${f.visitors === 1 ? 'زائر واحد' : f.visitors + ' زائر'})`;

const SENSOR_FRESH_MS = 6 * 3_600_000;

/**
 * Record the hub's findings on the program record. The hub lives in memory and is empty after a restart, so findings from the
 * last few hours that the hub no longer holds are kept rather than erased by the first quiet report.
 */
export function applySensor(p: PlatformRecord, found: SensorFinding[], nowIso: string): PlatformRecord {
  const kept = (p.sensorEvidence || []).filter(old => !found.some(f => f.text === old.text) && p.sensorCheckedAt && Date.parse(nowIso) - Date.parse(p.sensorCheckedAt) < SENSOR_FRESH_MS);
  const all = [...found, ...kept].slice(0, 4);
  if (!all.length && !p.sensorProblems?.length) return p;
  return { ...p, sensorEvidence: all, sensorProblems: all.map(describeFinding), sensorCheckedAt: nowIso };
}

export function freshSensorProblems(p: PlatformRecord, nowMs = Date.now()): string[] {
  return p.sensorProblems?.length && p.sensorCheckedAt && nowMs - Date.parse(p.sensorCheckedAt) < SENSOR_FRESH_MS ? p.sensorProblems : [];
}

/** The trail behind the program's fresh sensor findings, as lines for the report pasted to Claude. */
export function sensorTrailLines(p: PlatformRecord, nowMs = Date.now()): string[] {
  if (!freshSensorProblems(p, nowMs).length) return [];
  const out: string[] = [];
  for (const e of p.sensorEvidence || []) {
    if (!e.stack.length && !e.steps.length) continue;
    out.push(`  - ${e.text} — الصفحة ${e.page}`);
    if (e.steps.length) out.push(`    ما فعله الزائر قبل الخطأ: ${e.steps.join(' ← ')}`);
    if (e.stack.length) out.push(`    موضع الخطأ: ${e.stack.join(' | ')}`);
  }
  return out;
}
