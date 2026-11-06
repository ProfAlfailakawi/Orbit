#!/usr/bin/env node
// Regression check against a RUNNING Orbit server: node scripts/verify-demo-entry.mjs [baseUrl]
// Proves: demo entry works, state is synthetic, the real operator routes stay locked, no secrets/real hosts appear.
const base = (process.argv[2] || process.env.ORBIT_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const H = 'x-orbit-demo';
let failed = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) failed += 1; };
const j = async (r) => { try { return await r.json(); } catch { return null; } };

const cfg = await j(await fetch(`${base}/api/demo/config`));
ok(cfg && typeof cfg.enabled === 'boolean', `config answers (enabled=${cfg?.enabled})`);
if (!cfg?.enabled) { console.log('demo disabled: skipping entry checks'); process.exit(failed ? 1 : 0); }

const entered = await j(await fetch(`${base}/api/demo/enter`, { method: 'POST' }));
ok(/^demo_[0-9a-f]{64}$/.test(entered?.sessionId || ''), 'enter issues demo_+64hex');
const id = entered.sessionId;
const headers = { [H]: id, 'Content-Type': 'application/json' };

const session = await j(await fetch(`${base}/api/auth/session`, { headers }));
ok(session?.authenticated === true && session?.demo === true, 'demo session recognised');

const stateRes = await fetch(`${base}/api/state`, { headers });
const text = await stateRes.text();
const state = JSON.parse(text);
ok(stateRes.status === 200 && state.platforms?.length >= 4 && state.demo === true, `demo state has ${state.platforms?.length} synthetic programs`);
ok(!/ghp_|github_pat|api\.github\.com|run\.app|ProfAlfailakawi|AIza|PRIVATE KEY/.test(text), 'no tokens/real hosts in demo state');

for (const [m, p] of [['POST', '/api/sensor/ingest'], ['POST', '/api/ai/diagnose'], ['GET', '/api/stream'], ['POST', '/api/canary/run'], ['POST', '/api/fleet/x/verify']]) {
  const r = await fetch(base + p, { method: m, headers, body: m === 'POST' ? '{}' : undefined });
  ok(r.status === 403, `${m} ${p} blocked in demo (${r.status})`);
}
const sync = await j(await fetch(`${base}/api/github/sync`, { method: 'POST', headers, body: '{}' }));
ok(sync?.demo === true, 'sync is inert (answers from sandbox)');

const noAuth = await fetch(`${base}/api/state`);
ok(noAuth.status === 401, `without demo header the real API stays locked (${noAuth.status})`);
const forged = await fetch(`${base}/api/state`, { headers: { [H]: 'demo_zz' } });
ok(forged.status === 400, `malformed demo id rejected (${forged.status})`);
const fakeBearer = await fetch(`${base}/api/state`, { headers: { Authorization: 'Bearer ' + 'a'.repeat(64) } });
ok(fakeBearer.status === 401, 'forged operator token still rejected');

await fetch(`${base}/api/auth/logout`, { method: 'POST', headers });
console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
