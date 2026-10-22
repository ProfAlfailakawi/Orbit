// The smart visitor: a model plays a curious Kuwaiti user on a program's own site (optionally signed in with a dedicated test
// account) while code enforces the rules (src/core/aiExplorer.ts). What it reports:
//   problems = facts the browser itself witnessed (an error thrown, a request that failed, an error page) — said with the move that preceded them;
//   warnings = what the model noticed ("[زائر ذكي] ..."), which it may get wrong, so never a failure on its own.
import { SAMPLE, buildAgentPrompt, parseAgentReply, validateAction } from '../src/core/aiExplorer.ts';

const short = text => String(text).replace(/\s+/g, ' ').slice(0, 110);
const TAG = '[زائر ذكي] ';

const collectElements = () => {
  document.querySelectorAll('[data-orbit-i]').forEach(e => e.removeAttribute('data-orbit-i'));
  const out = [];
  for (const el of document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link]')) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || getComputedStyle(el).visibility === 'hidden' || r.top > innerHeight * 3) continue;
    const i = out.length;
    el.setAttribute('data-orbit-i', String(i));
    out.push({
      i, tag: el.tagName.toLowerCase(),
      // A <button> with no type is a submit button only inside a form; elsewhere it is just a button.
      type: (el.tagName === 'BUTTON' && !el.getAttribute('type') && !el.form ? 'button' : el.type || '').toLowerCase(),
      label: (el.getAttribute('aria-label') || el.innerText || el.placeholder || el.title || el.name || '').trim().replace(/\s+/g, ' ').slice(0, 50),
      href: el.tagName === 'A' ? el.getAttribute('href') || '' : '',
      field: /^(input|textarea|select)$/i.test(el.tagName), masked: el.type === 'password',
    });
    if (out.length >= 45) break;
  }
  return out;
};
const pageFacts = () => ({ title: document.title || '', text: (document.body?.innerText || '').slice(0, 3000) });

/** Sign in with a dedicated test account: a plain email + password form. Never logs or screenshots the secret. */
export async function signIn(page, creds) {
  const pass = () => page.locator('input[type=password]:visible').first();
  if (!(await pass().count())) {
    const entry = page.getByRole('link', { name: /تسجيل الدخول|دخول|log ?in|sign ?in/i }).or(page.getByRole('button', { name: /تسجيل الدخول|دخول|log ?in|sign ?in/i })).first();
    if (await entry.count()) { await entry.click({ timeout: 5000 }).catch(() => {}); await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {}); }
  }
  if (!(await pass().count())) return false;
  const user = page.locator('input[type=email]:visible, input[autocomplete=username]:visible, input[name*=mail i]:visible, input[name*=user i]:visible, input[type=text]:visible').first();
  if (!(await user.count())) return false;
  await user.fill(creds.email);
  await pass().fill(creds.password);
  const submit = page.locator('button[type=submit]:visible, input[type=submit]:visible').first();
  if (await submit.count()) await submit.click({ timeout: 5000 }).catch(() => {}); else await pass().press('Enter');
  await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  return (await pass().count()) === 0;
}

/**
 * ask(prompt, jpegBuffer) → the model's raw reply. Injected so the mechanics can be tried without a key.
 * Returns { problems, warnings, steps }.
 */
export async function exploreSite(browser, target, { ask, creds, allowWrites = false, maxSteps = 8, budget, deadlineMs = 150_000, device = {} }) {
  const problems = [];
  const warnings = [];
  const history = [];
  const origin = new URL(target.url).origin;
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...device, locale: 'ar', reducedMotion: 'reduce', serviceWorkers: 'block' });
  // The visitor never leaves the program's own site, whatever a link or a redirect says.
  await context.route('**/*', route => {
    const request = route.request();
    if (request.isNavigationRequest() && new URL(request.url()).origin !== origin && request.url().startsWith('http')) return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  let last = 'فتح الصفحة الرئيسية';
  let requests = 0;
  const witnessed = new Set();
  const saw = text => { if (witnessed.size < 6) witnessed.add(`بعد ${last}: ${text}`); };
  page.on('request', () => { requests += 1; });
  page.on('pageerror', e => saw(`خطأ برمجي ${short(e.message)}`));
  page.on('response', r => { if (r.url().startsWith(origin) && r.status() >= 500) saw(`طلب فشل بخطأ خادم (HTTP ${r.status()})`); });
  const started = Date.now();
  let steps = 0;
  try {
    await page.goto(target.url, { waitUntil: 'load', timeout: 30_000 });
    if (creds) {
      last = 'تسجيل الدخول بحساب الاختبار';
      const ok = await signIn(page, creds).catch(() => false);
      if (!ok) problems.push(TAG + 'تعذر تسجيل الدخول بحساب اختبار أوربت (قد تكون كلمة السر تغيّرت أو الدخول معطّلًا)');
    }
    for (let step = 1; step <= maxSteps && Date.now() - started < deadlineMs; step++) {
      if (!budget.take()) { warnings.push(TAG + 'توقف الاستكشاف لبلوغ حد الاستدعاءات'); break; }
      const elements = await page.evaluate(collectElements);
      const facts = await page.evaluate(pageFacts);
      const jpeg = await page.screenshot({ type: 'jpeg', quality: 55 }).catch(() => null);
      const reply = parseAgentReply(await ask(buildAgentPrompt({ url: page.url(), title: facts.title, text: facts.text, elements }, history, step, maxSteps), jpeg));
      if (!reply) { warnings.push(TAG + 'رد النموذج غير مفهوم فتوقف الاستكشاف'); break; }
      for (const f of reply.findings) if (warnings.length < 6 && !warnings.includes(TAG + f)) warnings.push(TAG + f);
      if (reply.action === 'done') break;
      steps = step;
      if (reply.action === 'back') { last = 'الرجوع للصفحة السابقة'; history.push('رجعت للخلف'); await page.goBack({ timeout: 8000 }).catch(() => {}); continue; }
      const verdict = validateAction(reply, elements, { allowWrites });
      if (!verdict.ok) { history.push('رُفض طلبك: ' + verdict.reason); continue; }
      const el = verdict.element;
      const target$ = page.locator(`[data-orbit-i="${el.i}"]`).first();
      const before = { url: page.url(), text: facts.text, requests };
      try {
        if (reply.action === 'type') {
          last = `الكتابة في الحقل «${el.label}»`;
          await target$.fill(SAMPLE[reply.kind || 'text'], { timeout: 5000 });
          history.push(`كتبت في «${el.label}»`);
        } else {
          last = `الضغط على «${el.label}»`;
          await target$.click({ timeout: 5000 });
          await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(600);
          const after = await page.evaluate(pageFacts);
          const changed = page.url() !== before.url || after.text !== before.text || requests !== before.requests;
          history.push(`ضغطت «${el.label}»${changed ? '' : ' (لم يتغير شيء)'}`);
          if (!changed && el.label && el.tag !== 'a' && warnings.length < 6) warnings.push(`${TAG}الضغط على «${el.label}» لم يُحدث أي تغيير ظاهر`);
        }
      } catch (e) { history.push(`تعذر تنفيذ ${last}`); }
    }
  } catch (e) {
    problems.push(`${TAG}تعذر فتح الموقع: ${short(e.message)}`);
  } finally { await context.close(); }
  problems.push(...[...witnessed].map(x => TAG + x));
  return { problems, warnings, steps };
}
