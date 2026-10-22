/** Browser side of alerts: permission, subscription, and what to show the owner. */
import { apiFetch } from './api';

export type PushState = 'unsupported' | 'ios-install' | 'blocked' | 'off' | 'on';

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isInstalled = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

function keyBytes(base64Url: string): Uint8Array {
  const padded = base64Url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64Url.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), ch => ch.charCodeAt(0));
}

export async function readPushState(): Promise<PushState> {
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
