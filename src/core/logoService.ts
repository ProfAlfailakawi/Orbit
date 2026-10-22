/**
 * Server side of program logos: SSRF-safe fetching, GitHub repository fallback, and durable storage.
 * Logos live apart from the main state document so they can never push it over Firestore's size limit.
 */
import dns from 'node:dns/promises';
import crypto from 'node:crypto';
import fs from 'node:fs';
import type { Firestore } from 'firebase-admin/firestore';
import {
  MAX_LOGO_BYTES, declaredSize, discoverSiteLogo, isPublicIp, isUsableLogo, pickFirstUsable, resolveHttps, toDataUri,
  type FoundLogo, type IconCandidate, type LogoDeps,
} from './logo.ts';
import type { PlatformRecord } from './types.ts';

interface Entry { dataUri: string | null; source: 'site' | 'github' | 'none'; sourceUrl: string; fetchedAt: number; attemptedAt: number }
export interface PublicLogo { src: string; source: 'site' | 'github' }

const DAY = 24 * 60 * 60_000;
const REFRESH_AFTER = 14 * DAY;
const RETRY_AFTER = 6 * 60 * 60_000;
const BUDGET_MS = 24_000;
const MAX_PER_RUN = 6;

async function assertPublicHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') ||
      /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) throw new Error('not a public hostname');
  const addresses = await dns.lookup(host, { all: true });
  if (!addresses.length || !addresses.every(a => isPublicIp(a.address))) throw new Error('resolves to a non-public address');
}

/** GET over https to a public host only; redirects are re-validated hop by hop and bodies are size-capped. */
async function safeGet(url: string, opts: { accept: string; maxBytes: number; timeoutMs?: number }, hop = 0): Promise<{ bytes: Uint8Array; finalUrl: string } | null> {
  let target: URL;
  try { target = new URL(url); } catch { return null; }
  if (target.protocol !== 'https:' || target.username || target.password || (target.port && target.port !== '443')) return null;
  try { await assertPublicHost(target.hostname); } catch { return null; }
  const response = await fetch(target, {
    redirect: 'manual',
    headers: { Accept: opts.accept, 'User-Agent': 'ORBIT-LogoFetcher/1 (+read-only)' },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
  });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    await response.body?.cancel().catch(() => undefined);
    const next = location && hop < 3 ? resolveHttps(location, target.toString()) : null;
    return next ? safeGet(next, opts, hop + 1) : null;
  }
  if (!response.ok || !response.body) { await response.body?.cancel().catch(() => undefined); return null; }
  if (Number(response.headers.get('content-length')) > opts.maxBytes) { await response.body.cancel().catch(() => undefined); return null; }
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > opts.maxBytes) { await reader.cancel().catch(() => undefined); return null; }
    chunks.push(value);
  }
  return { bytes: Buffer.concat(chunks), finalUrl: target.toString() };
}

const siteDeps: LogoDeps = {
  fetchText: async url => {
    const result = await safeGet(url, { accept: 'text/html,application/json;q=0.9,*/*;q=0.1', maxBytes: 600_000 });
    return result ? { text: new TextDecoder().decode(result.bytes), finalUrl: result.finalUrl } : null;
  },
  fetchBytes: async url => (await safeGet(url, { accept: 'image/*,*/*;q=0.1', maxBytes: MAX_LOGO_BYTES }))?.bytes ?? null,
};

const REPO_ICON_PATHS = [
  'public/apple-touch-icon.png', 'public/icon.svg', 'public/favicon.svg', 'public/logo.svg', 'public/logo.png',
  'public/pwa-512x512.png', 'public/icons/icon-512x512.png', 'public/favicon.ico', 'logo.svg', 'logo.png',
];

/** The program's own icon files in its GitHub repository (read-only), for programs with no reachable site. */
async function repositoryLogo(p: PlatformRecord, token: string | undefined): Promise<FoundLogo | null> {
  const headers: Record<string, string> = { 'User-Agent': 'ORBIT-LogoFetcher/1 (+read-only)' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const base = `https://api.github.com/repos/${encodeURIComponent(p.owner)}/${encodeURIComponent(p.repoName)}`;
  let requests = 0, blocked = false;
  const get = async (apiPath: string, accept: string, max: number): Promise<Uint8Array | null> => {
    if (blocked || requests >= 10) return null;
    requests += 1;
    try {
      const response = await fetch(`${base}${apiPath}`, { headers: { ...headers, Accept: accept }, signal: AbortSignal.timeout(4500) });
      if (response.status === 403 || response.status === 429) blocked = true;
      if (!response.ok) return null;
      const bytes = new Uint8Array(await response.arrayBuffer());
      return bytes.length <= max ? bytes : null;
    } catch { return null; }
  };

  const meta = await get('', 'application/vnd.github+json', 200_000);
  if (meta) {
    try {
      const homepage = (JSON.parse(new TextDecoder().decode(meta)) as { homepage?: unknown }).homepage;
      const site = typeof homepage === 'string' ? resolveHttps(homepage, 'https://github.com/') : null;
      if (site && (!p.productionUrl || new URL(site).host !== new URL(p.productionUrl).host)) {
        const found = await discoverSiteLogo(site, siteDeps);
        if (found) return found;
      }
    } catch { /* homepage unreadable */ }
  }

  const fromFile = async (repoPath: string) => {
    const bytes = await get(`/contents/${repoPath.split('/').map(encodeURIComponent).join('/')}`, 'application/vnd.github.raw+json', MAX_LOGO_BYTES);
    const mime = bytes && isUsableLogo(bytes);
    return bytes && mime ? { dataUri: toDataUri(bytes, mime), sourceUrl: `https://github.com/${p.owner}/${p.repoName}/blob/HEAD/${repoPath}` } : null;
  };

  // A PWA manifest names the real icons; map its paths back to the repository.
  for (const manifestPath of ['public/manifest.json', 'public/manifest.webmanifest']) {
    const raw = await get(`/contents/${manifestPath}`, 'application/vnd.github.raw+json', 100_000);
    if (!raw) continue;
    try {
      const icons = ((JSON.parse(new TextDecoder().decode(raw)) as { icons?: Array<{ src?: unknown; sizes?: unknown; purpose?: unknown }> }).icons || []) as Array<{ src?: unknown; sizes?: unknown; purpose?: unknown }>;
      const ranked = icons.filter(i => typeof i.src === 'string' && !/maskable/i.test(String(i.purpose || '')) && !/^https?:/i.test(String(i.src)))
        .sort((a, b) => Math.min(declaredSize(String(b.sizes || '')), 256) - Math.min(declaredSize(String(a.sizes || '')), 256)).slice(0, 2);
      for (const icon of ranked) {
        const found = await fromFile('public/' + String(icon.src).replace(/^\/+/, '').replace(/\?.*$/, ''));
        if (found) return found;
      }
    } catch { /* manifest unreadable */ }
    break;
  }
  for (const repoPath of REPO_ICON_PATHS) {
    const found = await fromFile(repoPath);
    if (found) return found;
    if (blocked || requests >= 10) break;
  }
  return null;
}

export function createLogoService(options: {
  firestore: Firestore | null; snapshotPath: string; getPlatforms: () => PlatformRecord[]; githubToken: () => string | undefined;
}) {
  const entries = new Map<string, Entry>();
  let running: Promise<{ checked: number; found: number; remaining: number }> | null = null;
  const docFor = (id: string) => options.firestore?.collection('orbitLogos').doc(crypto.createHash('sha1').update(id).digest('hex'));

  async function load() {
    try {
      if (options.firestore) {
        for (const doc of (await options.firestore.collection('orbitLogos').get()).docs) {
          const data = doc.data() as Entry & { id?: string };
          if (data.id) entries.set(data.id, data);
        }
      } else if (fs.existsSync(options.snapshotPath)) {
        const parsed = JSON.parse(fs.readFileSync(options.snapshotPath, 'utf8')) as Record<string, Entry>;
        for (const [id, entry] of Object.entries(parsed)) entries.set(id, entry);
      }
    } catch (error) {
      console.warn('ORBIT logo store unavailable:', error instanceof Error ? error.message : 'unknown');
    }
  }

  async function persist(id: string) {
    const entry = entries.get(id);
    if (!entry) return;
    try {
      const doc = docFor(id);
      if (doc) await doc.set({ id, ...entry });
      else fs.writeFileSync(options.snapshotPath, JSON.stringify(Object.fromEntries(entries)), { encoding: 'utf8', mode: 0o600 });
    } catch (error) {
      console.warn('ORBIT logo persistence failed:', error instanceof Error ? error.message : 'unknown');
    }
  }

  function list(): Record<string, PublicLogo> {
    const out: Record<string, PublicLogo> = {};
    for (const p of options.getPlatforms()) {
      const entry = entries.get(p.id);
      if (entry?.dataUri && entry.source !== 'none') out[p.id] = { src: entry.dataUri, source: entry.source };
    }
    return out;
  }

  async function discover(p: PlatformRecord): Promise<{ found: FoundLogo | null; source: Entry['source'] }> {
    if (p.productionUrl) {
      const found = await discoverSiteLogo(p.productionUrl, siteDeps).catch(() => null);
      if (found) return { found, source: 'site' };
    }
    if (p.runtimeMode !== 'non-github-web') {
      const found = await repositoryLogo(p, options.githubToken()).catch(() => null);
      if (found) return { found, source: found.sourceUrl.startsWith('https://github.com/') ? 'github' : 'site' };
    }
    return { found: null, source: 'none' };
  }

  const due = (p: PlatformRecord, force: boolean, now: number) => {
    const entry = entries.get(p.id);
    if (force || !entry) return true;
    if (entry.dataUri) return now - entry.fetchedAt > REFRESH_AFTER;
    return now - entry.attemptedAt > RETRY_AFTER;
  };

  /** One program (forced), or every program that has no logo yet or an old one. Bounded in time and count. */
  function refresh(opts: { id?: string; force?: boolean } = {}) {
    if (running) return running;
    running = (async () => {
      const started = Date.now();
      const pool = options.getPlatforms().filter(p => p.lifecycleState !== 'unlinked' && p.lifecycleState !== 'archived');
      const wanted = (opts.id ? pool.filter(p => p.id === opts.id) : pool).filter(p => due(p, Boolean(opts.id && opts.force), started));
      const targets = wanted.slice(0, MAX_PER_RUN);
      let found = 0;
      for (const p of targets) {
        if (Date.now() - started > BUDGET_MS) break;
        const result = await discover(p).catch(() => ({ found: null, source: 'none' as const }));
        const previous = entries.get(p.id);
        entries.set(p.id, result.found
          ? { dataUri: result.found.dataUri, source: result.source, sourceUrl: result.found.sourceUrl, fetchedAt: Date.now(), attemptedAt: Date.now() }
          // A failed refresh never erases a logo we already have.
          : { dataUri: previous?.dataUri ?? null, source: previous?.dataUri ? previous.source : 'none', sourceUrl: previous?.sourceUrl ?? '', fetchedAt: previous?.fetchedAt ?? 0, attemptedAt: Date.now() });
        if (result.found) found += 1;
        await persist(p.id);
      }
      // Programs still waiting for their turn; the caller asks again until none remain.
      return { checked: targets.length, found, remaining: Math.max(0, wanted.length - targets.length) };
    })().finally(() => { running = null; });
    return running;
  }

  return { load, list, refresh };
}
