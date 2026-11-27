/** Browser side of alerts: permission, subscription, and what to show the owner. */
import { apiFetch } from './api';
import { isNativePushAvailable, readNativePushPermission, registerNativePushToken, requestNativePushPermission } from '../native-push';
import { nativeSubscribeBody, planNativePush } from '../lib/nativePushPlan';

/** The iPhone app keeps its APNs token here so it can be removed again. */
const NATIVE_TOKEN_KEY = 'orbit_native_push_token';
/** The system question was shown once already (iOS shows it only once anyway; this keeps us from trying again). */
const NATIVE_ASKED_KEY = 'orbit_native_push_asked';
/** The owner switched alerts off from the bell: automatic registration stays off until he switches them on. */
const NATIVE_OFF_KEY = 'orbit_native_push_off';
const readKey = (key: string) => { try { return localStorage.getItem(key) || ''; } catch { return ''; } };
const writeKey = (key: string, value: string) => { try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch { /* storage unavailable */ } };
const readNativeToken = () => readKey(NATIVE_TOKEN_KEY);
const writeNativeToken = (value: string) => writeKey(NATIVE_TOKEN_KEY, value);

/** Fetches this device's APNs token and hands it to the server (idempotent there). Returns whether the server has it now. */
async function sendNativeToken(): Promise<boolean> {
  const token = await registerNativePushToken();
  if (!token) return false;
  const res = await apiFetch('/api/push/subscribe-native', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nativeSubscribeBody(token, readNativeToken())) });
  if (!res.ok) return false;
  writeNativeToken(token);
  return true;
}

/**
 * iPhone app, after a login and on every start while logged in: register for alerts without waiting for the bell.
 * Already allowed → the token goes to the server silently (a changed token replaces the old one); not decided → ask once;
 * refused, or switched off from the bell → nothing. Outside the app this does nothing. Never throws.
 */
export async function autoRegisterNativePush(): Promise<void> {
  try {
    if (!isNativePushAvailable()) return;
    const plan = planNativePush({ permission: await readNativePushPermission(), askedBefore: readKey(NATIVE_ASKED_KEY) === '1', switchedOff: readKey(NATIVE_OFF_KEY) === '1' });
    if (plan === 'skip') return;
    if (plan === 'ask') {
      writeKey(NATIVE_ASKED_KEY, '1');
      if ((await requestNativePushPermission()) !== 'granted') return;
    }
    await sendNativeToken();
  } catch { /* the bell still works by hand */ }
}

/** «إرسال تنبيه تجريبي»: the server sends one message to every registered device. */
export async function sendTestPush(): Promise<{ ok: boolean; sent: number; devices: number; error?: string }> {
  try {
    const res = await apiFetch('/api/push/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await res.json().catch(() => ({})) as { sent?: number; devices?: number; error?: string };
    return { ok: res.ok, sent: Number(data.sent) || 0, devices: Number(data.devices) || 0, error: typeof data.error === 'string' && /[؀-ۿ]/.test(data.error) ? data.error : undefined };
  } catch { return { ok: false, sent: 0, devices: 0 }; }
}

/** How many devices the server would alert (any browser or iPhone), so the test action can show on any of them. */
export async function readPushDevices(): Promise<number> {
  try {
    const res = await apiFetch('/api/push/key');
    if (!res.ok) return 0;
    return Number((await res.json()).devices) || 0;
  } catch { return 0; }
}

export type PushState = 'unsupported' | 'ios-install' | 'blocked' | 'off' | 'on';

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isInstalled = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

function keyBytes(base64Url: string): Uint8Array {
  const padded = base64Url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64Url.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), ch => ch.charCodeAt(0));
}

export async function readPushState(): Promise<PushState> {
  // Inside the iPhone app there is no Service Worker: the system permission and an APNs token are used instead.
  if (isNativePushAvailable()) {
    const permission = await readNativePushPermission();
    if (permission === 'denied') return 'blocked';
    return permission === 'granted' && readNativeToken() ? 'on' : 'off';
  }
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported';
  // iPhone and iPad deliver web alerts only to an app added to the Home Screen.
  if (isIOS() && !isInstalled()) return 'ios-install';
  if (!('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    return subscription && Notification.permission === 'granted' ? 'on' : 'off';
  } catch { return 'off'; }
}

export async function enablePush(): Promise<PushState> {
  if (isNativePushAvailable()) {
    writeKey(NATIVE_OFF_KEY, '');
    writeKey(NATIVE_ASKED_KEY, '1');
    const permission = await requestNativePushPermission();
    if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';
    return (await sendNativeToken()) ? 'on' : 'off';
  }
  const state = await readPushState();
  if (state !== 'off') return state;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';
  const registration = await navigator.serviceWorker.ready;
  const key = (await (await apiFetch('/api/push/key')).json()).publicKey as string;
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) as unknown as BufferSource });
  const res = await apiFetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: subscription.toJSON() }) });
  return res.ok ? 'on' : 'off';
}

export async function disablePush(): Promise<PushState> {
  if (isNativePushAvailable()) {
    const token = readNativeToken();
    try { if (token) await apiFetch('/api/push/unsubscribe-native', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }); } catch { /* already off */ }
    writeNativeToken('');
    writeKey(NATIVE_OFF_KEY, '1');
    return 'off';
  }
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      await apiFetch('/api/push/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
      await subscription.unsubscribe();
    }
  } catch { /* already off */ }
  return 'off';
}
