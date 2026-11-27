import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPasskeyService, memoryPasskeyStore, OPERATOR_HANDLE, PASSKEY_CHALLENGE_TTL_MS, PASSKEY_LIMIT, passkeyRef, relyingPartyFor, type WebAuthnLib,
} from './passkeys.ts';

const RP = { rpID: 'orbitq8.web.app', origin: 'https://orbitq8.web.app' };
const SESSION = 'a'.repeat(64);
const b64 = (text: string) => Buffer.from(text).toString('base64url');

/**
 * A mocked WebAuthn library: options carry a fixed challenge per call, and verification succeeds only when the response echoes
 * the expected challenge, origin and RP ID (as the real library checks inside clientDataJSON), with user verification required.
 */
function mockLib(overrides: Partial<{ counter: number; verified: boolean }> = {}) {
  let n = 0;
  const seen: Array<Record<string, unknown>> = [];
  const lib: WebAuthnLib = {
    async generateRegistrationOptions(opts) { seen.push(opts); n += 1; return { challenge: `reg-${n}`, rp: { name: 'Orbit', id: String(opts.rpID) }, user: { id: 'x', name: 'Orbit', displayName: 'x' }, pubKeyCredParams: [] } as never; },
    async generateAuthenticationOptions(opts) { seen.push(opts); n += 1; return { challenge: `auth-${n}`, rpId: String(opts.rpID) } as never; },
    async verifyRegistrationResponse(opts) {
      seen.push(opts);
      const r = opts.response as { id: string; challenge: string; origin: string };
      const ok = r.challenge === opts.expectedChallenge && r.origin === opts.expectedOrigin && opts.expectedRPID === RP.rpID && opts.requireUserVerification === true;
      if (!ok) throw new Error('mismatch');
      return { verified: overrides.verified ?? true, registrationInfo: { credential: { id: r.id, publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ['internal'] }, credentialDeviceType: 'multiDevice', credentialBackedUp: true } } as never;
    },
    async verifyAuthenticationResponse(opts) {
      seen.push(opts);
      const r = opts.response as { challenge: string; origin: string; counter?: number };
      const ok = r.challenge === opts.expectedChallenge && r.origin === opts.expectedOrigin && opts.requireUserVerification === true;
      if (!ok) throw new Error('mismatch');
      return { verified: true, authenticationInfo: { newCounter: r.counter ?? overrides.counter ?? 0, credentialBackedUp: true } } as never;
    },
  };
  return { lib, seen };
}

const regResponse = (id: string, challenge: string, origin = RP.origin) => ({ id, rawId: id, type: 'public-key', challenge, origin, response: {} }) as never;
const loginResponse = (id: string, challenge: string, extra: Record<string, unknown> = {}) =>
  ({ id, rawId: id, type: 'public-key', challenge, origin: RP.origin, response: { userHandle: b64(OPERATOR_HANDLE) }, ...extra }) as never;
const CRED = 'credential-id-0001';

async function registered(lib: WebAuthnLib, now = () => Date.now()) {
  const service = createPasskeyService({ store: memoryPasskeyStore(), lib, now });
  const begin = await service.beginRegister(RP, SESSION);
  assert.ok(begin.ok);
  const done = await service.finishRegister(RP, SESSION, begin.challengeId, regResponse(CRED, begin.options.challenge), 'آيفون');
  assert.ok(done.ok);
  return service;
}

test('the RP ID is the production host, never the Host header, and localhost only outside production', () => {
  assert.deepEqual(relyingPartyFor('orbit-api-xyz.a.run.app', { NODE_ENV: 'production', ORBIT_PRODUCTION_URL: 'https://orbitq8.web.app' }), RP);
  assert.deepEqual(relyingPartyFor('', { NODE_ENV: 'production' }), RP);
  assert.equal(relyingPartyFor('localhost:3000', { NODE_ENV: 'production', ORBIT_PRODUCTION_URL: 'http://orbitq8.web.app' }), null);
  assert.deepEqual(relyingPartyFor('localhost:3000', { NODE_ENV: 'development' }), { rpID: 'localhost', origin: 'http://localhost:3000' });
  assert.equal(relyingPartyFor('evil.example', { NODE_ENV: 'development' }), null);
});

test('registration requires user verification, a resident key, and the operator handle', async () => {
  const { lib, seen } = mockLib();
  await registered(lib);
  const options = seen[0] as { authenticatorSelection: Record<string, string>; userID: Uint8Array; rpID: string };
  assert.equal(options.authenticatorSelection.userVerification, 'required');
  assert.equal(options.authenticatorSelection.residentKey, 'required');
  assert.equal(new TextDecoder().decode(options.userID), OPERATOR_HANDLE);
  assert.equal(options.rpID, RP.rpID);
});

test('register then sign in: the stored credential opens a session and its counter moves forward', async () => {
  const { lib } = mockLib();
  const service = await registered(lib);
  assert.equal((await service.list()).length, 1);
  const begin = await service.beginLogin(RP);
  assert.ok(begin.ok);
  assert.deepEqual((begin.options as { allowCredentials?: unknown[] }).allowCredentials, undefined);
  const done = await service.finishLogin(RP, begin.challengeId, loginResponse(CRED, begin.options.challenge, { counter: 1 }));
  assert.deepEqual(done, { ok: true, label: 'آيفون' });
  assert.ok((await service.list())[0].lastUsedAt);
});

test('a challenge is used once, belongs to its kind, and expires after five minutes', async () => {
  const { lib } = mockLib();
  let clock = 1_000_000;
  const service = await registered(lib, () => clock);
  const begin = await service.beginLogin(RP);
  assert.ok(begin.ok);
  assert.ok((await service.finishLogin(RP, begin.challengeId, loginResponse(CRED, begin.options.challenge, { counter: 1 }))).ok);
  const replay = await service.finishLogin(RP, begin.challengeId, loginResponse(CRED, begin.options.challenge, { counter: 2 }));
  assert.equal(!replay.ok && replay.code, 'challenge-expired');
  const late = await service.beginLogin(RP);
  assert.ok(late.ok);
  clock += PASSKEY_CHALLENGE_TTL_MS + 1;
  const expired = await service.finishLogin(RP, late.challengeId, loginResponse(CRED, late.options.challenge, { counter: 3 }));
  assert.equal(!expired.ok && expired.code, 'challenge-expired');
  // A registration challenge cannot be spent on a sign-in.
  const reg = await service.beginRegister(RP, SESSION);
  assert.ok(reg.ok);
  const wrongKind = await service.finishLogin(RP, reg.challengeId, loginResponse(CRED, reg.options.challenge, { counter: 4 }));
  assert.equal(!wrongKind.ok && wrongKind.code, 'challenge-expired');
});

test('sign-in is refused for a wrong origin, an unknown credential, another user handle, or a counter that does not advance', async () => {
  const { lib } = mockLib();
  const service = await registered(lib);
  const attempt = async (response: (challenge: string) => never) => {
    const begin = await service.beginLogin(RP);
    assert.ok(begin.ok);
    return service.finishLogin(RP, begin.challengeId, response(begin.options.challenge));
  };
  const wrongOrigin = await attempt(c => loginResponse(CRED, c, { origin: 'https://evil.example', counter: 5 }));
  assert.equal(!wrongOrigin.ok && wrongOrigin.code, 'verify-failed');
  const unknown = await attempt(c => loginResponse('another-credential-1', c, { counter: 5 }));
  assert.equal(!unknown.ok && unknown.code, 'not-registered');
  const otherUser = await attempt(c => loginResponse(CRED, c, { counter: 5, response: { userHandle: b64('someone-else') } }));
  assert.equal(!otherUser.ok && otherUser.code, 'verify-failed');
  assert.ok((await attempt(c => loginResponse(CRED, c, { counter: 5 }))).ok);
  const cloned = await attempt(c => loginResponse(CRED, c, { counter: 5 }));
  assert.equal(!cloned.ok && cloned.code, 'verify-failed');
});

test('no registered passkey: the login screen is told so instead of opening an empty prompt', async () => {
  const { lib } = mockLib();
  const service = createPasskeyService({ store: memoryPasskeyStore(), lib });
  const begin = await service.beginLogin(RP);
  assert.equal(!begin.ok && begin.code, 'not-registered');
});

test('a registration challenge belongs to the session that asked for it', async () => {
  const { lib } = mockLib();
  const service = createPasskeyService({ store: memoryPasskeyStore(), lib });
  const begin = await service.beginRegister(RP, SESSION);
  assert.ok(begin.ok);
  const other = await service.finishRegister(RP, 'b'.repeat(64), begin.challengeId, regResponse(CRED, begin.options.challenge), 'x');
  assert.equal(!other.ok && other.code, 'challenge-expired');
  assert.equal((await service.list()).length, 0);
});

test('the small cap holds, duplicates are refused, and a removed device can no longer sign in', async () => {
  const { lib } = mockLib();
  const service = createPasskeyService({ store: memoryPasskeyStore(), lib });
  for (let i = 0; i < PASSKEY_LIMIT; i += 1) {
    const begin = await service.beginRegister(RP, SESSION);
    assert.ok(begin.ok);
    assert.ok((await service.finishRegister(RP, SESSION, begin.challengeId, regResponse(`credential-id-000${i}`, begin.options.challenge), `جهاز ${i}`)).ok);
  }
  const full = await service.beginRegister(RP, SESSION);
  assert.equal(!full.ok && full.code, 'passkey-limit');
  const ref = passkeyRef('credential-id-0000');
  assert.ok((await service.remove(ref)).ok);
  const missing = await service.remove(ref);
  assert.equal(!missing.ok && missing.code, 'passkey-missing');
  const again = await service.beginRegister(RP, SESSION);
  assert.ok(again.ok);
  const dup = await service.finishRegister(RP, SESSION, again.challengeId, regResponse('credential-id-0001', again.options.challenge), 'x');
  assert.equal(!dup.ok && dup.code, 'passkey-duplicate');
  const begin = await service.beginLogin(RP);
  assert.ok(begin.ok);
  const removed = await service.finishLogin(RP, begin.challengeId, loginResponse('credential-id-0000', begin.options.challenge, { counter: 9 }));
  assert.equal(!removed.ok && removed.code, 'not-registered');
});

test('labels are cleaned before they are stored', async () => {
  const { lib } = mockLib();
  const service = createPasskeyService({ store: memoryPasskeyStore(), lib });
  const begin = await service.beginRegister(RP, SESSION);
  assert.ok(begin.ok);
  const done = await service.finishRegister(RP, SESSION, begin.challengeId, regResponse(CRED, begin.options.challenge), '<b>آيفون</b>\u0000');
  assert.ok(done.ok);
  assert.equal(done.passkey.label, 'bآيفون/b');
});

import express from 'express';
import { registerPasskeyAccountRoutes, registerPasskeyLoginRoutes, type PasskeyRouteDeps } from './passkeys.ts';

async function withServer(openedAt: number, codeCheck: 'ok' | 'wrong' | 'locked', run: (base: string, calls: string[]) => Promise<void>) {
  const { lib } = mockLib();
  const calls: string[] = [];
  const app = express();
  app.use(express.json());
  const deps: PasskeyRouteDeps = {
    service: createPasskeyService({ store: memoryPasskeyStore(), lib }),
    openSession: async (_req, res) => { calls.push('session'); res.json({ authenticated: true }); },
    sessionOf: () => ({ hash: SESSION, openedAt }),
    checkOperatorCode: async () => { calls.push('code'); return codeCheck; },
    audit: action => calls.push(action),
    env: { NODE_ENV: 'production', ORBIT_PRODUCTION_URL: RP.origin },
  };
  registerPasskeyLoginRoutes(app, deps);
  registerPasskeyAccountRoutes(app, deps);
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const port = (server.address() as { port: number }).port;
  try { await run(`http://127.0.0.1:${port}`, calls); } finally { server.close(); }
}
const post = (url: string, body: unknown, origin = RP.origin) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) });

test('routes: a fresh session gets registration options; an older one must type the code first', async () => {
  await withServer(Date.now(), 'ok', async (base, calls) => {
    const res = await post(`${base}/api/passkeys/register/options`, {});
    assert.equal(res.status, 200);
    const data = await res.json() as { challengeId: string; options: { challenge: string } };
    assert.match(data.challengeId, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(calls.includes('code'), false);
  });
  await withServer(Date.now() - 60 * 60_000, 'wrong', async (base) => {
    const missing = await post(`${base}/api/passkeys/register/options`, {});
    assert.equal(missing.status, 403);
    assert.equal((await missing.json() as { code: string }).code, 'code-required');
    const wrong = await post(`${base}/api/passkeys/register/options`, { code: 'not-the-code' });
    assert.equal((await wrong.json() as { code: string }).code, 'code-wrong');
  });
  await withServer(Date.now() - 60 * 60_000, 'ok', async (base) => {
    assert.equal((await post(`${base}/api/passkeys/register/options`, { code: 'the-right-code' })).status, 200);
  });
});

test('routes: a foreign Origin is refused, and sign-in with no registered passkey says so', async () => {
  await withServer(Date.now(), 'ok', async (base, calls) => {
    assert.equal((await post(`${base}/api/auth/passkey/login/options`, {}, 'https://evil.example')).status, 400);
    const none = await post(`${base}/api/auth/passkey/login/options`, {});
    assert.equal(none.status, 404);
    assert.equal((await none.json() as { code: string }).code, 'not-registered');
    const bad = await post(`${base}/api/auth/passkey/login/verify`, { challengeId: 'x', response: {} });
    assert.equal(bad.status, 400);
    assert.equal(calls.includes('session'), false, 'no session without a verified passkey');
  });
});
