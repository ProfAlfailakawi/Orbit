import test from 'node:test';
import assert from 'node:assert/strict';
import { visitSite, pageAssets, type VisitDeps } from './visitor.ts';

const enc = (s: string) => new TextEncoder().encode(s);
const PAGE = `<!doctype html><html><head><title>App</title><link rel="stylesheet" href="/assets/app.css"><script type="module" src="/assets/app.js"></script><script src="https://cdn.other/x.js"></script></head><body><div id="root"></div>${'x'.repeat(300)}</body></html>`;
const fake = (routes: Record<string, { status?: number; type?: string; body?: string }>): VisitDeps => ({
  wait: async () => {},
  get: async url => {
    const r = routes[url];
    return r ? { status: r.status ?? 200, bytes: enc(r.body ?? ''), contentType: r.type ?? 'text/html', finalUrl: url, ms: 12 } : null;
  },
});
const base = 'https://app.example/';

test('a healthy page with working app files is ok; third-party files are not checked', async () => {
  const result = await visitSite(base, fake({
    [base]: { body: PAGE }, 'https://app.example/assets/app.css': { type: 'text/css' }, 'https://app.example/assets/app.js': { type: 'text/javascript' },
  }));
  assert.equal(result.ok, true); assert.equal(result.reachable, true); assert.match(result.evidence, /2 ملفات تطبيق سليمة/);
});

test('an app file that 404s is a problem, named in plain Arabic', async () => {
  const result = await visitSite(base, fake({ [base]: { body: PAGE }, 'https://app.example/assets/app.css': { type: 'text/css' }, 'https://app.example/assets/app.js': { status: 404, type: 'text/html' } }));
  assert.equal(result.ok, false); assert.equal(result.reachable, true);
  assert.deepEqual(result.problems, ['ملف التطبيق app.js لا يُحمَّل (HTTP 404)']);
});

test('a broken deploy that answers every file with the page itself is caught', async () => {
  const result = await visitSite(base, fake({ [base]: { body: PAGE }, 'https://app.example/assets/app.css': { type: 'text/html' }, 'https://app.example/assets/app.js': { type: 'text/html' } }));
  assert.equal(result.ok, false);
  assert.match(result.problems.join(' '), /يعيد صفحة بدل الملف/);
});

test('unreachable, server error and not found are reported as such', async () => {
  assert.deepEqual((await visitSite(base, fake({}))).problems, ['الموقع لا يستجيب']);
  const err = await visitSite(base, fake({ [base]: { status: 503 } }));
  assert.equal(err.reachable, false); assert.match(err.problems[0], /خطأ في الخادم \(HTTP 503\)/);
  assert.equal((await visitSite(base, fake({ [base]: { status: 404 } }))).problems[0], 'الصفحة الرئيسية غير موجودة (404)');
});

test('a login-protected page that answers 401/403 is reachable, not a failure', async () => {
  const result = await visitSite(base, fake({ [base]: { status: 401, body: 'Unauthorized' } }));
  assert.equal(result.reachable, true); assert.equal(result.ok, true);
});

test('an error page or an empty shell served with 200 is a problem', async () => {
  assert.match((await visitSite(base, fake({ [base]: { body: '<html><body><h1>Application Error</h1></body></html>' } }))).problems[0], /رسالة خطأ/);
  assert.match((await visitSite(base, fake({ [base]: { body: '<html></html>' } }))).problems[0], /فارغة/);
  assert.match((await visitSite(base, fake({ [base]: { type: 'application/json', body: '{"a":1}'.padEnd(400, ' ') } }))).problems[0], /لا تعيد صفحة ويب/);
});

test('assets: same-origin scripts, styles and modulepreloads only, de-duplicated and capped', () => {
  const html = '<link rel="modulepreload" href="/a.js"><script src="/a.js"></script><link rel="stylesheet" href="b.css"><script src="//evil.example/x.js"></script><link rel="icon" href="/f.ico">';
  assert.deepEqual(pageAssets(html, 'https://app.example/x/').map(a => a.url), ['https://app.example/a.js', 'https://app.example/x/b.css']);
  assert.equal(pageAssets(Array.from({ length: 12 }, (_, i) => `<script src="/s${i}.js"></script>`).join(''), base).length, 6);
});

/** A fake whose answers for one URL come from a list, one per attempt (null = no answer). */
const flaky = (routes: Record<string, Array<{ status?: number; type?: string; body?: string } | null>>) => {
  const calls: Record<string, number> = {};
  const deps: VisitDeps = {
    wait: async () => {},
    get: async url => {
      const list = routes[url]; if (!list) return null;
      const r = list[Math.min(calls[url] = (calls[url] ?? -1) + 1, list.length - 1)];
      return r ? { status: r.status ?? 200, bytes: enc(r.body ?? ''), contentType: r.type ?? 'text/html', finalUrl: url, ms: 12 } : null;
    },
  };
  return { deps, calls };
};

test('a single dropped request for an app file is not a problem, a file that fails twice is', async () => {
  const ok = { [base]: [{ body: PAGE }], [base + 'assets/app.css']: [{ type: 'text/css' }], [base + 'assets/app.js']: [null, { type: 'text/javascript' }] };
  assert.equal((await visitSite(base, flaky(ok).deps)).ok, true);
  const bad = { ...ok, [base + 'assets/app.js']: [null, null] };
  const result = await visitSite(base, flaky(bad).deps);
  assert.match(result.problems[0], /app\.js.*لا يُحمَّل/);
});

test('a 5xx is asked again, a 404 is an answer and is not', async () => {
  const flap = flaky({ [base]: [{ status: 503 }, { body: PAGE }], [base + 'assets/app.css']: [{ type: 'text/css' }], [base + 'assets/app.js']: [{ type: 'text/javascript' }] });
  assert.equal((await visitSite(base, flap.deps)).ok, true);
  const gone = flaky({ [base]: [{ body: PAGE }], [base + 'assets/app.css']: [{ type: 'text/css' }], [base + 'assets/app.js']: [{ status: 404 }, { type: 'text/javascript' }] });
  const r = await visitSite(base, gone.deps);
  assert.match(r.problems[0], /404/);
  assert.equal(gone.calls[base + 'assets/app.js'], 0, 'a 404 is asked once (the counter holds the last attempt index)');
});

test('retries are capped per visit so a really broken site is judged quickly', async () => {
  const { deps, calls } = flaky({ [base]: [{ body: PAGE }], [base + 'assets/app.css']: [null], [base + 'assets/app.js']: [null] });
  const r = await visitSite(base, deps);
  assert.equal(r.problems.length, 2);
  const attempts = Object.values(calls).reduce((a, n) => a + n + 1, 0);
  assert.ok(attempts <= 1 + 2 + 2 + 2, `home once, two assets, plus at most two retries (was ${attempts})`);
});

test('a visit that had to repeat a request says so, so its time is not mistaken for the site\'s speed', async () => {
  const ok = { [base]: [{ body: PAGE }], [base + 'assets/app.css']: [{ type: 'text/css' }], [base + 'assets/app.js']: [null, { type: 'text/javascript' }] };
  const retried = await visitSite(base, flaky(ok).deps);
  assert.equal(retried.ok, true);
  assert.equal(retried.retried, true);
  const clean = await visitSite(base, flaky({ ...ok, [base + 'assets/app.js']: [{ type: 'text/javascript' }] }).deps);
  assert.equal(clean.retried, false);
});
