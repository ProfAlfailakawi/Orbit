import test from 'node:test';
import assert from 'node:assert/strict';
import { validSubscription } from './pushService.ts';

test('only well-formed https push subscriptions are accepted', () => {
  const ok = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123def456', keys: { p256dh: 'BPk', auth: 'sec' } };
  assert.equal(validSubscription(ok), true);
  assert.equal(validSubscription({ ...ok, endpoint: 'http://insecure.example/x1234567' }), false);
  assert.equal(validSubscription({ ...ok, keys: { p256dh: 'x'.repeat(300), auth: 'a' } }), false);
  assert.equal(validSubscription({ endpoint: ok.endpoint }), false);
  assert.equal(validSubscription(null), false);
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classifyApnsAnswer, sendApnsWithFallback, type ApnsEnv, type ApnsResult } from './apns.ts';
import { createPushService } from './pushService.ts';
import { computeAlertChanges } from './alerts.ts';
import type { ProgramRow } from './fleetStatus.ts';

const TOKEN_A = 'a'.repeat(64);
const TOKEN_B = 'b'.repeat(64);
const message = { kind: 'problem' as const, title: 'Mirasedu', body: 'الموقع لا يفتح', tag: 'orbit-x', url: '/' };

/** A fake APNs: `accepts` says which environment each token belongs to (absent = no environment accepts it). */
function fakeApns(accepts: Record<string, ApnsEnv | 'gone'>) {
  const calls: Array<{ token: string; env: ApnsEnv }> = [];
  const sender = async (token: string, _t: string, _b: string, _d: Record<string, string>, env: ApnsEnv): Promise<ApnsResult> => {
    calls.push({ token, env });
    const owner = accepts[token];
    if (owner === 'gone') return classifyApnsAnswer(410, 'Unregistered');
    return owner === env ? classifyApnsAnswer(200, '') : classifyApnsAnswer(400, 'BadDeviceToken');
  };
  return { sender, calls };
}

function tempService(apns: ReturnType<typeof fakeApns>['sender']) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-push-'));
  const snapshotPath = path.join(dir, 'push.json');
  const service = createPushService({ firestore: null, snapshotPath, apns, webPush: async () => undefined });
  return { service, snapshotPath, read: () => JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) };
}

test('APNs answers: 410 drops, BadDeviceToken asks for the other environment, 5xx keeps the token', () => {
  assert.equal(classifyApnsAnswer(410, 'Unregistered').dead, true);
  assert.equal(classifyApnsAnswer(400, 'BadDeviceToken').wrongEnv, true);
  assert.equal(classifyApnsAnswer(400, 'BadDeviceToken').dead, undefined);
  assert.equal(classifyApnsAnswer(503, 'ServiceUnavailable').dead, undefined);
  assert.equal(classifyApnsAnswer(200, '').sent, true);
});

test('a sandbox token (Xcode build) is retried once on sandbox and its environment is remembered', async () => {
  const apns = fakeApns({ [TOKEN_A]: 'sandbox' });
  const result = await sendApnsWithFallback(apns.sender, TOKEN_A, 'production', 't', 'b');
  assert.equal(result.sent, true);
  assert.equal(result.env, 'sandbox');
  assert.deepEqual(apns.calls.map(c => c.env), ['production', 'sandbox']);
});

test('a token is dropped only when both environments reject it', async () => {
  const apns = fakeApns({});
  const result = await sendApnsWithFallback(apns.sender, TOKEN_A, 'production', 't', 'b');
  assert.equal(result.dead, true);
  assert.equal(apns.calls.length, 2);
});

test('registration path: the app registers on every start, but only a new token is added and welcomed', async () => {
  const apns = fakeApns({ [TOKEN_A]: 'production', [TOKEN_B]: 'production' });
  const { service, read } = tempService(apns.sender);
  await service.load();
  assert.deepEqual(await service.subscribeNative(TOKEN_A), { added: true });
  assert.deepEqual(await service.subscribeNative(TOKEN_A), { added: false }, 'the next app start changes nothing');
  assert.equal(service.nativeCount(), 1);
  // iOS handed the device a new token: the old one is replaced, not kept beside it.
  assert.deepEqual(await service.subscribeNative(TOKEN_B, TOKEN_A), { added: true });
  assert.deepEqual(read().nativeTokens.map((t: { token: string }) => t.token), [TOKEN_B]);
  // The welcome goes only to the device that was just added.
  await service.subscribeNative(TOKEN_A);
  apns.calls.length = 0;
  const welcome = await service.send([message], { nativeToken: TOKEN_A });
  assert.equal(welcome.sent, 1);
  assert.deepEqual(apns.calls.map(c => c.token), [TOKEN_A]);
});

test('sending remembers a sandbox token and drops only tokens both environments reject or that are gone', async () => {
  const dead = 'c'.repeat(64);
  const gone = 'd'.repeat(64);
  const apns = fakeApns({ [TOKEN_A]: 'sandbox', [gone]: 'gone' });
  const { service, read } = tempService(apns.sender);
  await service.load();
  await service.subscribeNative(TOKEN_A);
  await service.subscribeNative(dead);
  await service.subscribeNative(gone);
  const result = await service.send([message]);
  assert.deepEqual(result, { sent: 1, removed: 2 });
  const stored = read().nativeTokens;
  assert.deepEqual(stored.map((t: { token: string; env?: string }) => [t.token, t.env]), [[TOKEN_A, 'sandbox']]);
  // Next time the remembered environment is used first: a single call.
  apns.calls.length = 0;
  await service.send([message]);
  assert.deepEqual(apns.calls, [{ token: TOKEN_A, env: 'sandbox' }]);
});

test('the test alert reaches every registered device and reports how many', async () => {
  const apns = fakeApns({ [TOKEN_A]: 'production', [TOKEN_B]: 'production' });
  const { service } = tempService(apns.sender);
  await service.load();
  await service.subscribeNative(TOKEN_A);
  await service.subscribeNative(TOKEN_B);
  assert.deepEqual(await service.sendTest(), { sent: 2, removed: 0, devices: 2 });
});

test('the monitoring loop turns a new problem into a message that reaches a registered device', async () => {
  const row = (text: string, tone: 'ok' | 'bad') => ({ platform: { id: 'mirasedu', codeName: 'MIRASEDU', nameAr: 'مراس', nameEn: 'Mirasedu' }, tone, text, early: false }) as unknown as ProgramRow;
  const baseline = computeAlertChanges([row('', 'ok')], undefined);
  const change = computeAlertChanges([row('الموقع لا يفتح', 'bad')], baseline.next);
  assert.equal(change.messages.length, 1);
  const apns = fakeApns({ [TOKEN_A]: 'production' });
  const { service } = tempService(apns.sender);
  await service.load();
  await service.subscribeNative(TOKEN_A);
  assert.equal((await service.send(change.messages)).sent, 1);
});
