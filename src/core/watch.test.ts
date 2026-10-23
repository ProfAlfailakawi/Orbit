import test from 'node:test';
import assert from 'node:assert/strict';
import { applyVisit, clearSite, pool } from './watch.ts';
import { inspectRepositoryCapabilities } from './engine.ts';
import type { PlatformRecord } from './types.ts';

const app = (patch: Partial<PlatformRecord> = {}): PlatformRecord => ({
  ...inspectRepositoryCapabilities({ owner: 'o', repoName: 'r', codeName: 'APP', nameAr: 'APP', description: 'T', runtimeMode: 'github-web' }),
  lifecycleState: 'active', ...patch,
});
const visit = (over: object = {}) => ({ reachable: true, ok: true, status: 200, problems: [] as string[], evidence: 'ok', ms: 5, ...over });

test('a good visit records the verified site and raises coverage', () => {
  const p = applyVisit(app({ fourState: { ciPassed: true, deploymentSucceeded: true, siteReachable: null, userJourneyHealthy: null } }), 'https://a.example', visit(), '2026-01-01T00:00:00Z');
  assert.equal(p.productionUrl, 'https://a.example'); assert.equal(p.productionUrlVerified, true);
  assert.equal(p.fourState.siteReachable, true); assert.equal(p.monitoringCoveragePct, 75); assert.equal(p.healthStatus, 'Monitoring Gap');
});

test('an unreachable site is Offline; a page with problems is Degraded', () => {
  assert.equal(applyVisit(app(), 'https://a.example', visit({ reachable: false, ok: false, problems: ['الموقع لا يستجيب'] }), 'n').healthStatus, 'Offline');
  const degraded = applyVisit(app(), 'https://a.example', visit({ ok: false, problems: ['ملف التطبيق x لا يُحمَّل (HTTP 404)'] }), 'n');
  assert.equal(degraded.healthStatus, 'Degraded'); assert.deepEqual(degraded.siteProblems, ['ملف التطبيق x لا يُحمَّل (HTTP 404)']);
});

test('a program with no confirmed site forgets a never-verified placeholder address', () => {
  const stale = app({ productionUrl: 'https://placeholder.app', productionUrlVerified: true, siteProblems: ['x'], fourState: { ciPassed: true, deploymentSucceeded: null, siteReachable: true, userJourneyHealthy: null } });
  const cleared = clearSite(stale);
  assert.equal(cleared.productionUrl, null); assert.equal(cleared.productionUrlVerified, false);
  assert.equal(cleared.fourState.siteReachable, null); assert.deepEqual(cleared.siteProblems, []);
  const clean = app();
  assert.equal(clearSite(clean), clean, 'nothing to clear: same object back');
});

test('pool runs with bounded concurrency and stops starting new work after the deadline', async () => {
  let running = 0, peak = 0;
  const done = await pool([1, 2, 3, 4, 5, 6], 2, 10_000, async n => { running += 1; peak = Math.max(peak, running); await new Promise(r => setTimeout(r, 10)); running -= 1; return n; });
  assert.equal(done.length, 6); assert.ok(peak <= 2);
  const late = await pool([1, 2, 3, 4], 1, 25, async n => { await new Promise(r => setTimeout(r, 20)); return n; });
  assert.ok(late.length < 4, 'deadline skips the rest');
});

test('the speed sample is the home page request, and size is recorded for every good visit', () => {
  const first = applyVisit(app(), 'https://a.example', visit({ htmlBytes: 5000, ms: 5500, pageMs: 300 }), '2026-01-01T00:00:00Z');
  assert.deepEqual(first.vitals?.map(v => [v.ms, v.bytes]), [[300, 5000]], 'whole-visit time (with asset retries) is not used');
  const older = applyVisit(app(), 'https://a.example', visit({ htmlBytes: 5000, ms: 700 }), '2026-01-01T00:00:00Z');
  assert.equal(older.vitals?.[0].ms, 700, 'without a page time the visit time is the fallback');
});
