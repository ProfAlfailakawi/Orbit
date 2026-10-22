/** SSRF-safe GET for anything ORBIT fetches from the public internet on a program's behalf. */
import dns from 'node:dns/promises';
import { isPublicIp, resolveHttps } from './logo.ts';

export async function assertPublicHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') ||
      /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) throw new Error('not a public hostname');
  const addresses = await dns.lookup(host, { all: true });
  if (!addresses.length || !addresses.every(a => isPublicIp(a.address))) throw new Error('resolves to a non-public address');
}

export interface SafeResponse { status: number; bytes: Uint8Array; finalUrl: string; contentType: string; ms: number }

/**
 * https only, public hosts only (DNS-checked), redirects re-validated hop by hop (max 3), bodies size-capped.
 * Returns null when the request is refused or cannot be made; a non-2xx status is still returned so callers can judge it.
 */
export async function safeGet(url: string, opts: { accept?: string; maxBytes: number; timeoutMs?: number; acceptStatus?: (s: number) => boolean; method?: 'GET' | 'HEAD' }, hop = 0): Promise<SafeResponse | null> {
  const started = Date.now();
  let target: URL;
  try { target = new URL(url); } catch { return null; }
  if (target.protocol !== 'https:' || target.username || target.password || (target.port && target.port !== '443')) return null;
  try { await assertPublicHost(target.hostname); } catch { return null; }
  let response: Response;
  try {
    response = await fetch(target, {
      method: opts.method ?? 'GET',
      redirect: 'manual',
      headers: { Accept: opts.accept ?? '*/*', 'User-Agent': 'ORBIT-Watch/1 (+read-only)' },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 6000),
    });
  } catch { return null; }
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    await response.body?.cancel().catch(() => undefined);
    const next = location && hop < 3 ? resolveHttps(location, target.toString()) : null;
    return next ? safeGet(next, opts, hop + 1) : null;
  }
  const contentType = response.headers.get('content-type') || '';
  const accepted = opts.acceptStatus ? opts.acceptStatus(response.status) : response.ok;
  if (!accepted || !response.body) {
    await response.body?.cancel().catch(() => undefined);
    return { status: response.status, bytes: new Uint8Array(), finalUrl: target.toString(), contentType, ms: Date.now() - started };
  }
  if (Number(response.headers.get('content-length')) > opts.maxBytes) { await response.body.cancel().catch(() => undefined); return null; }
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > opts.maxBytes) { await reader.cancel().catch(() => undefined); return null; }
      chunks.push(value);
    }
  } catch { return null; }
  return { status: response.status, bytes: Buffer.concat(chunks), finalUrl: target.toString(), contentType, ms: Date.now() - started };
}
