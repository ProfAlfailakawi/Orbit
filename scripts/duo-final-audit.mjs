#!/usr/bin/env node
// iPhone Duo final audit (WebKit): every screen x every pose, measured, plus the live resize sequence and the stress checks.
// Read-only against a RUNNING local Orbit (demo sandbox + stubbed routes; nothing real is written):
// Service workers are blocked in the audit: the shell's worker would otherwise take over Vite's dev modules in WebKit.
//   PORT=5150 npm run dev
//   PW_MODULE=/opt/node22/lib/node_modules/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers \
//     node scripts/duo-final-audit.mjs [baseUrl] [outDir]
// Writes <outDir>/report.json and screenshots of the key poses to <outDir>/shots/.
import fs from 'node:fs/promises';
import path from 'node:path';

const { webkit } = await import(process.env.PW_MODULE || 'playwright');
const base = (process.argv[2] || process.env.ORBIT_BASE_URL || 'http://127.0.0.1:5150').replace(/\/$/, '');
const outDir = process.argv[3] || 'test-artifacts/duo-final';
const only = process.env.DUO_ONLY ? new Set(process.env.DUO_ONLY.split(',')) : null; // limit screens while iterating
const shotsOnly = process.env.DUO_SHOTS_ONLY === '1';
await fs.mkdir(path.join(outDir, 'shots'), { recursive: true });

// Poses A–H (I and J are separate runs below). "book" marks the inner screen sizes where the two-page spread applies.
const POSES = [
  ['A', 382, 580], ['A', 385, 571], ['A', 320, 568],
  ['B', 594, 368],
  ['C', 669, 867, 'book'],
  ['D', 951, 585, 'book'],
  ['E', 951, 350], ['E', 600, 350],
  ['F', 669, 520], ['F', 600, 480],
  ['G', 768, 1024], ['G', 1024, 768], ['G', 1280, 800], ['G', 1440, 900],
  ['H', 360, 640], ['H', 390, 844], ['H', 844, 390],
  ['S', 320, 350], ['S', 320, 600], ['S', 320, 900], ['S', 470, 350], ['S', 470, 600], ['S', 470, 900], ['S', 620, 350], ['S', 620, 600], ['S', 620, 900],
];
const SHOT_SIZES = new Set(['669x867', '951x585', '951x350', '600x350', '594x368', '382x580', '669x520', '768x1024']);
const SPINE = 28; // the brief's minimum spine; the layout reserves 32px, so the zone tested is the stricter centre ± 14px

const DEMO_STATE_EMPTY = { platforms: [], events: [], incidents: [], hasGithubTokenConfigured: true, demo: true };

// The local demo gate allows 20 entries per client address per 15 minutes; every audit context presents its own
// address (the dev server trusts one proxy hop), so the whole matrix can run against one local server.
let clientNo = 0;
const clientIp = () => { clientNo += 1; return `10.77.${Math.floor(clientNo / 250)}.${clientNo % 250 + 1}`; };

async function newPage(browser, w, h, opts = {}) {
  const context = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': clientIp() }, viewport: { width: w, height: h }, deviceScaleFactor: 1, locale: 'ar-KW', hasTouch: true, isMobile: false, reducedMotion: 'reduce', serviceWorkers: 'block', colorScheme: opts.colorScheme || 'light' });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  return { context, page };
}

async function settle(page) { await page.waitForTimeout(250); }

async function enterDemo(page) {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('.btn-demo').waitFor({ timeout: 20000 });
  await page.locator('.btn-demo').click();
  await page.locator('.rs').first().waitFor({ timeout: 20000 });
  await settle(page);
}

// ── Measurements ─────────────────────────────────────────────
async function measure(page, { book, laptop }) {
  return page.evaluate(({ book, laptop, SPINE }) => {
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const visible = el => {
      const s = getComputedStyle(el); const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0.01 && r.width > 0 && r.height > 0;
    };
    const label = el => (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
    const sel = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
    const sy = window.scrollY;
    const box = el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top + sy, w: r.width, h: r.height, r: r.right, b: r.bottom + sy }; };
    const interactive = [...document.querySelectorAll('button, input, textarea, a[href], select')].filter(visible);

    const overflowX = document.documentElement.scrollWidth - vw;
    // Clipped: an important element that sticks out of the viewport sideways, or is cut by an overflow:hidden ancestor.
    const important = [...document.querySelectorAll('h1, h2, .btn, input, textarea, .rs, .detail, .tally li, .login, .hero, .roster, .add, .manual, .banner, .reason, .notice')].filter(visible);
    const clipped = [];
    for (const el of important) {
      const r = el.getBoundingClientRect();
      if (r.left < -1 || r.right > vw + 1) { clipped.push({ el: sel(el), label: label(el), why: 'outside viewport x', left: Math.round(r.left), right: Math.round(r.right) }); continue; }
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (/(hidden|clip|auto|scroll)/.test(s.overflowX + s.overflowY)) {
          const pr = p.getBoundingClientRect();
          const scrollable = /(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight;
          if (r.left < pr.left - 1 || r.right > pr.right + 1 || (!scrollable && (r.top < pr.top - 1 || r.bottom > pr.bottom + 1))) {
            clipped.push({ el: sel(el), label: label(el), why: 'cut by ' + sel(p) });
          }
          break;
        }
      }
    }
    // Tap targets: every visible control at least 44x44 (its own box or a declared larger hit area via ::after).
    const small = [];
    for (const el of interactive) {
      const r = el.getBoundingClientRect();
      let w = r.width, h = r.height;
      const after = getComputedStyle(el, '::after');
      if (after.content !== 'none' && after.position === 'absolute') {
        const inset = parseFloat(after.top) || 0; w -= 2 * inset; h -= 2 * inset;
      }
      if (Math.round(w) < 44 || Math.round(h) < 44) small.push({ el: sel(el), label: label(el), w: Math.round(w), h: Math.round(h) });
    }
    // Spine: no text, input, button or list cell crosses centre ± SPINE/2 at the inner-screen sizes.
    const spine = [];
    if (book) {
      const cx = vw / 2, z0 = cx - SPINE / 2, z1 = cx + SPINE / 2;
      const textEls = [...document.querySelectorAll('body *')].filter(el =>
        [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && visible(el));
      const cells = [...document.querySelectorAll('.rs, .tally li, .detail, .explain, .banner, input, textarea')].filter(visible);
      for (const el of new Set([...interactive, ...textEls, ...cells])) {
        let r = el.getBoundingClientRect();
        if (textEls.includes(el) && !interactive.includes(el)) {
          // Measure the ink of the text, not the block box: a heading block may span the page while its words do not.
          const range = document.createRange(); range.selectNodeContents(el);
          const rects = [...range.getClientRects()].filter(q => q.width > 0);
          if (rects.length) r = { left: Math.min(...rects.map(q => q.left)), right: Math.max(...rects.map(q => q.right)) };
        }
        if (r.left < z1 && r.right > z0) spine.push({ el: sel(el), label: label(el), left: Math.round(r.left), right: Math.round(r.right) });
      }
    }
    // Laptop posture: the bottom bar never covers content once scrolled to the end.
    let barCovers = null;
    const bar = document.querySelector('.bar');
    if (laptop && bar && getComputedStyle(bar).position === 'fixed') {
      window.scrollTo(0, document.documentElement.scrollHeight);
      const barTop = bar.getBoundingClientRect().top;
      const last = [...document.querySelectorAll('.page > *:not(.page-aside), .page-aside > *')].filter(visible).map(el => el.getBoundingClientRect().bottom);
      barCovers = Math.max(0, Math.round(Math.max(...last) - barTop));
      window.scrollTo(0, sy);
    }
    const first = {};
    for (const [k, q] of [['h1', 'main h1'], ['primary', '.hero .btn-primary'], ['login', '.login .btn-primary'], ['passkey', '#orbit-passkey-input']]) {
      const el = document.querySelector(q);
      if (el && visible(el)) { const r = el.getBoundingClientRect(); first[k] = r.top >= 0 && r.bottom <= vh + 1; }
    }
    const barEl = document.querySelector('.bar');
    return {
      overflowX, clipped, small, spine, barCovers, firstScreen: first,
      barPosition: barEl ? getComputedStyle(barEl).position + (barEl.getBoundingClientRect().top > vh / 2 ? '-bottom' : '-top') : null,
      // Whether the two-page spread is in force (null on the static pages, which have no grid).
      book: document.querySelector('.page') ? getComputedStyle(document.querySelector('.page')).display === 'grid'
        : document.querySelector('.login-stage') ? getComputedStyle(document.querySelector('.login-stage')).display === 'grid' : null,
      docHeight: document.documentElement.scrollHeight,
    };
  }, { book, laptop, SPINE });
}

// ── Screens (inventory: see docs/IPHONE-DUO-FINAL-ACCEPTANCE.md §1) ──
// Each opens from the dashboard's resting state and returns the page in the named state.
const resetDash = async page => {
  if (await page.locator('.detail-close').count()) await page.locator('.detail-close').click({ force: true });
  if (await page.locator('.manual .btn').count()) await page.locator('.manual .btn').click();
  const addClose = page.locator('form.add .actions .btn:not(.btn-primary)');
  if (await addClose.count()) await addClose.click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle(page);
};
const pickProblem = async page => { await page.locator('.rs-bad, .rs-warn').first().click(); await page.locator('.detail').waitFor(); await settle(page); };

const DASH_SCREENS = {
  'dash-home': async () => {},
  'dash-detail': async page => { await pickProblem(page); },
  'dash-detail-ok': async page => { await page.locator('.rs-ok').first().click(); await page.locator('.detail').waitFor(); await settle(page); },
  'dash-explain': async page => { await pickProblem(page); await page.locator('.btn-explain').click(); await page.locator('.explain-chip, .explain p').first().waitFor(); await settle(page); },
  'dash-copied': async page => {
    await page.evaluate(() => { navigator.clipboard.writeText = async () => {}; });
    await page.locator('.hero .btn-primary').click(); await page.locator('.hero .btn.is-copied').waitFor(); await settle(page);
  },
  'dash-manual-copy': async page => {
    await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('denied'); }; document.execCommand = () => false; });
    await page.locator('.hero .btn-primary').click(); await page.locator('.manual').waitFor(); await settle(page);
  },
  'dash-add': async page => { await page.locator('.btn-add').first().click(); await page.locator('form.add').waitFor(); await page.locator('form.add input[type=text]').fill('برنامج القياس'); await settle(page); },
  'dash-add-error': async page => {
    await page.locator('.btn-add').first().click(); await page.locator('form.add').waitFor();
    await page.locator('form.add input[type=text]').fill('اختبار'); await page.locator('form.add input[type=url]').fill('https://github.com/only-owner');
    await page.locator('form.add .btn-primary').click(); await page.locator('form.add [role=status]').waitFor(); await settle(page);
  },
  'dash-add-mine': async page => {
    await page.locator('.btn-add').first().click(); await page.locator('form.add').waitFor();
    if (!(await page.locator('.mine-row').count())) {
      await page.locator('form.add input[type=text]').fill('برنامج تجريبي'); await page.locator('form.add input[type=url]').fill('https://example.org');
      await page.locator('form.add .btn-primary').click(); await page.locator('.mine-row').first().waitFor();
    }
    await page.locator('.mine-row .btn').first().click(); await page.locator('.btn-danger').waitFor(); await settle(page);
  },
  'dash-sync-banner': async page => { await page.locator('.bar .btn').first().click(); await page.locator('.banner:not(.banner-warn)').waitFor({ timeout: 15000 }); await settle(page); },
  'dash-offline': async (page, ctx) => { await ctx.setOffline(true); await page.evaluate(() => window.dispatchEvent(new Event('offline'))); await page.locator('.banner-warn').nth(1).waitFor(); await settle(page); },
};

const ISOLATED_SCREENS = {
  'login': async page => { await page.goto(base); await page.locator('#orbit-passkey-input').waitFor(); await page.locator('.btn-demo').waitFor(); await settle(page); },
  'login-error': async page => {
    await page.goto(base); await page.locator('#orbit-passkey-input').fill('wrong-passkey-for-audit');
    await page.locator('.login .btn-primary').click(); await page.locator('.login .error').waitFor(); await settle(page);
  },
  'login-server-down': async page => {
    await page.route('**/api/demo/enter', r => r.abort());
    await page.goto(base); await page.locator('.btn-demo').click(); await page.locator('.login .error').waitFor(); await settle(page);
  },
  // The deploy page (public/updating.html): the health probe is held at 503 so the page stays instead of returning to the app.
  'updating-page': async page => {
    await page.route('**/api/version', r => r.fulfill({ status: 503, body: 'updating' }));
    await page.goto(base + '/updating.html'); await page.locator('#retry').waitFor(); await settle(page);
  },
  // The privacy policy (public/privacy-policy.html, unlinked).
  'privacy-page': async page => { await page.goto(base + '/privacy-policy.html'); await page.locator('h1').waitFor(); await settle(page); },
  // Empty fleet / first load: /api/state answers with no programs (stubbed; the real loading state renders the same).
  'dash-empty': async page => {
    await page.route('**/api/state', r => r.fulfill({ json: DEMO_STATE_EMPTY }));
    await enterDemo(page).catch(() => {}); await page.locator('main h1').waitFor(); await settle(page);
  },
  // Operator dashboard (no demo): session and state are stubbed from a demo snapshot, so the weekly-report button and the
  // operator bar show without credentials. Every write route is answered locally; nothing reaches a real service.
  'dash-operator': async page => {
    const res = await fetch(base + '/api/demo/enter', { method: 'POST', headers: { 'x-forwarded-for': clientIp() } }); const { sessionId } = await res.json();
    const state = await (await fetch(base + '/api/state', { headers: { 'x-orbit-demo': sessionId } })).json();
    state.demo = false;
    await page.route('**/api/**', route => {
      const u = new URL(route.request().url()).pathname;
      if (u === '/api/auth/session') return route.fulfill({ json: { authenticated: true } });
      if (u === '/api/state') return route.fulfill({ json: state });
      if (u === '/api/demo/config') return route.fulfill({ json: { enabled: false } });
      if (u.startsWith('/api/logos')) return route.fulfill({ json: { logos: {}, remaining: 0 } });
      if (u === '/api/github/sync') return route.fulfill({ json: { platforms: state.platforms, syncedResults: [] } });
      return route.fulfill({ json: { ok: true, remaining: 0 } });
    });
    await page.goto(base); await page.locator('.rs').first().waitFor({ timeout: 20000 }); await settle(page);
  },
};

const screenNames = [...Object.keys(ISOLATED_SCREENS).filter(n => n.startsWith('login')), ...Object.keys(DASH_SCREENS), 'dash-empty', 'dash-operator', 'updating-page', 'privacy-page']
  .filter(n => !only || only.has(n));

// A fresh browser per pose: one long WebKit session on a busy machine can die mid-run and take the whole matrix with it.
let browser = await webkit.launch();
const report = { base, when: new Date().toISOString(), engine: 'webkit ' + browser.version(), spineZone: SPINE, poses: [], live: null, stress: [] };

for (const [pose, w, h, kind] of POSES) {
  const size = `${w}x${h}`;
  if (shotsOnly && !SHOT_SIZES.has(size)) continue;
  if (process.env.DUO_SIZES && !process.env.DUO_SIZES.split(',').includes(size)) continue;
  const book = kind === 'book';
  if (!browser.isConnected()) browser = await webkit.launch();
  const laptop = h <= 420 && w >= 560;
  // Dashboard screens share one demo session per size.
  const dash = await newPage(browser, w, h);
  let dashReady = false;
  for (const name of screenNames) {
    let target, isolated = false;
    if (ISOLATED_SCREENS[name]) { target = await newPage(browser, w, h); isolated = true; }
    else {
      if (!dashReady) { await enterDemo(dash.page); dashReady = true; }
      target = dash;
    }
    const { page, context } = target;
    let result;
    try {
      if (isolated) await ISOLATED_SCREENS[name](page);
      else { await resetDash(page); await DASH_SCREENS[name](page, context); }
      result = await measure(page, { book, laptop });
      if (SHOT_SIZES.has(size)) await page.screenshot({ path: path.join(outDir, 'shots', `${size}-${name}.png`), fullPage: false });
    } catch (error) {
      result = { error: String(error.message || error).split('\n')[0] };
    }
    if (name === 'dash-offline') await context.setOffline(false).catch(() => {});
    report.poses.push({ pose, size, screen: name, errors: [...page.errors], ...result });
    if (isolated) await context.close().catch(() => {});
  }
  await dash.context.close().catch(() => {});
  await browser.close().catch(() => {});
  browser = await webkit.launch();
  console.log('done', pose, size);
}

// ── I: live resize sequence on one page instance, no reload ──
if (!shotsOnly) {
  const seq = [[951, 585], [669, 867], [470, 700], [382, 580], [594, 368], [951, 350], [951, 585]];
  const { page, context } = await newPage(browser, 951, 585);
  await enterDemo(page);
  await pickProblem(page);
  const picked = await page.locator('.detail strong').innerText();
  await page.locator('.btn-add').first().click();
  await page.locator('form.add input[type=text]').fill('نص يبقى بعد الطي');
  await page.locator('form.add input[type=url]').fill('https://example.org/keep');
  await page.locator('form.add input[type=url]').evaluate(el => el.setSelectionRange(8, 15));
  await page.evaluate(() => window.scrollTo(0, 120));
  const steps = [];
  for (const [w, h] of seq) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(300);
    steps.push(await page.evaluate(([w, h]) => {
      const url = document.querySelector('form.add input[type=url]');
      return {
        size: `${w}x${h}`,
        typedName: document.querySelector('form.add input[type=text]')?.value,
        typedLink: url?.value,
        selection: url ? [url.selectionStart, url.selectionEnd] : null,
        detail: document.querySelector('.detail strong')?.textContent,
        addOpen: Boolean(document.querySelector('form.add')),
        scrollY: Math.round(window.scrollY),
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    }, [w, h]));
  }
  const ok = steps.every(s => s.typedName === 'نص يبقى بعد الطي' && s.typedLink === 'https://example.org/keep' && s.detail === picked && s.addOpen && s.overflowX <= 0 && s.selection?.[0] === 8 && s.selection?.[1] === 15);
  report.live = { picked, steps, pass: ok, errors: page.errors };
  await page.screenshot({ path: path.join(outDir, 'shots', 'I-live-end-951x585.png') });
  await context.close();
  console.log('live', ok ? 'PASS' : 'FAIL');
}

// ── J: accessibility stress ──
if (!shotsOnly) {
  const cases = [
    { name: 'text-200', sizes: [[382, 580], [669, 867], [951, 585], [951, 350]], css: 'html{font-size:200%!important}body{font-size:32px!important}' },
    { name: 'dark', sizes: [[382, 580], [669, 867], [951, 585], [951, 350]], colorScheme: 'dark' },
    { name: 'safe-area-left-44', sizes: [[669, 867], [951, 585], [951, 350]], css: ':root{--gut-l:44px!important;--gut-r:20px!important}' },
    { name: 'safe-area-right-44', sizes: [[669, 867], [951, 585], [951, 350]], css: ':root{--gut-r:44px!important;--gut-l:20px!important}' },
  ];
  for (const c of cases) {
    for (const [w, h] of c.sizes) {
      for (const screen of ['login', 'dash-home', 'dash-detail', 'dash-add']) {
        if (!browser.isConnected()) browser = await webkit.launch();
        const { page, context } = await newPage(browser, w, h, c);
        try {
          if (screen === 'login') await ISOLATED_SCREENS.login(page);
          else { await enterDemo(page); await DASH_SCREENS[screen](page, context); }
          if (c.css) { await page.addStyleTag({ content: c.css }); await settle(page); }
          const m = await measure(page, { book: (w === 669 && h === 867) || (w === 951 && h === 585), laptop: h <= 420 });
          report.stress.push({ case: c.name, size: `${w}x${h}`, screen, ...m, errors: page.errors });
          if (screen !== 'login' && (w === 669 || (w === 951 && h === 585))) await page.screenshot({ path: path.join(outDir, 'shots', `J-${c.name}-${w}x${h}-${screen}.png`) });
        } catch (error) { report.stress.push({ case: c.name, size: `${w}x${h}`, screen, error: String(error.message).split('\n')[0] }); }
        await context.close();
      }
    }
  }
  // Keyboard open: the add form's field focused while the window shrinks to ~350px tall.
  for (const [w, h] of [[669, 867], [951, 585], [382, 580]]) {
    if (!browser.isConnected()) browser = await webkit.launch();
    const { page, context } = await newPage(browser, w, h);
    await enterDemo(page); await DASH_SCREENS['dash-add'](page);
    await page.locator('form.add input[type=text]').focus();
    await page.setViewportSize({ width: w, height: 350 }); await settle(page);
    // A real browser scrolls the focused field above the keyboard; WebKit's resize does not, so do what Safari does.
    await page.locator('form.add input[type=text]').evaluate(el => el.scrollIntoView({ block: 'nearest' })); await settle(page);
    const m = await page.evaluate(() => { const el = document.activeElement; const r = el.getBoundingClientRect(); const bar = document.querySelector('.bar').getBoundingClientRect();
      return { focusedKept: el.matches('form.add input[type=text]'), value: el.value, inView: r.top >= 0 && r.bottom <= innerHeight, coveredByBar: r.bottom > bar.top && r.top < bar.bottom, overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
    report.stress.push({ case: 'keyboard-350', size: `${w}x350 (from ${w}x${h})`, screen: 'dash-add', ...m });
    await page.screenshot({ path: path.join(outDir, 'shots', `J-keyboard-${w}x350.png`) });
    await context.close();
  }
}

await browser.close();

// Summary
const rows = report.poses;
const summary = {
  measurements: rows.length,
  errors: rows.filter(r => r.error).map(r => `${r.size} ${r.screen}: ${r.error}`),
  overflowX: rows.filter(r => r.overflowX > 0).map(r => `${r.size} ${r.screen}: ${r.overflowX}px`),
  clipped: rows.filter(r => r.clipped?.length).map(r => `${r.size} ${r.screen}: ${r.clipped.map(c => c.label + ' (' + c.why + ')').join('; ')}`),
  smallTargets: [...new Set(rows.flatMap(r => (r.small || []).map(s => `${s.label} ${s.w}x${s.h}`)))],
  spine: rows.filter(r => r.spine?.length).map(r => `${r.size} ${r.screen}: ${r.spine.map(s => s.label).join('; ')}`),
  bookNotApplied: rows.filter(r => POSES.find(p => `${p[1]}x${p[2]}` === r.size)?.[3] === 'book' && r.book === false && !r.error).map(r => `${r.size} ${r.screen}`),
  barCovers: rows.filter(r => r.barCovers > 0).map(r => `${r.size} ${r.screen}: ${r.barCovers}px`),
  notOnFirstScreen: rows.filter(r => r.firstScreen && Object.values(r.firstScreen).includes(false) && /^(A|B|E)$/.test(r.pose)).map(r => `${r.size} ${r.screen}: ${JSON.stringify(r.firstScreen)}`),
  pageErrors: [...new Set(rows.flatMap(r => r.errors || []))],
  live: report.live?.pass,
  stress: report.stress.filter(s => s.error || s.overflowX > 0 || s.spine?.length || s.clipped?.length || s.focusedKept === false || s.inView === false).map(s => `${s.case} ${s.size} ${s.screen}: ${s.error || JSON.stringify({ overflowX: s.overflowX, spine: s.spine?.map(x => x.label), clipped: s.clipped?.map(x => x.label), inView: s.inView })}`),
};
report.summary = summary;
await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(summary, null, 1));
