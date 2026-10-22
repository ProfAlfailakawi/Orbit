/** Results of the daily real-browser visit. Pure: validation of what the robot posts, and applying it to a program record. */
import type { PlatformRecord } from './types.ts';
import { VISUAL_CHANGE_BITS, hashDistance } from './pageAudit.ts';

export interface BrowserVisitReport { id: string; url: string; ok: boolean; problems: string[]; warnings: string[]; hash?: string; sensor?: 'installed' | 'absent' }

const MAX_PROBLEMS = 10;
const MAX_WARNINGS = 8;
const MAX_TEXT = 200;

/** Keep only well-formed reports; strip control characters, query strings and long text so nothing sensitive or huge is stored. */
export function parseBrowserReports(body: unknown): BrowserVisitReport[] {
  const list = (body as { reports?: unknown } | null)?.reports;
  if (!Array.isArray(list)) return [];
  const out: BrowserVisitReport[] = [];
  for (const raw of list.slice(0, 40)) {
    const r = raw as Partial<BrowserVisitReport> | null;
    if (!r || typeof r.id !== 'string' || typeof r.url !== 'string' || typeof r.ok !== 'boolean' || !Array.isArray(r.problems)) continue;
    const clean = (list: unknown, max: number) => (Array.isArray(list) ? list : []).filter((x): x is string => typeof x === 'string')
      .map(x => x.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/https?:\/\/[^\s)]+/g, u => u.split(/[?#]/)[0]).trim().slice(0, MAX_TEXT))
      .filter(Boolean).slice(0, max);
    const problems = clean(r.problems, MAX_PROBLEMS);
    const hash = typeof r.hash === 'string' && /^[0-9a-f]{16}$/.test(r.hash) ? r.hash : undefined;
    const sensor = r.sensor === 'installed' || r.sensor === 'absent' ? r.sensor : undefined;
    out.push({ id: r.id.slice(0, 80), url: r.url.slice(0, 300), ok: r.ok && problems.length === 0, problems, warnings: clean(r.warnings, MAX_WARNINGS), hash, ...(sensor ? { sensor } : {}) });
  }
  return out;
}

/** A report only counts when it was made against the address ORBIT currently trusts for that program. */
export function applyBrowserVisit(p: PlatformRecord, report: BrowserVisitReport, currentUrl: string | null, nowIso: string): PlatformRecord {
  if (!currentUrl || report.url.replace(/\/+$/, '') !== currentUrl.replace(/\/+$/, '')) return p;
  // A home page that looks very different from the last visit is worth a look even when no error was raised.
  const before = p.browserVisit?.hash;
  const changed = before && report.hash && hashDistance(before, report.hash) >= VISUAL_CHANGE_BITS;
  const warnings = changed ? ['شكل الصفحة الرئيسية تغيّر بشدة عن الفحص السابق، تأكد أنه تغيير مقصود', ...report.warnings].slice(0, MAX_WARNINGS) : report.warnings;
  return { ...p, browserVisit: { at: nowIso, ok: report.ok, problems: report.problems, warnings, hash: report.hash ?? before, ...(report.sensor ? { sensor: report.sensor } : {}) } };
}

/** Findings from the last browser visit while still fresh (a daily visit stays valid for 36 hours). */
export function freshBrowserProblems(p: PlatformRecord, now = Date.now()): string[] {
  const v = p.browserVisit;
  if (!v || v.ok || now - Date.parse(v.at) > 36 * 3_600_000) return [];
  return v.problems;
}

/** Softer findings from the last browser visit (accessibility, hygiene, a changed look), while still fresh. */
export function freshBrowserWarnings(p: PlatformRecord, now = Date.now()): string[] {
  const v = p.browserVisit;
  return v?.warnings?.length && now - Date.parse(v.at) <= 36 * 3_600_000 ? v.warnings : [];
}
