/**
 * «الدخول بالبصمة» (WebAuthn passkeys) for the single Orbit operator, on the same approach as schedule-kw:
 * @simplewebauthn/server, discoverable credentials, user verification required, challenges kept and checked only on the server.
 *
 *   enable on this device (operator session):  POST /api/passkeys/register/options  then  /api/passkeys/register/verify
 *   list and remove (operator session):        GET  /api/passkeys                   and   DELETE /api/passkeys/:ref
 *   sign in (no session yet):                  POST /api/auth/passkey/login/options then  /api/auth/passkey/login/verify
 *
 * Decisions:
 *  - The device keeps the private key and uses it only after Face ID / Touch ID / the device code; the server stores public keys only.
 *  - Firebase Hosting forwards no cookies to Cloud Run (only `__session`), so a challenge is identified by a random id returned in
 *    the options answer and sent back with the verify call. The challenge itself is what the device signs; it is stored server-side,
 *    used once, and expires after five minutes.
 *  - The RP ID and origin come from configuration (the production URL), never from what the browser sends.
 *  - A credential can be registered only from a fresh session (signed in with the code in the last ten minutes) or after typing the
 *    code again, so a stolen session cannot plant a lasting passkey. A small cap (PASSKEY_LIMIT) keeps the list short.
 *  - Nothing of the credential material (id, key, response) is logged.
 */
import crypto from 'node:crypto';
import type express from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type {
  AuthenticationResponseJSON, AuthenticatorTransportFuture, PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON, RegistrationResponseJSON, VerifiedAuthenticationResponse, VerifiedRegistrationResponse,
} from '@simplewebauthn/server';

export const PASSKEY_LIMIT = 3;
export const PASSKEY_CHALLENGE_TTL_MS = 5 * 60_000;
export const PASSKEY_FRESH_LOGIN_MS = 10 * 60_000;
export const PASSKEY_RP_NAME = 'Orbit';
/** The one operator's user handle: the device stores it with the credential and returns it on sign-in. */
export const OPERATOR_HANDLE = 'orbit-operator';

export const PASSKEY_MESSAGES = {
  unavailable: 'الدخول بالبصمة غير متاح على هذا العنوان.',
  expired: 'انتهت مهلة الطلب. اضغط الزر وأعد المحاولة.',
  verifyFailed: 'تعذّر التحقق من البصمة. أعد المحاولة، أو ادخل برمز الدخول.',
  notRegistered: 'هذا الجهاز غير مسجَّل للدخول بالبصمة. ادخل برمز الدخول ثم فعّل البصمة.',
  duplicate: 'هذا الجهاز مسجَّل من قبل.',
  limit: `بلغتَ الحدّ الأقصى (${PASSKEY_LIMIT} أجهزة). أزل جهازًا لتضيف غيره.`,
  codeNeeded: 'اكتب رمز الدخول لتأكيد تفعيل البصمة على هذا الجهاز.',
  codeWrong: 'رمز الدخول غير صحيح.',
  tooMany: 'محاولات كثيرة. حاول بعد قليل.',
  missing: 'هذا الجهاز غير موجود في القائمة.',
} as const;

/* ── Relying party ─────────────────────────────────────────────────────────── */
export interface RelyingParty { rpID: string; origin: string }

/**
 * Production: the configured public URL (ORBIT_PRODUCTION_URL, https://orbitq8.web.app). Requests reach Cloud Run through
 * Firebase Hosting, so the Host header is not the public name and is never used there.
 * Development only: http://localhost:<port> from the request's Host.
 */
export function relyingPartyFor(hostHeader: string, env: Record<string, string | undefined> = process.env): RelyingParty | null {
  if (env.NODE_ENV === 'production') {
    try {
      const url = new URL(env.ORBIT_PRODUCTION_URL || 'https://orbitq8.web.app');
      if (url.protocol !== 'https:') return null;
      return { rpID: url.hostname, origin: url.origin };
    } catch { return null; }
  }
  const host = String(hostHeader || '').trim().toLowerCase();
  if (!/^localhost(:\d{1,5})?$/.test(host)) return null;
  return { rpID: 'localhost', origin: `http://${host}` };
}

/* ── Storage ───────────────────────────────────────────────────────────────── */
export interface StoredPasskey {
  credentialId: string; publicKey: string; counter: number; transports: string[];
  deviceType: string; backedUp: boolean; label: string; createdAt: string; lastUsedAt?: string;
}
export interface ChallengeDoc { kind: 'login' | 'register'; challenge: string; sessionHash?: string; expiresAt: number }
type Outcome<R> = { next: StoredPasskey[]; result: R } | { refuse: R };

export interface PasskeyStore {
  list(): Promise<StoredPasskey[]>;
  /** Atomic read-modify-write of the credential list. */
  update<R>(fn: (current: StoredPasskey[]) => Outcome<R>): Promise<{ ok: boolean; result: R }>;
  putChallenge(id: string, doc: ChallengeDoc): Promise<void>;
  /** Atomically removes and returns the challenge (one use only), or null. */
  takeChallenge(id: string): Promise<ChallengeDoc | null>;
}

/** Local development and tests: process memory. */
export function memoryPasskeyStore(): PasskeyStore {
  let credentials: StoredPasskey[] = [];
  const challenges = new Map<string, ChallengeDoc>();
  return {
    async list() { return credentials.map(row => ({ ...row })); },
    async update(fn) {
      const out = fn(credentials.map(row => ({ ...row })));
      if ('refuse' in out) return { ok: false, result: out.refuse };
      credentials = out.next;
      return { ok: true, result: out.result };
    },
    async putChallenge(id, doc) {
      const now = Date.now();
      for (const [key, row] of challenges) if (row.expiresAt <= now) challenges.delete(key);
      challenges.set(id, doc);
    },
    async takeChallenge(id) {
      const row = challenges.get(id) || null;
      challenges.delete(id);
      return row;
    },
  };
}

/** Production: one document `orbit/passkeys` for the (few) credentials, and `orbitPasskeyChallenges/{sha256(id)}` for challenges. */
export function firestorePasskeyStore(firestore: Firestore): PasskeyStore {
  const doc = firestore.collection('orbit').doc('passkeys');
  const challenges = firestore.collection('orbitPasskeyChallenges');
  const read = (data: unknown): StoredPasskey[] => (Array.isArray((data as { credentials?: unknown })?.credentials) ? (data as { credentials: StoredPasskey[] }).credentials : []);
  return {
    async list() { return read((await doc.get()).data()); },
    update(fn) {
      return firestore.runTransaction(async tx => {
        const out = fn(read((await tx.get(doc)).data()));
        if ('refuse' in out) return { ok: false, result: out.refuse };
        tx.set(doc, { credentials: out.next, updatedAt: new Date().toISOString() });
        return { ok: true, result: out.result };
      });
    },
    async putChallenge(id, row) {
      await challenges.doc(id).set({ ...row, expiresAtTtl: new Date(row.expiresAt) });
      // Challenges that were asked for and never used: a light sweep, so the collection never grows.
      try {
        const stale = await challenges.where('expiresAt', '<', Date.now()).limit(20).get();
        await Promise.all(stale.docs.map(item => item.ref.delete()));
      } catch { /* the next request sweeps again */ }
    },
    takeChallenge(id) {
      return firestore.runTransaction(async tx => {
        const ref = challenges.doc(id);
        const snap = await tx.get(ref);
        if (!snap.exists) return null;
        tx.delete(ref);
        const data = snap.data() as ChallengeDoc;
        return { kind: data.kind, challenge: data.challenge, expiresAt: Number(data.expiresAt), ...(data.sessionHash ? { sessionHash: data.sessionHash } : {}) };
      });
    },
  };
}

/* ── Core (WebAuthn library injected so tests can mock it) ─────────────────── */
export interface WebAuthnLib {
  generateRegistrationOptions(opts: Record<string, unknown>): Promise<PublicKeyCredentialCreationOptionsJSON>;
  verifyRegistrationResponse(opts: Record<string, unknown>): Promise<VerifiedRegistrationResponse>;
  generateAuthenticationOptions(opts: Record<string, unknown>): Promise<PublicKeyCredentialRequestOptionsJSON>;
  verifyAuthenticationResponse(opts: Record<string, unknown>): Promise<VerifiedAuthenticationResponse>;
}

export type Refusal = { ok: false; status: number; code: string; error: string };
const refuse = (status: number, code: string, error: string): Refusal => ({ ok: false, status, code, error });

/** A short id for listing and removing; it does not carry the credential id itself. */
export const passkeyRef = (credentialId: string) => crypto.createHash('sha256').update(credentialId).digest('hex').slice(0, 16);
export const hashOf = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const CHALLENGE_ID = /^[A-Za-z0-9_-]{43}$/;
const CREDENTIAL_ID = /^[A-Za-z0-9_-]{16,1024}$/;
const cleanLabel = (value: unknown) => String(value ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 40) || 'جهاز';
const fromB64url = (text: string) => new Uint8Array(Buffer.from(text, 'base64url'));

export const publicView = (row: StoredPasskey) => ({ ref: passkeyRef(row.credentialId), label: row.label, createdAt: row.createdAt, lastUsedAt: row.lastUsedAt || null, synced: Boolean(row.backedUp) });

export function createPasskeyService(deps: { store: PasskeyStore; lib: WebAuthnLib; now?: () => number }) {
  const { store, lib } = deps;
  const now = deps.now || Date.now;

  async function openChallenge(fields: Omit<ChallengeDoc, 'expiresAt'>): Promise<string> {
    const challengeId = crypto.randomBytes(32).toString('base64url');
    await store.putChallenge(hashOf(challengeId), { ...fields, expiresAt: now() + PASSKEY_CHALLENGE_TTL_MS });
    return challengeId;
  }

  async function takeChallenge(challengeId: unknown, kind: ChallengeDoc['kind']): Promise<ChallengeDoc | null> {
    if (typeof challengeId !== 'string' || !CHALLENGE_ID.test(challengeId)) return null;
    const row = await store.takeChallenge(hashOf(challengeId));
    if (!row || row.kind !== kind || row.expiresAt <= now()) return null;
    return row;
  }

  return {
    async list() { return (await store.list()).map(publicView); },

    async beginLogin(rp: RelyingParty): Promise<{ ok: true; challengeId: string; options: PublicKeyCredentialRequestOptionsJSON } | Refusal> {
      if (!(await store.list()).length) return refuse(404, 'not-registered', PASSKEY_MESSAGES.notRegistered);
      const options = await lib.generateAuthenticationOptions({ rpID: rp.rpID, userVerification: 'required', allowCredentials: [], timeout: 60_000 });
      return { ok: true, challengeId: await openChallenge({ kind: 'login', challenge: options.challenge }), options };
    },

    async finishLogin(rp: RelyingParty, challengeId: unknown, response: AuthenticationResponseJSON | undefined): Promise<{ ok: true; label: string } | Refusal> {
      const challenge = await takeChallenge(challengeId, 'login');
      if (!challenge) return refuse(400, 'challenge-expired', PASSKEY_MESSAGES.expired);
      const credentialId = String(response?.id || '');
      const handle = Buffer.from(String(response?.response?.userHandle || ''), 'base64url').toString('utf8');
      if (!response || !CREDENTIAL_ID.test(credentialId) || handle !== OPERATOR_HANDLE) return refuse(400, 'verify-failed', PASSKEY_MESSAGES.verifyFailed);
      const stored = (await store.list()).find(row => row.credentialId === credentialId);
      if (!stored) return refuse(400, 'not-registered', PASSKEY_MESSAGES.notRegistered);
      let outcome: VerifiedAuthenticationResponse;
      try {
        outcome = await lib.verifyAuthenticationResponse({
          response, expectedChallenge: challenge.challenge, expectedOrigin: rp.origin, expectedRPID: rp.rpID, requireUserVerification: true,
          credential: { id: stored.credentialId, publicKey: fromB64url(stored.publicKey), counter: Number(stored.counter) || 0, transports: stored.transports as AuthenticatorTransportFuture[] },
        });
      } catch { return refuse(400, 'verify-failed', PASSKEY_MESSAGES.verifyFailed); }
      if (!outcome.verified) return refuse(400, 'verify-failed', PASSKEY_MESSAGES.verifyFailed);
      // The counter only moves forward, atomically: a replayed or cloned response is refused.
      const newCounter = Number(outcome.authenticationInfo.newCounter) || 0;
      const advanced = await store.update<boolean>(current => {
        const row = current.find(item => item.credentialId === credentialId);
        if (!row) return { refuse: false };
        const seen = Number(row.counter) || 0;
        if ((newCounter !== 0 || seen !== 0) && newCounter <= seen) return { refuse: false };
        return { next: current.map(item => item === row ? { ...row, counter: newCounter, backedUp: Boolean(outcome.authenticationInfo.credentialBackedUp), lastUsedAt: new Date(now()).toISOString() } : item), result: true };
      });
      if (!advanced.ok) return refuse(400, 'verify-failed', PASSKEY_MESSAGES.verifyFailed);
      return { ok: true, label: stored.label };
    },

    async beginRegister(rp: RelyingParty, sessionHash: string): Promise<{ ok: true; challengeId: string; options: PublicKeyCredentialCreationOptionsJSON } | Refusal> {
      const existing = await store.list();
      if (existing.length >= PASSKEY_LIMIT) return refuse(409, 'passkey-limit', PASSKEY_MESSAGES.limit);
      const options = await lib.generateRegistrationOptions({
        rpName: PASSKEY_RP_NAME, rpID: rp.rpID, userName: 'Orbit', userDisplayName: 'مشغّل أوربت',
        userID: new TextEncoder().encode(OPERATOR_HANDLE), attestationType: 'none', timeout: 60_000,
        excludeCredentials: existing.map(row => ({ id: row.credentialId, transports: row.transports as AuthenticatorTransportFuture[] })),
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        supportedAlgorithmIDs: [-7, -257],
      });
      return { ok: true, challengeId: await openChallenge({ kind: 'register', challenge: options.challenge, sessionHash }), options };
    },

    async finishRegister(rp: RelyingParty, sessionHash: string, challengeId: unknown, response: RegistrationResponseJSON | undefined, label: unknown): Promise<{ ok: true; passkey: ReturnType<typeof publicView> } | Refusal> {
      const challenge = await takeChallenge(challengeId, 'register');
      // The challenge belongs to the session that asked for it.
      if (!challenge || challenge.sessionHash !== sessionHash) return refuse(400, 'challenge-expired', PASSKEY_MESSAGES.expired);
      let verified: VerifiedRegistrationResponse;
      try {
        verified = await lib.verifyRegistrationResponse({ response, expectedChallenge: challenge.challenge, expectedOrigin: rp.origin, expectedRPID: rp.rpID, requireUserVerification: true });
      } catch { return refuse(400, 'verify-failed', PASSKEY_MESSAGES.verifyFailed); }
      if (!verified.verified || !verified.registrationInfo) return refuse(400, 'verify-failed', PASSKEY_MESSAGES.verifyFailed);
      const info = verified.registrationInfo;
      const row: StoredPasskey = {
        credentialId: info.credential.id, publicKey: Buffer.from(info.credential.publicKey).toString('base64url'),
        counter: Number(info.credential.counter) || 0, transports: (info.credential.transports || []) as string[],
        deviceType: String(info.credentialDeviceType), backedUp: Boolean(info.credentialBackedUp), label: cleanLabel(label),
        createdAt: new Date(now()).toISOString(),
      };
      // Never overwrite an existing credential (that would reset its counter); the cap is checked in the same transaction.
      const added = await store.update<'ok' | 'duplicate' | 'limit'>(current => {
        if (current.some(item => item.credentialId === row.credentialId)) return { refuse: 'duplicate' };
        if (current.length >= PASSKEY_LIMIT) return { refuse: 'limit' };
        return { next: [...current, row], result: 'ok' };
      });
      if (!added.ok) return added.result === 'duplicate' ? refuse(409, 'passkey-duplicate', PASSKEY_MESSAGES.duplicate) : refuse(409, 'passkey-limit', PASSKEY_MESSAGES.limit);
      return { ok: true, passkey: publicView(row) };
    },

    async remove(ref: string): Promise<{ ok: true; label: string } | Refusal> {
      const out = await store.update<string | null>(current => {
        const target = current.find(row => passkeyRef(row.credentialId) === ref);
        return target ? { next: current.filter(row => row !== target), result: target.label } : { refuse: null };
      });
      return out.ok && out.result !== null ? { ok: true, label: out.result } : refuse(404, 'passkey-missing', PASSKEY_MESSAGES.missing);
    },
  };
}
export type PasskeyService = ReturnType<typeof createPasskeyService>;

/* ── Rate limits (in memory: one operator) ─────────────────────────────────── */
export function createWindowLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (key: string, at = Date.now()): boolean => {
    const list = (hits.get(key) || []).filter(stamp => at - stamp < windowMs);
    if (list.length >= limit) { hits.set(key, list); return false; }
    list.push(at);
    hits.set(key, list);
    if (hits.size > 5000) hits.clear();
    return true;
  };
}

/* ── Routes ────────────────────────────────────────────────────────────────── */
export interface PasskeyRouteDeps {
  service: PasskeyService;
  /** Opens the same operator session the code login opens, and answers the request. */
  openSession: (req: express.Request, res: express.Response, method: 'passkey') => Promise<void>;
  /** The current operator session (behind the /api gate): its token hash and when it was opened. */
  sessionOf: (res: express.Response) => { hash: string; openedAt: number } | null;
  /** Checks the operator code (constant time), counting wrong attempts like the code login. */
  checkOperatorCode: (req: express.Request, code: string) => Promise<'ok' | 'wrong' | 'locked'>;
  audit: (action: string, detail: string) => void;
  env?: Record<string, string | undefined>;
}

const send = (res: express.Response, out: Refusal) => res.status(out.status).json({ error: out.error, code: out.code });

function rpOrRefuse(req: express.Request, res: express.Response, env?: Record<string, string | undefined>): RelyingParty | null {
  const rp = relyingPartyFor(String(req.get('host') || ''), env);
  // A browser sends its Origin on these POSTs; it must be the configured one (the device checks it again inside the signature).
  const origin = req.get('origin');
  if (!rp || (origin && origin !== rp.origin)) { res.status(400).json({ error: PASSKEY_MESSAGES.unavailable, code: 'passkey-unavailable' }); return null; }
  return rp;
}

/** Sign-in routes: mounted before the session gate. */
export function registerPasskeyLoginRoutes(app: express.Express, deps: PasskeyRouteDeps) {
  const optionsLimit = createWindowLimiter(20, 60_000);
  const verifyLimit = createWindowLimiter(10, 60_000);
  const key = (req: express.Request) => req.ip || 'unknown';
  app.post('/api/auth/passkey/login/options', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!optionsLimit(key(req))) return res.status(429).json({ error: PASSKEY_MESSAGES.tooMany, code: 'too-many' });
    const rp = rpOrRefuse(req, res, deps.env);
    if (!rp) return;
    deps.service.beginLogin(rp).then(out => (out.ok ? res.json({ challengeId: out.challengeId, options: out.options }) : send(res, out)), next);
  });
  app.post('/api/auth/passkey/login/verify', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!verifyLimit(key(req))) return res.status(429).json({ error: PASSKEY_MESSAGES.tooMany, code: 'too-many' });
    const rp = rpOrRefuse(req, res, deps.env);
    if (!rp) return;
    void (async () => {
      const out = await deps.service.finishLogin(rp, req.body?.challengeId, req.body?.response);
      if (!out.ok) { if (out.code === 'verify-failed') deps.audit('AUTH_PASSKEY_FAILED', 'محاولة دخول بالبصمة غير ناجحة.'); return send(res, out); }
      deps.audit('AUTH_PASSKEY_LOGIN', `تسجيل دخول المشغل بالبصمة من «${out.label}».`);
      await deps.openSession(req, res, 'passkey');
    })().catch(next);
  });
}

/** Device management: mounted after the session gate (operator session and Origin already checked). */
export function registerPasskeyAccountRoutes(app: express.Express, deps: PasskeyRouteDeps) {
  const optionsLimit = createWindowLimiter(10, 60_000);
  const verifyLimit = createWindowLimiter(10, 60_000);
  app.get('/api/passkeys', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const available = Boolean(relyingPartyFor(String(req.get('host') || ''), deps.env));
    deps.service.list().then(items => res.json({ available, limit: PASSKEY_LIMIT, items }), next);
  });
  app.post('/api/passkeys/register/options', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!optionsLimit('operator')) return res.status(429).json({ error: PASSKEY_MESSAGES.tooMany, code: 'too-many' });
    const rp = rpOrRefuse(req, res, deps.env);
    if (!rp) return;
    const session = deps.sessionOf(res);
    if (!session) return res.status(401).json({ error: 'Authentication required' });
    void (async () => {
      // A session opened more than ten minutes ago types the code again before planting a lasting passkey.
      if (Date.now() - session.openedAt > PASSKEY_FRESH_LOGIN_MS) {
        const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
        if (!code) return res.status(403).json({ error: PASSKEY_MESSAGES.codeNeeded, code: 'code-required' });
        const check = await deps.checkOperatorCode(req, code);
        if (check === 'locked') return res.status(429).json({ error: PASSKEY_MESSAGES.tooMany, code: 'too-many' });
        if (check === 'wrong') return res.status(403).json({ error: PASSKEY_MESSAGES.codeWrong, code: 'code-wrong' });
      }
      const out = await deps.service.beginRegister(rp, session.hash);
      return out.ok ? res.json({ challengeId: out.challengeId, options: out.options }) : send(res, out);
    })().catch(next);
  });
  app.post('/api/passkeys/register/verify', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!verifyLimit('operator')) return res.status(429).json({ error: PASSKEY_MESSAGES.tooMany, code: 'too-many' });
    const rp = rpOrRefuse(req, res, deps.env);
    if (!rp) return;
    const session = deps.sessionOf(res);
    if (!session) return res.status(401).json({ error: 'Authentication required' });
    deps.service.finishRegister(rp, session.hash, req.body?.challengeId, req.body?.response, req.body?.label).then(out => {
      if (!out.ok) return send(res, out);
      deps.audit('PASSKEY_ADDED', `تفعيل الدخول بالبصمة على «${out.passkey.label}».`);
      return res.json({ ok: true, passkey: out.passkey });
    }, next);
  });
  app.delete('/api/passkeys/:ref', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const ref = String(req.params.ref || '');
    if (!/^[a-f0-9]{16}$/.test(ref)) return res.status(404).json({ error: PASSKEY_MESSAGES.missing, code: 'passkey-missing' });
    deps.service.remove(ref).then(out => {
      if (!out.ok) return send(res, out);
      deps.audit('PASSKEY_REMOVED', `إزالة الدخول بالبصمة من «${out.label}».`);
      return res.json({ ok: true });
    }, next);
  });
}
