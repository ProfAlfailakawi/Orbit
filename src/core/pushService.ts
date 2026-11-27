/**
 * Web Push to the owner's devices. Keys and subscriptions live in one Firestore document (or a local file in development);
 * the VAPID key pair is generated on first use, so nothing has to be configured by hand.
 */
import fs from 'node:fs';
import webpush from 'web-push';
import type { Firestore } from 'firebase-admin/firestore';
import type { AlertMemory, PushMessage } from './alerts.ts';
import { defaultApnsEnv, sendApns, sendApnsWithFallback, type ApnsEnv, type ApnsSender } from './apns.ts';

export interface PushSubscriptionJson { endpoint: string; keys: { p256dh: string; auth: string } }
/** env: the APNs environment that last accepted this token (absent = the server default). */
interface NativeDevice { token: string; addedAt: number; env?: ApnsEnv }
export interface SendResult { sent: number; removed: number }
/** Limit a send to one device (the welcome message goes only to the device that was just added). */
export interface SendTarget { nativeToken?: string; endpoint?: string }
interface Stored { vapid?: { publicKey: string; privateKey: string }; subscriptions: Array<PushSubscriptionJson & { addedAt: number }>; nativeTokens?: Array<NativeDevice>; alerts?: AlertMemory }

const MAX_SUBSCRIPTIONS = 10;
const SUBJECT = 'https://orbitq8.web.app';

export function validSubscription(value: unknown): value is PushSubscriptionJson {
  const sub = value as PushSubscriptionJson | null;
  return Boolean(sub && typeof sub.endpoint === 'string' && /^https:\/\/[^\s]{10,1000}$/.test(sub.endpoint) &&
    typeof sub.keys?.p256dh === 'string' && sub.keys.p256dh.length < 200 && typeof sub.keys?.auth === 'string' && sub.keys.auth.length < 100);
}

type WebPushSender = (sub: PushSubscriptionJson, payload: string, options: { TTL: number; urgency: 'high' | 'normal'; timeout: number }) => Promise<unknown>;

export function createPushService(options: { firestore: Firestore | null; snapshotPath: string; apns?: ApnsSender; webPush?: WebPushSender }) {
  const apnsSender: ApnsSender = options.apns || ((token, title, body, data, env) => sendApns(token, title, body, data, env));
  const webPushSender: WebPushSender = options.webPush || ((sub, payload, opts) => webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload, opts));
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
  const count = () => state.subscriptions.length + (state.nativeTokens?.length || 0);
  const nativeCount = () => state.nativeTokens?.length || 0;

  async function subscribe(sub: PushSubscriptionJson): Promise<{ added: boolean }> {
    const added = !state.subscriptions.some(s => s.endpoint === sub.endpoint);
    state.subscriptions = [{ endpoint: sub.endpoint, keys: sub.keys, addedAt: Date.now() }, ...state.subscriptions.filter(s => s.endpoint !== sub.endpoint)].slice(0, MAX_SUBSCRIPTIONS);
    await save();
    return { added };
  }

  async function unsubscribe(endpoint: string) {
    state.subscriptions = state.subscriptions.filter(s => s.endpoint !== endpoint);
    await save();
  }

  /**
   * The owner's iPhone app: an APNs device token instead of a Web Push subscription.
   * Idempotent: the app calls this on every start, so a known token changes nothing (and keeps its environment).
   * replaces: the token this device used before, when iOS handed it a new one. added: the token was not known.
   */
  async function subscribeNative(token: string, replaces?: string): Promise<{ added: boolean }> {
    const devices = state.nativeTokens || [];
    const known = devices.some(t => t.token === token);
    const stale = Boolean(replaces && replaces !== token && devices.some(t => t.token === replaces));
    if (known && !stale) return { added: false };
    const others = devices.filter(t => t.token !== token && t.token !== replaces);
    const current = devices.find(t => t.token === token);
    state.nativeTokens = [current || { token, addedAt: Date.now() }, ...others].slice(0, MAX_SUBSCRIPTIONS);
    await save();
    return { added: !known };
  }

  async function unsubscribeNative(token: string) {
    state.nativeTokens = (state.nativeTokens || []).filter(t => t.token !== token);
    await save();
  }

  const alerts = () => state.alerts;
  async function setAlerts(memory: AlertMemory) {
    const changed = JSON.stringify(memory) !== JSON.stringify(state.alerts);
    state.alerts = memory;
    if (changed) await save();
  }

  /**
   * Send to every device (or only `target`); web subscriptions that report 404/410 are forgotten, and APNs tokens are forgotten
   * only when APNs says the app is gone (410) or both its environments reject the token (see sendApnsWithFallback).
   */
  async function send(messages: PushMessage[], target?: SendTarget): Promise<SendResult> {
    const webTargets = target ? state.subscriptions.filter(s => s.endpoint === target.endpoint) : state.subscriptions;
    const nativeTargets = target ? (state.nativeTokens || []).filter(t => t.token === target.nativeToken) : (state.nativeTokens || []);
    if (!messages.length || (!webTargets.length && !nativeTargets.length)) return { sent: 0, removed: 0 };
    if (webTargets.length && !options.webPush) webpush.setVapidDetails(SUBJECT, state.vapid!.publicKey, state.vapid!.privateKey);
    let sent = 0;
    const gone = new Set<string>();
    await Promise.all(webTargets.flatMap(sub => messages.map(async message => {
      try {
        await webPushSender(sub, JSON.stringify(message), { TTL: 6 * 3600, urgency: message.kind === 'problem' ? 'high' : 'normal', timeout: 8000 });
        sent += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.add(sub.endpoint);
      }
    })));
    // Native iPhone app: straight to APNs. A failure here never affects the Web Push sends above.
    // Messages go one after another per device, so a token's environment is learned from the first and reused by the rest.
    const deadNative = new Set<string>();
    let envChanged = false;
    await Promise.all(nativeTargets.map(async device => {
      for (const message of messages) {
        try {
          const env = device.env || defaultApnsEnv();
          const result = await sendApnsWithFallback(apnsSender, device.token, env, message.title, message.body, { kind: String(message.kind || ''), url: String(message.url || '/'), tag: String(message.tag || '') });
          if (result.sent) {
            sent += 1;
            if (result.env !== env || !device.env) { device.env = result.env; envChanged = true; }
          } else if (result.dead) { deadNative.add(device.token); return; }
        } catch { /* one device failing must not stop the rest */ }
      }
    }));
    if (deadNative.size) state.nativeTokens = (state.nativeTokens || []).filter(t => !deadNative.has(t.token));
    if (gone.size) state.subscriptions = state.subscriptions.filter(s => !gone.has(s.endpoint));
    if (gone.size || deadNative.size || envChanged) await save();
    return { sent, removed: gone.size + deadNative.size };
  }

  /** «إرسال تنبيه تجريبي»: one message to every registered device, and how many it reached. */
  async function sendTest(): Promise<SendResult & { devices: number }> {
    const devices = count();
    const result = await send([{ kind: 'recovered', title: 'أوربت', body: 'تنبيه تجريبي: التنبيهات تصل إلى هذا الجهاز.', tag: 'orbit-test', url: '/' }]);
    return { ...result, devices };
  }

  return { load, publicKey, count, nativeCount, subscribe, unsubscribe, subscribeNative, unsubscribeNative, alerts, setAlerts, send, sendTest };
}
