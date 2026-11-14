import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// iPhone Duo, round 2. Two shared definitions (the same in every app of the family):
//  BOOK  = two pages around a spine, LANDSCAPE inner screen only (951x585..669).
//  DUO INNER (widget keep-out only) = BOOK or the portrait inner screen (669x867), both only when installed (display-mode: standalone).
// Portrait is never split into two halves. Phones on their side (height < 520), iPads (744+ portrait, 1024+ landscape) and desktops
// keep their own layout. Every such query is scoped to `screen` (an A4 print page is about 658 px wide).
const FILES = ['src/app.css', 'public/updating.html', 'public/privacy-policy.html'];
const read = (file: string) => fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const squash = (q: string) => q.replace(/\s+/g, ' ').replace(/\s*:\s*/g, ':').replace(/\( /g, '(').trim();

function preludes(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/@media([^{]+)\{/g)) out.push(squash(m[1]));
  return out;
}
const px = (query: string, feature: string) => { const m = query.match(new RegExp(`\\(${feature}:(\\d+)px\\)`)); return m ? Number(m[1]) : null; };

const BOOK = 'screen and (min-width:721px) and (max-width:1000px) and (min-height:520px) and (max-height:960px) and (orientation:landscape)';
const PORTRAIT_INNER = 'screen and (min-width:640px) and (max-width:720px) and (min-height:520px) and (max-height:960px) and (orientation:portrait)';

/** Does the exact BOOK condition match a window of w x h CSS px? (same numbers as BOOK above) */
const isBook = (w: number, h: number) => w >= 721 && w <= 1000 && h >= 520 && h <= 960 && w > h;

for (const file of FILES) {
  test(`Duo round 2: ${file} splits into two pages in landscape book mode only`, () => {
    let books = 0;
    for (const prelude of preludes(read(file))) {
      for (const query of prelude.split(',').map(q => q.trim())) {
        const min = px(query, 'min-width'), max = px(query, 'max-width');
        assert.ok(!/min-aspect-ratio/.test(query), `old aspect-ratio spread query: @media ${query}`);
        assert.ok(!(min === 820 && max === 1000), `old 820-1000 spread query: @media ${query}`);
        assert.ok(!/horizontal-viewport-segments/.test(query) || query.startsWith(BOOK), `hinge query must stay inside BOOK: @media ${query}`);
        if (min === 640 && max === 720) {
          // The portrait inner screen only ever gets the widget keep-out, never a layout split.
          assert.match(query, /\(display-mode:standalone\)/, `portrait 640-720 query without standalone: @media ${query}`);
          assert.ok(query.includes(PORTRAIT_INNER.replace('screen and ', 'screen and (display-mode:standalone) and ')), `portrait query is not the shared DUO INNER one: @media ${query}`);
        }
        if (min === 721) {
          books += 1;
          assert.match(query, /^screen and /, `not scoped to screen: @media ${query}`);
          const body = query.replace('(display-mode:standalone) and ', '');
          assert.ok(body.startsWith(BOOK.replace('(max-height:960px)', `(max-height:${px(query, 'max-height')}px)`)), `not the shared BOOK condition: @media ${query}`);
          assert.ok((px(query, 'max-height') ?? 9999) <= 960, `BOOK must stay at or below 960 px high: @media ${query}`);
        }
      }
    }
    assert.ok(books > 0, `${file} no longer has a BOOK query; update this guard if that is intended`);
  });
}

test('Duo round 2: the portrait inner screen block in app.css holds only the keep-out, no grid', () => {
  const css = read('src/app.css');
  const at = css.indexOf('screen and (display-mode: standalone) and (min-width: 640px)');
  assert.ok(at > 0, 'keep-out block missing');
  const block = css.slice(at, css.indexOf('\n}\n', at));
  assert.match(block, /--duo-cutout-w: 116px/);
  assert.match(block, /--duo-cutout-h: 116px/);
  assert.ok(!/grid-template-columns|column-count|columns:/.test(block), 'the shared portrait block must not split the page');
});

test('Duo round 2: BOOK matches the Duo landscape sizes and nothing else', () => {
  for (const [w, h] of [[951, 585], [951, 669], [951, 540], [800, 600], [1000, 700]]) assert.ok(isBook(w, h), `${w}x${h} should be book`);
  const notBook: Array<[number, number]> = [[669, 867], [720, 900], [390, 844], [844, 390], [932, 430], [744, 1024], [820, 1180], [1024, 768], [1180, 820], [1280, 800], [951, 350], [367, 740], [594, 368]];
  for (const [w, h] of notBook) assert.ok(!isBook(w, h), `${w}x${h} must keep its own layout`);
});

test('Duo round 2: the real-hinge block stays in the stylesheet, inside BOOK', () => {
  assert.ok(preludes(read('src/app.css')).some(q => q.startsWith(BOOK) && /horizontal-viewport-segments:2/.test(q)));
});

test('Duo round 2: the laptop dock for short landscape stays as it was', () => {
  assert.ok(preludes(read('src/app.css')).includes('screen and (max-height:420px) and (min-width:560px)'));
});
