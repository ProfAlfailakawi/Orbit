/** Domain expiry from the public RDAP service (read-only, no key). Registries without RDAP answer 404 and are simply "unknown". */
import { safeGet } from './safeFetch.ts';
import { parseRdapExpiry } from './expiry.ts';

export async function readDomainExpiry(domain: string): Promise<string | null> {
  if (!/^[a-z0-9.-]{3,100}$/.test(domain)) return null;
  const res = await safeGet(`https://rdap.org/domain/${domain}`, { accept: 'application/rdap+json, application/json', maxBytes: 400_000, timeoutMs: 8000 });
  if (!res || res.status !== 200) return null;
  try { return parseRdapExpiry(JSON.parse(new TextDecoder().decode(res.bytes))); } catch { return null; }
}
