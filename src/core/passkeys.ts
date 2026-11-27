/**
 * «الدخول بالبصمة» in the browser / iPhone app (WebAuthn), on the same approach as schedule-kw.
 * The server decides (src/server/passkeys.ts). Here: support detection, JSON ↔ bytes, and honest Arabic messages.
 * The browser stores only one non-sensitive mark: «a passkey was registered on this device».
 */
import { apiFetch } from './api';

const DEVICE_KEY = 'orbit.passkey.device';

export type PasskeyFailure = 'cancelled' | 'unsupported' | 'not-registered' | 'expired' | 'code-required' | 'code-wrong' | 'limit' | 'unavailable' | 'failed';

export class PasskeyError extends Error {
  readonly failure: PasskeyFailure;
  /** The system refused because the page was not focused yet (iPhone app just opening), not because the owner cancelled. */
  notFocused = false;
  constructor(failure: PasskeyFailure, message: string) { super(message); this.name = 'PasskeyError'; this.failure = failure; }
}

export const PASSKEY_TEXT: Record<PasskeyFailure, string> = {
  cancelled: 'أُلغي الطلب أو انتهت مهلته. جرّب مرة أخرى، أو ادخل برمز الدخول.',
  unsupported: 'هذا الجهاز لا يدعم الدخول بالبصمة. ادخل برمز الدخول.',
  'not-registered': 'هذا الجهاز غير مسجَّل للدخول بالبصمة. ادخل برمز الدخول ثم فعّل البصمة.',
  expired: 'انتهت مهلة الطلب. أعد المحاولة.',
  'code-required': 'اكتب رمز الدخول لتأكيد تفعيل البصمة على هذا الجهاز.',
  'code-wrong': 'رمز الدخول غير صحيح.',
  limit: 'بلغتَ الحدّ الأقصى من الأجهزة. أزل جهازًا لتضيف غيره.',
  unavailable: 'الدخول بالبصمة غير متاح على هذا العنوان.',
  failed: 'تعذّر إكمال الطلب. أعد المحاولة، أو ادخل برمز الدخول.',
};

const storage = {
  get: (key: string) => { try { return localStorage.getItem(key) || ''; } catch { return ''; } },
  set: (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* unavailable */ } },
  remove: (key: string) => { try { localStorage.removeItem(key); } catch { /* unavailable */ } },
};
export const passkeyDeviceRemembered = () => storage.get(DEVICE_KEY) === '1';
export const rememberPasskeyDevice = () => storage.set(DEVICE_KEY, '1');
export const forgetPasskeyDevice = () => storage.remove(DEVICE_KEY);

/** WebAuthn exists and the device can verify its owner (Face ID, Touch ID, or the device code). */
export async function passkeySupported(): Promise<boolean> {
  try {
    if (typeof window === 'undefined' || typeof window.PublicKeyCredential === 'undefined' || !navigator.credentials?.create || !navigator.credentials?.get) return false;
    const probe = (window.PublicKeyCredential as unknown as { isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean> }).isUserVerifyingPlatformAuthenticatorAvailable;
    if (typeof probe !== 'function') return false;
    return Boolean(await probe.call(window.PublicKeyCredential));
  } catch { return false; }
}

/** A name for this device in the list. */
export function suggestedDeviceLabel(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/iphone/i.test(ua)) return 'آيفون';
  if (/ipad/i.test(ua)) return 'آيباد';
  if (/android/i.test(ua)) return 'هاتف أندرويد';
  if (/macintosh/i.test(ua)) return (navigator.maxTouchPoints || 0) > 1 ? 'آيباد' : 'ماك';
  if (/windows/i.test(ua)) return 'ويندوز';
  return 'هذا الجهاز';
}

/* ── encoding ─────────────────────────────────────────────────────────────── */
const toBytes = (text: string): ArrayBuffer => {
  const base = text.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base + '='.repeat((4 - (base.length % 4)) % 4));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out.buffer;
};
const toText = (buffer: ArrayBuffer | null | undefined): string => {
  if (!buffer) return '';
  let raw = '';
  new Uint8Array(buffer).forEach(byte => { raw += String.fromCharCode(byte); });
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
type Descriptor = { id: string; type: string; transports?: string[] };
const descriptor = (item: Descriptor) => ({ ...item, id: toBytes(String(item.id)) }) as PublicKeyCredentialDescriptor;

type Answer = { ok: boolean; status: number; data: Record<string, any> };
async function post(path: string, body: unknown, withSession: boolean): Promise<Answer> {
  const init: RequestInit = { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body ?? {}), credentials: 'same-origin' };
  // Sign-in has no session yet, so it uses a plain request (no operator or demo header).
  const response = withSession ? await apiFetch(path, init) : await fetch(path, init);
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

function serverFailure(data: Record<string, any>, status: number): PasskeyError {
  const code = String(data?.code || '');
  const text = typeof data?.error === 'string' && /[؀-ۿ]/.test(data.error) ? data.error : '';
  const known: Record<string, PasskeyFailure> = {
    'not-registered': 'not-registered', 'challenge-expired': 'expired', 'code-required': 'code-required', 'code-wrong': 'code-wrong',
    'passkey-limit': 'limit', 'passkey-unavailable': 'unavailable',
  };
  const failure = known[code] || 'failed';
  return new PasskeyError(failure, text || (status === 429 ? 'محاولات كثيرة. حاول بعد قليل.' : PASSKEY_TEXT[failure]));
}

/** What the browser throws when the owner cancels or the time runs out. */
function browserFailure(error: unknown): PasskeyError {
  if (error instanceof PasskeyError) return error;
  const name = String((error as { name?: string })?.name || '');
  const message = String((error as { message?: string })?.message || '');
  if (name === 'NotAllowedError' || name === 'AbortError') {
    const failure = new PasskeyError('cancelled', PASSKEY_TEXT.cancelled);
    // Refused because the page is not ready yet («not focused» / «not allowed in the current context»), not cancelled by the owner.
    failure.notFocused = /not focused|current context/i.test(message) && !/cancel/i.test(message);
    return failure;
  }
  if (name === 'NotSupportedError' || name === 'SecurityError') return new PasskeyError('unsupported', PASSKEY_TEXT.unsupported);
  if (name === 'InvalidStateError') return new PasskeyError('failed', 'هذا الجهاز مسجَّل من قبل.');
  return new PasskeyError('failed', PASSKEY_TEXT.failed);
}

/** Sign in with the passkey: returns the same answer as the code login (sessionToken). */
export async function loginWithPasskey(): Promise<{ authenticated?: boolean; sessionToken?: string }> {
  if (!(await passkeySupported())) throw new PasskeyError('unsupported', PASSKEY_TEXT.unsupported);
  const asked = await post('/api/auth/passkey/login/options', {}, false);
  if (!asked.ok) throw serverFailure(asked.data, asked.status);
  const o = asked.data.options;
  let credential: PublicKeyCredential | null;
  try {
    credential = (await navigator.credentials.get({ publicKey: {
      challenge: toBytes(o.challenge), rpId: o.rpId, timeout: o.timeout, userVerification: 'required',
      allowCredentials: (o.allowCredentials || []).map(descriptor),
    } })) as PublicKeyCredential | null;
  } catch (error) { throw browserFailure(error); }
  if (!credential) throw new PasskeyError('cancelled', PASSKEY_TEXT.cancelled);
  const reply = credential.response as AuthenticatorAssertionResponse;
  const verified = await post('/api/auth/passkey/login/verify', { challengeId: asked.data.challengeId, response: {
    id: credential.id, rawId: toText(credential.rawId), type: credential.type,
    authenticatorAttachment: (credential as unknown as { authenticatorAttachment?: string }).authenticatorAttachment || undefined,
    clientExtensionResults: credential.getClientExtensionResults?.() || {},
    response: { clientDataJSON: toText(reply.clientDataJSON), authenticatorData: toText(reply.authenticatorData), signature: toText(reply.signature), userHandle: toText(reply.userHandle) },
  } }, false);
  if (!verified.ok) throw serverFailure(verified.data, verified.status);
  rememberPasskeyDevice();
  return verified.data;
}

/** Register this device for the operator. `code` is asked for when the session is older than ten minutes. */
export async function registerPasskey(opts: { code?: string; label?: string } = {}): Promise<void> {
  if (!(await passkeySupported())) throw new PasskeyError('unsupported', PASSKEY_TEXT.unsupported);
  const asked = await post('/api/passkeys/register/options', opts.code ? { code: opts.code } : {}, true);
  if (!asked.ok) throw serverFailure(asked.data, asked.status);
  const o = asked.data.options;
  let credential: PublicKeyCredential | null;
  try {
    credential = (await navigator.credentials.create({ publicKey: {
      rp: o.rp, user: { ...o.user, id: toBytes(o.user.id) }, challenge: toBytes(o.challenge), pubKeyCredParams: o.pubKeyCredParams,
      timeout: o.timeout, attestation: 'none', authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
      excludeCredentials: (o.excludeCredentials || []).map(descriptor),
    } })) as PublicKeyCredential | null;
  } catch (error) { throw browserFailure(error); }
  if (!credential) throw new PasskeyError('cancelled', PASSKEY_TEXT.cancelled);
  const reply = credential.response as AuthenticatorAttestationResponse;
  const verified = await post('/api/passkeys/register/verify', { challengeId: asked.data.challengeId, label: opts.label || suggestedDeviceLabel(), response: {
    id: credential.id, rawId: toText(credential.rawId), type: credential.type,
    authenticatorAttachment: (credential as unknown as { authenticatorAttachment?: string }).authenticatorAttachment || undefined,
    clientExtensionResults: credential.getClientExtensionResults?.() || {},
    response: { clientDataJSON: toText(reply.clientDataJSON), attestationObject: toText(reply.attestationObject), transports: reply.getTransports?.() || [] },
  } }, true);
  if (!verified.ok) throw serverFailure(verified.data, verified.status);
  rememberPasskeyDevice();
}

export type PasskeyItem = { ref: string; label: string; createdAt: string; lastUsedAt: string | null; synced: boolean };
export type PasskeyList = { available: boolean; limit: number; items: PasskeyItem[] };

export async function fetchPasskeys(): Promise<PasskeyList> {
  const response = await apiFetch('/api/passkeys', { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new PasskeyError('failed', PASSKEY_TEXT.failed);
  return { available: Boolean(data.available), limit: Number(data.limit) || 3, items: Array.isArray(data.items) ? data.items : [] };
}

export async function removePasskey(ref: string): Promise<void> {
  const response = await apiFetch(`/api/passkeys/${encodeURIComponent(ref)}`, { method: 'DELETE' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw serverFailure(data, response.status);
}
