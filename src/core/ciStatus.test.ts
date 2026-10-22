import test from 'node:test';
import assert from 'node:assert/strict';
import { hasCiVerdict } from './ciStatus.ts';

test('cancelled and skipped runs carry no CI verdict', () => {
  assert.equal(hasCiVerdict({ status: 'completed', conclusion: 'cancelled' }), false);
  assert.equal(hasCiVerdict({ status: 'completed', conclusion: 'skipped' }), false);
  assert.equal(hasCiVerdict({ status: 'in_progress', conclusion: null }), false);
});

test('success and failure runs are verdicts', () => {
  assert.equal(hasCiVerdict({ status: 'completed', conclusion: 'success' }), true);
  assert.equal(hasCiVerdict({ status: 'completed', conclusion: 'failure' }), true);
  assert.equal(hasCiVerdict({ status: 'completed', conclusion: 'timed_out' }), true);
});
