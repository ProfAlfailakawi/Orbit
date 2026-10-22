/** The security certificate (HTTPS) of a program's site: expiry is the classic failure that nobody sees coming. */
import type { PlatformRecord } from './types.ts';

export interface CertResult { expiresAt: string | null; problem: string | null }

const DAY = 86_400_000;
const CERT_FRESH_MS = 72 * 3_600_000;
export const CERT_RECHECK_MS = 20 * 3_600_000;

export const daysPhrase = (n: number) => n === 1 ? 'يوم واحد' : n === 2 ? 'يومين' : n <= 10 ? n + ' أيام' : n + ' يومًا';

export function applyCert(p: PlatformRecord, cert: CertResult, nowIso: string): PlatformRecord {
  return { ...p, certExpiresAt: cert.expiresAt ?? undefined, certProblem: cert.problem ?? undefined, certCheckedAt: nowIso };
}

export function certDue(p: PlatformRecord, now = Date.now()): boolean {
  return !p.certCheckedAt || now - Date.parse(p.certCheckedAt) > CERT_RECHECK_MS;
}

function fresh(p: PlatformRecord, now: number) {
  return Boolean(p.certCheckedAt) && now - Date.parse(p.certCheckedAt as string) < CERT_FRESH_MS;
}

/** An expired or untrusted certificate (visitors already see a browser warning), or one that ends within 3 days. */
export function certProblems(p: PlatformRecord, now = Date.now()): string[] {
  if (!fresh(p, now)) return [];
  if (p.certProblem) return [p.certProblem];
  if (!p.certExpiresAt) return [];
  const days = Math.ceil((Date.parse(p.certExpiresAt) - now) / DAY);
  if (days <= 0) return ['شهادة الأمان (HTTPS) للموقع انتهت، والزوّار يرون تحذيرًا من المتصفح'];
  return days <= 3 ? [`شهادة الأمان (HTTPS) للموقع تنتهي بعد ${daysPhrase(days)}`] : [];
}

/** Early notice: a certificate that ends within 14 days. */
export function certWarnings(p: PlatformRecord, now = Date.now()): string[] {
  if (!fresh(p, now) || p.certProblem || !p.certExpiresAt) return [];
  const days = Math.ceil((Date.parse(p.certExpiresAt) - now) / DAY);
  return days > 3 && days <= 14 ? [`شهادة الأمان (HTTPS) للموقع تنتهي بعد ${daysPhrase(days)}، تأكد أن تجديدها تلقائي`] : [];
}
