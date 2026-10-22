/** Things that end on a date and take a program down without any code change: the domain name and the GitHub token. */
import type { PlatformRecord } from './types.ts';
import { daysPhrase } from './certs.ts';

const DAY = 86_400_000;

/** Hosts on someone else's domain (hosting platforms): the owner does not renew these, so there is nothing to watch. */
const PLATFORM_SUFFIXES = ['web.app', 'firebaseapp.com', 'ai.studio', 'run.app', 'github.io', 'vercel.app', 'netlify.app', 'pages.dev', 'onrender.com', 'herokuapp.com', 'appspot.com', 'workers.dev', 'replit.app', 'repl.co', 'glitch.me', 'fly.dev', 'railway.app', 'supabase.co', 'azurewebsites.net', 'cloudfront.net'];
/** Second-level registries, where the owned name has three labels (shop.com.kw → shop.com.kw, not com.kw). */
const SECOND_LEVEL = new Set(['com.kw', 'org.kw', 'net.kw', 'edu.kw', 'gov.kw', 'co.uk', 'org.uk', 'com.sa', 'com.eg', 'com.au', 'co.in', 'com.tr', 'co.za']);

/** The name the owner registers (and renews), or null for IPs, single labels and hosting-platform subdomains. */
export function registrableDomain(host: string): string | null {
  const name = host.toLowerCase().replace(/\.$/, '');
  if (!/^[a-z0-9.-]+$/.test(name) || /^\d{1,3}(\.\d{1,3}){3}$/.test(name)) return null;
  if (PLATFORM_SUFFIXES.some(s => name === s || name.endsWith('.' + s))) return null;
  const labels = name.split('.');
  if (labels.length < 2) return null;
  const last2 = labels.slice(-2).join('.');
  return SECOND_LEVEL.has(last2) ? (labels.length >= 3 ? labels.slice(-3).join('.') : null) : last2;
}

/** The expiration date from an RDAP domain answer (RFC 9083), or null. */
export function parseRdapExpiry(json: unknown): string | null {
  const events = (json as { events?: Array<{ eventAction?: unknown; eventDate?: unknown }> } | null)?.events;
  if (!Array.isArray(events)) return null;
  const hit = events.find(e => typeof e?.eventAction === 'string' && /^expiration$/i.test(e.eventAction) && typeof e.eventDate === 'string');
  const time = hit ? Date.parse(hit.eventDate as string) : NaN;
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

const DOMAIN_RECHECK_MS = 6 * DAY;
const DOMAIN_FRESH_MS = 14 * DAY;

export const domainDue = (p: PlatformRecord, now = Date.now()) => !p.domainCheckedAt || now - Date.parse(p.domainCheckedAt) > DOMAIN_RECHECK_MS;

export function applyDomain(p: PlatformRecord, expiresAt: string | null, nowIso: string): PlatformRecord {
  return { ...p, domainExpiresAt: expiresAt ?? undefined, domainCheckedAt: nowIso };
}

function domainDays(p: PlatformRecord, now: number): number | null {
  if (!p.domainExpiresAt || !p.domainCheckedAt || now - Date.parse(p.domainCheckedAt) > DOMAIN_FRESH_MS) return null;
  return Math.ceil((Date.parse(p.domainExpiresAt) - now) / DAY);
}

/** A domain that expired or ends within a week: the site disappears for everyone. */
export function domainProblems(p: PlatformRecord, now = Date.now()): string[] {
  const days = domainDays(p, now);
  if (days === null || days > 7) return [];
  return [days <= 0 ? 'اسم النطاق (domain) انتهى، والموقع سيختفي أو اختفى' : `اسم النطاق (domain) ينتهي بعد ${daysPhrase(days)}، جدّده الآن`];
}

/** Early notice: a domain that ends within 30 days. */
export function domainWarnings(p: PlatformRecord, now = Date.now()): string[] {
  const days = domainDays(p, now);
  return days !== null && days > 7 && days <= 30 ? [`اسم النطاق (domain) ينتهي بعد ${daysPhrase(days)}، جدّده قبل الموعد`] : [];
}

/** GitHub sends `github-authentication-token-expiration: 2026-12-01 10:00:00 UTC` on authenticated calls. */
export function parseTokenExpiry(header: string | null | undefined): string | null {
  if (!header) return null;
  const time = Date.parse(header.trim());
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export interface TokenNotice { tone: 'bad' | 'warn'; text: string }

/** The token ORBIT reads GitHub with: when it ends, every program's repository data goes dark at once. */
export function tokenNotice(expiresAt: string | null | undefined, now = Date.now()): TokenNotice | null {
  if (!expiresAt) return null;
  const days = Math.ceil((Date.parse(expiresAt) - now) / DAY);
  if (!Number.isFinite(days) || days > 14) return null;
  if (days <= 0) return { tone: 'bad', text: 'توكن GitHub الذي يقرأ به أوربت انتهى، وكل بيانات المستودعات متوقفة. أنشئ توكنًا جديدًا.' };
  return { tone: days <= 3 ? 'bad' : 'warn', text: `توكن GitHub الذي يقرأ به أوربت ينتهي بعد ${daysPhrase(days)}. أنشئ توكنًا جديدًا قبل ذلك.` };
}
