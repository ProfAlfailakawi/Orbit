import test from 'node:test';
import assert from 'node:assert/strict';
import { applySensor, createSensorHub, freshSensorProblems, originOf, parseSensorBody, redactPathIds, scrubText, sensorNoteLines, sensorNoteTexts, sensorTrailLines } from './sensor.ts';
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

test('an uncaught error from the program\'s own code seen by one visitor is a note with its trail, not a problem', () => {
  const hub = createSensorHub(() => 5);
  hub.add('p', parseSensorBody(body('visitor_one', [{ k: 'error', m: 'Cannot read properties of null', p: '/pay', t: ['at pay (/app.js:3:9)'], b: ['نقر button#pay في /pay'], o: 1 }])));
  const [f] = hub.findings('p');
  assert.equal(f.visitors, 1);
  assert.equal(f.note, true);
  assert.deepEqual(f.steps, ['نقر button#pay في /pay']);
  assert.deepEqual(hub.problems('p'), [], 'one visitor can be an extension or a stale cache');
  hub.add('p', parseSensorBody(body('visitor_two', [{ k: 'error', m: 'Cannot read properties of null', p: '/pay', o: 1 }])));
  assert.equal(hub.problems('p').length, 1, 'a second visitor makes it a problem');
  hub.add('q', parseSensorBody(body('visitor_one', [{ k: 'error', m: 'third party broke', p: '/', o: 0 }])));
  assert.deepEqual(hub.findings('q'), [], 'a failure outside the program\'s own code still needs two visitors');
});

test('connection failures are an outage signal only as a burst of several visitors within an hour', () => {
  let t = 10_000_000; const hub = createSensorHub(() => t);
  const fail = (s: string) => parseSensorBody(body(s, [{ k: 'request', m: 'فشل الاتصال /api/cloud-status', p: '/' }]));
  hub.add('p', fail('visitor_one')); t += 3 * 3_600_000; hub.add('p', fail('visitor_two'));
  assert.deepEqual(hub.problems('p'), [], 'two visitors hours apart is weak signal, not an outage');
  assert.equal(hub.findings('p')[0].note, true, 'but it is kept as a note');
  t += 60_000; hub.add('p', fail('visitor_three')); hub.add('p', fail('visitor_four'));
  assert.equal(hub.problems('p').length, 1, 'three visitors within the hour is a burst');
  // a server error status stays a problem at two visitors
  const hub2 = createSensorHub(() => 5);
  for (const v of ['visitor_one', 'visitor_two']) hub2.add('p', parseSensorBody(body(v, [{ k: 'request', m: 'HTTP 503 /api/pay', p: '/' }])));
  assert.equal(hub2.problems('p').length, 1);
});

test('notes never reach the program problems; they appear in the report lines', () => {
  const p = applySensor({ id: 'a' } as PlatformRecord, [finding('خطأ برمجي: x', { visitors: 1, note: true, lastAt: new Date().toISOString() })], new Date().toISOString());
  assert.deepEqual(freshSensorProblems(p), []);
  assert.deepEqual(sensorTrailLines(p), []);
  assert.match(sensorNoteLines(p).join('\n'), /خطأ برمجي: x \(زائر واحد\)/);
  assert.match(sensorNoteTexts(p)[0], /^ملاحظة من زوّار/);
});

test('an old incident is not kept alive by another visitor reporting something else', () => {
  const t0 = new Date('2026-01-01T10:00:00Z');
  const incident = finding('طلب يفشل', { lastAt: t0.toISOString() });
  let p = applySensor({ id: 'a' } as PlatformRecord, [incident], t0.toISOString());
  // 7 hours later a different, new finding arrives; the hub still holds the old one (24h window) and passes it again
  const later = new Date(t0.getTime() + 7 * 3_600_000);
  p = applySensor(p, [incident, finding('جديد', { lastAt: later.toISOString() })], later.toISOString());
  const live = freshSensorProblems(p, later.getTime());
  assert.equal(live.length, 1);
  assert.match(live[0], /جديد/);
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

test('identifiers are redacted from paths and request breadcrumbs, even from older copies of the script', () => {
  assert.equal(redactPathIds('/api/participants/48213/answers'), '/api/participants/:id/answers');
  assert.equal(redactPathIds('/s/3f2b8c1e-9a4d-4b7e-8c11-2a5d6e7f8091/run'), '/s/:id/run');
  assert.equal(redactPathIds('/u/ahmad%40example.com'), '/u/:id');
  assert.equal(redactPathIds('/session/ab12cd34ef56'), '/session/:id');
  assert.equal(redactPathIds('/api/save'), '/api/save', 'plain route words stay');
  assert.equal(redactPathIds('at run (/assets/index-BVx95H3k.js:10:5)'), 'at run (/assets/index-BVx95H3k.js:10:5)', 'a file name stays readable in a stack');
  assert.equal(redactPathIds('Uncaught Error: boom @/participant/48213/:4'), 'Uncaught Error: boom @/participant/:id/:4');
  const out = parseSensorBody(body('sess_123456', [
    { k: 'request', m: 'HTTP 500 /api/participants/48213', p: '/participant/48213/results' },
    { k: 'error', m: 'x is null', p: '/pay', b: ['\u0637\u0644\u0628 /api/participants/48213 \u2190 500', 'click in /pay'], o: 1 },
  ]));
  assert.equal(out[0].message, 'HTTP 500 /api/participants/:id');
  assert.equal(out[0].page, '/participant/:id/results');
  assert.ok(out[1].steps[0].includes('/api/participants/:id'));
  assert.ok(!JSON.stringify(out).includes('48213'));
});

test('what a visitor typed or uploaded does not leave through an error message, and console reports are dropped', () => {
  assert.equal(scrubText('Failed for ahmad@example.com'), 'Failed for [email]');
  assert.equal(scrubText('call 965 5551 2345 failed'), 'call [num] failed');
  assert.equal(scrubText('bad token abcdefghijklmnopqrstuvwxyz012345'), 'bad token [token]');
  assert.equal(scrubText('File "holiday photo 2026.png" is too large'), 'File "..." is too large');
  assert.equal(scrubText("Cannot read properties of null (reading 'total')"), "Cannot read properties of null (reading 'total')", 'a plain property name stays');
  assert.equal(redactPathIds('/share/aB3dE5gH7jKl'), '/share/:id', 'a share-link token is redacted');
  assert.equal(redactPathIds('/api/participants/list'), '/api/participants/list', 'long lowercase route words are not tokens');
  const out = parseSensorBody(body('sess_123456', [
    { k: 'console', m: 'user object {"uid":"u1","email":"a@b.co"}' },
    { k: 'error', m: 'Upload failed: "my private scan.pdf" by a@b.co', p: '/s/aB3dE5gH7jKl', o: 1 },
  ]));
  assert.equal(out.length, 1, 'console reports are ignored');
  assert.equal(out[0].message, 'Upload failed: "..." by [REDACTED_EMAIL]');
  assert.equal(out[0].page, '/s/:id');
});

test('findings saved before notes existed are judged by the current rules and then age normally', () => {
  const saved = (text: string, visitors: number) => ({ text, page: '/', visitors, stack: [], steps: [] });
  const t0 = new Date('2026-10-23T00:00:00Z');
  const legacy = {
    id: 'a', sensorCheckedAt: t0.toISOString(),
    sensorEvidence: [
      saved('طلب من الموقع يفشل عند الزوّار: فشل الاتصال /api/cloud-status', 2),
      saved('خطأ برمجي ظهر لزوّار الموقع: Uncaught TypeError: x', 1),
      saved('طلب من الموقع يفشل عند الزوّار: HTTP 503 /api/pay', 2),
    ],
  } as unknown as PlatformRecord;
  const live = freshSensorProblems(legacy, t0.getTime() + 60_000);
  assert.equal(live.length, 1, 'only the 503 seen by two visitors is still a problem');
  assert.match(live[0], /HTTP 503/);
  assert.equal(sensorNoteLines(legacy, t0.getTime() + 60_000).length, 2, 'the connection failure and the single-visitor error are notes');
  // later reports keep arriving, but they do not renew the old entries: they were stamped with when the sensor last reported
  let p = applySensor(legacy, [], new Date(t0.getTime() + 1_000).toISOString());
  p = applySensor(p, [], new Date(t0.getTime() + 5 * 3_600_000).toISOString());
  assert.equal(freshSensorProblems(p, t0.getTime() + 5.5 * 3_600_000).length, 1);
  assert.deepEqual(freshSensorProblems(p, t0.getTime() + 7 * 3_600_000), [], 'six hours after the last time it was seen, it is gone');
});
