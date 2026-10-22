/** Server side of site discovery: finds each program's real public website from its repository and remembers it. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import type { Firestore } from 'firebase-admin/firestore';
import { chooseLiveSite, deployWorkflowPaths, extractSiteCandidates, SITE_FILE_PATHS, toOrigin, type RepoTexts } from './siteDiscovery.ts';
import { openRepo } from './repoReader.ts';
import { safeGet } from './safeFetch.ts';
import { confirmedSite } from './ownerSites.ts';
import type { PlatformRecord } from './types.ts';

/** Bump when discovery rules change: older answers are then ignored and looked up again. */
const RULES_VERSION = 1;
interface Entry { url: string | null; source: string; foundAt: number; attemptedAt: number; v: number }

const DAY = 24 * 60 * 60_000;
const REVERIFY_AFTER = 7 * DAY;
const RETRY_AFTER = 6 * 60 * 60_000;
const BUDGET_MS = 24_000;
const MAX_PER_RUN = 5;

async function isLive(url: string): Promise<boolean> {
  const response = await safeGet(url, { maxBytes: 300_000, accept: 'text/html,*/*;q=0.5', acceptStatus: () => true });
  return Boolean(response && response.status >= 200 && response.status < 400);
}

export function createSiteService(options: {
  firestore: Firestore | null; snapshotPath: string; getPlatforms: () => PlatformRecord[]; githubToken: () => string | undefined;
}) {
  const entries = new Map<string, Entry>();
  let running: Promise<{ checked: number; found: number; remaining: number }> | null = null;
  const docFor = (id: string) => options.firestore?.collection('orbitSites').doc(crypto.createHash('sha1').update(id).digest('hex'));

  async function load() {
    try {
      if (options.firestore) {
        for (const doc of (await options.firestore.collection('orbitSites').get()).docs) {
          const data = doc.data() as Entry & { id?: string };
          if (data.id) entries.set(data.id, data);
        }
      } else if (fs.existsSync(options.snapshotPath)) {
        for (const [id, entry] of Object.entries(JSON.parse(fs.readFileSync(options.snapshotPath, 'utf8')) as Record<string, Entry>)) entries.set(id, entry);
      }
    } catch (error) {
      console.warn('ORBIT site store unavailable:', error instanceof Error ? error.message : 'unknown');
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
      console.warn('ORBIT site persistence failed:', error instanceof Error ? error.message : 'unknown');
    }
  }

  /** The address ORBIT should visit: the discovered site, or what the owner typed for a program added by hand. */
  function url(p: PlatformRecord): string | null {
    const confirmed = confirmedSite(p.codeName);
    if (confirmed) return confirmed;
    const entry = entries.get(p.id);
    if (entry?.v === RULES_VERSION && entry.url) return entry.url;
    return p.isCustomAdded && p.productionUrl ? toOrigin(p.productionUrl) : null;
  }

  function list(): Record<string, { url: string; source: string }> {
    const out: Record<string, { url: string; source: string }> = {};
    for (const p of options.getPlatforms()) {
      const entry = entries.get(p.id);
      const confirmed = confirmedSite(p.codeName);
      if (confirmed) out[p.id] = { url: confirmed, source: 'confirmed by owner' };
      else if (entry?.v === RULES_VERSION && entry.url) out[p.id] = { url: entry.url, source: entry.source };
    }
    return out;
  }

  async function discover(p: PlatformRecord): Promise<{ url: string; source: string } | null> {
    if (p.runtimeMode === 'local-only' || p.runtimeMode === 'github-local') return null;
    const confirmed = confirmedSite(p.codeName);
    if (confirmed) return { url: confirmed, source: 'confirmed by owner' };
    if (p.runtimeMode === 'non-github-web') {
      const typed = p.productionUrl ? toOrigin(p.productionUrl) : null;
      return typed && await isLive(typed) ? { url: typed, source: 'typed by owner' } : null;
    }
    const repo = await openRepo(p, options.githubToken(), 20);
    const paths = new Set(repo.files.map(f => f.path));
    const texts: RepoTexts = {};
    for (const path of [...SITE_FILE_PATHS, ...deployWorkflowPaths([...paths])]) {
      if (!paths.has(path)) continue;
      const bytes = await repo.read(path, 200_000);
      if (bytes) texts[path] = new TextDecoder().decode(bytes);
    }
    const meta = await repo.meta();
    const candidates = extractSiteCandidates(texts, meta?.homepage);
    if (p.isCustomAdded && p.productionUrl) {
      const typed = toOrigin(p.productionUrl);
      if (typed && !candidates.some(c => c.url === typed)) candidates.unshift({ url: typed, score: 200, sources: ['typed by owner'] });
    }
    const chosen = await chooseLiveSite(candidates, isLive);
    return chosen ? { url: chosen.url, source: chosen.sources[0] } : null;
  }

  const due = (p: PlatformRecord, force: boolean, now: number) => {
    const entry = entries.get(p.id);
    if (force || !entry || entry.v !== RULES_VERSION) return true;
    if (entry.url) return now - entry.foundAt > REVERIFY_AFTER;
    return now - entry.attemptedAt > RETRY_AFTER;
  };

  /** One program (forced), or every program with no site yet or an old answer. Bounded in time and count. */
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
        const result = await discover(p).catch(() => null);
        const previous = entries.get(p.id);
        entries.set(p.id, result
          ? { url: result.url, source: result.source, foundAt: Date.now(), attemptedAt: Date.now(), v: RULES_VERSION }
          // A failed lookup never erases an address we already verified.
          : { url: previous?.v === RULES_VERSION ? previous.url : null, source: previous?.source ?? 'none', foundAt: previous?.foundAt ?? 0, attemptedAt: Date.now(), v: RULES_VERSION });
        if (result) found += 1;
        await persist(p.id);
      }
      return { checked: targets.length, found, remaining: Math.max(0, wanted.length - targets.length) };
    })().finally(() => { running = null; });
    return running;
  }

  return { load, url, list, refresh };
}
