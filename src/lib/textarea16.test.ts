import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('textarea font-size is at least 16px (no iOS focus zoom)', async () => {
  const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
  const m = css.match(/\.manual textarea \{ font-size: ([\d.]+)rem/);
  assert.ok(m && parseFloat(m[1]) >= 1);
});
