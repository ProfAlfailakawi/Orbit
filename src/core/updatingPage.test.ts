import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { HEALTH_PATH, isPlatformUpdating, nextDelay, UPDATING_MESSAGE } from './updatingNotice.ts';

// «أوربت يتلقّى تحديثاً» instead of Google's English 5xx page while Cloud Run swaps servers mid-deploy.
const read = (file: string) => fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const PAGE = read('public/updating.html');
const ORIGIN = 'https://orbitq8.web.app';
const GOOGLE_502 = '<html><title>Error 502 (Server Error)!!1</title><p>Error: Server Error. Please try again in 30 seconds.</p></html>';
const html = (body: string, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
const pathOf = (key: any) => new URL(typeof key === 'string' ? key : key.url, ORIGIN).pathname;
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

type Net = (pathname: string) => Promise<Response>;
/** public/sw.js in a sandbox with an in-memory Cache Storage that records every write. */
function worker(net: Net, options: { online?: boolean } = {}) {
  const handlers: Record<string, (event: any) => void> = {};
  const store = new Map<string, Map<string, Response>>();
  const writes: Array<{ cache: string; key: string; status: number }> = [];
  const open = async (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    const entries = store.get(name)!;
    return {
      put: async (key: any, response: Response) => { writes.push({ cache: name, key: pathOf(key), status: response.status }); entries.set(pathOf(key), response.clone()); },
      match: async (key: any) => entries.get(pathOf(key))?.clone(),
      addAll: async (list: string[]) => {
        for (const item of list) {
          const r = await net(pathOf(item));
          if (!r.ok) throw new TypeError(`addAll: ${item} ${r.status}`);
          writes.push({ cache: name, key: pathOf(item), status: r.status });
          entries.set(pathOf(item), r);
        }
      },
    };
  };
  const caches = {
    open,
    keys: async () => [...store.keys()],
    delete: async (name: string) => store.delete(name),
    match: async (key: any) => { for (const entries of store.values()) { const hit = entries.get(pathOf(key)); if (hit) return hit.clone(); } return undefined; },
  };
  const self: any = {
    addEventListener: (type: string, fn: any) => { handlers[type] = fn; },
    skipWaiting() {}, clients: { claim() {} }, navigator: { onLine: options.online ?? true }, registration: {},
  };
  vm.runInNewContext(read('public/sw.js'), { self, URL, Response, Promise, JSON, caches, fetch: (request: any) => net(pathOf(request)) });
  const lifecycle = async (type: string) => {
    const waits: Promise<unknown>[] = [];
    handlers[type]({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  };
  const request = async (pathname: string, init: { mode?: string; method?: string } = {}) => {
    let answer = null as Promise<Response> | null;
    handlers.fetch({
      request: { url: `${ORIGIN}${pathname}`, mode: init.mode ?? 'navigate', method: init.method ?? 'GET' },
      respondWith: (p: Promise<Response>) => { answer = p; },
    });
    let response = null as Response | null, error: unknown = null;
    try { response = answer ? await answer : null; } catch (e) { error = e; }
    await tick();
    return { answered: answer !== null, response, error };
  };
  return { lifecycle, request, store, writes, open };
}

/** The network mid-deploy: Hosting still serves static files for install, everything else is the platform's error. */
const deploying = (status: number | 'drop'): Net => async pathname => {
  if (pathname === '/updating.html') return html(PAGE);
  if (['/', '/index.html'].includes(pathname)) return html('<p>app shell</p>');
  if (pathname === '/manifest.json' || pathname === '/icon.svg') return new Response('{}', { status: 200 });
  if (status === 'drop') throw new TypeError('Failed to fetch');
  return html(GOOGLE_502, status);
};
const isUpdatingPage = async (response: Response | null) =>
  Boolean(response) && response!.status === 503 && response!.headers.get('cache-control') === 'no-store'
  && /text\/html/.test(response!.headers.get('content-type') || '') && (await response!.clone().text()).includes('أوربت يتلقّى تحديثاً');

test('a navigation answered 500/502/503/504 gets the updating page (503, no-store)', async () => {
  for (const status of [500, 502, 503, 504]) {
    const sw = worker(deploying(status));
    await sw.lifecycle('install');
    assert.ok(await isUpdatingPage((await sw.request('/programs/nahj')).response), `status ${status}`);
  }
});

test('a navigation dropped while online gets the updating page; truly offline keeps the cached shell', async () => {
  // Installed while the network was fine, then every request drops.
  const dropAfterInstall = () => { let installed = false; const net: Net = async p => { if (installed) throw new TypeError('Failed to fetch'); return deploying(502)(p); }; return { net, done: () => { installed = true; } }; };
  const a = dropAfterInstall();
  const online = worker(a.net);
  await online.lifecycle('install'); a.done();
  assert.ok(await isUpdatingPage((await online.request('/')).response));
  assert.ok(await isUpdatingPage((await online.request('/programs/x')).response));
  const b = dropAfterInstall();
  const offline = worker(b.net, { online: false });
  await offline.lifecycle('install'); b.done();
  assert.equal(await (await offline.request('/')).response!.text(), '<p>app shell</p>');
  assert.ok((await offline.request('/programs/x')).error instanceof Error);
});

test('success, redirects, /api, non-GET and non-navigation requests are left alone, and no 5xx is ever cached', async () => {
  const fine = worker(async pathname => pathname === '/updating.html' ? html(PAGE) : html(`<p>${pathname}</p>`));
  await fine.lifecycle('install');
  const ok = await fine.request('/settings');
  assert.equal(ok.response?.status, 200);
  assert.equal(await ok.response!.text(), '<p>/settings</p>');
  const redirect = worker(async () => new Response(null, { status: 302, headers: { Location: '/' } }));
  assert.equal((await redirect.request('/x')).response?.status, 302);

  const sw = worker(deploying(502));
  await sw.lifecycle('install');
  assert.equal((await sw.request('/api/state', { mode: 'cors' })).answered, false);
  assert.equal((await sw.request('/api/version')).answered, false);
  assert.equal((await sw.request('/', { method: 'POST' })).answered, false);
  const font = await sw.request('/fonts/x.woff2', { mode: 'no-cors' });
  assert.equal(font.response?.status, 502);
  assert.deepEqual(sw.writes.filter(w => w.status >= 500), []);
});

test('install precaches the page in the versioned cache; without it the raw answer passes through', async () => {
  const source = read('public/sw.js');
  assert.match(source, /orbit-mission-control-v3/);
  const sw = worker(deploying(502));
  await sw.lifecycle('install');
  assert.ok(sw.store.get('orbit-mission-control-v3')?.has('/updating.html'));
  const empty = worker(deploying(502));
  assert.equal((await empty.request('/x')).response?.status, 502);
  assert.match(source, /addEventListener\('push'/);
  assert.match(source, /addEventListener\('notificationclick'/);
});

test('the page is self-contained, RTL, light/dark, and in Orbit\'s own identity', () => {
  assert.ok(!/https?:\/\//i.test(PAGE) && !/\bsrc=/i.test(PAGE) && !/<link\b/i.test(PAGE) && !/@import/i.test(PAGE));
  assert.ok((PAGE.match(/url\("([^"]+)"\)/g) || []).every(u => /^url\("\/fonts\//.test(u)));
  for (const u of PAGE.match(/\/fonts\/[\w-]+\.woff2/g) || []) assert.ok(fs.existsSync(new URL(`../../public${u}`, import.meta.url)), u);
  assert.match(PAGE, /<html lang="ar" dir="rtl">/);
  assert.match(PAGE, /prefers-color-scheme:dark/);
  assert.match(PAGE, /prefers-reduced-motion/);
  assert.match(PAGE, /<title>تحديثٌ قيد الإطلاق · أوربت<\/title>/);
  for (const text of ['أوربت يتلقّى تحديثاً', 'يعود الاتصال وحده فور اكتمال الإطلاق.', 'أعد الاتصال الآن', 'انقطعت الإشارة من جهتك']) assert.ok(PAGE.includes(text), text);
  // The mark is the one in public/icon.svg.
  for (const color of ['#090D16', '#38BDF8', '#F8FAFC', '#10B981', '#F59E0B']) assert.ok(PAGE.includes(color), color);
});

function runPage(options: { health: boolean[]; recent?: number[]; pathname?: string; online?: boolean }) {
  const script = /<script>([\s\S]*?)<\/script>/.exec(PAGE)?.[1] || '';
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const asked: string[] = [];
  const nodes: Record<string, any> = {};
  const node = (id: string) => (nodes[id] ??= { textContent: '', addEventListener() {} });
  const store: Record<string, string> = options.recent ? { 'orbit-updating-reloads': JSON.stringify(options.recent) } : {};
  const location = { pathname: options.pathname ?? '/programs/x', reloads: 0, replaced: '', reload() { this.reloads++; }, replace(url: string) { this.replaced = url; } };
  let call = 0;
  vm.runInNewContext(script, {
    document: { getElementById: node, addEventListener() {}, hidden: false },
    window: { addEventListener() {} }, navigator: { onLine: options.online ?? true }, location,
    sessionStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } },
    setTimeout: (fn: () => void, ms: number) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {},
    fetch: (url: string, init: any) => { asked.push(`${url}|${init?.cache}`); return Promise.resolve({ ok: options.health[Math.min(call++, options.health.length - 1)] }); },
    AbortController, JSON, Date, Math,
  });
  const step = async () => { const timer = timers.filter(t => t.ms !== 8000).shift()!; timers.splice(timers.indexOf(timer), 1); timer.fn(); await tick(); await tick(); return timer.ms; };
  return { asked, location, nodes, step };
}

test('the page asks /api/version every 3 s, reopens the same URL, and never loops', async () => {
  const page = runPage({ health: [false, false, true] });
  const delays = [await page.step(), await page.step(), await page.step()];
  assert.deepEqual(delays, [3000, 3000, 3000]);
  assert.ok(page.asked.every(a => a === `${HEALTH_PATH}|no-store`));
  assert.equal(page.location.reloads, 1);

  const direct = runPage({ health: [true], pathname: '/updating.html' });
  await direct.step();
  assert.equal(direct.location.replaced, '/');

  const now = Date.now();
  const stuck = runPage({ health: [true], recent: [now - 1000, now - 2000, now - 3000] });
  assert.equal(await stuck.step(), 30000);
  assert.equal(stuck.nodes.lead.textContent, 'الإطلاق أطول من المعتاد هذه المرة.');

  const offline = runPage({ health: [true], online: false });
  assert.equal(offline.nodes.title.textContent, 'انقطعت الإشارة من جهتك');
  await offline.step();
  assert.equal(offline.asked.length, 0);
});

test('in the app: only a non-JSON 5xx on /api is the platform updating', () => {
  assert.equal(isPlatformUpdating(502, 'text/html; charset=UTF-8'), true);
  assert.equal(isPlatformUpdating(503, null), true);
  assert.equal(isPlatformUpdating(503, 'application/json; charset=utf-8'), false);
  assert.equal(isPlatformUpdating(401, 'text/html'), false);
  assert.equal(isPlatformUpdating(404, 'text/html'), false);
  assert.equal(UPDATING_MESSAGE, 'أوربت يتلقّى تحديثاً، ويعود الاتصال وحده بعد قليل.');
  assert.deepEqual([1, 5, 6, 20].map(nextDelay), [3000, 3000, 3900, 15000]);
  const api = read('src/core/api.ts');
  assert.match(api, /isPlatformUpdating\(response\.status, response\.headers\.get\('content-type'\)\)/);
  assert.match(api, /showUpdatingNotice\(serverAnswers\)/);
});

test('the health probe is public and sits before the auth middleware', () => {
  const server = read('server.ts');
  const version = server.indexOf("app.get('/api/version'");
  const auth = server.indexOf("app.use('/api', asyncRoute(");
  assert.ok(version > 0 && auth > version);
  assert.match(server.slice(version, version + 200), /Cache-Control', 'no-store'/);
});
