import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createDemoGate, createDemoStore, buildDemoState, demoEnabled, DEMO_HEADER } from './demoSandbox.ts';

/** A stand-in for every real handler: any hit means isolation failed. It would leak a "real" token and log line. */
async function boot(enabled = true, max = 200) {
  const hits: string[] = [];
  const app = express();
  app.use(express.json());
  const { gate } = createDemoGate({ enabled: () => enabled, store: createDemoStore(30 * 60_000, max) });
  app.use('/api', gate);
  app.use((req, res) => { hits.push(`${req.method} ${req.path}`); res.json({ real: true, token: 'ghp_REALTOKEN', log: 'REAL-CLOUD-RUN-LOG', github: 'api.github.com' }); });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { hits, base, close: () => server.close() };
}
const enter = async (base: string) => (await (await fetch(`${base}/api/demo/enter`, { method: 'POST' })).json()) as { sessionId: string };

test('enter issues demo_ + 64 hex; state is synthetic only', async () => {
  const s = await boot();
  const { sessionId } = await enter(s.base);
  assert.match(sessionId, /^demo_[0-9a-f]{64}$/);
  const res = await fetch(`${s.base}/api/state`, { headers: { [DEMO_HEADER]: sessionId, Authorization: 'Bearer ' + 'a'.repeat(64) } });
  const text = await res.text();
  assert.equal(res.status, 200);
  assert.ok(JSON.parse(text).platforms.length >= 4);
  for (const bad of ['ghp_', 'github_pat', 'REAL', 'run.app', 'api.github.com', 'ProfAlfailakawi', 'AIza', 'BEGIN PRIVATE']) assert.ok(!text.includes(bad), bad);
  assert.deepEqual(s.hits, []);
  s.close();
});

test('every demo request is answered by the gate: nothing reaches real handlers', async () => {
  const s = await boot();
  const { sessionId } = await enter(s.base);
  const h = { [DEMO_HEADER]: sessionId, 'Content-Type': 'application/json' };
  const paths: Array<[string, string]> = [
    ['GET', '/api/state'], ['POST', '/api/github/sync'], ['POST', '/api/watch/run'], ['POST', '/api/explain'],
    ['POST', '/api/sensor/ingest'], ['POST', '/api/public-sensor'], ['GET', '/api/stream'], ['POST', '/api/ai/diagnose'],
    ['POST', '/api/radar/ingest'], ['POST', '/api/canary/run'], ['POST', '/api/auth/verify'], ['GET', '/api/weekly-report'],
    ['POST', '/api/fleet/x/verify'], ['POST', '/api/memory/save'], ['GET', '/api/anything-new-added-later'], ['POST', '/api/push/subscribe'],
    ['POST', '/api/fleet/add'], ['POST', '/api/state/hydrate'], ['GET', '/api/logs'],
  ];
  for (const [method, p] of paths) {
    const res = await fetch(s.base + p, { method, headers: h, body: method === 'POST' ? '{"nameAr":"اختبار","link":"https://api.github.com/x"}' : undefined });
    const body = await res.text();
    assert.ok(!body.includes('ghp_REALTOKEN') && !body.includes('REAL-CLOUD-RUN-LOG'), `${method} ${p} leaked`);
  }
  assert.deepEqual(s.hits, [], 'demo traffic reached a real handler');
  // blocked write/trigger routes are 403, not silently real
  assert.equal((await fetch(`${s.base}/api/sensor/ingest`, { method: 'POST', headers: h, body: '{}' })).status, 403);
  s.close();
});

test('requests without the header keep going to the real handlers; malformed header is rejected, never passed', async () => {
  const s = await boot();
  assert.equal((await (await fetch(`${s.base}/api/state`)).json()).real, true);
  const bad = await fetch(`${s.base}/api/state`, { headers: { [DEMO_HEADER]: 'demo_nothex' } });
  assert.equal(bad.status, 400);
  assert.equal(s.hits.length, 1);
  s.close();
});

test('sandboxes are private per visitor; writes stay inside', async () => {
  const s = await boot();
  const a = (await enter(s.base)).sessionId, b = (await enter(s.base)).sessionId;
  const add = await fetch(`${s.base}/api/fleet/add`, { method: 'POST', headers: { [DEMO_HEADER]: a, 'Content-Type': 'application/json' }, body: JSON.stringify({ nameAr: 'برنامجي' }) });
  assert.equal(add.status, 200);
  const count = async (id: string) => (await (await fetch(`${s.base}/api/state`, { headers: { [DEMO_HEADER]: id } })).json()).platforms.length;
  assert.equal(await count(a), 6);
  assert.equal(await count(b), 5);
  s.close();
});

test('kill switch: enter 404, demo header never falls through', async () => {
  const s = await boot(false);
  assert.equal((await fetch(`${s.base}/api/demo/enter`, { method: 'POST' })).status, 404);
  assert.equal((await (await fetch(`${s.base}/api/demo/config`)).json()).enabled, false);
  const res = await fetch(`${s.base}/api/state`, { headers: { [DEMO_HEADER]: 'demo_' + 'a'.repeat(64) } });
  assert.equal(res.status, 404);
  assert.deepEqual(s.hits, []);
  s.close();
});

test('capacity cap and enter rate limit', async () => {
  const s = await boot(true, 2);
  await enter(s.base); await enter(s.base);
  assert.equal((await fetch(`${s.base}/api/demo/enter`, { method: 'POST' })).status, 503);
  s.close();
  const r = await boot();
  let last = 0;
  for (let i = 0; i < 22; i += 1) last = (await fetch(`${r.base}/api/demo/enter`, { method: 'POST' })).status;
  assert.equal(last, 429);
  r.close();
});

test('TTL expiry drops the sandbox; env switch parsing; fixtures are fresh', () => {
  const store = createDemoStore(1000, 5);
  assert.ok(store.create('demo_x', 0));
  assert.ok(store.get('demo_x', 500));
  assert.equal(store.get('demo_x', 1500), null);
  assert.equal(demoEnabled({} as NodeJS.ProcessEnv), true);
  for (const v of ['0', 'false', 'off', 'No']) assert.equal(demoEnabled({ ORBIT_DEMO_ENABLED: v } as NodeJS.ProcessEnv), false);
  const st = buildDemoState();
  assert.ok(st.platforms.every(p => p.repoUrl === '' && (!p.productionUrl || p.productionUrl.endsWith('.demo.invalid'))));
});
