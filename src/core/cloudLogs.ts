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
  timestamp?: string; textPayload?: string; httpRequest?: { status?: number }; resource?: { labels?: { revision_name?: string } };
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
 * Group the entries by message and revision (digits collapsed so «after 3021ms» and «after 3150ms» are one error).
 * `serving` is the list of revisions that receive traffic, when known: a group from any other revision is marked `serving: false`.
 * Groups that can concern visitors are kept first (four at most), then a couple of the rest, so a noisy failing revision
 * can never crowd a visitor-facing error out of the list. Messages are cleaned like the browser sensor's: log lines can quote what a visitor sent.
 */
export function summarizeLogEntries(entries: LogEntry[], serving?: string[] | null): ServerError[] {
  const groups = new Map<string, ServerError>();
  for (const e of entries) {
    const raw = messageOf(e);
    if (!raw || BENIGN.test(raw)) continue;
    const cleaned = scrubText(redactPathIds(sanitizeTelemetryPayload(raw.replace(/https?:\/\/[^\s)'"]+/g, u => u.split(/[?#]/)[0])).sanitized)).slice(0, 160);
    const revision = typeof e.resource?.labels?.revision_name === 'string' && /^[a-z][a-z0-9-]{0,62}$/.test(e.resource.labels.revision_name) ? e.resource.labels.revision_name : undefined;
    const key = cleaned.replace(/\d{2,}/g, 'N') + '|' + (revision || '');
    const at = typeof e.timestamp === 'string' ? e.timestamp : '';
    const g = groups.get(key);
    if (g) { g.count += 1; if (at > g.lastAt) g.lastAt = at; }
    else groups.set(key, { text: cleaned, count: 1, lastAt: at, ...(revision ? { revision } : {}), ...(serving && revision && !serving.includes(revision) ? { serving: false } : {}) });
  }
  const all = [...groups.values()].sort((a, b) => b.count - a.count);
  return [...all.filter(g => g.serving !== false).slice(0, 4), ...all.filter(g => g.serving === false).slice(0, 2)];
}

export function applyServerErrors(p: PlatformRecord, errors: ServerError[] | null, issue: string | null, nowIso: string): PlatformRecord {
  if (!errors) return { ...p, serverLogsIssue: issue || 'تعذرت قراءة سجلات الخادم', serverLogsCheckedAt: nowIso, serverErrors: undefined };
  return { ...p, serverErrors: errors, serverLogsCheckedAt: nowIso, serverLogsIssue: undefined };
}

/** A revision's start-up failure: when that revision gets no traffic, visitors never reach it, so it is a warning, never a red problem. */
const where = (e: ServerError) => (e.revision ? ` [النسخة ${e.revision}]` : '');
const idle = (e: ServerError) => e.serving === false;

const fresh = (p: PlatformRecord, now: number) => Boolean(p.serverLogsCheckedAt) && now - Date.parse(p.serverLogsCheckedAt!) < FRESH_MS;
const times = (n: number) => (n === 1 ? 'مرة واحدة' : n === 2 ? 'مرتين' : `${n} مرة`);

export function serverProblems(p: PlatformRecord, now = Date.now()): string[] {
  return fresh(p, now) ? (p.serverErrors || []).filter(e => e.count >= LOG_PROBLEM_COUNT && !idle(e)).map(e => `خطأ في سجلات الخادم: ${e.text} (${times(e.count)} في آخر نصف ساعة)${where(e)}`) : [];
}

export function serverWarnings(p: PlatformRecord, now = Date.now()): string[] {
  if (!fresh(p, now)) return [];
  const errors = p.serverErrors || [];
  const quiet = errors.filter(idle).map(e => `نسخة لا تخدم الزوار سجّلت خطأ: ${e.text} (${times(e.count)})${where(e)}، لا أثر على الزوار ما دامت الحركة على نسخة أخرى`);
  const few = [...quiet, ...errors.filter(e => e.count < LOG_PROBLEM_COUNT && !idle(e)).map(e => `خطأ عابر في سجلات الخادم: ${e.text} (${times(e.count)})${where(e)}`)];
  return p.serverLogsIssue ? [`لا يمكن قراءة سجلات الخادم: ${p.serverLogsIssue}`, ...few] : few;
}

export interface LogReader {
  read(source: LogSource, sinceIso: string): Promise<{ entries: LogEntry[] } | { error: string }>;
  /** Revisions that currently receive traffic (needs the Cloud Run Viewer role); null when that cannot be established. */
  servingRevisions(source: LogSource): Promise<string[] | null>;
}

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
    async servingRevisions(source) {
      let token: string | null | undefined;
      try { token = await getToken(); } catch { token = null; }
      if (!token) return null;
      try {
        const response = await fetchImpl(`https://run.googleapis.com/v2/projects/${source.project}/locations/-/services?pageSize=100`, {
          headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) return null;
        const data = await response.json() as { services?: Array<{ name?: string; trafficStatuses?: Array<{ revision?: string; percent?: number }> }> };
        const service = (data.services || []).find(x => typeof x.name === 'string' && x.name.endsWith(`/services/${source.service}`));
        if (!service?.trafficStatuses) return null;
        const serving = service.trafficStatuses.filter(t => (t.percent ?? 0) > 0 && typeof t.revision === 'string').map(t => t.revision as string);
        return serving.length ? serving : null;
      } catch { return null; }
    },
  };
}
