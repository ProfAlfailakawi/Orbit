import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRepoRenames } from './repoRenames.ts';
import { INITIAL_PLATFORMS } from './seedData.ts';
import type { PlatformRecord } from './types.ts';

const stale = (): PlatformRecord => ({
  ...INITIAL_PLATFORMS.find(p => p.id === 'schedule')!,
  repoName: 'schedule', repoUrl: 'https://github.com/ProfAlfailakawi/schedule',
  connectionVerified: true, dataIntegrity: 'Live', lastVerifiedEvidence: 'old repo', lastVerifiedTimestamp: '2026-01-01T00:00:00Z',
  productionUrl: 'https://old.example', productionUrlVerified: true,
  recentCommits: [{ sha: 'abc1234', author: 'a', message: 'm', timestamp: '2026-01-01T00:00:00Z', branch: 'main', changedFiles: [], riskLevel: 'Low', dataIntegrity: 'Live' }],
  fourState: { ciPassed: false, deploymentSucceeded: false, siteReachable: true, userJourneyHealthy: null },
  siteProblems: ['x'], vitals: [{ at: 'n', ms: 1, bytes: 1 }],
});

test('the seed catalog already points the schedule system at schedule-kw', () => {
  const seed = INITIAL_PLATFORMS.find(p => p.id === 'schedule')!;
  assert.equal(seed.repoName, 'schedule-kw');
  assert.equal(seed.repoUrl, 'https://github.com/ProfAlfailakawi/schedule-kw');
});

test('saved state that still points at the archived repository is moved and its old evidence forgotten', () => {
  const other = { ...INITIAL_PLATFORMS[0] };
  const { platforms, renamed } = applyRepoRenames([stale(), other]);
  assert.deepEqual(renamed, ['schedule']);
  const moved = platforms[0];
  assert.equal(moved.repoName, 'schedule-kw');
  assert.equal(moved.repoUrl, 'https://github.com/ProfAlfailakawi/schedule-kw');
  assert.equal(moved.connectionVerified, false);
  assert.equal(moved.dataIntegrity, 'Not Configured');
  assert.deepEqual([moved.recentCommits, moved.productionUrl, moved.productionUrlVerified, moved.siteProblems, moved.vitals], [[], null, false, undefined, undefined]);
  assert.deepEqual(moved.fourState, { ciPassed: null, deploymentSucceeded: null, siteReachable: null, userJourneyHealthy: null });
  assert.equal(platforms[1], other, 'other programs are untouched');
});

test('it is idempotent: a record already on the new repository is left alone', () => {
  const first = applyRepoRenames([stale()]).platforms;
  const again = applyRepoRenames(first);
  assert.deepEqual(again.renamed, []);
  assert.equal(again.platforms[0], first[0]);
});
