/** ORBIT ONE intelligence: private, bounded, evidence-qualified and read-only. */
import type { BlackBoxFrame, CrossAppPattern, IncidentCaseFile, PlatformRecord } from './types.ts';
import { MANDATORY_CLAUDE_GUARDRAIL, sanitizeTelemetryPayload } from './engine.ts';
import { displayName } from './displayName.ts';
import { freshBrowserProblems } from './browserVisit.ts';

export type TruthEvidence = { uiReportedSuccess?: unknown; serverRecordConfirmed?: unknown; httpStatus?: unknown };
export function evaluateTruthEvidence(input: TruthEvidence | null | undefined) {
  if (!input || input.uiReportedSuccess !== true)
    return { verdict: 'unknown' as const, code: null, reason: 'No verified UI-success claim.' };
  if (input.serverRecordConfirmed === false)
    return { verdict: 'contradiction' as const, code: 'ORBIT_CONFIRMED_OUTCOME_MISMATCH',
      reason: 'UI success conflicts with explicitly reported authoritative server non-commit.' };
  if (input.serverRecordConfirmed === true)
    return { verdict: 'confirmed' as const, code: null, reason: 'Explicit UI and server confirmations agree.' };
  return { verdict: 'unknown' as const, code: null, reason: 'No authoritative result; failure cannot be asserted.' };
}

const safeName = (input: unknown) => typeof input === 'string' && /^[a-z][a-z0-9_.:-]{1,78}$/i.test(input) ? input : null;
const types = {
  ui_action: { requestType: 'UI_ACTION', message: 'UI action metadata reported, without screen or input content.' },
  http_result: { requestType: 'HTTP', message: 'HTTP result metadata reported; no payload captured.' },
  verified_record: { requestType: 'STATE_CHANGE', message: 'Server confirmation reported; requires independent verification.' },
  background_job: { requestType: 'JOB_EXEC', message: 'Job result metadata reported without job payload.' },
} as const;

/** No DOM, screenshots, typed inputs, URLs, cookies, coordinates or arbitrary values survive. */
export function buildPrivacySafeTimeline(
  raw: unknown, context: { correlationId: string; releaseVersion: string; operationName: string }
): BlackBoxFrame[] {
  if (!Array.isArray(raw)) return [];
  const frames: BlackBoxFrame[] = [];
  for (const item of raw.slice(-12)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const d = item as Record<string, unknown>;
    const kind = typeof d.kind === 'string' && Object.prototype.hasOwnProperty.call(types, d.kind)
      ? types[d.kind as keyof typeof types] : null;
    const name = safeName(d.operation) || safeName(context.operationName);
    if (!kind || !name) continue;
    const status = typeof d.statusCode === 'number' && Number.isInteger(d.statusCode) && d.statusCode >= 100 && d.statusCode <= 599 ? String(d.statusCode) : 'unverified';
    frames.push({
      frameId: 'SAFE-' + (frames.length + 1),
      timestamp: new Date().toISOString(),
      appVersion: sanitizeTelemetryPayload(context.releaseVersion.slice(0, 80)).sanitized,
      operationName: name,
      requestType: kind.requestType,
      statusCode: status,
      correlationId: context.correlationId,
      outcome: d.outcome === 'success' ? 'Success' : d.outcome === 'timeout' ? 'Timeout' : 'Exception',
      sanitizedPayloadSummary: kind.message,
      redactedFieldsCount: Object.keys(d).filter(k=>!['kind','operation','statusCode','outcome'].includes(k)).length,
    });
    if(frames.length >= 8) break;
  }
  return frames;
}

const norm = (s: string): string | null => {
  const x=s.trim().toLowerCase().replace(/\s+/g,' ');
  if(x.length<4 || x.length>90 || ['api','rest','database','firebase','github','cloud','http','backend','frontend'].includes(x))return null;
  return /^[a-z0-9\u0600-\u06ff ._:/-]+$/i.test(x) ? x : null;
};
const deps=(p:PlatformRecord) => [...(p.apiServices||[]),...(p.databasesAndIntegrations||[])].map(norm).filter((x):x is string=>x!==null);
export function buildSharedDependencyAdvisory(incident: IncidentCaseFile, fleet: PlatformRecord[]): CrossAppPattern | null {
  if (incident.dataIntegrity !== 'Live') return null;
  const origin=fleet.find(p=>p.codeName.toUpperCase()===incident.appId.toUpperCase());
  if(!origin)return null;
  const known=new Set(deps(origin));
  const related=fleet.filter(p=>p.id!==origin.id && p.lifecycleState==='active' && deps(p).some(x=>known.has(x)));
  if(!related.length)return null;
  return {
    id:'ADVISORY-'+incident.fingerprint,title:'احتمال تأثر برامج تستخدم خدمة مشتركة',
    sharedDependencyOrPattern:'Declared shared dependency only',
    originAppId:origin.codeName,potentiallyAffectedAppIds:related.map(p=>p.codeName),
    riskDescription:'No cross-application outage is confirmed by this dependency match.',
    recommendedVerificationPerApp:'Run read-only checks or designated staging journeys.',
    status:'Needs Inspection',
  };
}

export function rankPostReleaseChecks(p: PlatformRecord) {
  const commits=(p.recentCommits||[]).filter(c=>c.dataIntegrity==='Live' && /^[a-f0-9]{7,64}$/i.test(c.sha));
  if(!commits.length)return {basis:'No verified GitHub commit data', risk:'unknown' as const, checks:[] as string[]};
  const latest=commits[0];
  const checks=['Verify deployment separately from GitHub CI', 'Test relevant flows in a sandbox without real payments'];
  if(latest.riskLevel==='High'||latest.riskLevel==='Unknown')checks.push('Review sensitive regression paths before any change');
  return {basis:'GitHub commit '+latest.sha.slice(0,12)+' (temporal association only)',
    risk:latest.riskLevel==='High'||latest.riskLevel==='Unknown'?'review' as const:'unknown' as const,checks};
}

export function buildRepairIntelligenceAddendum(incident: IncidentCaseFile, platform: PlatformRecord, fleet: PlatformRecord[]): string {
  const impact=buildSharedDependencyAdvisory(incident,fleet);
  const release=rankPostReleaseChecks(platform);
  const timeline=(incident.blackBoxFrames||[]).slice(-8).map(f=>'- '+sanitizeTelemetryPayload(f.operationName+' / '+f.requestType+' / '+f.outcome).sanitized);
  return [
    '## ORBIT ONE — Evidence-qualified supplementary analysis',
    'Incident evidence does not prove root cause. Do not automatically change, merge or deploy monitored apps.',
    'Privacy-safe timeline metadata (NOT a screen recording):',
    ...(timeline.length?timeline:['- No authenticated sanitized breadcrumbs available.']),
    'Possible shared dependency impact: '+(impact?'UNVERIFIED: '+impact.potentiallyAffectedAppIds.join(', '):'No explicit cross-app match'),
    'Release: '+release.basis,
    ...release.checks.map(t=>'- '+t),
    'After an approved fix, verify the deployed version with real evidence before marking the incident resolved.',
  ].join('\n');
}

export function classifyReadOnlyProbe(status: number|null, verifiedBody=false, isOrbit=false) {
  if(status===null)return 'unverified';
  if(status>=200&&status<300&&(!isOrbit||verifiedBody))return 'reachable';
  return 'failed';
}

/** Evidence-backed failure signals for one program, in plain Arabic. Unknown is never reported as a failure. */
export function getProgramProblems(p: PlatformRecord): string[] {
  const out: string[] = [];
  const f = p.fourState;
  if (f?.ciPassed === false) out.push('اختبارات GitHub الأخيرة فشلت');
  if (f?.deploymentSucceeded === false) out.push('آخر نشر لم ينجح');
  if (f?.siteReachable === false) out.push('الموقع لا يستجيب');
  if (f?.userJourneyHealthy === false) out.push('تجربة المستخدم الأساسية تحتاج مراجعة');
  // What the site visitor found on the public page (a broken app file, an error page), while the finding is fresh.
  if (p.siteProblems?.length && p.siteCheckedAt && Date.now() - Date.parse(p.siteCheckedAt) < 36 * 3_600_000) out.push(...p.siteProblems);
  out.push(...freshBrowserProblems(p));
  const failed = (p.recentRuns || []).find(r => r.dataIntegrity === 'Live' && r.status === 'failure');
  if (failed && f?.ciPassed === false) out.push('آخر عملية فاشلة: ' + sanitizeTelemetryPayload(failed.workflowName + ' — ' + failed.commitMessage).sanitized.slice(0, 160));
  return [...new Set(out)];
}

/** Plain-Arabic reason a program is not linked to live evidence, or null when linked / intentionally local. */
export function getLinkIssue(p: PlatformRecord): string | null {
  if (p.runtimeMode === 'local-only' || p.runtimeMode === 'github-local') return null;
  if (p.connectionVerified && p.dataIntegrity === 'Live') return null;
  if (p.dataIntegrity === 'Unavailable' || p.connectionStatus === 'Unavailable') {
    const reason = (p.lastVerifiedEvidence || '').split(/;|(?<=\.)\s/)[0].trim();
    return reason && !/^GitHub repository HTTP/.test(reason) ? reason : 'تعذر قراءة GitHub لهذا البرنامج';
  }
  if (p.dataIntegrity === 'Cached') return 'بيانات قديمة تحتاج مزامنة';
  return 'لم يُفحص بعد — اضغط «تحديث»';
}

/** One copy-paste report for Claude: every program with a problem, plus the monitoring gaps, read-only. */
export function buildFleetReportForClaude(platforms: PlatformRecord[], incidents: IncidentCaseFile[], today = new Date().toISOString().slice(0, 10)): string {
  const fleet = platforms.filter(p => p.lifecycleState !== 'unlinked' && p.lifecycleState !== 'archived');
  const withProblems = fleet.map(p => ({ p, problems: getProgramProblems(p) })).filter(x => x.problems.length);
  const open = incidents.filter(i => i.dataIntegrity === 'Live' && !['Resolved', 'False Positive', 'Expected Behavior', "Won't Fix"].includes(i.status));
  const lines = [
    '# تقرير أوربت — ' + today,
    MANDATORY_CLAUDE_GUARDRAIL,
    '',
    'المطلوب: افحص المشاكل أدناه وحدد السبب بالدليل، ثم اقترح أقل تعديل ممكن للموافقة قبل التنفيذ.',
    '',
    '## المشاكل الحالية',
  ];
  if (!withProblems.length && !open.length) lines.push('- لا توجد مشاكل مؤكدة.');
  for (const { p, problems } of withProblems) {
    lines.push('### ' + displayName(p) + ' — ' + p.owner + '/' + p.repoName + ' · ' + p.defaultBranch);
    problems.forEach(x => lines.push('- ' + x));
  }
  for (const i of open) lines.push('- [' + i.appId + '] ' + sanitizeTelemetryPayload(i.title).sanitized + ' (' + i.severity + ')');
  const linkIssues = fleet.map(p => ({ p, issue: getLinkIssue(p) })).filter(x => x.issue);
  if (linkIssues.length) {
    lines.push('', '## مشاكل الربط (برامج لا يقرأ أوربت بياناتها الحية)');
    linkIssues.forEach(({ p, issue }) => lines.push('- ' + displayName(p) + ' (' + p.owner + '/' + p.repoName + '): ' + issue));
  }
  const gaps = fleet.filter(p => !(p.fourState?.siteReachable === true && p.fourState?.userJourneyHealthy === true));
  lines.push('', '## برامج رصدها غير مكتمل (ليست دليل سلامة)', gaps.length ? gaps.map(p => displayName(p)).join('، ') : 'لا يوجد.');
  return lines.join('\n');
}
