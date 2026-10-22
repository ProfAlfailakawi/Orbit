/** Applying a site visit to a program record. Pure, so the server routes stay thin and this is unit-tested. */
import type { PlatformRecord } from './types.ts';
import type { VisitResult } from './visitor.ts';

const confirmedChecks = (fourState: PlatformRecord['fourState']) => Object.values(fourState).filter(v => v !== null).length;

function healthOf(p: PlatformRecord, fourState: PlatformRecord['fourState'], problems: string[]): PlatformRecord['healthStatus'] {
  if (fourState.siteReachable === false) return 'Offline';
  if (fourState.ciPassed === false || fourState.deploymentSucceeded === false || fourState.userJourneyHealthy === false || problems.length) return 'Degraded';
  return confirmedChecks(fourState) === 4 ? 'Healthy' : 'Monitoring Gap';
}

export function applyVisit(p: PlatformRecord, url: string, visit: VisitResult, nowIso: string): PlatformRecord {
  const fourState = { ...p.fourState, siteReachable: visit.reachable };
  return {
    ...p,
    productionUrl: url,
    productionUrlVerified: visit.reachable,
    fourState,
    monitoringCoveragePct: Math.round(confirmedChecks(fourState) * 100 / 4),
    healthStatus: healthOf(p, fourState, visit.problems),
    siteProblems: visit.problems,
    siteCheckedAt: nowIso,
  };
}

/** A program with no confirmed website of its own: forget any address that was never verified (seeded placeholders, strangers' sites). */
export function clearSite(p: PlatformRecord): PlatformRecord {
  if (!p.productionUrl && p.fourState.siteReachable === null && !p.siteProblems?.length && !p.productionUrlVerified) return p;
  const fourState = { ...p.fourState, siteReachable: null };
  return { ...p, productionUrl: null, productionUrlVerified: false, fourState, monitoringCoveragePct: Math.round(confirmedChecks(fourState) * 100 / 4), siteProblems: [], siteCheckedAt: undefined };
}

/** Run `fn` over items with bounded concurrency and an overall deadline; items not started by then are skipped. */
export async function pool<T, R>(items: T[], concurrency: number, deadlineMs: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  const started = Date.now();
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length && Date.now() - started < deadlineMs) {
      const item = items[next++];
      out.push(await fn(item));
    }
  }));
  return out;
}
