import test from 'node:test';
import assert from 'node:assert/strict';
import { applySensor, createSensorHub, freshSensorProblems, originOf, parseSensorBody } from './sensor.ts';
import type { PlatformRecord } from './types.ts';

const body = (s: string, r: unknown[]) => JSON.stringify({ s, r });

test('parse accepts clean reports and strips urls/queries and secrets', () => {
  const out = parseSensorBody(body('sess_123456', [{ k: 'resource', m: 'failed https://a.app/x.js?token=abc ghp_abcdefghijklmnop1234', p: '/home?x=1' }, { k: 'bogus', m: 'x' }, { k: 'error', m: '' }]));
  assert.equal(out.length, 1);
  assert.ok(!out[0].message.includes('token=') && !out[0].message.includes('ghp_abcdefghij'));
  assert.equal(out[0].page, '/home');
});

test('parse rejects garbage, big bodies and bad sessions', () => {
  assert.deepEqual(parseSensorBody('nope'), []);
  assert.deepEqual(parseSensorBody({}), []);
  assert.deepEqual(parseSensorBody('x'.repeat(9000)), []);
  assert.deepEqual(parseSensorBody(body('a b', [{ k: 'error', m: 'x' }])), []);
});

test('an error needs two different visitors before it counts', () => {
  let t = 1_000_000; const hub = createSensorHub(() => t);
  const r = (s: string) => parseSensorBody(body(s, [{ k: 'error', m: 'x is undefined', p: '/' }]));
  hub.add('p', r('visitor_one')); hub.add('p', r('visitor_one'));
  assert.deepEqual(hub.problems('p'), []);
  hub.add('p', r('visitor_two'));
  assert.equal(hub.problems('p').length, 1);
  t += 25 * 3_600_000;
  assert.deepEqual(hub.problems('p'), []);
});

test('rate limit', () => {
  let t = 0; const hub = createSensorHub(() => t);
  for (let i = 0; i < 3; i++) assert.ok(hub.allow('ip', 3, 60_000));
  assert.equal(hub.allow('ip', 3, 60_000), false);
  t += 61_000; assert.ok(hub.allow('ip', 3, 60_000));
});

test('record helpers', () => {
  const p = { id: 'a' } as PlatformRecord; const now = new Date().toISOString();
  assert.equal(applySensor(p, [], now), p);
  const q = applySensor(p, ['m'], now);
  assert.deepEqual(freshSensorProblems(q), ['m']);
  assert.deepEqual(freshSensorProblems({ ...q, sensorCheckedAt: new Date(Date.now() - 7 * 3_600_000).toISOString() }), []);
  assert.equal(originOf('https://a.app/path?x'), 'https://a.app');
  assert.equal(originOf('http://a.app'), null);
});
