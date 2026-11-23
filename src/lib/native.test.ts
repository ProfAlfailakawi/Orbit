import test from 'node:test';
import assert from 'node:assert/strict';
import { isNativeShell, isNativeIOS, pushBlockedMessage, pushInstallMessage } from './native.ts';

const g = globalThis as any;
test('browser: no Capacitor keeps the web wording', () => {
  delete g.Capacitor;
  assert.equal(isNativeShell(), false);
  assert.match(pushBlockedMessage(), /إعدادات المتصفح/);
  assert.match(pushInstallMessage(), /Safari/);
});
test('in-app: native wording, no browser or Safari mention', () => {
  g.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' };
  assert.equal(isNativeShell(), true);
  assert.equal(isNativeIOS(), true);
  assert.equal(pushBlockedMessage(), 'التنبيهات محجوبة. فعّلها من «الإعدادات ‹ الإشعارات ‹ Orbit».');
  assert.doesNotMatch(pushInstallMessage() + pushBlockedMessage(), /Safari|المتصفح/);
  delete g.Capacitor;
});
test('Capacitor present but not native counts as browser', () => {
  g.Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web' };
  assert.equal(isNativeShell(), false);
  delete g.Capacitor;
});
