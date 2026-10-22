/**
 * Browser sensor reports: tiny error notes sent by a program's own pages (public/orbit-sensor.js).
 * Reports come from the open internet, so nothing is trusted: parsed defensively, tied to a known program by Origin,
 * rate-limited, and raised as a problem only when several different visitors hit the same error.
 */
import { sanitizeTelemetryPayload } from './engine.ts';
import type { PlatformRecord } from './types.ts';

export interface SensorReport { kind: 'error' | 'rejection' | 'resource' | 'request'; message: string; page: string; session: string }

const KINDS = new Set(['error', 'rejection', 'resource', 'request']);
const MAX_BODY = 8_000;

const strip = (value: string) => sanitizeTelemetryPayload(value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/https?:\/\/[^\s)'"]+/g, u => u.split(/[?#]/)[0])).sanitized.trim();

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
    const r = item as { k?: unknown; m?: unknown; p?: unknown } | null;
    if (!r || typeof r.k !== 'string' || !KINDS.has(r.k) || typeof r.m !== 'string') continue;
    const message = strip(r.m).slice(0, 160);
    if (!message) continue;
    let page = '/';
    if (typeof r.p === 'string') { try { page = new URL(r.p, 'https://x.invalid').pathname.slice(0, 80); } catch { /* keep "/" */ } }
    out.push({ kind: r.k as SensorReport['kind'], message, page, session });
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
export const SENSOR_WINDOW_MS = 24 * 3_600_000;
export const SENSOR_CORROBORATION = 2;

/** In-memory hub: counts distinct visitors per error and exposes the corroborated ones. */
export function createSensorHub(now: () => number = Date.now) {
  const seen = new Map<string, Map<string, { sessions: Map<string, number>; text: string }>>(); // program -> signature -> evidence
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
    const bucket = seen.get(programId) || new Map();
    seen.set(programId, bucket);
    for (const r of reports) {
      const signature = `${r.kind}|${r.message}`;
      const entry = bucket.get(signature) || { sessions: new Map<string, number>(), text: `${KIND_LABEL[r.kind]}: ${r.message}` };
      entry.sessions.set(r.session, t);
      bucket.set(signature, entry);
    }
    if (bucket.size > 60) { // bound memory: drop the oldest evidence
      const oldest = [...bucket.entries()].sort((a, b) => Math.max(...a[1].sessions.values()) - Math.max(...b[1].sessions.values()))[0];
      if (oldest) bucket.delete(oldest[0]);
    }
  }

  /** Corroborated problems for a program (≥N different visitors within the window), plain Arabic, at most 4. */
  function problems(programId: string): string[] {
    const t = now();
    const out: string[] = [];
    for (const entry of seen.get(programId)?.values() || []) {
      for (const [s, at] of entry.sessions) if (t - at > SENSOR_WINDOW_MS) entry.sessions.delete(s);
      if (entry.sessions.size >= SENSOR_CORROBORATION) out.push(`${entry.text} (${entry.sessions.size} زائر)`);
    }
    return out.slice(0, 4);
  }

  return { allow, add, problems };
}

/** Record the hub's current findings on the program record (kept for 36h by the reader, so a quiet day clears it). */
export function applySensor(p: PlatformRecord, problems: string[], nowIso: string): PlatformRecord {
  if (!problems.length && !p.sensorProblems?.length) return p;
  return { ...p, sensorProblems: problems, sensorCheckedAt: nowIso };
}

export function freshSensorProblems(p: PlatformRecord, nowMs = Date.now()): string[] {
  return p.sensorProblems?.length && p.sensorCheckedAt && nowMs - Date.parse(p.sensorCheckedAt) < 6 * 3_600_000 ? p.sensorProblems : [];
}
