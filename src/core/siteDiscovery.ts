/**
 * Finds a program's real public website from evidence in its own repository (hosting config, canonical URL,
 * sitemap, CNAME, homepage). Pure: it ranks candidates; the caller verifies that a candidate is actually live.
 */

export interface SiteCandidate { url: string; score: number; sources: string[] }

/** Texts of the repository files worth reading. Missing files are simply absent. */
export type RepoTexts = Record<string, string>;

export const SITE_FILE_PATHS = [
  'firebase.json', '.firebaserc', 'CNAME', 'public/CNAME', 'package.json', 'index.html', 'public/index.html',
  'public/sitemap.xml', 'public/robots.txt', 'README.md',
] as const;

const PLACEHOLDER = /(^|[.-])(example|your[-_]?|xxxx+|yourdomain|my-?app|test-?site|localhost|placeholder)([.-]|$)|<|>|\$\{|\{\{/i;
const HOSTING_HOST = /\.(web\.app|firebaseapp\.com|run\.app|vercel\.app|netlify\.app|pages\.dev|github\.io)$/i;

/** `https://host` for a public-looking hostname, else null. Keeps only the origin: paths are never evidence. */
export function toOrigin(input: string): string | null {
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(input) ? input : 'https://' + input);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const host = url.hostname.toLowerCase();
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host) || PLACEHOLDER.test(host)) return null;
    if (/\.(local|internal|localhost|test|invalid)$/.test(host)) return null;
    return 'https://' + host;
  } catch { return null; }
}

const parseJson = (text: string | undefined): any => { try { return text ? JSON.parse(text) : null; } catch { return null; } };

export function extractSiteCandidates(texts: RepoTexts, githubHomepage?: string): SiteCandidate[] {
  const found = new Map<string, SiteCandidate>();
  const add = (raw: string | null | undefined, score: number, source: string) => {
    const url = raw ? toOrigin(raw) : null;
    if (!url) return;
    const entry = found.get(url) || { url, score: 0, sources: [] };
    if (!entry.sources.includes(source)) { entry.score += score; entry.sources.push(source); }
    found.set(url, entry);
  };

  // Hosting configuration: the explicit, strongest evidence of where a program is served.
  const rc = parseJson(texts['.firebaserc']);
  const targets: Record<string, string[]> = {};
  for (const project of Object.values(rc?.targets || {}) as Array<{ hosting?: Record<string, string[]> }>) {
    for (const [name, ids] of Object.entries(project?.hosting || {})) if (Array.isArray(ids)) targets[name] = ids;
  }
  const firebase = parseJson(texts['firebase.json']);
  const hosting = firebase?.hosting;
  for (const entry of (Array.isArray(hosting) ? hosting : hosting ? [hosting] : []) as Array<{ site?: string; target?: string }>) {
    if (entry.site) add(`${entry.site}.web.app`, 70, 'firebase.json site');
    if (entry.target) for (const id of targets[entry.target] || [entry.target]) add(`${id}.web.app`, 70, 'firebase.json target');
  }
  for (const ids of Object.values(targets)) for (const id of ids) add(`${id}.web.app`, 40, '.firebaserc target');
  const defaultProject = rc?.projects?.hosting || rc?.projects?.default;
  if (typeof defaultProject === 'string' && !hosting) add(`${defaultProject}.web.app`, 25, '.firebaserc project');

  // What visitors actually use: custom domain, canonical URL, sitemap.
  for (const path of ['CNAME', 'public/CNAME']) {
    const line = (texts[path] || '').split(/\r?\n/).map(l => l.trim()).find(Boolean);
    if (line) add(line, 95, 'CNAME');
  }
  for (const path of ['index.html', 'public/index.html']) {
    const html = texts[path] || '';
    const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0].match(/href=["']([^"']+)["']/i)?.[1]
      || html.match(/<meta[^>]+property=["']og:url["'][^>]*>/i)?.[0].match(/content=["']([^"']+)["']/i)?.[1];
    if (canonical) add(canonical, 85, 'canonical');
  }
  const sitemapLoc = (texts['public/sitemap.xml'] || '').match(/<loc>\s*([^<\s]+)\s*<\/loc>/i)?.[1];
  if (sitemapLoc) add(sitemapLoc, 85, 'sitemap');
  const robotsSitemap = (texts['public/robots.txt'] || '').match(/^\s*Sitemap:\s*(\S+)/im)?.[1];
  if (robotsSitemap) add(robotsSitemap, 85, 'robots.txt');

  const pkg = parseJson(texts['package.json']);
  if (typeof pkg?.homepage === 'string') add(pkg.homepage, 75, 'package.json homepage');
  if (githubHomepage) add(githubHomepage, 75, 'GitHub homepage');

  // Mentions in documentation and workflows add weight to hosting-platform hosts (and to hosts already proposed).
  const counts = new Map<string, number>();
  for (const [path, text] of Object.entries(texts)) {
    if (path !== 'README.md' && !path.startsWith('.github/workflows/')) continue;
    for (const match of text.matchAll(/https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/gi)) {
      const origin = toOrigin(match[0]);
      if (origin) counts.set(origin, (counts.get(origin) || 0) + 1);
    }
  }
  for (const [origin, count] of counts) {
    if (found.has(origin) || HOSTING_HOST.test(new URL(origin).hostname)) add(origin, 12 + Math.min(count, 5) * 4, 'mentioned in docs');
  }

  return [...found.values()].sort((a, b) => b.score - a.score);
}

/** First candidate (best first, at most `limit` tried) that the verifier confirms live. */
export async function chooseLiveSite(candidates: SiteCandidate[], isLive: (url: string) => Promise<boolean>, limit = 6): Promise<SiteCandidate | null> {
  for (const candidate of candidates.slice(0, limit)) {
    if (await isLive(candidate.url).catch(() => false)) return candidate;
  }
  return null;
}

/** Workflow files that deploy: their text names the hosting targets and live URLs. */
export const deployWorkflowPaths = (paths: string[]) =>
  paths.filter(p => /^\.github\/workflows\/[^/]*(deploy|release|hosting|publish)[^/]*\.ya?ml$/i.test(p)).slice(0, 2);
