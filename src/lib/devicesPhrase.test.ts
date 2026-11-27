import test from 'node:test';
import assert from 'node:assert/strict';
import { devicesPhrase } from './devicesPhrase.ts';

test('device counts read as natural Arabic', () => {
  assert.equal(devicesPhrase(1), 'جهاز واحد');
  assert.equal(devicesPhrase(2), 'جهازين');
  assert.equal(devicesPhrase(3), '3 أجهزة');
  assert.equal(devicesPhrase(10), '10 أجهزة');
  assert.equal(devicesPhrase(11), '11 جهازًا');
});
