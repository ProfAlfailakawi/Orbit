import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRows, sharedLinkReason, summarize, programsPhrase, lastCheckLabel, buildCopyText } from './fleetStatus.ts';
import { inspectRepositoryCapabilities } from './engine.ts';
import type { PlatformRecord } from './types.ts';

const app = (codeName: string, patch: Partial<PlatformRecord> = {}): PlatformRecord => ({
  ...inspectRepositoryCapabilities({ owner: 'ProfAlfailakawi', repoName: codeName.toLowerCase(), codeName, nameAr: codeName, description: 'Test', runtimeMode: 'github-web' }),
  lifecycleState: 'active', ...patch,
});
const working = (codeName: string) => app(codeName, {
  connectionVerified: true, dataIntegrity: 'Live', productionUrl: 'https://x.example', productionUrlVerified: true,
  fourState: { ciPassed: true, deploymentSucceeded: true, siteReachable: true, userJourneyHealthy: null },
});

test('rows are classified and sorted: problems, then gaps, then working, then local', () => {
  const failing = working('BAD'); failing.fourState = { ...failing.fourState, deploymentSucceeded: false };
  const rows = buildRows([working('OK'), app('NEW'), failing, app('LOC', { runtimeMode: 'local-only' })], [], []);
  assert.deepEqual(rows.map(r => r.tone), ['bad', 'warn', 'ok', 'local']);
  assert.equal(rows[0].text, 'آخر نشر لم ينجح');
  assert.deepEqual(rows.map(r => r.needsCopy), [true, true, false, false]);
});

test('unlinked and archived programs are not shown', () => {
  assert.equal(buildRows([app('A', { lifecycleState: 'unlinked' }), app('B', { lifecycleState: 'archived' })], [], []).length, 0);
});

test('a working program with an unknown journey is not a problem', () => {
  assert.equal(buildRows([working('OK')], [], [])[0].tone, 'ok');
});

test('summary wording follows the worst row', () => {
  const failing = working('BAD'); failing.fourState = { ...failing.fourState, siteReachable: false };
  assert.equal(summarize(buildRows([failing], [], [])).headline, 'يوجد برنامج فيه مشكلة');
  assert.match(summarize(buildRows([failing, { ...failing, id: 'x2', codeName: 'B2' }], [], [])).headline, /برنامجان/);
  assert.equal(summarize(buildRows([app('NEW')], [], [])).tone, 'warn');
  const ok = summarize(buildRows([working('OK')], [], []));
  assert.equal(ok.tone, 'ok'); assert.equal(ok.buttonLabel, null);
});

test('Arabic count phrases', () => {
  assert.deepEqual([1, 2, 3, 10, 11].map(programsPhrase), ['برنامج واحد', 'برنامجان', '3 برامج', '10 برامج', '11 برنامجًا']);
});

test('last check label uses the newest linked evidence only', () => {
  const now = Date.parse('2026-10-22T12:00:00Z');
  assert.equal(lastCheckLabel([app('A')], now), 'لم يُفحص بعد');
  const linked = working('B'); linked.lastVerifiedTimestamp = '2026-10-22T11:55:00Z';
  assert.equal(lastCheckLabel([linked], now), 'آخر فحص: قبل 5 دقائق');
});

test('copy text covers one program or all, and always carries the safety guardrail', () => {
  const failing = working('BAD'); failing.fourState = { ...failing.fourState, ciPassed: false };
  const rows = buildRows([failing, app('NEW')], [], []);
  const one = buildCopyText(rows, failing.id);
  assert.match(one, /BAD/); assert.doesNotMatch(one, /NEW/);
  const all = buildCopyText(rows, 'all');
  assert.match(all, /BAD/); assert.match(all, /NEW/); assert.match(all, /لا تدمج أو تنشر/);
});

test('a link reason shared by several programs is written once in the summary, not on every row', () => {
  const unlinked = ['A', 'B', 'C'].map(c => app(c, { dataIntegrity: 'Unavailable', connectionStatus: 'Unavailable', lastVerifiedEvidence: 'المستودع خاص ولم يُضبط توكن GitHub; prior success.' }));
  const rows = buildRows(unlinked, [], []);
  assert.deepEqual(rows.map(r => r.text), ['غير مربوط', 'غير مربوط', 'غير مربوط']);
  assert.equal(summarize(rows, sharedLinkReason(unlinked)).reason, 'المستودع خاص ولم يُضبط توكن GitHub');
  assert.equal(sharedLinkReason([unlinked[0]]), null);
});
