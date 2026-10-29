/**
 * Errors in a program's own server logs (Cloud Run). The browser sensor only sees what reaches the page; a server that fails
 * quietly, or answers 500 to a background job, shows up here. Read-only: needs the log viewer role and nothing else.
 */
import { sanitizeTelemetryPayload } from './engine.ts';
import { redactPathIds, scrubText } from './sensor.ts';
import type { PlatformRecord } from './types.ts';

export interface LogSource { codeName: string; project: string; service: string }
export type ServerError = NonNullable<PlatformRecord['serverErrors']>[number];

/** How far back each watch looks and how long its result stays valid: a little over a day, because the scheduled watch runs daily. */
export const LOG_WINDOW_MS = 25 * 3_600_000;
const FRESH_MS = 26 * 3_600_000;
/** The same error this many times within half an hour (anywhere in the window) is a problem; fewer is a warning. */
export const LOG_PROBLEM_COUNT = 3;
export const LOG_BURST_MS = 30 * 60_000;

/** The most occurrences that fall within any half hour: a burst, as opposed to the same error spread thinly over the day. */
function busiestHalfHour(times: number[]): number {
  const sorted = [...times].sort((a, b) => a - b);
  let best = 0;
  for (let start = 0, end = 0; end < sorted.length; end++) {
    while (sorted[end] - sorted[start] > LOG_BURST_MS) start++;
    best = Math.max(best, end - start + 1);
  }
  return best;
}

/**
 * ORBIT_LOG_SOURCES lists which Cloud Run service holds each program's logs. Two spellings, both validated:
 * (a 1st-gen Cloud Function is written `fn:<name>`, e.g. `TEBYAN=my-project/fn:api`)
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
    if (!/^[A-Za-z][A-Za-z0-9._-]{0,40}$/.test(r.codeName) || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(r.project) || !/^(fn:)?[a-z][a-z0-9-]{0,62}$/.test(r.service)) continue;
    out.push({ codeName: r.codeName.toUpperCase(), project: r.project, service: r.service });
  }
  return out;
}

const FUNCTION = 'fn:';
const isFunction = (service: string) => service.startsWith(FUNCTION);

export function buildLogFilter(service: string, sinceIso: string): string {
  const resource = isFunction(service)
    ? `resource.type="cloud_function" AND resource.labels.function_name="${service.slice(FUNCTION.length)}"`
    : `resource.type="cloud_run_revision" AND resource.labels.service_name="${service}"`;
  return `${resource} AND severity>=ERROR AND timestamp>="${sinceIso}"`;
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
  const seenAt = new Map<string, number[]>();
  for (const e of entries) {
    const raw = messageOf(e);
    if (!raw || BENIGN.test(raw)) continue;
    const cleaned = scrubText(redactPathIds(sanitizeTelemetryPayload(raw.replace(/https?:\/\/[^\s)'"]+/g, u => u.split(/[?#]/)[0])).sanitized)).slice(0, 160);
    const revision = typeof e.resource?.labels?.revision_name === 'string' && /^[a-z][a-z0-9-]{0,62}$/.test(e.resource.labels.revision_name) ? e.resource.labels.revision_name : undefined;
    const key = cleaned.replace(/\d{2,}/g, 'N') + '|' + (revision || '');
    const at = typeof e.timestamp === 'string' ? e.timestamp : '';
    seenAt.set(key, [...(seenAt.get(key) || []), Number.isFinite(Date.parse(at)) ? Date.parse(at) : 0]);
    const g = groups.get(key);
    if (g) { g.count += 1; if (at > g.lastAt) g.lastAt = at; }
    else groups.set(key, { text: cleaned, count: 1, lastAt: at, ...(revision ? { revision } : {}), ...(serving && revision && !serving.includes(revision) ? { serving: false } : {}) });
  }
  for (const [key, g] of groups) g.peak = busiestHalfHour(seenAt.get(key) || []);
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
/** Results stored before bursts were measured read their count as the burst: they came from a half-hour window. */
const peakOf = (e: ServerError) => e.peak ?? e.count;
const burstPhrase = (e: ServerError) => `${times(peakOf(e))} خلال نصف ساعة${e.count > peakOf(e) ? `، و${times(e.count)} في آخر يوم` : ''}`;

export function serverProblems(p: PlatformRecord, now = Date.now()): string[] {
  return fresh(p, now) ? (p.serverErrors || []).filter(e => peakOf(e) >= LOG_PROBLEM_COUNT && !idle(e)).map(e => `خطأ في سجلات الخادم: ${e.text} (${burstPhrase(e)})${where(e)}`) : [];
}

export function serverWarnings(p: PlatformRecord, now = Date.now()): string[] {
  if (!fresh(p, now)) return [];
  const errors = p.serverErrors || [];
  const quiet = errors.filter(idle).map(e => `نسخة لا تخدم الزوار سجّلت خطأ: ${e.text} (${times(e.count)})${where(e)}، لا أثر على الزوار ما دامت الحركة على نسخة أخرى`);
  const few = [...quiet, ...errors.filter(e => peakOf(e) < LOG_PROBLEM_COUNT && !idle(e)).map(e => `خطأ عابر في سجلات الخادم: ${e.text} (${times(e.count)} في آخر يوم، لا يتجاوز ${times(peakOf(e))} خلال نصف ساعة)${where(e)}`)];
  return p.serverLogsIssue ? [`لا يمكن قراءة سجلات الخادم: ${p.serverLogsIssue}`, ...few] : few;
}

export interface LogReader {
  read(source: LogSource, sinceIso: string): Promise<{ entries: LogEntry[] } | { error: string }>;
  /**
   * Revisions that currently receive traffic: the exact split with the Cloud Run Viewer role; without it, the revision that
   * answered the latest request (Logs Viewer is enough). Null when neither can be established.
   */
  servingRevisions(source: LogSource): Promise<string[] | null>;
}

/**
 * The revision that answered the newest request in the last day. Cloud Run sends every request to the serving revision, so
 * a replaced revision stops appearing here and its old errors stop being red. With no request since a deploy this still names
 * the old revision, which keeps its errors red: the safe side. Assumes no traffic split, which these programs never use.
 */
async function latestRequestRevision(source: LogSource, token: string, fetchImpl: typeof fetch): Promise<string[] | null> {
  try {
    const since = new Date(Date.now() - LOG_WINDOW_MS).toISOString();
    const response = await fetchImpl('https://logging.googleapis.com/v2/entries:list', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resourceNames: [`projects/${source.project}`],
        filter: `resource.type="cloud_run_revision" AND resource.labels.service_name="${source.service}" AND log_id("run.googleapis.com/requests") AND timestamp>="${since}"`,
        orderBy: 'timestamp desc',
        pageSize: 1,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const data = await response.json() as { entries?: LogEntry[] };
    const revision = data.entries?.[0]?.resource?.labels?.revision_name;
    return typeof revision === 'string' && /^[a-z0-9-]{1,80}$/.test(revision) ? [revision] : null;
  } catch { return null; }
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
      // A Cloud Function has no revisions to tell apart.
      if (isFunction(source.service)) return null;
      let token: string | null | undefined;
      try { token = await getToken(); } catch { token = null; }
      if (!token) return null;
      try {
        const response = await fetchImpl(`https://run.googleapis.com/v2/projects/${source.project}/locations/-/services?pageSize=100`, {
          headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) return await latestRequestRevision(source, token, fetchImpl);
        const data = await response.json() as { services?: Array<{ name?: string; trafficStatuses?: Array<{ revision?: string; percent?: number }> }> };
        const service = (data.services || []).find(x => typeof x.name === 'string' && x.name.endsWith(`/services/${source.service}`));
        if (!service?.trafficStatuses) return null;
        const serving = service.trafficStatuses.filter(t => (t.percent ?? 0) > 0 && typeof t.revision === 'string').map(t => t.revision as string);
        return serving.length ? serving : null;
      } catch { return null; }
    },
  };
}
