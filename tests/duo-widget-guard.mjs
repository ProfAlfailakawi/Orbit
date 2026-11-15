#!/usr/bin/env node
// iPhone Duo widget-corner guard (WebKit). Fails if anything important (visible text, a, button, input, select, textarea, [role=tab|button],
// img, svg) overlaps the reserved zone: x >= vw - widget-w and y <= widget-h (PHYSICAL top-right). Backgrounds (an element with no text and no
// interaction, or one marked data-duo-bleed) are exempt and every exemption is logged.
//   npm run test:duo-widget        (starts its own local server on a free port; no real data: demo sandbox only)
// Env: PW_MODULE (path to a playwright index.mjs, default "playwright"), PLAYWRIGHT_BROWSERS_PATH, ORBIT_BASE_URL (use a running server),
//      DUO_GUARD_ENGINE=chromium to fall back (then the report says Chromium, never WebKit).
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs/promises';

const pw = await import(process.env.PW_MODULE || 'playwright');
const engineName = process.env.DUO_GUARD_ENGINE === 'chromium' ? 'chromium' : 'webkit';
const engine = pw[engineName];

const freePort = () => new Promise(res => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
let server = null;
let base = process.env.ORBIT_BASE_URL;
if (!base) {
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  for (let i = 0; i < 90; i++) { try { if ((await fetch(base)).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 1000)); }
}
base = base.replace(/\/$/, '');

// Known Duo sizes (CSS px). Each runs portrait and landscape (w/h swapped), light and dark; plus 200 % text at the first screens.
const SIZES = [[382, 580], [470, 780], [594, 368], [669, 867], [951, 585], [457, 678], [457, 760]];
// The installed app (Capacitor WKWebView) has no browser toolbars, so its viewport is TALLER: these full-height sizes run in the APP context only.
const TALL = [[382, 780], [382, 844], [470, 900], [669, 1000], [951, 700], [720, 900], [951, 669], [951, 800], [1000, 960]];
// EMULATED app context in desktop WebKit (WKWebView UA without "Safari/", window.Capacitor native ios, navigator.standalone undefined). Not a real device.
const APP_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
// Sizes where the zone MUST be active (the Duo's own geometry); the swapped ones are checked only if the page itself activates the zone.
const MUST_ACTIVE = new Set(['382x580', '470x780', '669x867', '594x368', '951x585', '368x594', '585x951', '867x669', '457x678', '457x760', '678x457', '760x457', '580x382', '780x470', '720x900', '951x669', '951x800', '1000x960', '382x780', '382x844', '470x900', '669x1000', '951x700']);
let n = 0;
const ip = () => `10.99.${Math.floor(++n / 250)}.${n % 250 + 1}`;

const violations = [];
const exemptions = new Map();
const inactive = [];
let cases = 0, checks = 0;

async function scan(page, label, mustBeActive, control = false) {
  const r = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const px = n => parseFloat(cs.getPropertyValue(n)) || 0;
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const zw = px('--duo-widget-w'), zh = (() => { const p = document.createElement('div'); p.style.cssText = `position:fixed;visibility:hidden;height:${cs.getPropertyValue('--duo-widget-h') || '0px'}`; document.body.appendChild(p); const h = p.getBoundingClientRect().height; p.remove(); return h; })();
    if (!zw) return { active: false, zw, zh, vw, vh, hits: [], bleed: [] };
    const zoneLeft = vw - zw;
    const hits = [], bleed = [];
    const INTERACTIVE = 'a,button,input,select,textarea,[role=tab],[role=button],img,svg';
    const shown = el => { const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0.01; };
    const describe = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '');
    const hit = r => r.width > 0 && r.height > 0 && r.right > zoneLeft + 0.5 && r.left < vw && r.top < zh - 0.5 && r.bottom > 0;
    const inside = el => { for (let e = el; e; e = e.parentElement) if (!shown(e)) return false; return true; };
    for (const el of document.body.querySelectorAll('*')) {
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'PATH', 'CIRCLE', 'G', 'DEFS', 'LINE', 'POLYLINE', 'RECT', 'ELLIPSE', 'USE', 'STOP', 'CLIPPATH', 'RADIALGRADIENT', 'LINEARGRADIENT', 'TEXT', 'TSPAN'].includes(el.tagName.toUpperCase())) continue;
      if (el.closest('[data-duo-debug]')) continue;
      if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue; // the svg box stands for its content
      const clipped = el.closest('[aria-hidden=true]') && getComputedStyle(el).position === 'fixed';
      if (!inside(el)) continue;
      const bleedOwner = el.closest('[data-duo-bleed]');
      const isInteractive = el.matches(INTERACTIVE);
      let ownText = false, textRect = null;
      for (const node of el.childNodes) {
        if (node.nodeType === 3 && node.textContent.trim()) {
          const range = document.createRange(); range.selectNodeContents(node);
          for (const rr of range.getClientRects()) if (hit(rr)) { ownText = true; textRect = rr; }
        }
      }
      const box = el.getBoundingClientRect();
      if (!(isInteractive ? hit(box) : ownText)) continue;
      // An svg or img that is only a decorative backdrop (aria-hidden, no interaction) is a bleed, never content.
      const decorative = isInteractive && (el.closest('[aria-hidden=true]') || el.getAttribute('role') === 'presentation') && !el.closest('a,button');
      const rect = ownText ? textRect : box;
      const rec = { el: describe(el), x: Math.round(rect.left), y: Math.round(rect.top), w: Math.round(rect.width), h: Math.round(rect.height) };
      if (bleedOwner || decorative || clipped) bleed.push({ ...rec, why: bleedOwner ? 'data-duo-bleed' : 'decorative aria-hidden' });
      else hits.push(rec);
    }
    return { active: true, zw, zh, vw, vh, hits, bleed };
  });
  checks += 1;
  if (r.active && !(r.zw > 0 && r.zh > 0)) violations.push({ label, el: '(zone)', note: `zone resolved to ${r.zw}x${r.zh}: the guard would pass vacuously` });
  if (control) return r;
  if (!r.active) {
    inactive.push(label);
    if (mustBeActive) violations.push({ label, el: '(zone)', note: 'the widget zone must be ACTIVE here but --duo-widget-w is 0' });
    return;
  }
  for (const b of r.bleed) { const key = `${b.el} (${b.why})`; exemptions.set(key, (exemptions.get(key) || 0) + 1); }
  for (const h of r.hits) violations.push({ label, ...h, zone: `x>=${r.vw - r.zw} y<=${Math.round(r.zh)}` });
}

async function newPage(browser, w, h, scheme, text200, app) {
  const context = await browser.newContext({ ...(app ? { userAgent: APP_UA, isMobile: true, hasTouch: true } : {}),  extraHTTPHeaders: { 'x-forwarded-for': ip() }, viewport: { width: w, height: h }, deviceScaleFactor: app ? 2 : 1, locale: 'ar-KW', reducedMotion: 'reduce', serviceWorkers: 'block', colorScheme: scheme });
  const page = await context.newPage();
  if (app) await page.addInitScript(() => {
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', platform: 'ios' };
    try { Object.defineProperty(navigator, 'standalone', { get: () => undefined, configurable: true }); } catch { /* already undefined */ }
  });
  if (text200) await page.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = '200%'; }); });
  return { context, page };
}
const settle = page => page.waitForTimeout(300);

let browser = await engine.launch();
const version = browser.version();
try {
  for (const app of [false, true]) {
  for (const [bw, bh] of app ? [...SIZES, ...TALL] : SIZES) {
    for (const [w, h] of (app && TALL.some(t => t[0] === bw && t[1] === bh)) ? [[bw, bh]] : [[bw, bh], [bh, bw]]) {
      for (const scheme of ['light', 'dark']) {
        for (const text200 of [false, true]) {
          if (text200 && scheme === 'dark') continue; // 200 % text is checked in light; dark is covered at 100 %
          const tag = `${app ? 'APP' : 'SAFARI'} ${w}x${h} ${scheme}${text200 ? ' text200' : ''}`;
          const must = MUST_ACTIVE.has(`${w}x${h}`);
          cases += 1;
          for (let attempt = 1; ; attempt++) {
          const before = { v: violations.length, c: checks };
          let context;
          try {
          const made = await newPage(browser, w, h, scheme, text200, app); context = made.context; const page = made.page;
          // Signed out: the sign-in screen.
          await page.goto(base, { waitUntil: 'domcontentloaded' });
          await page.locator('.btn-demo').waitFor({ timeout: 20000 });
          await settle(page); await scan(page, `${tag} login`, must);
          if (w === 382 && h === 580 && scheme === 'light' && !text200 && !app) {
            // Negative control: a known overlap (a visible button inside the zone) MUST be flagged, otherwise the guard is vacuous.
            await page.evaluate(() => { const b = document.createElement('button'); b.textContent = 'x'; b.style.cssText = 'position:fixed;top:10px;right:10px;width:30px;height:30px;z-index:9999'; document.body.appendChild(b); });
            const c = await scan(page, 'negative-control', true, true);
            if (!c.hits.some(x => x.el.startsWith('button'))) violations.push({ label: 'negative-control', el: '(guard)', note: 'a button placed in the zone was NOT flagged' });
            else console.log(`negative control ok: flagged ${c.hits.length} element(s) in a ${Math.round(c.zw)}x${Math.round(c.zh)} zone`);
            await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator('.btn-demo').waitFor({ timeout: 20000 });
          }
          // Signed in (demo sandbox): home, a program card open, the add form open.
          await page.locator('.btn-demo').click();
          await page.locator('.rs').first().waitFor({ timeout: 20000 });
          await settle(page); await scan(page, `${tag} dashboard`, must);
          await page.locator('.rs').first().click(); await settle(page); await scan(page, `${tag} program-open`, must);
          const add = page.locator('.btn-add'); if (await add.count()) { await add.first().click(); await settle(page); await scan(page, `${tag} add-form-open`, must); }
          // Static pages.
          await page.route('**/api/version', r => r.fulfill({ status: 503, body: 'updating' }));
          await page.goto(base + '/updating.html'); await page.locator('#retry').waitFor(); await settle(page); await scan(page, `${tag} updating.html`, must);
          await page.goto(base + '/privacy-policy.html'); await page.locator('h1').waitFor(); await settle(page); await scan(page, `${tag} privacy-policy.html`, must);
          await context.close();
          break;
          } catch (e) {
            // A browser or page that died mid-case (a loaded machine) is relaunched and the case re-run once; a second failure is a real failure.
            violations.length = before.v; checks = before.c;
            if (attempt >= 2) throw e;
            console.log(`retry ${tag}: ${String(e.message).split('\n')[0]}`);
            await browser.close().catch(() => {}); browser = await engine.launch();
          }
          }
          console.log(`ok ${tag}`);
        }
      }
    }
  }
  }
} finally {
  await browser.close();
  server?.kill();
}

const engineLabel = `${engineName === 'webkit' ? 'WebKit' : 'Chromium (NOT WebKit)'} ${version}`;
console.log(`duo-widget guard on ${engineLabel}: ${cases} contexts, ${checks} scans, ${violations.length} violations, ${inactive.length} scans where the zone is inactive by design (non-Duo geometry)`);
if (exemptions.size) { console.log('exempt (backgrounds / decorative):'); for (const [k, c] of exemptions) console.log(`  ${k} x${c}`); }
for (const v of violations) console.log('VIOLATION', JSON.stringify(v));
if (process.env.DUO_GUARD_REPORT) await fs.writeFile(process.env.DUO_GUARD_REPORT, JSON.stringify({ engine: engineLabel, cases, checks, violations, inactive: inactive.length, exemptions: [...exemptions] }, null, 1));
process.exit(violations.length ? 1 : 0);
