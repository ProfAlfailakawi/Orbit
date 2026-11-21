import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REVIEW_DEMO_ACCESS_CODE, isReviewDemoAccessCode, normalizeReviewDemoCandidate } from './review-demo-entry.ts';

test('the reserved code is long, random-looking and not a guessable word', () => {
  assert.ok(REVIEW_DEMO_ACCESS_CODE.length >= 14);
  assert.match(REVIEW_DEMO_ACCESS_CODE, /^[a-z0-9]+$/);
  assert.ok(!/test|demo|orbit|apple|review|password|12345/i.test(REVIEW_DEMO_ACCESS_CODE));
});

test('matches exactly the code (case and spaces tolerated), nothing else', () => {
  assert.equal(isReviewDemoAccessCode(REVIEW_DEMO_ACCESS_CODE), true);
  assert.equal(isReviewDemoAccessCode(' ' + REVIEW_DEMO_ACCESS_CODE.toUpperCase() + ' '), true);
  for (const bad of ['', 'Test', 'demo', '9999999999', REVIEW_DEMO_ACCESS_CODE.slice(0, -1), REVIEW_DEMO_ACCESS_CODE + '1', null, undefined, 0, {}, []]) {
    assert.equal(isReviewDemoAccessCode(bad), false, String(bad));
  }
  assert.equal(normalizeReviewDemoCandidate(' A b '), 'ab');
});

test('no visible demo button remains in the app UI', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.ok(!app.includes('btn-demo'));
  assert.ok(!app.includes('تجربة بدون حساب'));
  assert.ok(!app.includes('/api/demo/config'));
  assert.ok(app.includes('isReviewDemoAccessCode(passkeyInput)'));
});
