/**
 * Direct APNs delivery for the native iOS app. The device token from the native shell is an APNs token (hex),
 * not a Web Push subscription, so it is sent over HTTP/2 with the .p8 key.
 * Env: APNS_KEY_P8 (accepts \n), APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID (default com.dralfailakawi.orbit),
 * APNS_ENV = production | sandbox (default production = TestFlight / App Store).
 */
import { sign as signBytes } from 'node:crypto';
import http2 from 'node:http2';

const b64url = (input: Buffer | string) => Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
let jwtCache: { jwt: string; issuedAt: number } | null = null;

export const validApnsToken = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64,200}$/i.test(value);
export const apnsConfigured = () => Boolean(process.env.APNS_KEY_P8 && process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID);

function apnsJwt(): string | null {
  const key = String(process.env.APNS_KEY_P8 || '').replace(/\\n/g, '\n').trim();
  const keyId = String(process.env.APNS_KEY_ID || '').trim();
  const teamId = String(process.env.APNS_TEAM_ID || '').trim();
  if (!key || !keyId || !teamId) return null;
  const nowSec = Math.floor(Date.now() / 1000);
  if (jwtCache && nowSec - jwtCache.issuedAt < 40 * 60) return jwtCache.jwt;
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const claims = b64url(JSON.stringify({ iss: teamId, iat: nowSec }));
  const signature = signBytes('sha256', Buffer.from(`${header}.${claims}`), { key, dsaEncoding: 'ieee-p1363' });
  const jwt = `${header}.${claims}.${b64url(signature)}`;
  jwtCache = { jwt, issuedAt: nowSec };
  return jwt;
}

export interface ApnsResult { sent: boolean; dead?: boolean; reason?: string }

export function sendApns(deviceToken: string, title: string, body: string, data: Record<string, string> = {}): Promise<ApnsResult> {
  const jwt = apnsJwt();
  if (!jwt || !deviceToken) return Promise.resolve({ sent: false, reason: 'APNS_NOT_CONFIGURED' });
  const topic = process.env.APNS_BUNDLE_ID || 'com.dralfailakawi.orbit';
  const host = process.env.APNS_ENV === 'sandbox' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
  const payload = JSON.stringify({ aps: { alert: { title, body }, sound: 'default', 'thread-id': data.kind || 'orbit' }, ...data });
  return new Promise(resolve => {
    let settled = false;
    const finish = (result: ApnsResult) => {
      if (settled) return;
      settled = true;
      try { client.close(); } catch { /* already closed */ }
      resolve(result);
    };
    const client = http2.connect(host);
    client.on('error', error => finish({ sent: false, reason: `APNS_CONN ${error.message}` }));
    const timer = setTimeout(() => finish({ sent: false, reason: 'APNS_TIMEOUT' }), 15_000);
    const request = client.request({
      ':method': 'POST',
      ':path': `/3/device/${deviceToken}`,
      authorization: `bearer ${jwt}`,
      'apns-topic': topic,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'apns-expiration': String(Math.floor(Date.now() / 1000) + 6 * 3600),
      'content-type': 'application/json',
    });
    let status = 0;
    let text = '';
    request.on('response', headers => { status = Number(headers[':status'] || 0); });
    request.setEncoding('utf8');
    request.on('data', chunk => { text += chunk; });
    request.on('end', () => {
      clearTimeout(timer);
      if (status === 200) return finish({ sent: true });
      let reason = '';
      try { reason = String(JSON.parse(text).reason || ''); } catch { reason = text.slice(0, 120); }
      finish({ sent: false, dead: status === 410 || /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/i.test(reason), reason: `APNS_${status} ${reason}` });
    });
    request.on('error', error => finish({ sent: false, reason: `APNS_REQ ${error.message}` }));
    request.end(payload);
  });
}
