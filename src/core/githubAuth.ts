/**
 * Where ORBIT's GitHub credential comes from.
 *
 * Preferred: a GitHub App (GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY). The private key never expires;
 * from it ORBIT mints a one-hour installation token on demand and renews it before it runs out,
 * so the fleet cannot go dark because a token reached its date.
 *
 * Fallback: the older personal token (GITHUB_READ_ONLY_TOKEN). If GitHub rejects it (401), ORBIT
 * stops sending it and keeps reading public repositories anonymously instead of failing every one.
 */
import { createSign } from 'node:crypto';

export type GithubAuthMode = 'app' | 'pat' | 'none';

export interface GithubAuth {
  mode(): GithubAuthMode;
  /** A token to send, or undefined to call GitHub anonymously. Never throws. */
  token(): Promise<string | undefined>;
  /** Report that GitHub answered 401 for this token, so it is not sent again. */
  rejected(token: string | undefined): void;
  /** True when a personal token was configured but GitHub refused it. */
  patRejected(): boolean;
  /** Last App error (no installation, bad key...), for the operator. */
  lastError(): string | null;
}

const API = 'https://api.github.com';
const RENEW_BEFORE_MS = 10 * 60_000;

function base64url(input: string | Buffer) {
  return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/** Secret Manager and .env files often store the PEM with literal "\n"; accept both, or base64 of the PEM. */
export function normalizePrivateKey(raw: string): string {
  let key = raw.trim();
  if (!key.includes('BEGIN')) {
    try { const decoded = Buffer.from(key, 'base64').toString('utf8'); if (decoded.includes('BEGIN')) key = decoded.trim(); } catch { /* keep as is */ }
  }
  return key.replace(/\\n/g, '\n');
}

/** The short JWT GitHub requires to act as the App itself (valid 9 minutes, backdated 60s for clock drift). */
export function appJwt(appId: string, privateKey: string, nowMs: number): string {
  const iat = Math.floor(nowMs / 1000) - 60;
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ iat, exp: iat + 540, iss: appId }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${base64url(signer.sign(privateKey))}`;
}

export function createGithubAuth(options: {
  appId?: string; privateKey?: string; installationId?: string; owner?: string; pat?: string;
  fetchImpl?: typeof fetch; now?: () => number;
} = {}): GithubAuth {
  const doFetch = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const appId = options.appId?.trim();
  const privateKey = options.privateKey ? normalizePrivateKey(options.privateKey) : '';
  const pat = options.pat?.trim() || undefined;
  const useApp = Boolean(appId && privateKey);

  let installationId = options.installationId?.trim() || '';
  let cached: { token: string; expiresAt: number } | null = null;
  let inflight: Promise<string | undefined> | null = null;
  let patDead = false;
  let lastError: string | null = null;
  let retryAfter = 0;

  const appHeaders = () => ({
    Authorization: `Bearer ${appJwt(appId!, privateKey, now())}`,
    Accept: 'application/vnd.github+json', 'User-Agent': 'ORBIT-App/1', 'X-GitHub-Api-Version': '2022-11-28',
  });

  async function findInstallation(): Promise<string> {
    const res = await doFetch(`${API}/app/installations?per_page=100`, { headers: appHeaders(), signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`GitHub App installations HTTP ${res.status}`);
    const list = await res.json() as Array<{ id?: number; account?: { login?: string } }>;
    const wanted = options.owner?.toLowerCase();
    const hit = (wanted && list.find(i => i.account?.login?.toLowerCase() === wanted)) || list[0];
    if (!hit?.id) throw new Error('GitHub App is not installed on any account');
    return String(hit.id);
  }

  async function mint(): Promise<string | undefined> {
    try {
      if (!installationId) installationId = await findInstallation();
      const res = await doFetch(`${API}/app/installations/${installationId}/access_tokens`, { method: 'POST', headers: appHeaders(), signal: AbortSignal.timeout(8000) });
      if (res.status === 404) installationId = ''; // uninstalled and reinstalled: look it up again next time
      if (!res.ok) throw new Error(`GitHub App token HTTP ${res.status}`);
      const body = await res.json() as { token?: string; expires_at?: string };
      if (!body.token) throw new Error('GitHub App token missing in response');
      const expiresAt = Date.parse(body.expires_at || '') || now() + 3_600_000;
      cached = { token: body.token, expiresAt };
      lastError = null;
      return body.token;
    } catch (error) {
      lastError = error instanceof Error ? error.message.slice(0, 160) : 'GitHub App token failed';
      retryAfter = now() + 60_000;
      return undefined;
    }
  }

  return {
    mode: () => (useApp ? 'app' : pat ? 'pat' : 'none'),
    async token() {
      if (useApp) {
        if (cached && cached.expiresAt - now() > RENEW_BEFORE_MS) return cached.token;
        if (now() < retryAfter) return cached && cached.expiresAt > now() ? cached.token : undefined;
        inflight ??= mint().finally(() => { inflight = null; });
        return inflight;
      }
      return pat && !patDead ? pat : undefined;
    },
    rejected(token) {
      if (!token) return;
      if (cached?.token === token) cached = null; // mint a fresh one on the next call
      else if (token === pat) patDead = true;
    },
    patRejected: () => Boolean(pat) && patDead && !useApp,
    lastError: () => lastError,
  };
}
