/** Remembers when ORBIT's own GitHub token expires, so the owner hears about it before every repository goes dark. */
import type { Firestore } from 'firebase-admin/firestore';
import { parseTokenExpiry } from './expiry.ts';

const RECHECK_MS = 12 * 3_600_000;

export function createTokenWatch(options: { firestore: Firestore | null; fetchImpl?: typeof fetch; now?: () => number }) {
  const doc = options.firestore?.collection('orbit').doc('githubToken');
  const doFetch = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  let state: { expiresAt: string | null; checkedAt: number } = { expiresAt: null, checkedAt: 0 };

  async function load() {
    try {
      const stored = doc ? (await doc.get()).data() as { expiresAt?: string | null; checkedAt?: number } | undefined : undefined;
      if (stored) state = { expiresAt: stored.expiresAt ?? null, checkedAt: stored.checkedAt ?? 0 };
    } catch { /* the next check fills it in */ }
  }

  async function remember(expiresAt: string | null) {
    state = { expiresAt, checkedAt: now() };
    try { await doc?.set(state); } catch { /* memory still has it */ }
  }

  /** `/rate_limit` is free (it does not count against the limit) and carries the expiry header like any authenticated call. */
  async function check(token: string | undefined, force = false) {
    if (!token || (!force && now() - state.checkedAt < RECHECK_MS)) return;
    try {
      const res = await doFetch('https://api.github.com/rate_limit', { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'ORBIT-Watch/1' }, signal: AbortSignal.timeout(5000) });
      if (res.status === 401) return remember(new Date(now() - 1000).toISOString()); // revoked or expired: treat as ended
      await remember(parseTokenExpiry(res.headers.get('github-authentication-token-expiration')));
    } catch { /* try again next time */ }
  }

  return { load, check, expiresAt: () => state.expiresAt };
}
