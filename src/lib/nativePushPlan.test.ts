import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeSubscribeBody, planNativePush } from './nativePushPlan.ts';

test('granted permission registers silently on every start', () => {
  assert.equal(planNativePush({ permission: 'granted', askedBefore: true, switchedOff: false }), 'register');
  assert.equal(planNativePush({ permission: 'granted', askedBefore: false, switchedOff: false }), 'register');
});

test('an undecided permission is asked once, never twice', () => {
  assert.equal(planNativePush({ permission: 'default', askedBefore: false, switchedOff: false }), 'ask');
  assert.equal(planNativePush({ permission: 'default', askedBefore: true, switchedOff: false }), 'skip');
});

test('denied, unsupported, or switched off by the owner: nothing is registered', () => {
  assert.equal(planNativePush({ permission: 'denied', askedBefore: false, switchedOff: false }), 'skip');
  assert.equal(planNativePush({ permission: 'unsupported', askedBefore: false, switchedOff: false }), 'skip');
  assert.equal(planNativePush({ permission: 'granted', askedBefore: true, switchedOff: true }), 'skip');
});

test('a changed token tells the server which one it replaces', () => {
  assert.deepEqual(nativeSubscribeBody('b'.repeat(64), 'a'.repeat(64)), { token: 'b'.repeat(64), replaces: 'a'.repeat(64) });
  assert.deepEqual(nativeSubscribeBody('a'.repeat(64), 'a'.repeat(64)), { token: 'a'.repeat(64) });
  assert.deepEqual(nativeSubscribeBody('a'.repeat(64), ''), { token: 'a'.repeat(64) });
});
