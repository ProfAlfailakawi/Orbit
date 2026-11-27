import test from 'node:test';
import assert from 'node:assert/strict';
import { createRateGate } from './rateGate.ts';

test('the test-alert gate allows one press, then asks to wait, then caps the hour', () => {
  const gate = createRateGate({ minIntervalMs: 20_000, windowMs: 60 * 60_000, maxPerWindow: 3 });
  assert.equal(gate.take(0), 0);
  assert.equal(gate.take(5_000), 15_000);
  assert.equal(gate.take(20_000), 0);
  assert.equal(gate.take(40_000), 0);
  assert.ok(gate.take(60_000) > 0, 'a fourth press within the hour is refused');
  assert.equal(gate.take(60 * 60_000 + 1), 0, 'the window slides');
});
