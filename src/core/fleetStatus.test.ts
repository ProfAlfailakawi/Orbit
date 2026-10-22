import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRows, sharedLinkReason, summarize, programsPhrase, lastCheckLabel, buildCopyText, watchHealth, minutesPhrase } from './fleetStatus.ts';
import { applyCert } from './certs.ts';
import { applySensor } from './sensor.ts';
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

test('an early warning is a warn row that says so, and the headline does not claim missing monitoring', () => {
  const soon = applyCert(working('SOON'), { expiresAt: new Date(Date.now() + 9 * 86_400_000).toISOString(), problem: null }, new Date().toISOString());
  const rows = buildRows([soon, working('OK')], [], []);
  assert.deepEqual(rows.map(r => [r.tone, Boolean(r.early)]), [['warn', true], ['ok', false]]);
  assert.match(rows[0].text, /شهادة الأمان.*بعد 9 أيام/);
  const summary = summarize(rows);
  assert.equal(summary.tone, 'warn');
  assert.match(summary.headline, /لا شيء معطل.*تحذير مبكر/);
});

test('a certificate that ends in two days is a real problem', () => {
  const dying = applyCert(working('DYING'), { expiresAt: new Date(Date.now() + 2 * 86_400_000).toISOString(), problem: null }, new Date().toISOString());
  const [row] = buildRows([dying], [], []);
  assert.equal(row.tone, 'bad');
  assert.match(row.text, /تنتهي بعد يومين/);
});

test('the copied report names the trail, the probable cause and the suspect commit', () => {
  const now = Date.now();
  const sick = applySensor(working('PAY'), [{ text: 'خطأ برمجي ظهر لزوّار الموقع: x is null', page: '/pay', visitors: 1, stack: ['at pay (/app.js:3:9)'], steps: ['نقر button#pay في /pay'] }], new Date(now).toISOString());
  sick.siteLastOkAt = new Date(now - 6 * 3_600_000).toISOString();
  sick.recentCommits = [{ sha: 'abcdef1234567', author: 'a', message: 'refactor pay', timestamp: new Date(now - 3_600_000).toISOString(), branch: 'main', changedFiles: ['src/pay.ts'], riskLevel: 'Low', dataIntegrity: 'Live' }];
  const rows = buildRows([sick], [], []);
  const text = buildCopyText(rows, 'all');
  assert.match(text, /ما فعله الزائر قبل الخطأ: نقر button#pay/);
  assert.match(text, /موضع الخطأ: at pay/);
  assert.match(text, /المشكلة بدأت بعد آخر تعديل: abcdef1 «refactor pay» — الملفات: src\/pay\.ts/);
  const older = { ...sick, recentCommits: [{ ...sick.recentCommits[0], timestamp: new Date(now - 9 * 3_600_000).toISOString() }] };
  assert.doesNotMatch(buildCopyText(buildRows([older], [], []), 'all'), /المشكلة بدأت بعد آخر تعديل/);
});

test('the owner is told when the automatic watch itself has gone quiet', () => {
  const now = Date.parse('2026-05-01T12:00:00Z');
  const seen = (minutesAgo: number) => app('A', { siteCheckedAt: new Date(now - minutesAgo * 60_000).toISOString() });
  assert.deepEqual(watchHealth([seen(10)], now), { stale: false, minutes: 10 });
  assert.deepEqual(watchHealth([seen(200), seen(400)], now), { stale: true, minutes: 200 });
  assert.equal(watchHealth([app('B')], now), null, 'no site to watch means nothing to be stale');
  assert.deepEqual([minutesPhrase(45), minutesPhrase(200), minutesPhrase(60 * 30)], ['45 دقيقة', '3 ساعات', 'يوم']);
});
