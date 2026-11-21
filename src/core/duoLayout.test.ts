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
        assert.ok(!/horizontal-viewport-segments/.test(query) || query.startsWith(BOOK) || query === 'screen and (horizontal-viewport-segments:2)', `hinge query must stay inside BOOK (or be the bare zone-only query): @media ${query}`);
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

// Widget corner (round 4): ONE reserved zone as CSS variables, evaluated for real in every file that carries it.
// Only the app stylesheet carries the zone: it is switched on by these window-size queries AND html[data-device="duo"] (see the
// reset test below). The static pages have no device markers, so they carry no zone at all.
const ZONE_FILES = ['src/app.css'];
/** Minimal evaluator for the media features the zone uses. Unknown features fail loudly. */
function matches(query: string, w: number, h: number): boolean {
  return query.split(/\s+and\s+/).every(part => {
    if (part === 'screen') return true;
    const m = part.match(/^\((min|max)-(width|height):(\d+)px\)$/);
    if (m) { const v = m[2] === 'width' ? w : h; return m[1] === 'min' ? v >= Number(m[3]) : v <= Number(m[3]); }
    if (part === '(orientation:landscape)') return w > h;
    if (part === '(orientation:portrait)') return h >= w;
    if (part === '(horizontal-viewport-segments:2)') return false; // real hinge only; not simulated
    throw new Error(`widget zone query uses a feature this guard cannot evaluate: ${part}`);
  });
}
const zoneQueries = (file: string) => {
  const out: string[] = [];
  for (const m of squash_all(read(file))) if (/--duo-widget-w\s*:\s*96px/.test(m.body)) out.push(...m.query.split(',').map(q => q.trim()));
  return out;
};
/** Every `@media <q> { :root { ... } }` block, flattened. */
function squash_all(src: string): Array<{ query: string; body: string }> {
  const out: Array<{ query: string; body: string }> = [];
  for (const m of src.matchAll(/@media([^{]+)\{\s*:root\s*\{([^}]*)\}/g)) out.push({ query: squash(m[1]), body: m[2] });
  return out;
}
const ZONE_ON: Array<[number, number]> = [[382, 580], [470, 780], [669, 867], [368, 594], [585, 951], [594, 368], [951, 585], [867, 669], [700, 900], [457, 678], [457, 760], [678, 457], [780, 470], [580, 382], [844, 390], [951, 350], [720, 900], [951, 669], [951, 800], [1000, 960], [867, 669], [700, 600], [540, 400]];
const ZONE_ON_PORTRAIT_EDGE: Array<[number, number]> = [[720, 361], [720, 1200]];
const ZONE_OFF: Array<[number, number]> = [[744, 1024], [820, 1180], [1024, 768], [1180, 820], [1280, 800], [1440, 900], [1100, 300], [1200, 520]];
const ZONE_ON_APP: Array<[number, number]> = [[382, 780], [382, 844], [470, 900], [669, 1000], [951, 700], [594, 420]];

for (const file of ZONE_FILES) {
  test(`Duo widget corner: ${file} reserves the zone on the Duo screens only`, () => {
    const queries = zoneQueries(file);
    assert.ok(queries.length >= 3, `${file}: widget zone definition missing`);
    assert.ok(!/display-mode/.test(queries.join(' ')), `${file}: the zone must not depend on display-mode`);
    for (const [w, h] of [...ZONE_ON, ...ZONE_ON_PORTRAIT_EDGE]) assert.ok(queries.some(q => matches(q, w, h)), `${file}: zone must be active at ${w}x${h}`);
    for (const [w, h] of ZONE_ON_APP) assert.ok(queries.some(q => matches(q, w, h)), `${file}: zone must be active at the taller app viewport ${w}x${h}`);
    for (const [w, h] of ZONE_OFF) assert.ok(!queries.some(q => matches(q, w, h)), `${file}: zone must stay 0 at ${w}x${h}`);
  });
}

test('Duo widget corner: the zone variables live in the root tokens, are 0 by default and never use inline-end', () => {
  const css = read('src/app.css');
  const root = css.slice(css.indexOf(':root {'), css.indexOf('@media (prefers-color-scheme: dark)'));
  for (const v of ['--duo-widget-w: 0px', '--duo-widget-gap: 0px', '--duo-widget-h: 0px']) assert.ok(root.includes(v), `${v} missing from :root`);
  assert.match(css, /--duo-widget-h: clamp\(64px, 31vh, 270px\)/);
  assert.ok(!/duo-cutout/.test(css + read('public/updating.html') + read('public/privacy-policy.html')), 'the old 116px keep-out variables must be gone');
  assert.ok(!/padding-inline-end[^;]*--duo/.test(css), 'the zone is physical right; never inline-end');
});

// The window-size queries above match every ordinary iPhone (390-430 wide), a narrow iPad window and a narrow desktop browser too.
// The zone is real only on the iPhone Duo (html[data-device="duo"], set by src/lib/duo-markers.ts); everywhere else it must be 0.
const ZONE_VARS = ['--duo-widget-w', '--duo-widget-gap', '--duo-widget-h', '--duo-col', '--duo-reserve-r', '--duo-extra'];
const STATIC_PAGES = ['public/updating.html', 'public/privacy-policy.html', 'apple/www/index.html', 'apple/www/offline.html'];
/** Every `selector { body }` rule with no nested block, with the selector text cleaned of comments. */
const flatRules = (src: string) => [...src.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{};]+)\{([^{}]*)\}/g)].map(m => ({ sel: m[1].trim(), body: m[2] }));

test('Widget corner: normal screens get no zone (the reset under html:not([data-device="duo"]) zeroes every zone variable)', () => {
  const css = read('src/app.css');
  const resets = flatRules(css).filter(r => r.sel === 'html:not([data-device="duo"])');
  assert.equal(resets.length, 1, 'the html:not([data-device="duo"]) reset is missing: the zone would return on every iPhone, narrow iPad and desktop window');
  const reset = resets[0].body;
  for (const v of ZONE_VARS) assert.match(reset, new RegExp(`${v}\\s*:\\s*0px\\s*(;|$)`), `the reset must set ${v} to 0px`);
  // Every variable the zone blocks set must be in the reset, so a new one cannot leak onto ordinary phones.
  for (const r of flatRules(css)) {
    if (!/--duo-widget-w\s*:\s*96px/.test(r.body)) continue;
    for (const m of r.body.matchAll(/(--duo-[\w-]+)\s*:/g)) assert.ok(new RegExp(`${m[1]}\\s*:\\s*0px`).test(reset), `${m[1]} is set by a zone block but not reset to 0px off the Duo`);
  }
  // A non-zero zone value may only live on :root (lower specificity than the reset) or under [data-device="duo"], and never !important.
  for (const r of flatRules(css)) {
    for (const m of r.body.matchAll(/(--duo-widget-[whg]\w*)\s*:\s*([^;]+)/g)) {
      const value = m[2].trim();
      assert.ok(!/!important/.test(value), `${m[1]} must not be !important (it would beat the reset): ${r.sel}`);
      if (/^0px$/.test(value)) continue;
      assert.ok(r.sel === ':root' || /\[data-device="duo"\]/.test(r.sel) && !/:not\(/.test(r.sel), `${m[1]}: ${value} is reachable off the Duo through \`${r.sel}\``);
    }
  }
});

test('Widget corner: the static pages (no device markers) carry no width-only zone', () => {
  for (const file of STATIC_PAGES) {
    const src = read(file);
    assert.ok(!/--duo-widget-w\s*:\s*(?!\s|0px)[^;}]+/.test(src), `${file}: a non-zero --duo-widget-w is back; without markers it would hit every ordinary iPhone`);
  }
});

test('Widget corner: the app marks the iPhone Duo before the first render', () => {
  const main = read('src/main.tsx');
  assert.match(main, /import \{ installDuoMarkers \} from '\.\/lib\/duo-markers\.ts';/);
  assert.ok(main.indexOf('installDuoMarkers();') > -1 && main.indexOf('installDuoMarkers();') < main.indexOf('createRoot('), 'installDuoMarkers() must run before React renders');
  const markers = read('src/lib/duo-markers.ts');
  assert.match(markers, /root\.dataset\.device = duo \? 'duo' : 'other'/);
  assert.match(markers, /iPhone\|iPod/, 'Duo detection must require an iPhone (or the iOS shell)');
  assert.match(markers, /shortScreen <= 720/, 'Duo detection must exclude every iPad (short side >= 744)');
});
