import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../app.css', import.meta.url), 'utf8');
const block = (re: RegExp) => Object.fromEntries([...(css.match(re)?.[1] ?? '').matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map(m => [m[1], m[2]]));
const light = block(/:root\s*\{([^}]*)\}/);
const dark = { ...light, ...block(/prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/) };

const lum = (hex: string) => {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// Every text colour is only ever drawn on these backgrounds.
const pairs: Array<[string, string]> = [
  ['ink', 'bg'], ['ink', 'card'], ['muted', 'bg'], ['muted', 'card'],
  ['btn-ink', 'btn'], ['btn-ink', 'btn2'], ['btn', 'card'], ['btn', 'bg'],
  ['muted', 'bad-bg'], ['muted', 'warn-bg'], ['muted', 'ok-bg'],
  ['bad-ink', 'card'], ['warn-ink', 'card'],
  ['hero-ink', 'hero-1'], ['hero-ink', 'hero-2'], ['hero-muted', 'hero-1'], ['hero-muted', 'hero-2'], ['hero-btn-ink', 'hero-btn'],
  ['hero-1', 'hero-ok'], ['hero-bad', 'hero-1'], ['hero-warn', 'hero-1'], ['hero-ok', 'hero-1'],
  ['bad-ink', 'bad-bg'], ['warn-ink', 'warn-bg'], ['ok-ink', 'card'], ['ok-ink', 'ok-bg'],
  ['ink', 'bad-bg'], ['ink', 'warn-bg'], ['ink', 'ok-bg'], ['bad-ink', 'card'],
];

// Shapes and strokes (status badges, ring) need 3:1. A literal hex may stand in for a token.
const shapes: Array<[string, string]> = [
  ['on-bad', 'bad-edge'], ['on-warn', 'warn-edge'], ['ok-ink', 'ok-bg'],
  ['bad-edge', 'card'], ['warn-edge', 'card'], ['ok-edge', 'card'],
  ['bad-edge', 'bad-bg'], ['warn-edge', 'warn-bg'], ['ok-edge', 'ok-bg'],
  ['hero-1', 'hero-bad'], ['hero-1', 'hero-warn'], ['hero-1', 'hero-local'], ['hero-local', 'hero-1'], ['hero-local', 'hero-2'],
];
const colour = (theme: Record<string, string>, key: string) => (key.startsWith('#') ? key : theme[key]);

for (const [name, theme] of [['light', light], ['dark', dark]] as const) {
  test(`${name} theme: status shapes and the ring meet 3:1`, () => {
    for (const [fg, bg] of shapes) {
      const r = ratio(colour(theme, fg), colour(theme, bg));
      assert.ok(r >= 3, `${fg} on ${bg} is ${r.toFixed(2)}:1 in ${name}`);
    }
  });

  test(`${name} theme: text/background pairs meet WCAG AA (4.5:1)`, () => {
    for (const [fg, bg] of pairs) {
      assert.ok(theme[fg] && theme[bg], `missing token ${fg} or ${bg}`);
      const r = ratio(theme[fg], theme[bg]);
      assert.ok(r >= 4.5, `${fg} on ${bg} is ${r.toFixed(2)}:1 in ${name}`);
    }
  });
}
