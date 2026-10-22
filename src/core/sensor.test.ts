import test from 'node:test';
import assert from 'node:assert/strict';
import { applySensor, createSensorHub, freshSensorProblems, originOf, parseSensorBody, sensorTrailLines } from './sensor.ts';
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
  assert.deepEqual(parseSensorBody('x'.repeat(17000)), []);
  assert.deepEqual(parseSensorBody(body('a b', [{ k: 'error', m: 'x' }])), []);
});

test('parse drops browser noise and keeps the trail only for errors', () => {
  const out = parseSensorBody(body('sess_123456', [
    { k: 'error', m: 'ResizeObserver loop completed with undelivered notifications.' },
    { k: 'error', m: 'Script error.' },
    { k: 'error', m: 'x is not a function @/app.js:10', t: ['at save (/app.js:10:5)', 'at HTMLButtonElement.<anonymous> (/app.js:99:1) https://a.app/q?token=SECRET', 'c', 'd', 'e'], b: ['نقر button#save في /form', 'طلب /api/save ← 500'], o: 1 },
    { k: 'resource', m: 'تعذر تحميل /a.css', t: ['ignored'], b: ['ignored'], o: 1 },
  ]));
  assert.equal(out.length, 2);
  assert.equal(out[0].stack.length, 4, 'at most four frames');
  assert.ok(!out[0].stack.join('').includes('SECRET'));
  assert.deepEqual(out[0].steps, ['نقر button#save في /form', 'طلب /api/save ← 500']);
  assert.equal(out[0].own, true);
  assert.deepEqual([out[1].stack, out[1].steps, out[1].own], [[], [], false]);
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

test('an uncaught error from the program\'s own code counts on first sight and carries its trail', () => {
  const hub = createSensorHub(() => 5);
  hub.add('p', parseSensorBody(body('visitor_one', [{ k: 'error', m: 'Cannot read properties of null', p: '/pay', t: ['at pay (/app.js:3:9)'], b: ['نقر button#pay في /pay'], o: 1 }])));
  const [f] = hub.findings('p');
  assert.equal(f.visitors, 1);
  assert.deepEqual(f.steps, ['نقر button#pay في /pay']);
  assert.match(hub.problems('p')[0], /زائر واحد/);
  hub.add('q', parseSensorBody(body('visitor_one', [{ k: 'error', m: 'third party broke', p: '/', o: 0 }])));
  assert.deepEqual(hub.findings('q'), [], 'a failure outside the program\'s own code still needs two visitors');
});

test('rate limit', () => {
  let t = 0; const hub = createSensorHub(() => t);
  for (let i = 0; i < 3; i++) assert.ok(hub.allow('ip', 3, 60_000));
  assert.equal(hub.allow('ip', 3, 60_000), false);
  t += 61_000; assert.ok(hub.allow('ip', 3, 60_000));
});

const finding = (text: string, extra = {}) => ({ text, page: '/pay', visitors: 2, stack: ['at pay (/app.js:3:9)'], steps: ['نقر button#pay في /pay'], ...extra });

test('record helpers', () => {
  const p = { id: 'a' } as PlatformRecord; const now = new Date().toISOString();
  assert.equal(applySensor(p, [], now), p);
  const q = applySensor(p, [finding('m')], now);
  assert.deepEqual(freshSensorProblems(q), ['m (2 زائر)']);
  assert.deepEqual(freshSensorProblems({ ...q, sensorCheckedAt: new Date(Date.now() - 7 * 3_600_000).toISOString() }), []);
  assert.equal(originOf('https://a.app/path?x'), 'https://a.app');
  assert.equal(originOf('http://a.app'), null);
});

test('a restart that empties the hub does not erase recent findings, but old ones do expire', () => {
  const p = { id: 'a' } as PlatformRecord;
  const t0 = new Date('2026-01-01T10:00:00Z');
  const first = applySensor(p, [finding('old')], t0.toISOString());
  const soon = applySensor(first, [finding('new')], new Date(t0.getTime() + 3_600_000).toISOString());
  assert.deepEqual(soon.sensorEvidence?.map(e => e.text), ['new', 'old']);
  const late = applySensor(soon, [], new Date(t0.getTime() + 8 * 3_600_000).toISOString());
  assert.deepEqual(late.sensorEvidence, []);
});

test('the trail lines tell Claude where and what happened', () => {
  const q = applySensor({ id: 'a' } as PlatformRecord, [finding('خطأ برمجي: boom')], new Date().toISOString());
  const text = sensorTrailLines(q).join('\n');
  assert.match(text, /ما فعله الزائر قبل الخطأ: نقر button#pay/);
  assert.match(text, /موضع الخطأ: at pay \(\/app\.js:3:9\)/);
  assert.deepEqual(sensorTrailLines({ id: 'a' } as PlatformRecord), []);
});
