/**
 * A program can move to a new repository (the schedule system moved from `schedule`, now archived, to `schedule-kw`).
 * Saved state wins over the seed catalog, so the move has to be applied to what is already stored: point the record at the
 * new repository and forget everything that was learned from the old one, so the next sync starts from real evidence.
 */
import type { PlatformRecord } from './types.ts';

export const REPO_RENAMES: Array<{ id: string; from: string; to: string }> = [
  { id: 'schedule', from: 'schedule', to: 'schedule-kw' },
];

export function applyRepoRenames(platforms: PlatformRecord[], renames = REPO_RENAMES): { platforms: PlatformRecord[]; renamed: string[] } {
  const renamed: string[] = [];
  const next = platforms.map(p => {
    const rule = renames.find(r => r.id === p.id && r.from.toLowerCase() === p.repoName.toLowerCase());
    if (!rule) return p;
    renamed.push(p.id);
    return {
      ...p,
      repoName: rule.to,
      repoUrl: `https://github.com/${p.owner}/${rule.to}`,
      connectionVerified: false,
      connectionStatus: 'Pending Credentials',
      dataIntegrity: 'Not Configured',
      lastVerifiedEvidence: '',
      lastVerifiedTimestamp: '',
      healthStatus: 'Monitoring Gap',
      monitoringCoveragePct: 0,
      releaseShield: 'Insufficient Evidence',
      releaseConfidencePct: 0,
      recentRuns: [],
      recentCommits: [],
      branchHeads: undefined,
      fourState: { ciPassed: null, deploymentSucceeded: null, siteReachable: null, userJourneyHealthy: null },
      productionUrl: null,
      productionUrlVerified: false,
      siteProblems: undefined, siteCheckedAt: undefined, siteLastOkAt: undefined,
      browserVisit: undefined, sensorProblems: undefined, sensorEvidence: undefined, sensorCheckedAt: undefined,
      vitals: undefined, certExpiresAt: undefined, certProblem: undefined, certCheckedAt: undefined,
      domainExpiresAt: undefined, domainCheckedAt: undefined,
    } as PlatformRecord;
  });
  return { platforms: next, renamed };
}
