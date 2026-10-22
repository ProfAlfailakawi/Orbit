/** What the owner sees per program: one short status line and whether there is something to copy to Claude. */
import type { IncidentCaseFile, PlatformRecord, RadarEvent } from './types.ts';
import { generateClaudeMissionPrompt } from './engine.ts';
import { buildFleetReportForClaude, buildRepairIntelligenceAddendum, getLinkIssue, getProgramProblems } from './guardian.ts';

export type RowTone = 'bad' | 'warn' | 'ok' | 'local';
export interface ProgramRow {
  platform: PlatformRecord;
  tone: RowTone;
  text: string;
  needsCopy: boolean;
  incidents: IncidentCaseFile[];
}

const severityRank: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3, Informational: 4 };
const closedStatuses = new Set(['Resolved', 'False Positive', 'Expected Behavior', "Won't Fix"]);
const toneRank: Record<RowTone, number> = { bad: 0, warn: 1, ok: 2, local: 3 };

export const isInFleet = (p: PlatformRecord) => p.lifecycleState !== 'unlinked' && p.lifecycleState !== 'archived';

/** Open incidents that a live production event has witnessed; demonstration data is excluded. */
export function getConfirmedProductionIncidents(incidents: IncidentCaseFile[], events: RadarEvent[]) {
  const witnessed = new Set(events
    .filter(e => e.environment === 'production' && e.dataIntegrity === 'Live')
    .map(e => e.appId.toUpperCase() + ':' + e.fingerprint));
  return incidents.filter(i =>
    i.dataIntegrity === 'Live' && !closedStatuses.has(i.status) &&
    witnessed.has(i.appId.toUpperCase() + ':' + i.fingerprint)
  ).sort((a, b) =>
    (severityRank[a.severity] ?? 5) - (severityRank[b.severity] ?? 5) ||
    (Date.parse(b.lastSeen) || 0) - (Date.parse(a.lastSeen) || 0)
  );
}

/** The most common reason programs are not linked, so it is written once instead of on every row. */
export function sharedLinkReason(platforms: PlatformRecord[]): string | null {
  const counts = new Map<string, number>();
  for (const p of platforms.filter(isInFleet)) {
    const issue = getLinkIssue(p);
    if (issue) counts.set(issue, (counts.get(issue) || 0) + 1);
  }
  const top = [...counts].sort((a, b) => b[1] - a[1])[0];
  return top && top[1] > 1 ? top[0] : null;
}

export function buildRows(platforms: PlatformRecord[], incidents: IncidentCaseFile[], events: RadarEvent[]): ProgramRow[] {
  const confirmed = getConfirmedProductionIncidents(incidents, events);
  const shared = sharedLinkReason(platforms);
  return platforms.filter(isInFleet).map((p): ProgramRow => {
    const own = confirmed.filter(i => i.appId.toUpperCase() === p.codeName.toUpperCase());
    const problems = [...own.slice(0, 1).map(i => i.title), ...getProgramProblems(p)];
    if (problems.length) return { platform: p, tone: 'bad', text: problems.slice(0, 2).join(' · '), needsCopy: true, incidents: own };
    if (p.runtimeMode === 'local-only' || p.runtimeMode === 'github-local') {
      return { platform: p, tone: 'local', text: 'برنامج محلي', needsCopy: false, incidents: own };
    }
    const link = getLinkIssue(p);
    if (link) return { platform: p, tone: 'warn', text: link === shared ? 'غير مربوط' : link, needsCopy: true, incidents: own };
    const siteChecked = p.productionUrlVerified && p.fourState?.siteReachable === true;
    if (!siteChecked) {
      return { platform: p, tone: 'warn', text: p.productionUrl ? 'الموقع لم يُفحص بعد' : 'لا يوجد رابط للموقع', needsCopy: true, incidents: own };
    }
    return { platform: p, tone: 'ok', text: 'يعمل', needsCopy: false, incidents: own };
  }).sort((a, b) => toneRank[a.tone] - toneRank[b.tone]);
}

export interface Summary { bad: number; warn: number; tone: 'bad' | 'warn' | 'ok'; headline: string; buttonLabel: string | null; reason: string | null }

/** Arabic count phrase: 1 → «برنامج واحد», 2 → «برنامجان», 3–10 → «N برامج», 11+ → «N برنامجًا». */
export function programsPhrase(n: number): string {
  if (n === 1) return 'برنامج واحد';
  if (n === 2) return 'برنامجان';
  return n <= 10 ? n + ' برامج' : n + ' برنامجًا';
}

export function summarize(rows: ProgramRow[], reason: string | null = null): Summary {
  const bad = rows.filter(r => r.tone === 'bad').length;
  const warn = rows.filter(r => r.tone === 'warn').length;
  if (bad) return { bad, warn, tone: 'bad', headline: (bad === 1 ? 'يوجد برنامج فيه مشكلة' : 'يوجد ' + programsPhrase(bad) + ' فيها مشاكل'), buttonLabel: 'انسخ كل المشاكل لكلود', reason };
  if (warn) return { bad, warn, tone: 'warn', headline: 'لا توجد مشاكل مؤكدة، لكن الرصد ناقص في ' + programsPhrase(warn), buttonLabel: 'انسخ التقرير لكلود', reason };
  return { bad, warn, tone: 'ok', headline: rows.length ? 'كل البرامج تعمل' : 'لا توجد برامج بعد', buttonLabel: null, reason: null };
}

/** «آخر فحص» from the newest GitHub-verified timestamp in the fleet. */
export function lastCheckLabel(platforms: PlatformRecord[], now = Date.now()): string {
  const times = platforms.filter(isInFleet)
    .filter(p => p.connectionVerified && p.dataIntegrity === 'Live')
    .map(p => Date.parse(p.lastVerifiedTimestamp)).filter(Number.isFinite);
  if (!times.length) return 'لم يُفحص بعد';
  const minutes = Math.max(0, Math.round((now - Math.max(...times)) / 60_000));
  if (minutes < 1) return 'آخر فحص: الآن';
  if (minutes < 60) return 'آخر فحص: قبل ' + (minutes === 1 ? 'دقيقة' : minutes === 2 ? 'دقيقتين' : minutes <= 10 ? minutes + ' دقائق' : minutes + ' دقيقة');
  const hours = Math.round(minutes / 60);
  if (hours < 24) return 'آخر فحص: قبل ' + (hours === 1 ? 'ساعة' : hours === 2 ? 'ساعتين' : hours <= 10 ? hours + ' ساعات' : hours + ' ساعة');
  const days = Math.round(hours / 24);
  return 'آخر فحص: قبل ' + (days === 1 ? 'يوم' : days === 2 ? 'يومين' : days <= 10 ? days + ' أيام' : days + ' يومًا');
}

const mission = (incident: IncidentCaseFile, p: PlatformRecord, fleet: PlatformRecord[]) =>
  generateClaudeMissionPrompt(incident, p, 'fix') + '\n' + buildRepairIntelligenceAddendum(incident, p, fleet);

/** Text to paste into Claude. One program, or every program that has a problem or a gap. */
export function buildCopyText(rows: ProgramRow[], scope: 'all' | string): string {
  const fleet = rows.map(r => r.platform);
  const picked = scope === 'all' ? rows : rows.filter(r => r.platform.id === scope);
  const incidents = picked.flatMap(r => r.incidents);
  const report = buildFleetReportForClaude(scope === 'all' ? fleet : picked.map(r => r.platform), incidents);
  const missions = incidents.slice(0, 3).map(i => {
    const p = fleet.find(x => x.codeName.toUpperCase() === i.appId.toUpperCase());
    return p ? mission(i, p, fleet) : '';
  }).filter(Boolean);
  return [report, ...missions].join('\n\n');
}
