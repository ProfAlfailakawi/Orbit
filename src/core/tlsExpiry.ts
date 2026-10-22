/** Reads a site's certificate without sending any request: a TLS handshake to a DNS-checked public address. */
import dns from 'node:dns/promises';
import tls from 'node:tls';
import { isPublicIp } from './logo.ts';
import { assertPublicHost } from './safeFetch.ts';
import type { CertResult } from './certs.ts';

export async function readCertificate(hostname: string, timeoutMs = 6000): Promise<CertResult | null> {
  try { await assertPublicHost(hostname); } catch { return null; }
  let address: string;
  try { const found = await dns.lookup(hostname); if (!isPublicIp(found.address)) return null; address = found.address; } catch { return null; }
  return new Promise<CertResult | null>(resolve => {
    // The address was checked above; connecting to it (with the real name for SNI) avoids a second, rebindable lookup.
    const socket = tls.connect({ host: address, port: 443, servername: hostname, rejectUnauthorized: false, timeout: timeoutMs }, () => {
      const cert = socket.getPeerCertificate();
      const reason = socket.authorized ? null : String(socket.authorizationError || 'unknown');
      socket.end();
      const expiresAt = cert?.valid_to ? new Date(cert.valid_to).toISOString() : null;
      const expired = expiresAt !== null && Date.parse(expiresAt) <= Date.now();
      resolve({ expiresAt, problem: reason && !expired ? `شهادة الأمان (HTTPS) للموقع غير موثوقة (${reason.replace(/_/g, ' ').toLowerCase().slice(0, 60)})` : null });
    });
    socket.on('timeout', () => { socket.destroy(); resolve(null); });
    socket.on('error', () => resolve(null));
  });
}
