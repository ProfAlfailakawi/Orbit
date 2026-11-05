import test from 'node:test';
import assert from 'node:assert/strict';
import { displayName } from './displayName.ts';

test('fleet programs keep their code name', () => {
  assert.equal(displayName({ codeName: 'NAHJ', nameAr: 'نهج', isCustomAdded: false }), 'NAHJ');
});

test('custom programs show what the owner typed, minus a trailing parenthetical', () => {
  assert.equal(displayName({ codeName: 'X1', nameAr: 'موقعي (My Site)', isCustomAdded: true }), 'موقعي');
  assert.equal(displayName({ codeName: 'X1', nameAr: 'موقعي', isCustomAdded: true }), 'موقعي');
});

test('a custom program with an empty name falls back to its code name', () => {
  assert.equal(displayName({ codeName: 'X1', nameAr: '  (only note)', isCustomAdded: true }), 'X1');
});
