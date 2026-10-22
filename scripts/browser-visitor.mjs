// Daily real-browser visitor: opens each program's site like a person would — on a desktop, on a phone, and on a phone with a
// weak connection — follows a few of its own pages, and reports what went wrong. Judgement lives in src/core/pageAudit.ts.
// Run with `npx tsx scripts/browser-visitor.mjs` (the audit module is TypeScript).
// Env: ORBIT_URL (service url), ORBIT_TOKEN (Google identity token for the scheduler identity). Never prints the token.
// Local trial without ORBIT: ORBIT_DRY_RUN_URLS="http://localhost:8080,https://example.com" prints the reports instead of posting them.
import { chromium, devices } from 'playwright';
import { auditHeaders, auditSnapshot, averageHash, crawlTargets, scanForSecrets } from '../src/core/pageAudit.ts';

const dry = (process.env.ORBIT_DRY_RUN_URLS || '').split(',').map(x => x.trim()).filter(Boolean);
const base = (process.env.ORBIT_URL || '').replace(/\/+$/, '');
const token = process.env.ORBIT_TOKEN || '';
if (!dry.length && (!base || !token)) { console.error('ORBIT_URL and ORBIT_TOKEN are required'); process.exit(2); }

const call = async (path, body) => {
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  if (!response.ok) throw new Error(`${path} -> HTTP ${response.status}`);
  return response.json();
};

const SITE_BUDGET_MS = 240_000;
const RUN_BUDGET_MS = 17 * 60_000;
const CRAWL_PAGES = 4;
const PROFILES = [
  { device: 'desktop', tag: '', options: { viewport: { width: 1280, height: 800 } }, slow: false },
  { device: 'phone', tag: '[جوال] ', options: { ...devices['iPhone 13'] }, slow: false },
  // About Lighthouse's "Slow 4G": what a visitor on a weak mobile connection actually gets.
  { device: 'phone-slow', tag: '[جوال بطيء] ', options: { ...devices['Pixel 5'] }, slow: true },
];

const short = text => String(text).replace(/\s+/g, ' ').slice(0, 120);
const noQuery = url => { try { const u = new URL(url); return u.origin + u.pathname; } catch { return 'عنوان غير معروف'; } };

/** Facts about the page as it stands now, collected inside the browser. Judged later by auditSnapshot. */
const collect = () => {
  const shown = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const nameOf = el => {
    const direct = el.getAttribute('aria-label') || el.getAttribute('title') || (el.innerText || '').trim() || el.querySelector('img[alt]')?.getAttribute('alt');
    if (direct) return direct;
    const by = el.getAttribute('aria-labelledby');
    if (by && by.split(/\s+/).some(id => (document.getElementById(id)?.innerText || '').trim())) return 'x';
    if (el.labels && el.labels.length) return 'x';
    return /^(submit|button|reset)$/.test(el.type || '') ? el.value : '';
  };
  const controls = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button]')].filter(shown);
  const targets = [...document.querySelectorAll('button, input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, [role=button]')].filter(shown);
  const images = [...document.images].filter(i => i.src && !i.src.startsWith('data:'));
  return {
    lang: document.documentElement.lang || '',
    direction: getComputedStyle(document.body).direction,
    text: (document.body?.innerText || '').slice(0, 20000),
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
    images: images.length,
    brokenImages: images.filter(i => i.complete && i.naturalWidth === 0 && i.loading !== 'lazy').length,
    unnamedControls: controls.filter(el => !nameOf(el)).length,
    smallTargets: targets.filter(el => { const r = el.getBoundingClientRect(); return r.width < 24 || r.height < 24; }).length,
    links: [...document.querySelectorAll('a[href]')].map(a => a.href).slice(0, 80),
    blank: !document.body || !Array.from(document.body.querySelectorAll('*')).some(el => { const r = el.getBoundingClientRect(); return r.width > 40 && r.height > 20; }) || (document.body.innerText || '').trim().length < 3,
  };
};

async function lookHash(browser, jpeg) {
  const page = await browser.newPage();
  try {
    const gray = await page.evaluate(async b64 => {
      const img = new Image(); img.src = 'data:image/jpeg;base64,' + b64; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = 8; canvas.height = 8;
      const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, 8, 8);
      const d = ctx.getImageData(0, 0, 8, 8).data; const out = [];
      for (let i = 0; i < 64; i++) out.push(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]);
      return out;
    }, jpeg.toString('base64'));
    return averageHash(gray);
  } catch { return undefined; } finally { await page.close(); }
}

async function openPage(browser, profile, url, { first, hashOf }) {
  const problems = [];
  const warnings = [];
  const context = await browser.newContext({ ...profile.options, locale: 'ar', reducedMotion: 'reduce', serviceWorkers: 'block' });
  const page = await context.newPage();
  const origin = new URL(url).origin;
  const consoleErrors = [];
  const secretScans = [];
  let hash;
  page.on('pageerror', e => problems.push(`${profile.tag}خطأ برمجي في الصفحة: ${short(e.message)}`));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|chrome-extension|favicon/i.test(m.text())) consoleErrors.push(short(m.text())); });
  page.on('requestfailed', r => { if (r.url().startsWith(origin) && !/aborted|ERR_ABORTED/i.test(r.failure()?.errorText || '')) problems.push(`${profile.tag}فشل تحميل ${noQuery(r.url())}`); });
  page.on('response', r => {
    const type = r.request().resourceType();
    if (r.url().startsWith(origin) && r.status() >= 400 && type !== 'fetch' && type !== 'xhr') problems.push(`${profile.tag}ملف ${noQuery(r.url())} أعاد HTTP ${r.status()}`);
    if (first && r.url().startsWith(origin) && (type === 'script' || type === 'document') && r.status() < 400) {
      secretScans.push(r.text().then(body => { if (body.length < 3_000_000) problems.push(...scanForSecrets(body, noQuery(r.url()).split('/').pop() || 'الصفحة')); }).catch(() => {}));
    }
  });
  let snapshot = null; let headers = {};
  const started = Date.now();
  try {
    if (profile.slow) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: Math.round(1.6 * 1024 * 1024 / 8), uploadThroughput: Math.round(750 * 1024 / 8) });
    }
    const response = await page.goto(url, { waitUntil: 'load', timeout: profile.slow ? 60_000 : 30_000 });
    const loadMs = Date.now() - started;
    if (!response || response.status() >= 400) problems.push(`${profile.tag}الصفحة أعادت HTTP ${response ? response.status() : 'بلا رد'}`);
    headers = response ? response.headers() : {};
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    const facts = await page.evaluate(collect);
    if (facts.blank) problems.push(`${profile.tag}الصفحة تظهر فارغة بعد التحميل`);
    snapshot = { ...facts, consoleErrors: [...new Set(consoleErrors)].slice(0, 3), loadMs };
    if (first && profile.device === 'desktop') {
      const jpeg = await page.screenshot({ type: 'jpeg', quality: 60 }).catch(() => null);
      if (jpeg && !facts.blank) hash = await lookHash(browser, jpeg);
    }
  } catch (e) {
    problems.push(profile.slow ? `${profile.tag}تعذر فتح الموقع على اتصال ضعيف: ${short(e.message)}` : `${profile.tag}تعذر فتح الموقع: ${short(e.message)}`);
  } finally {
    await Promise.allSettled(secretScans);
    await context.close();
  }
  if (snapshot) {
    const audit = auditSnapshot(snapshot, profile.device);
    problems.push(...audit.problems); warnings.push(...audit.warnings);
    if (first && profile.device === 'desktop') warnings.push(...auditHeaders(headers));
  }
  return { problems, warnings, links: snapshot?.links || [], hash };
}

async function visit(browser, target, runStarted) {
  const siteStarted = Date.now();
  const problems = []; const warnings = []; let hash; let links = [];
  for (const profile of PROFILES) {
    if (Date.now() - siteStarted > SITE_BUDGET_MS || Date.now() - runStarted > RUN_BUDGET_MS) { warnings.push('انتهى وقت الفحص قبل إكمال كل الأجهزة'); break; }
    const first = profile.device === 'desktop';
    const result = await openPage(browser, profile, target.url, { first });
    problems.push(...result.problems); warnings.push(...result.warnings);
    if (first) { hash = result.hash; links = result.links; }
  }
  // Follow a few of the site's own pages (desktop only): a broken inner page is invisible from the home page alone.
  for (const page of crawlTargets(links, target.url, CRAWL_PAGES)) {
    if (Date.now() - siteStarted > SITE_BUDGET_MS || Date.now() - runStarted > RUN_BUDGET_MS) break;
    const label = `صفحة ${new URL(page).pathname}: `;
    const result = await openPage(browser, PROFILES[0], page, { first: false });
    problems.push(...result.problems.map(x => label + x)); warnings.push(...result.warnings.map(x => label + x));
  }
  // The same finding on every device is one finding: keep the first (desktop) wording, and keep phone-only ones tagged.
  const unique = list => { const seen = new Set(); return list.filter(x => { const key = x.replace(/^(صفحة [^:]*: )?\[(?:جوال|جوال بطيء)\] /, '$1'); return seen.has(key) ? false : (seen.add(key), true); }); };
  const finalProblems = unique(problems).slice(0, 10);
  return { id: target.id, url: target.url, ok: finalProblems.length === 0, problems: finalProblems, warnings: unique(warnings).slice(0, 8), hash };
}

const runStarted = Date.now();
const targets = dry.length ? dry.map((url, i) => ({ id: 'dry-' + i, url })) : (await call('/internal/scheduler/visit-targets')).targets;
console.log(`targets: ${targets.length}`);
const browser = await chromium.launch(process.env.ORBIT_CHROMIUM_PATH ? { executablePath: process.env.ORBIT_CHROMIUM_PATH } : {});
const reports = [];
try { for (const t of targets) reports.push(await visit(browser, t, runStarted)); } finally { await browser.close(); }
if (dry.length) { console.log(JSON.stringify(reports, null, 2)); process.exit(0); }
const result = await call('/internal/scheduler/visit-results', { reports });
console.log(JSON.stringify({ accepted: result.accepted, problems: result.problems, failing: reports.filter(r => !r.ok).map(r => r.id), withWarnings: reports.filter(r => r.warnings.length).map(r => r.id) }));
