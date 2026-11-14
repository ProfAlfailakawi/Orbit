import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// iPhone Duo, round 2. Two shared definitions (the same in every app of the family):
//  BOOK  = two pages around a spine, LANDSCAPE inner screen only (951x585..669).
//  DUO INNER (widget keep-out only) = BOOK or the portrait inner screen (669x867). Round 3: in a browser tab AND in the installed app,
//  so the keep-out has no display-mode condition at all.
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
          assert.ok(query.startsWith(PORTRAIT_INNER), `portrait query is not the shared DUO INNER one: @media ${query}`);
        }
        if (min === 721) {
          books += 1;
          assert.match(query, /^screen and /, `not scoped to screen: @media ${query}`);
          assert.ok(query.startsWith(BOOK.replace('(max-height:960px)', `(max-height:${px(query, 'max-height')}px)`)), `not the shared BOOK condition: @media ${query}`);
          assert.ok((px(query, 'max-height') ?? 9999) <= 960, `BOOK must stay at or below 960 px high: @media ${query}`);
        }
      }
    }
    assert.ok(books > 0, `${file} no longer has a BOOK query; update this guard if that is intended`);
  });
}

test('Duo round 2: the portrait inner screen block in app.css holds only the keep-out, no grid', () => {
  const css = read('src/app.css');
  const at = css.indexOf('screen and (min-width: 640px) and (max-width: 720px)');
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

// Round 3: the keep-out is evaluated for real, per file, at every size that matters.
/** Minimal evaluator for the media features the keep-out uses (screen, min/max width/height, orientation). Unknown features fail loudly. */
function matches(query: string, w: number, h: number): boolean {
  const parts = query.split(/\s+and\s+/);
  return parts.every(part => {
    if (part === 'screen') return true;
    const m = part.match(/^\((min|max)-(width|height):(\d+)px\)$/);
    if (m) { const v = m[2] === 'width' ? w : h; return m[1] === 'min' ? v >= Number(m[3]) : v <= Number(m[3]); }
    if (part === '(orientation:landscape)') return w > h;
    if (part === '(orientation:portrait)') return h >= w;
    throw new Error(`keep-out query uses a feature this guard cannot evaluate: ${part}`);
  });
}
const keepOutQueries = (file: string) => {
  const src = read(file);
  const out: string[] = [];
  for (const m of src.matchAll(/@media([^{]+)\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g)) {
    if (/--duo-cutout-w\s*:\s*116px/.test(m[2])) out.push(...squash(m[1]).split(',').map(q => q.trim()));
  }
  return out;
};
const IN: Array<[number, number]> = [[951, 669], [951, 585], [669, 867], [720, 900], [700, 900], [880, 585]];
const OUT: Array<[number, number]> = [[390, 844], [844, 390], [932, 430], [430, 932], [744, 1024], [820, 1180], [1024, 768], [1180, 820], [1280, 800], [1440, 900], [367, 740], [951, 350], [594, 368]];

for (const file of FILES) {
  test(`Duo round 3: ${file} keep-out has no display-mode and matches only the Duo inner screen`, () => {
    const queries = keepOutQueries(file);
    assert.deepEqual(queries.sort(), [BOOK, PORTRAIT_INNER].sort(), `${file} keep-out must be exactly BOOK + PORTRAIT INNER`);
    assert.ok(!/display-mode/.test(queries.join(' ')), `${file} keep-out must not depend on display-mode`);
    for (const [w, h] of IN) assert.ok(queries.some(q => matches(q, w, h)), `${file}: keep-out must apply at ${w}x${h}`);
    for (const [w, h] of OUT) assert.ok(!queries.some(q => matches(q, w, h)), `${file}: keep-out must NOT apply at ${w}x${h}`);
  });
}
