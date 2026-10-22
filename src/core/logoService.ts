/**
 * Server side of program logos: SSRF-safe fetching, GitHub repository fallback, and durable storage.
 * Logos live apart from the main state document so they can never push it over Firestore's size limit.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import type { Firestore } from 'firebase-admin/firestore';
import {
  MAX_LOGO_BYTES, discoverSiteLogo, findManifestPaths, isUsableLogo, pickRepoLogoPaths, resolveHttps, toDataUri,
  type FoundLogo, type LogoDeps, type RepoFile,
} from './logo.ts';
import { safeGet } from './safeFetch.ts';
import type { PlatformRecord } from './types.ts';

/** Bump when the discovery rules change: older results (e.g. favicons of unrelated sites) are then ignored and looked up again. */
const RULES_VERSION = 2;
interface Entry { dataUri: string | null; source: 'site' | 'github' | 'none'; sourceUrl: string; fetchedAt: number; attemptedAt: number; v?: number }
export interface PublicLogo { src: string; source: 'site' | 'github' }

const DAY = 24 * 60 * 60_000;
const REFRESH_AFTER = 14 * DAY;
const RETRY_AFTER = 6 * 60 * 60_000;
const BUDGET_MS = 24_000;
const MAX_PER_RUN = 6;

const siteDeps: LogoDeps = {
  fetchText: async url => {
    const result = await safeGet(url, { accept: 'text/html,application/json;q=0.9,*/*;q=0.1', maxBytes: 600_000 });
    return result && result.status >= 200 && result.status < 300 ? { text: new TextDecoder().decode(result.bytes), finalUrl: result.finalUrl } : null;
  },
  fetchBytes: async url => {
    const result = await safeGet(url, { accept: 'image/*,*/*;q=0.1', maxBytes: MAX_LOGO_BYTES });
    return result && result.status >= 200 && result.status < 300 ? result.bytes : null;
  },
};

/** The program's own icon files in its GitHub repository (read-only), chosen from its web-app manifest or by name. */
async function repositoryLogo(p: PlatformRecord, token: string | undefined): Promise<FoundLogo | null> {
  const headers: Record<string, string> = { 'User-Agent': 'ORBIT-LogoFetcher/1 (+read-only)' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const base = `https://api.github.com/repos/${encodeURIComponent(p.owner)}/${encodeURIComponent(p.repoName)}`;
  let requests = 0, blocked = false;
  const get = async (apiPath: string, accept: string, max: number): Promise<Uint8Array | null> => {
    if (blocked || requests >= 12) return null;
    requests += 1;
    try {
      const response = await fetch(`${base}${apiPath}`, { headers: { ...headers, Accept: accept }, signal: AbortSignal.timeout(6000) });
      if (response.status === 403 || response.status === 429) blocked = true;
      if (!response.ok) return null;
      const bytes = new Uint8Array(await response.arrayBuffer());
      return bytes.length <= max ? bytes : null;
    } catch { return null; }
  };
  const raw = (repoPath: string, max: number) => get(`/contents/${repoPath.split('/').map(encodeURIComponent).join('/')}`, 'application/vnd.github.raw+json', max);

  // One request lists every file with its size; no guessing of paths.
  const treeBytes = await get('/git/trees/HEAD?recursive=1', 'application/vnd.github+json', 8_000_000);
  let files: RepoFile[] = [];
  if (treeBytes) {
    try {
      const tree = (JSON.parse(new TextDecoder().decode(treeBytes)) as { tree?: Array<{ path?: string; type?: string; size?: number }> }).tree || [];
      files = tree.filter(t => t.type === 'blob' && typeof t.path === 'string').map(t => ({ path: t.path as string, size: Number(t.size) || 0 }));
    } catch { /* unreadable tree */ }
  }

  if (files.length) {
    const manifests: Array<{ path: string; json: unknown }> = [];
    for (const manifestPath of findManifestPaths(files)) {
      const bytes = await raw(manifestPath, 100_000);
      try { manifests.push({ path: manifestPath, json: bytes ? JSON.parse(new TextDecoder().decode(bytes)) : null }); } catch { /* not JSON */ }
    }
    for (const repoPath of pickRepoLogoPaths(files, manifests, 4)) {
      const bytes = await raw(repoPath, MAX_LOGO_BYTES);
      const mime = bytes && isUsableLogo(bytes);
      if (bytes && mime) return { dataUri: toDataUri(bytes, mime), sourceUrl: `https://github.com/${p.owner}/${p.repoName}/blob/HEAD/${repoPath}` };
    }
  }

  // Last resort: the homepage the repository's owner declared on GitHub.
  const meta = await get('', 'application/vnd.github+json', 200_000);
  if (meta) {
    try {
      const homepage = (JSON.parse(new TextDecoder().decode(meta)) as { homepage?: unknown }).homepage;
      const site = typeof homepage === 'string' ? resolveHttps(homepage, 'https://github.com/') : null;
      if (site) return await discoverSiteLogo(site, siteDeps);
    } catch { /* homepage unreadable */ }
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
      if (entry?.v === RULES_VERSION && entry.dataUri && entry.source !== 'none') out[p.id] = { src: entry.dataUri, source: entry.source };
    }
    return out;
  }

  /**
   * The program's own repository is the source of truth for its logo. A site is consulted only when the owner supplied it
   * themselves (a program added by hand): the seeded production URLs are unverified and may belong to someone else.
   */
  async function discover(p: PlatformRecord): Promise<{ found: FoundLogo | null; source: Entry['source'] }> {
    if (p.runtimeMode !== 'non-github-web') {
      const found = await repositoryLogo(p, options.githubToken()).catch(() => null);
      if (found) return { found, source: found.sourceUrl.startsWith('https://github.com/') ? 'github' : 'site' };
    }
    if (p.isCustomAdded && p.productionUrl) {
      const found = await discoverSiteLogo(p.productionUrl, siteDeps).catch(() => null);
      if (found) return { found, source: 'site' };
    }
    return { found: null, source: 'none' };
  }

  const due = (p: PlatformRecord, force: boolean, now: number) => {
    const entry = entries.get(p.id);
    if (force || !entry || entry.v !== RULES_VERSION) return true;
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
          ? { dataUri: result.found.dataUri, source: result.source, sourceUrl: result.found.sourceUrl, fetchedAt: Date.now(), attemptedAt: Date.now(), v: RULES_VERSION }
          // A failed refresh never erases a logo we already have.
          : { dataUri: previous?.v === RULES_VERSION ? previous.dataUri : null, source: previous?.v === RULES_VERSION && previous.dataUri ? previous.source : 'none', sourceUrl: previous?.v === RULES_VERSION ? previous.sourceUrl : '', fetchedAt: previous?.v === RULES_VERSION ? previous.fetchedAt : 0, attemptedAt: Date.now(), v: RULES_VERSION });
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
