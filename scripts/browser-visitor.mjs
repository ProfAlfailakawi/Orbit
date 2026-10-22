// Daily real-browser visitor: opens each program's site like a person would and reports what went wrong.
// Env: ORBIT_URL (service url), ORBIT_TOKEN (Google identity token for the scheduler identity). Never prints the token.
import { chromium } from 'playwright';

const base = (process.env.ORBIT_URL || '').replace(/\/+$/, '');
const token = process.env.ORBIT_TOKEN || '';
if (!base || !token) { console.error('ORBIT_URL and ORBIT_TOKEN are required'); process.exit(2); }

const call = async (path, body) => {
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  if (!response.ok) throw new Error(`${path} -> HTTP ${response.status}`);
  return response.json();
};

const short = text => String(text).replace(/\s+/g, ' ').slice(0, 120);
const noQuery = url => { try { const u = new URL(url); return u.origin + u.pathname; } catch { return 'عنوان غير معروف'; } };

async function visit(browser, target) {
  const problems = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ar' });
  const page = await context.newPage();
  const origin = new URL(target.url).origin;
  page.on('pageerror', e => problems.push(`خطأ برمجي في الصفحة: ${short(e.message)}`));
  page.on('requestfailed', r => { if (r.url().startsWith(origin) && !/aborted|ERR_ABORTED/i.test(r.failure()?.errorText || '')) problems.push(`فشل تحميل ${noQuery(r.url())}`); });
  page.on('response', r => { if (r.url().startsWith(origin) && r.status() >= 400 && r.request().resourceType() !== 'fetch' && r.request().resourceType() !== 'xhr') problems.push(`ملف ${noQuery(r.url())} أعاد HTTP ${r.status()}`); });
  try {
    const response = await page.goto(target.url, { waitUntil: 'load', timeout: 30_000 });
    if (!response || response.status() >= 400) problems.push(`الصفحة الرئيسية أعادت HTTP ${response ? response.status() : 'بلا رد'}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    const shown = await page.evaluate(() => {
      const body = document.body;
      const text = (body?.innerText || '').trim().length;
      const visible = body ? Array.from(body.querySelectorAll('*')).some(el => { const r = el.getBoundingClientRect(); return r.width > 40 && r.height > 20 && getComputedStyle(el).visibility !== 'hidden'; }) : false;
      return { text, visible };
    });
    if (!shown.visible || shown.text < 3) problems.push('الصفحة تظهر فارغة بعد التحميل');
  } catch (e) {
    problems.push(`تعذر فتح الموقع: ${short(e.message)}`);
  } finally { await context.close(); }
  const unique = [...new Set(problems)].slice(0, 6);
  return { id: target.id, url: target.url, ok: unique.length === 0, problems: unique };
}

const { targets } = await call('/internal/scheduler/visit-targets');
console.log(`targets: ${targets.length}`);
const browser = await chromium.launch();
const reports = [];
try { for (const t of targets) reports.push(await visit(browser, t)); } finally { await browser.close(); }
const result = await call('/internal/scheduler/visit-results', { reports });
console.log(JSON.stringify({ accepted: result.accepted, problems: result.problems, failing: reports.filter(r => !r.ok).map(r => r.id) }));
