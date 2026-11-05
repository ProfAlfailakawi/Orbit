import test from 'node:test';
import assert from 'node:assert/strict';
import { createTokenWatch } from './tokenWatch.ts';

const reply = (status: number, expiry?: string) => (async () => new Response(null, { status, headers: expiry ? { 'github-authentication-token-expiration': expiry } : {} })) as unknown as typeof fetch;

test('without a token nothing is requested', async () => {
  let calls = 0;
  const watch = createTokenWatch({ firestore: null, now: () => 1_000, fetchImpl: (async () => { calls++; return new Response(null); }) as unknown as typeof fetch });
  await watch.check(undefined);
  assert.equal(calls, 0);
  assert.equal(watch.expiresAt(), null);
});

test('a 401 marks the token as already ended', async () => {
  const now = Date.UTC(2026, 0, 1);
  const watch = createTokenWatch({ firestore: null, now: () => now, fetchImpl: reply(401) });
  await watch.check('t');
  assert.equal(watch.expiresAt(), new Date(now - 1000).toISOString());
});

test('rechecks are throttled for 12 hours unless forced', async () => {
  let calls = 0; let now = 50_000_000;
  const fetchImpl = (async () => { calls++; return new Response(null, { status: 200 }); }) as unknown as typeof fetch;
  const watch = createTokenWatch({ firestore: null, now: () => now, fetchImpl });
  await watch.check('t'); await watch.check('t');
  assert.equal(calls, 1);
  now += 13 * 3_600_000; await watch.check('t');
  assert.equal(calls, 2);
  await watch.check('t', true);
  assert.equal(calls, 3);
});

test('a network failure is swallowed and leaves the expiry unchanged', async () => {
  const watch = createTokenWatch({ firestore: null, now: () => 1, fetchImpl: (async () => { throw new Error('down'); }) as unknown as typeof fetch });
  await watch.check('t');
  assert.equal(watch.expiresAt(), null);
});
