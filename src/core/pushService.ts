/**
 * Web Push to the owner's devices. Keys and subscriptions live in one Firestore document (or a local file in development);
 * the VAPID key pair is generated on first use, so nothing has to be configured by hand.
 */
import fs from 'node:fs';
import webpush from 'web-push';
import type { Firestore } from 'firebase-admin/firestore';
import type { AlertMemory, PushMessage } from './alerts.ts';

export interface PushSubscriptionJson { endpoint: string; keys: { p256dh: string; auth: string } }
interface Stored { vapid?: { publicKey: string; privateKey: string }; subscriptions: Array<PushSubscriptionJson & { addedAt: number }>; alerts?: AlertMemory }

const MAX_SUBSCRIPTIONS = 10;
const SUBJECT = 'https://orbitq8.web.app';

export function validSubscription(value: unknown): value is PushSubscriptionJson {
  const sub = value as PushSubscriptionJson | null;
  return Boolean(sub && typeof sub.endpoint === 'string' && /^https:\/\/[^\s]{10,1000}$/.test(sub.endpoint) &&
    typeof sub.keys?.p256dh === 'string' && sub.keys.p256dh.length < 200 && typeof sub.keys?.auth === 'string' && sub.keys.auth.length < 100);
}

export function createPushService(options: { firestore: Firestore | null; snapshotPath: string }) {
  let state: Stored = { subscriptions: [] };
  const doc = options.firestore?.collection('orbit').doc('push');

  async function load() {
    try {
      if (doc) state = { subscriptions: [], ...((await doc.get()).data() as Partial<Stored> | undefined) };
      else if (fs.existsSync(options.snapshotPath)) state = { subscriptions: [], ...JSON.parse(fs.readFileSync(options.snapshotPath, 'utf8')) };
    } catch (error) {
      console.warn('ORBIT push store unavailable:', error instanceof Error ? error.message : 'unknown');
    }
    if (!state.vapid) { state.vapid = webpush.generateVAPIDKeys(); await save(); }
  }

  async function save() {
    try {
      if (doc) await doc.set(state);
      else fs.writeFileSync(options.snapshotPath, JSON.stringify(state), { encoding: 'utf8', mode: 0o600 });
    } catch (error) {
      console.warn('ORBIT push persistence failed:', error instanceof Error ? error.message : 'unknown');
    }
  }

  const publicKey = () => state.vapid!.publicKey;
  const count = () => state.subscriptions.length;

  async function subscribe(sub: PushSubscriptionJson) {
    state.subscriptions = [{ endpoint: sub.endpoint, keys: sub.keys, addedAt: Date.now() }, ...state.subscriptions.filter(s => s.endpoint !== sub.endpoint)].slice(0, MAX_SUBSCRIPTIONS);
    await save();
  }

  async function unsubscribe(endpoint: string) {
    state.subscriptions = state.subscriptions.filter(s => s.endpoint !== endpoint);
    await save();
  }

  const alerts = () => state.alerts;
  async function setAlerts(memory: AlertMemory) {
    const changed = JSON.stringify(memory) !== JSON.stringify(state.alerts);
    state.alerts = memory;
    if (changed) await save();
  }

  /** Send to every device; devices that report the subscription gone (404/410) are forgotten. */
  async function send(messages: PushMessage[]): Promise<{ sent: number; removed: number }> {
    if (!messages.length || !state.subscriptions.length) return { sent: 0, removed: 0 };
    webpush.setVapidDetails(SUBJECT, state.vapid!.publicKey, state.vapid!.privateKey);
    let sent = 0;
    const gone = new Set<string>();
    await Promise.all(state.subscriptions.flatMap(sub => messages.map(async message => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(message), { TTL: 6 * 3600, urgency: message.kind === 'problem' ? 'high' : 'normal', timeout: 8000 });
        sent += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.add(sub.endpoint);
      }
    })));
    if (gone.size) { state.subscriptions = state.subscriptions.filter(s => !gone.has(s.endpoint)); await save(); }
    return { sent, removed: gone.size };
  }

  return { load, publicKey, count, subscribe, unsubscribe, alerts, setAlerts, send };
}
