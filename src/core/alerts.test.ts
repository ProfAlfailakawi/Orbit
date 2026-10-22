import test from 'node:test';
import assert from 'node:assert/strict';
import { computeAlertChanges } from './alerts.ts';
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
