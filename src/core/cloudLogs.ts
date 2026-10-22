/**
 * Errors in a program's own server logs (Cloud Run). The browser sensor only sees what reaches the page; a server that fails
 * quietly, or answers 500 to a background job, shows up here. Read-only: needs the log viewer role and nothing else.
 */
import { sanitizeTelemetryPayload } from './engine.ts';
import { redactPathIds, scrubText } from './sensor.ts';
import type { PlatformRecord } from './types.ts';

export interface LogSource { codeName: string; project: string; service: string }
export type ServerError = NonNullable<PlatformRecord['serverErrors']>[number];

/** How far back each watch looks, and how long a result stays valid (the watch runs every 15 minutes). */
export const LOG_WINDOW_MS = 30 * 60_000;
const FRESH_MS = 60 * 60_000;
/** The same error this many times in the window is a problem; fewer is a warning. */
export const LOG_PROBLEM_COUNT = 3;

/**
 * ORBIT_LOG_SOURCES lists which Cloud Run service holds each program's logs. Two spellings, both validated:
 * `ORDER=my-project/order-api;ADMIN=my-project/admin-api` (no commas or quotes, so it fits a deploy flag) or a JSON array of {codeName, project, service}.
 * Anything malformed is skipped, never trusted.
 */
export function parseLogSources(raw: string | undefined): LogSource[] {
  const text = (raw || '').trim();
  if (!text) return [];
  let items: unknown[] = [];
  if (text.startsWith('[')) {
    try { const data = JSON.parse(text); items = Array.isArray(data) ? data : []; } catch { return []; }
  } else {
    items = text.split(/[;\s]+/).filter(Boolean).map(part => { const m = /^([^=]+)=([^/]+)\/(.+)$/.exec(part); return m ? { codeName: m[1], project: m[2], service: m[3] } : null; });
  }
  const out: LogSource[] = [];
  for (const item of items.slice(0, 20)) {
    const r = item as Partial<LogSource> | null;
    if (!r || typeof r.codeName !== 'string' || typeof r.project !== 'string' || typeof r.service !== 'string') continue;
    if (!/^[A-Za-z][A-Za-z0-9._-]{0,40}$/.test(r.codeName) || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(r.project) || !/^[a-z][a-z0-9-]{0,62}$/.test(r.service)) continue;
    out.push({ codeName: r.codeName.toUpperCase(), project: r.project, service: r.service });
  }
  return out;
}

export function buildLogFilter(service: string, sinceIso: string): string {
  return `resource.type="cloud_run_revision" AND resource.labels.service_name="${service}" AND severity>=ERROR AND timestamp>="${sinceIso}"`;
}

export interface LogEntry {
  timestamp?: string; textPayload?: string; httpRequest?: { status?: number };
  jsonPayload?: { message?: unknown; error?: unknown; msg?: unknown };
}

/** Noise every service has: a visitor who closed the tab, a probe that was cut short. */
const BENIGN = /client disconnected|request aborted|ECONNRESET|socket hang up|context canceled/i;

function messageOf(e: LogEntry): string {
  const j = e.jsonPayload;
  const fromJson = [j?.message, j?.msg, typeof j?.error === 'string' ? j.error : (j?.error as { message?: unknown } | undefined)?.message].find((x): x is string => typeof x === 'string' && x.trim().length > 0);
  const text = fromJson || (typeof e.textPayload === 'string' ? e.textPayload : '');
  const status = e.httpRequest?.status;
  const first = text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().split(/\s{2,}|\n/)[0];
  if (first) return first;
  return status && status >= 500 ? `الخادم أعاد HTTP ${status}` : '';
}

/**
 * Group the entries by message (digits collapsed so «after 3021ms» and «after 3150ms» are one error), keep the commonest four.
 * Messages are cleaned the same way as the browser sensor's: log lines can quote what a visitor sent.
 */
export function summarizeLogEntries(entries: LogEntry[]): ServerError[] {
  const groups = new Map<string, ServerError>();
  for (const e of entries) {
    const raw = messageOf(e);
    if (!raw || BENIGN.test(raw)) continue;
    const cleaned = scrubText(redactPathIds(sanitizeTelemetryPayload(raw.replace(/https?:\/\/[^\s)'"]+/g, u => u.split(/[?#]/)[0])).sanitized)).slice(0, 160);
    const key = cleaned.replace(/\d{2,}/g, 'N');
    const at = typeof e.timestamp === 'string' ? e.timestamp : '';
    const g = groups.get(key);
    if (g) { g.count += 1; if (at > g.lastAt) g.lastAt = at; } else groups.set(key, { text: cleaned, count: 1, lastAt: at });
  }
  return [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 4);
}

export function applyServerErrors(p: PlatformRecord, errors: ServerError[] | null, issue: string | null, nowIso: string): PlatformRecord {
  if (!errors) return { ...p, serverLogsIssue: issue || 'تعذرت قراءة سجلات الخادم', serverLogsCheckedAt: nowIso, serverErrors: undefined };
  return { ...p, serverErrors: errors, serverLogsCheckedAt: nowIso, serverLogsIssue: undefined };
}

const fresh = (p: PlatformRecord, now: number) => Boolean(p.serverLogsCheckedAt) && now - Date.parse(p.serverLogsCheckedAt!) < FRESH_MS;
const times = (n: number) => (n === 1 ? 'مرة واحدة' : n === 2 ? 'مرتين' : `${n} مرة`);

export function serverProblems(p: PlatformRecord, now = Date.now()): string[] {
  return fresh(p, now) ? (p.serverErrors || []).filter(e => e.count >= LOG_PROBLEM_COUNT).map(e => `خطأ في سجلات الخادم: ${e.text} (${times(e.count)} في آخر نصف ساعة)`) : [];
}

export function serverWarnings(p: PlatformRecord, now = Date.now()): string[] {
  if (!fresh(p, now)) return [];
  const few = (p.serverErrors || []).filter(e => e.count < LOG_PROBLEM_COUNT).map(e => `خطأ عابر في سجلات الخادم: ${e.text} (${times(e.count)})`);
  return p.serverLogsIssue ? [`لا يمكن قراءة سجلات الخادم: ${p.serverLogsIssue}`, ...few] : few;
}

export interface LogReader { read(source: LogSource, sinceIso: string): Promise<{ entries: LogEntry[] } | { error: string }> }

/** Cloud Logging over its REST API, authenticated as ORBIT's own runtime service account. */
export function createCloudLogReader(getToken: () => Promise<string | null | undefined>, fetchImpl: typeof fetch = fetch): LogReader {
  return {
    async read(source, sinceIso) {
      let token: string | null | undefined;
      try { token = await getToken(); } catch { token = null; }
      if (!token) return { error: 'لا توجد هوية لقراءة السجلات' };
      try {
        const response = await fetchImpl('https://logging.googleapis.com/v2/entries:list', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ resourceNames: [`projects/${source.project}`], filter: buildLogFilter(source.service, sinceIso), orderBy: 'timestamp desc', pageSize: 100 }),
          signal: AbortSignal.timeout(10_000),
        });
        if (response.status === 403) return { error: `ليس لحساب أوربت صلاحية «Logs Viewer» على مشروع ${source.project}` };
        if (!response.ok) return { error: `خدمة السجلات أعادت HTTP ${response.status}` };
        const data = await response.json() as { entries?: LogEntry[] };
        return { entries: Array.isArray(data.entries) ? data.entries : [] };
      } catch { return { error: 'تعذر الاتصال بخدمة السجلات' }; }
    },
  };
}
