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
