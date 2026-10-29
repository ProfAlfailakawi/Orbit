import test from 'node:test';
import assert from 'node:assert/strict';
import { alertSignature, computeAlertChanges } from './alerts.ts';
import { applySensor, createSensorHub, parseSensorBody } from './sensor.ts';
import { buildRows } from './fleetStatus.ts';
import { inspectRepositoryCapabilities } from './engine.ts';
import type { ProgramRow } from './fleetStatus.ts';

const row = (id: string, tone: ProgramRow['tone'], text = 'x'): ProgramRow => ({
  platform: { id, codeName: id.toUpperCase(), nameAr: 'ar', isCustomAdded: false } as any, tone, text, needsCopy: tone === 'bad', incidents: [],
});

test('the first run only records a baseline: no flood when alerts are first enabled', () => {
  const { messages, next } = computeAlertChanges([row('a', 'bad', 'آخر نشر لم ينجح'), row('b', 'ok')], undefined);
  assert.deepEqual(messages, []);
  assert.deepEqual(next, { initialized: true, signatures: { a: 'آخر نشر لم ينجح', b: '' } });
});

test('a program that gets a new problem is announced once, in English name + Arabic problem', () => {
  const memory = { initialized: true, signatures: { a: '', b: '' } };
  const first = computeAlertChanges([row('a', 'bad', 'الموقع لا يستجيب'), row('b', 'ok')], memory);
  assert.deepEqual(first.messages.map(m => [m.kind, m.title, m.body]), [['problem', 'A', 'الموقع لا يستجيب']]);
  const again = computeAlertChanges([row('a', 'bad', 'الموقع لا يستجيب'), row('b', 'ok')], first.next);
  assert.deepEqual(again.messages, [], 'the same problem is not repeated');
  const changed = computeAlertChanges([row('a', 'bad', 'آخر نشر لم ينجح'), row('b', 'ok')], first.next);
  assert.equal(changed.messages.length, 1, 'a different problem is announced');
});

test('recovery is announced; a program that is merely unverified is not an alert', () => {
  const memory = { initialized: true, signatures: { a: 'الموقع لا يستجيب', b: '' } };
  const { messages } = computeAlertChanges([row('a', 'ok', 'يعمل'), row('b', 'warn', 'الرصد ناقص')], memory);
  assert.deepEqual(messages.map(m => [m.kind, m.title, m.body]), [['recovered', 'A', 'عاد للعمل']]);
});

test('a burst of new problems collapses into one summary', () => {
  const memory = { initialized: true, signatures: Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map(i => [i, ''])) };
  const rows = ['a', 'b', 'c', 'd', 'e'].map(i => row(i, 'bad', 'مشكلة'));
  const { messages } = computeAlertChanges(rows, memory);
  assert.equal(messages.length, 1); assert.equal(messages[0].kind, 'summary'); assert.match(messages[0].body, /5 برامج/);
});

test('an early warning is announced once like a problem, and clearing it counts as recovery', () => {
  const early = (id: string, text: string): ProgramRow => ({ ...row(id, 'warn', text), early: true });
  const memory = { initialized: true, signatures: { a: '' } };
  const first = computeAlertChanges([early('a', 'الموقع يتباطأ')], memory);
  assert.deepEqual(first.messages.map(m => [m.kind, m.body]), [['problem', 'الموقع يتباطأ']]);
  assert.deepEqual(computeAlertChanges([early('a', 'الموقع يتباطأ')], first.next).messages, []);
  assert.equal(computeAlertChanges([row('a', 'ok', 'يعمل')], first.next).messages[0].kind, 'recovered');
});

// One program, one unchanged visitor error seen by more and more visitors: the full path hub → record → row → alert.
const site = () => ({
  ...inspectRepositoryCapabilities({ owner: 'ProfAlfailakawi', repoName: 'pay', codeName: 'PAY', nameAr: 'PAY', description: 'Test', runtimeMode: 'github-web' }),
  lifecycleState: 'active', connectionVerified: true, dataIntegrity: 'Live', productionUrl: 'https://x.example', productionUrlVerified: true,
  fourState: { ciPassed: true, deploymentSucceeded: true, siteReachable: true, userJourneyHealthy: null },
} as any);
const beacon = (session: string, m = 'x is undefined') => parseSensorBody(JSON.stringify({ s: session, r: [{ k: 'error', m, p: '/' }] }));

test('five visitors hitting the same unchanged error send one push, not four', () => {
  let t = Date.now() - 10 * 60_000; const hub = createSensorHub(() => t);
  let p = site(); let memory = computeAlertChanges(buildRows([p], [], []), undefined).next;
  const pushes: string[] = [];
  for (let i = 1; i <= 5; i++) {
    t += 60_000; hub.add(p.id, beacon('visitor_' + i), 'ip-' + i);
    p = applySensor(p, hub.findings(p.id), new Date(t).toISOString());
    const { messages, next } = computeAlertChanges(buildRows([p], [], []), memory);
    pushes.push(...messages.map(m => m.body)); memory = next;
  }
  assert.equal(pushes.length, 1);
  assert.match(pushes[0], /x is undefined \(زائران\)/, 'the push still shows the count as it was when it was sent');
});

test('a genuinely new error, and an error that returns after recovering, still alert', () => {
  const memory = { initialized: true, signatures: { a: '' } };
  const first = computeAlertChanges([row('a', 'bad', 'خطأ: x (زائران)')], memory);
  assert.equal(first.messages.length, 1);
  assert.deepEqual(computeAlertChanges([row('a', 'bad', 'خطأ: x (7 زوار)')], first.next).messages, [], 'more visitors, same error');
  assert.equal(computeAlertChanges([row('a', 'bad', 'خطأ: x (7 زوار) · خطأ: y (زائران)')], first.next).messages.length, 1, 'a second error is new');
  const gone = computeAlertChanges([row('a', 'ok', 'يعمل')], first.next);
  assert.equal(gone.messages[0].kind, 'recovered');
  assert.equal(computeAlertChanges([row('a', 'bad', 'خطأ: x (زائران)')], gone.next).messages[0].kind, 'problem', 'it came back');
});

test('alert signatures ignore counts in every wording and the order of the parts; old memories match without a re-send', () => {
  assert.equal(alertSignature('خطأ: x (3 زائر) · خطأ: y (زائر واحد)'), alertSignature('خطأ: y (11 زائرًا) · خطأ: x (زائران)'));
  const old = { initialized: true, signatures: { a: 'خطأ: x (4 زائر)' } }; // saved before this change, raw text with the old wording
  assert.deepEqual(computeAlertChanges([row('a', 'bad', 'خطأ: x (5 زوار)')], old).messages, []);
});
