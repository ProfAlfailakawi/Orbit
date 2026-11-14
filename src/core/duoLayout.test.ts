import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The two-page spread and the laptop dock are for the iPhone Duo's inner screen only (about 669x867 and 951x585 CSS px).
// Safari exposes nothing but the window size, so the size ranges ARE the discriminator: a portrait spread must stay inside
// 640-720 px wide and a landscape one inside 820-1000 px, which keeps every iPad (744+ portrait, 1024+ landscape) on the
// tablet layout. Every such query is also scoped to `screen`, because an A4 print page (about 658 px) falls in the portrait range.
const FILES = ['src/app.css', 'public/updating.html', 'public/privacy-policy.html'];
const read = (file: string) => fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

function preludes(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/@media([^{]+)\{/g)) out.push(m[1].replace(/\s+/g, ' ').trim());
  return out;
}
const px = (query: string, feature: string) => { const m = query.match(new RegExp(`\\(${feature}\\s*:\\s*(\\d+)px\\)`)); return m ? Number(m[1]) : null; };

const isSpread = (q: string) => /min-aspect-ratio:\s*7\/5/.test(q) || (px(q, 'min-width') !== null && (px(q, 'min-height') ?? 0) >= 500 && px(q, 'max-width') !== null);
const isHinge = (q: string) => /horizontal-viewport-segments/.test(q);
const isLaptop = (q: string) => px(q, 'max-height') === 420 && px(q, 'min-width') === 560;

for (const file of FILES) {
  test(`Duo ≠ iPad: ${file} keeps the book spread and the laptop dock to the Duo's size ranges`, () => {
    let seen = 0;
    for (const prelude of preludes(read(file))) {
      for (const query of prelude.split(',').map(q => q.trim())) {
        if (!(isSpread(query) || isHinge(query) || isLaptop(query))) continue;
        seen += 1;
        assert.match(query, /^screen and /, `not scoped to screen: @media ${query}`);
        if (isHinge(query) || isLaptop(query)) continue;
        const min = px(query, 'min-width')!, max = px(query, 'max-width')!;
        if (min < 800) { assert.ok(min >= 640 && max <= 720, `portrait spread must be 640-720 px wide: @media ${query}`); }
        else { assert.ok(max <= 1000, `landscape spread must stay at or below 1000 px wide: @media ${query}`); }
      }
    }
    assert.ok(seen > 0, `${file} no longer has any Duo query; update this guard if that is intended`);
  });
}

test('Duo ≠ iPad: the real-hinge block stays in the stylesheet', () => {
  assert.match(read('src/app.css'), /@media screen and \(horizontal-viewport-segments: 2\)/);
});
