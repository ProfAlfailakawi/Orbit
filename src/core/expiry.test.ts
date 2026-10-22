import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDomain, domainDue, domainProblems, domainWarnings, parseRdapExpiry, parseTokenExpiry, registrableDomain, tokenNotice } from './expiry.ts';
import { createTokenWatch } from './tokenWatch.ts';
import { explainProblem } from './causes.ts';
import type { PlatformRecord } from './types.ts';

test('the owned name is found, hosting-platform subdomains are not', () => {
  assert.equal(registrableDomain('www.drahmad.kw'), 'drahmad.kw');
  assert.equal(registrableDomain('shop.example.com.kw'), 'example.com.kw');
  assert.equal(registrableDomain('app.mizan-platform.app'), 'mizan-platform.app');
  assert.equal(registrableDomain('orbitq8.web.app'), null);
  assert.equal(registrableDomain('nahjq8.ai.studio'), null);
  assert.equal(registrableDomain('x.run.app'), null);
  assert.equal(registrableDomain('127.0.0.1'), null);
  assert.equal(registrableDomain('localhost'), null);
  assert.equal(registrableDomain('com.kw'), null);
});

test('RDAP expiration is read, anything else is unknown', () => {
  assert.equal(parseRdapExpiry({ events: [{ eventAction: 'registration', eventDate: '2020-01-01T00:00:00Z' }, { eventAction: 'expiration', eventDate: '2027-03-04T05:06:07Z' }] }), '2027-03-04T05:06:07.000Z');
  assert.equal(parseRdapExpiry({ events: [] }), null);
  assert.equal(parseRdapExpiry({ events: [{ eventAction: 'expiration', eventDate: 'garbage' }] }), null);
  assert.equal(parseRdapExpiry(null), null);
});

test('domain: a week away is a problem, a month away is a warning, a year away is silent, a stale check says nothing', () => {
  const now = Date.parse('2026-06-01T00:00:00Z');
  const at = (days: number, checkedDaysAgo = 0) => applyDomain({ domainCheckedAt: undefined } as PlatformRecord, new Date(now + days * 864e5).toISOString(), new Date(now - checkedDaysAgo * 864e5).toISOString());
  assert.match(domainProblems(at(-2), now)[0], /انتهى/);
  assert.match(domainProblems(at(5), now)[0], /بعد 5 أيام/);
  assert.deepEqual(domainWarnings(at(5), now), []);
  assert.match(domainWarnings(at(20), now)[0], /بعد 20 يومًا/);
  assert.deepEqual([...domainProblems(at(300), now), ...domainWarnings(at(300), now)], []);
  assert.deepEqual(domainProblems(at(2, 20), now), [], 'a 20-day-old answer proves nothing');
  assert.equal(domainDue(at(300, 3), now), false);
  assert.equal(domainDue(at(300, 7), now), true);
  assert.equal(domainDue({} as PlatformRecord, now), true);
  assert.equal(explainProblem(domainProblems(at(5), now)[0]).urgency, 'عاجلة');
});

test('GitHub token expiry header and the notice thresholds', () => {
  assert.equal(parseTokenExpiry('2026-12-01 10:00:00 UTC'), '2026-12-01T10:00:00.000Z');
  assert.equal(parseTokenExpiry('nonsense'), null);
  assert.equal(parseTokenExpiry(null), null);
  const now = Date.parse('2026-06-01T00:00:00Z');
  const at = (days: number) => new Date(now + days * 864e5).toISOString();
  assert.equal(tokenNotice(null, now), null);
  assert.equal(tokenNotice(at(40), now), null);
  assert.deepEqual([tokenNotice(at(10), now)?.tone, tokenNotice(at(2), now)?.tone, tokenNotice(at(-1), now)?.tone], ['warn', 'bad', 'bad']);
  assert.match(tokenNotice(at(10), now)?.text || '', /بعد 10 أيام/);
});

test('the token watch asks GitHub at most twice a day and remembers the answer', async () => {
  let t = 100 * 3_600_000; let calls = 0; let status = 200;
  const fetchImpl = (async () => { calls++; return new Response('{}', { status, headers: { 'github-authentication-token-expiration': '2026-12-01 10:00:00 UTC' } }); }) as typeof fetch;
  const watch = createTokenWatch({ firestore: null, fetchImpl, now: () => t });
  await watch.check(undefined); assert.equal(calls, 0, 'no token, no call');
  await watch.check('tok'); assert.equal(calls, 1);
  assert.equal(watch.expiresAt(), '2026-12-01T10:00:00.000Z');
  await watch.check('tok'); assert.equal(calls, 1, 'too soon');
  t += 13 * 3_600_000; await watch.check('tok'); assert.equal(calls, 2);
  status = 401; t += 13 * 3_600_000; await watch.check('tok');
  assert.ok(Date.parse(watch.expiresAt()!) < t, 'a rejected token counts as ended');
});
