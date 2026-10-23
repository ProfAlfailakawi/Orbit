/**
 * Browser sensor reports: tiny error notes sent by a program's own pages (public/orbit-sensor.js).
 * Reports come from the open internet, so nothing is trusted: parsed defensively, tied to a known program by Origin,
 * rate-limited, and raised as a problem only when several different visitors hit the same error.
 */
import { sanitizeTelemetryPayload } from './engine.ts';
import type { PlatformRecord } from './types.ts';

export interface SensorReport {
  kind: 'error' | 'rejection' | 'resource' | 'request';
  message: string; page: string; session: string;
  /** Where it threw (first frames, no query strings) and what the visitor did just before. Only for errors. */
  stack: string[]; steps: string[];
  /** An uncaught error thrown by the program's own code, as opposed to a failing network or third-party script. */
  own: boolean;
}

// «console» was dropped on purpose: console.error often prints whole objects (user ids, emails). Old copies that still send it are ignored.
const KINDS = new Set(['error', 'rejection', 'resource', 'request']);
export const SENSOR_MAX_BODY = 16_000;
const MAX_BODY = SENSOR_MAX_BODY;
/** Noise every site has: not worth a phone alert. */
const BENIGN = /ResizeObserver loop|^script error\.?$|(?:chrome|moz|safari)-extension:|Non-Error promise rejection/i;

const strip = (value: string) => sanitizeTelemetryPayload(value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/https?:\/\/[^\s)'"]+/g, u => u.split(/[?#]/)[0])).sanitized.trim();

/** A path segment that looks like an identifier: digits, uuid, long token, letters mixed with digits, an email or an encoded value. */
const isIdSegment = (segment: string) =>
  /^\d{2,}$/.test(segment) || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(segment) || /^[A-Za-z0-9_-]{20,}$/.test(segment) || (/^[A-Za-z0-9_-]{12,}$/.test(segment) && !/^[a-z-]+$/.test(segment)) ||
  (/\d/.test(segment) && /[A-Za-z]/.test(segment) && segment.length >= 6) || segment.includes('@') || segment.includes('%');

/**
 * Error messages can quote what a visitor typed or uploaded: emails, long numbers and long tokens are masked, and a quoted value is kept
 * only when it is a plain identifier («reading 'total'»). The browser script does this too; repeating it here covers older copies.
 */
export function scrubText(text: string): string {
  return text
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]')
    .replace(/\+?\d[\d\s().-]{6,}\d/g, '[num]')
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, '[token]')
    .replace(/(["'`])((?:(?!\1).){1,200}?)\1/g, (m, q: string, v: string) => (/^[A-Za-z_$][\w$]{0,30}$/.test(v) ? m : `${q}...${q}`));
}

const FILE_NAME = /\.(m?js|css|html?|map|tsx?|jsx|json|svg|png|webp|woff2?)$/i;
export function redactPathIds(text: string): string {
  return text.replace(/\/[^\s/\u2190?#]+/g, seg => {
    const name = seg.slice(1);
    const core = name.split(/[:)]/)[0]; // «index-abc123.js:10:5)» → the file name, keeping the position after it
    const suffix = name.slice(core.length);
    return isIdSegment(core) && !(FILE_NAME.test(core) && !/[@%]/.test(core)) ? '/:id' + suffix : seg;
  });
}

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
    const cleaned = strip(r.m).slice(0, 160);
    const message = scrubText(redactPathIds(cleaned));
    if (!message || BENIGN.test(message)) continue;
    let page = '/';
    if (typeof r.p === 'string') { try { page = redactPathIds(new URL(r.p, 'https://x.invalid').pathname).slice(0, 80); } catch { /* keep "/" */ } }
    const isError = r.k === 'error' || r.k === 'rejection';
    out.push({
      kind: r.k as SensorReport['kind'], message, page, session,
      stack: isError ? lines(r.t, 4, 110).map(x => scrubText(redactPathIds(x))) : [], steps: isError ? lines(r.b, 12, 70).map(x => scrubText(redactPathIds(x))) : [],
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
};
/** `note`: seen, but too thin to call the program broken (one visitor's own-code error, a few scattered connection failures). `lastAt`: when it was last seen. */
export interface SensorFinding { text: string; page: string; visitors: number; stack: string[]; steps: string[]; lastAt?: string; note?: boolean }
export const SENSOR_WINDOW_MS = 24 * 3_600_000;
export const SENSOR_CORROBORATION = 2;
/** A connection failure on one endpoint is only an outage signal when several visitors hit it close together; scattered ones are tabs closed, phones locked, weak signal. */
export const NETWORK_BURST_VISITORS = 3;
export const NETWORK_BURST_MS = 3_600_000;
const NETWORK_FAILURE = /^\u0641\u0634\u0644 \u0627\u0644\u0627\u062a\u0635\u0627\u0644/;

/** In-memory hub: counts distinct visitors per error and exposes the corroborated ones. */
export function createSensorHub(now: () => number = Date.now) {
  type Entry = { sessions: Map<string, number>; text: string; page: string; stack: string[]; steps: string[]; own: boolean; network: boolean };
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
      const entry = bucket.get(signature) || { sessions: new Map<string, number>(), text: `${KIND_LABEL[r.kind]}: ${r.message}`, page: r.page, stack: [], steps: [], own: false, network: r.kind === 'request' && NETWORK_FAILURE.test(r.message) };
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
   * What visitors reported for a program. A finding is a *problem* when it is corroborated: an error needs two different visitors
   * (an uncaught error from the program's own code needs two as well; one visitor is only a note, because an extension or a stale cache
   * can cause one), and a connection failure needs a burst of several visitors within an hour. Thinner evidence is returned as a *note*:
   * worth showing in the report, never a reason to call the program broken. At most 4 problems and 3 notes, most visitors first.
   */
  function findings(programId: string): SensorFinding[] {
    const t = now();
    const problems: SensorFinding[] = [];
    const notes: SensorFinding[] = [];
    for (const entry of seen.get(programId)?.values() || []) {
      for (const [s, at] of entry.sessions) if (t - at > SENSOR_WINDOW_MS) entry.sessions.delete(s);
      const visitors = entry.sessions.size;
      if (!visitors) continue;
      const lastAt = new Date(Math.max(...entry.sessions.values())).toISOString();
      const finding = { text: entry.text, page: entry.page, visitors, stack: entry.stack, steps: entry.steps, lastAt };
      const burst = [...entry.sessions.values()].filter(at => t - at <= NETWORK_BURST_MS).length;
      if (entry.network) {
        if (burst >= NETWORK_BURST_VISITORS) problems.push(finding);
        else if (visitors >= SENSOR_CORROBORATION) notes.push({ ...finding, note: true });
      } else if (visitors >= SENSOR_CORROBORATION) problems.push(finding);
      else if (entry.own) notes.push({ ...finding, note: true });
    }
    const byVisitors = (a: SensorFinding, b: SensorFinding) => b.visitors - a.visitors;
    return [...problems.sort(byVisitors).slice(0, 4), ...notes.sort(byVisitors).slice(0, 3)];
  }

  const problems = (programId: string) => findings(programId).filter(f => !f.note).map(describeFinding);
  return { allow, add, findings, problems };
}

export const describeFinding = (f: SensorFinding) => `${f.text} (${f.visitors === 1 ? 'زائر واحد' : f.visitors + ' زائر'})`;

const SENSOR_FRESH_MS = 6 * 3_600_000;

/**
 * Record the hub's findings on the program record. The hub lives in memory and is empty after a restart, so findings seen in the
 * last few hours that the hub no longer holds are kept rather than erased by the first quiet report. Freshness is per finding
 * (when it was last seen), so one visitor's unrelated report never keeps an old incident alive.
 */
export function applySensor(p: PlatformRecord, found: SensorFinding[], nowIso: string): PlatformRecord {
  const nowMs = Date.parse(nowIso);
  const kept = (p.sensorEvidence || []).filter(old => !found.some(f => f.text === old.text) && nowMs - lastSeen(old, p) < SENSOR_FRESH_MS);
  const all = [...found, ...kept].slice(0, 7);
  if (!all.length && !p.sensorEvidence?.length && !p.sensorProblems?.length) return p;
  return { ...p, sensorEvidence: all, sensorProblems: all.filter(f => !f.note).map(describeFinding), sensorCheckedAt: nowIso };
}

const lastSeen = (e: { lastAt?: string }, p: PlatformRecord) => Date.parse(e.lastAt || p.sensorCheckedAt || '');
const isFresh = (e: { lastAt?: string }, p: PlatformRecord, nowMs: number) => nowMs - lastSeen(e, p) < SENSOR_FRESH_MS;

/** Corroborated problems seen recently. Records saved before findings carried a time fall back to when the sensor last reported. */
export function freshSensorProblems(p: PlatformRecord, nowMs = Date.now()): string[] {
  if (p.sensorEvidence?.length) return p.sensorEvidence.filter(e => !e.note && isFresh(e, p, nowMs)).map(describeFinding);
  return p.sensorProblems?.length && p.sensorCheckedAt && nowMs - Date.parse(p.sensorCheckedAt) < SENSOR_FRESH_MS ? p.sensorProblems : [];
}

const trailOf = (e: { text: string; page: string; stack: string[]; steps: string[] }) => {
  const out = [`  - ${e.text} — الصفحة ${e.page}`];
  if (e.steps.length) out.push(`    ما فعله الزائر قبل الخطأ: ${e.steps.join(' ← ')}`);
  if (e.stack.length) out.push(`    موضع الخطأ: ${e.stack.join(' | ')}`);
  return out;
};

/** The trail behind the program's fresh sensor problems, as lines for the report pasted to Claude. */
export function sensorTrailLines(p: PlatformRecord, nowMs = Date.now()): string[] {
  if (!freshSensorProblems(p, nowMs).length) return [];
  return (p.sensorEvidence || []).filter(e => !e.note && (e.stack.length || e.steps.length)).flatMap(trailOf);
}

/** Thin evidence (one visitor, scattered connection failures): shown in the report, never in the program's status. */
export function sensorNoteLines(p: PlatformRecord, nowMs = Date.now()): string[] {
  return (p.sensorEvidence || []).filter(e => e.note && isFresh(e, p, nowMs)).flatMap(e => [`  - ${e.text} (${e.visitors === 1 ? 'زائر واحد' : e.visitors + ' زوّار'})`, ...trailOf(e).slice(1)]);
}

/** The notes as plain texts, for the weekly log. */
export function sensorNoteTexts(p: PlatformRecord, nowMs = Date.now()): string[] {
  return (p.sensorEvidence || []).filter(e => e.note && isFresh(e, p, nowMs)).map(e => `ملاحظة من زوّار: ${e.text}`);
}
