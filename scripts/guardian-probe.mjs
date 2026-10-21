/**
 * Independent ORBIT liveness and read-only website checks.
 * No authentication, user actions, cookies, redirects, screenshots or writes.
 */
import dns from 'node:dns/promises';
import net from 'node:net';

const watchdog = process.env.ORBIT_HEALTHCHECK_URL?.trim() || '';
let targets = [];
try {
  targets = JSON.parse(process.env.ORBIT_GHOST_TARGETS || '[]');
  if (!Array.isArray(targets) || targets.length > 15 || !targets.every(x => typeof x === 'string')) {
    throw new Error('Expected up to 15 public HTTPS URLs.');
  }
} catch {
  console.error('Invalid external guardian configuration.');
  process.exit(2);
}
const jobs = [...(watchdog ? [{ url: watchdog, orbit: true }] : []), ...targets.map(url => ({ url, orbit: false }))];
if (!jobs.length) {
  console.log('ORBIT external guardian UNCONFIGURED: no external checks started.');
  process.exit(0);
}
const rejectPrivateIp = (ip) => {
  const p = ip.split('.').map(Number);
  return p[0] === 0 || p[0] === 10 || p[0] === 127 || p[0] >= 224 ||
    (p[0] === 169 && p[1] === 254) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
    (p[0] === 198 && [18, 19].includes(p[1]));
};
async function validateUrl(raw, isOrbit) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || !url.hostname.includes('.') || url.username || url.password ||
      (url.port && url.port !== '443') || net.isIP(url.hostname) ||
      /(\.localhost|\.local|\.internal|\.invalid|\.test)$/i.test(url.hostname) ||
      (isOrbit && url.pathname !== '/healthz')) {
    throw new Error('Target does not meet safe public HTTPS requirements.');
  }
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (addresses.length === 0 || addresses.some(a => a.family !== 4 || rejectPrivateIp(a.address))) {
    throw new Error('Target is not a verified public IPv4 host.');
  }
  return url;
}
let failed = 0;
for (const [index, task] of jobs.entries()) {
  try {
    const target = await validateUrl(task.url, task.orbit);
    const response = await fetch(target, {
      method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(8000),
      headers: { accept: 'application/json' },
    });
    let passed = response.ok;
    if (task.orbit) {
      const evidence = await response.json().catch(() => null);
      passed = passed && evidence?.service === 'orbit' && evidence?.status === 'running';
    }
    if (!passed) throw new Error('Check failed.');
    console.log('READ-ONLY check #' + (index + 1) + ' passed; functional journeys remain unverified.');
  } catch {
    failed++;
    console.error('READ-ONLY check #' + (index + 1) + ' failed; target address not disclosed.');
  }
}
if (failed) {
  console.error(failed + ' external availability or liveness checks failed.');
  process.exit(1);
}
