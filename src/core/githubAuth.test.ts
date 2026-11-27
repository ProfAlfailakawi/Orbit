import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { appJwt, createGithubAuth, normalizePrivateKey } from './githubAuth.ts';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();

test('App JWT is RS256-signed with the App id as issuer', () => {
  const jwt = appJwt('123', pem, 1_700_000_000_000);
  const [h, p, sig] = jwt.split('.');
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
  assert.equal(payload.iss, '123');
  assert.ok(payload.exp - payload.iat <= 600);
  const v = createVerify('RSA-SHA256'); v.update(`${h}.${p}`);
  assert.ok(v.verify(publicKey, Buffer.from(sig, 'base64url')));
});

test('private key stored with literal \\n or as base64 still works', () => {
  assert.equal(normalizePrivateKey(pem.trim().replace(/\n/g, '\\n')), pem.trim());
  assert.equal(normalizePrivateKey(Buffer.from(pem).toString('base64')), pem.trim());
});

test('App mode mints, caches, and renews the installation token before it ends', async () => {
  let t = 0, minted = 0;
  const calls: string[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method || 'GET'} ${url}`);
    if (url.endsWith('/app/installations?per_page=100')) return Response.json([{ id: 9, account: { login: 'Other' } }, { id: 7, account: { login: 'ProfAlfailakawi' } }]);
    minted += 1;
    return Response.json({ token: `ghs_${minted}`, expires_at: new Date(t + 3_600_000).toISOString() });
  }) as typeof fetch;
  const auth = createGithubAuth({ appId: '1', privateKey: pem, owner: 'profalfailakawi', pat: 'old', fetchImpl, now: () => t });
  assert.equal(auth.mode(), 'app');
  assert.equal(await auth.token(), 'ghs_1');
  assert.ok(calls[1].includes('/app/installations/7/access_tokens'));
  t = 40 * 60_000; assert.equal(await auth.token(), 'ghs_1');
  t = 55 * 60_000; assert.equal(await auth.token(), 'ghs_2');
  auth.rejected('ghs_2'); assert.equal(await auth.token(), 'ghs_3');
});

test('a rejected personal token is dropped so public repositories are read anonymously', async () => {
  const auth = createGithubAuth({ pat: 'ghp_x' });
  assert.equal(auth.mode(), 'pat');
  assert.equal(await auth.token(), 'ghp_x');
  auth.rejected('ghp_x');
  assert.equal(await auth.token(), undefined);
  assert.equal(auth.patRejected(), true);
});

test('App failure is reported, not thrown', async () => {
  const auth = createGithubAuth({ appId: '1', privateKey: pem, installationId: '5', fetchImpl: (async () => new Response('', { status: 401 })) as typeof fetch });
  assert.equal(await auth.token(), undefined);
  assert.match(auth.lastError() || '', /401/);
});
