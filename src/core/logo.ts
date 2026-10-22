/**
 * Logo discovery for monitored programs. Pure parsing and ranking, plus a pipeline that takes its network
 * access as dependencies so it can be tested without the internet (the server injects SSRF-safe fetchers).
 */

export const MAX_LOGO_BYTES = 100_000;
const MIN_PNG_SIDE = 48;

export interface IconCandidate { url: string; score: number; kind: 'apple' | 'icon' | 'manifest' | 'default' }

const attr = (tag: string, name: string): string => {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i'));
  return (match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim();
};

/** https only, no credentials; relative references resolve against the page. */
export function resolveHttps(href: string, base: string): string | null {
  try {
    const url = new URL(href, base);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    url.hash = '';
    return url.toString();
  } catch { return null; }
}

/** Largest side declared by a `sizes` attribute; `any` (scalable) counts as large. */
export function declaredSize(sizes: string): number {
  if (/\bany\b/i.test(sizes)) return 512;
  const sides = [...sizes.matchAll(/(\d+)\s*x\s*(\d+)/gi)].map(m => Math.max(Number(m[1]), Number(m[2])));
  return sides.length ? Math.max(...sides) : 0;
}

const scoreIcon = (kind: IconCandidate['kind'], size: number, svg: boolean, ico: boolean) => {
  const usable = Math.min(size || 0, 256);
  if (svg) return 330;
  if (kind === 'apple') return 300 + usable / 4;
  if (kind === 'manifest') return 250 + usable / 4;
  if (ico) return 60 + usable / 8;
  return 150 + usable / 4;
};

/** Icon `<link>`s of a page, best first, plus the web-app manifest if one is declared. */
export function extractIconCandidates(html: string, pageUrl: string): { icons: IconCandidate[]; manifestUrl: string | null } {
  const icons: IconCandidate[] = [];
  let manifestUrl: string | null = null;
  for (const tag of (html.match(/<link\b[^>]*>/gi) || []).slice(0, 120)) {
    const rel = attr(tag, 'rel').toLowerCase();
    const href = attr(tag, 'href');
    const url = href ? resolveHttps(href, pageUrl) : null;
    if (!url) continue;
    if (/\bmanifest\b/.test(rel)) { manifestUrl = manifestUrl || url; continue; }
    const apple = /apple-touch-icon/.test(rel);
    if (!apple && !/(^|\s)(shortcut\s+)?icon(\s|$)/.test(rel)) continue;
    const type = attr(tag, 'type').toLowerCase();
    const svg = type.includes('svg') || /\.svg(\?|$)/i.test(url);
    const ico = type.includes('icon') || /\.ico(\?|$)/i.test(url);
    const size = declaredSize(attr(tag, 'sizes'));
    icons.push({ url, kind: apple ? 'apple' : 'icon', score: scoreIcon(apple ? 'apple' : 'icon', size, svg, ico) });
  }
  return { icons, manifestUrl };
}

/** Icons of a web-app manifest. Prefers plain icons over `maskable` ones, which carry an extra safe-zone margin. */
export function iconsFromManifest(manifest: unknown, manifestUrl: string): IconCandidate[] {
  const list = (manifest as { icons?: unknown })?.icons;
  if (!Array.isArray(list)) return [];
  const out: IconCandidate[] = [];
  for (const item of list.slice(0, 20)) {
    const entry = item as { src?: unknown; sizes?: unknown; type?: unknown; purpose?: unknown };
    if (typeof entry.src !== 'string') continue;
    const url = resolveHttps(entry.src, manifestUrl);
    if (!url) continue;
    const svg = String(entry.type || '').includes('svg') || /\.svg(\?|$)/i.test(url);
    const maskable = /maskable/i.test(String(entry.purpose || '')) && !/\bany\b/i.test(String(entry.purpose || ''));
    const base = scoreIcon('manifest', declaredSize(String(entry.sizes || '')), svg, false);
    out.push({ url, kind: 'manifest', score: base - (maskable ? 40 : 0) });
  }
  return out;
}

/** Image type from the first bytes, never from a header. Returns null for anything that is not a displayable image. */
export function sniffImageMime(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b.length < 4) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00) return 'image/x-icon';
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  const head = new TextDecoder().decode(b.slice(0, 400)).trimStart().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg')) || (head.startsWith('<!doctype svg'))) return 'image/svg+xml';
  return null;
}

/** PNG width/height from the IHDR chunk, or null. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24 || sniffImageMime(bytes) !== 'image/png') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** A usable logo: a real image, small enough, and not a tiny bitmap that would look blurry in a circle. */
export function isUsableLogo(bytes: Uint8Array): string | null {
  if (bytes.length < 80 || bytes.length > MAX_LOGO_BYTES) return null;
  const mime = sniffImageMime(bytes);
  if (!mime) return null;
  if (mime === 'image/svg+xml') {
    // Rendered only through <img>, where scripts never run; still refuse anything that embeds active content.
    const text = new TextDecoder().decode(bytes).toLowerCase();
    if (/<script|<foreignobject|onload\s*=|javascript:/.test(text)) return null;
  }
  const size = pngSize(bytes);
  if (size && (size.width < MIN_PNG_SIDE || size.height < MIN_PNG_SIDE || Math.abs(size.width - size.height) > size.width * 0.5)) return null;
  return mime;
}

export const toDataUri = (bytes: Uint8Array, mime: string) => `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;

/** True only for globally routable addresses; everything private, loopback, link-local, CGNAT or multicast is refused. */
export function isPublicIp(ip: string): boolean {
  const v4 = ip.match(/^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/i);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if ([a, b, Number(v4[3]), Number(v4[4])].some(n => n > 255)) return false;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 168 || b === 0)) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    return true;
  }
  const v6 = ip.toLowerCase();
  if (!v6.includes(':')) return false;
  if (v6 === '::' || v6 === '::1') return false;
  if (/^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || /^ff/.test(v6)) return false;
  return true;
}

export interface LogoDeps {
  /** Fetch a page or manifest as text, following only safe redirects. */
  fetchText(url: string): Promise<{ text: string; finalUrl: string } | null>;
  /** Fetch image bytes. */
  fetchBytes(url: string): Promise<Uint8Array | null>;
}

export interface FoundLogo { dataUri: string; sourceUrl: string }

/** Try candidates best-first; the first real, sensible image wins. */
export async function pickFirstUsable(candidates: IconCandidate[], deps: LogoDeps, limit = 5): Promise<FoundLogo | null> {
  const seen = new Set<string>();
  for (const candidate of [...candidates].sort((a, b) => b.score - a.score)) {
    if (seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    if (seen.size > limit) break;
    const bytes = await deps.fetchBytes(candidate.url).catch(() => null);
    const mime = bytes && isUsableLogo(bytes);
    if (bytes && mime) return { dataUri: toDataUri(bytes, mime), sourceUrl: candidate.url };
  }
  return null;
}

/** Logo of a live site: declared icons, then the web-app manifest, then the conventional file names. */
export async function discoverSiteLogo(siteUrl: string, deps: LogoDeps): Promise<FoundLogo | null> {
  const origin = resolveHttps('/', siteUrl);
  if (!origin) return null;
  const page = await deps.fetchText(origin).catch(() => null);
  const pageUrl = page?.finalUrl || origin;
  const { icons, manifestUrl } = page ? extractIconCandidates(page.text, pageUrl) : { icons: [], manifestUrl: null };
  const candidates = [...icons];
  const manifest = manifestUrl ? await deps.fetchText(manifestUrl).catch(() => null) : null;
  if (manifest) {
    try { candidates.push(...iconsFromManifest(JSON.parse(manifest.text), manifest.finalUrl)); } catch { /* not JSON */ }
  }
  const root = new URL(pageUrl);
  for (const [path, score] of [['/apple-touch-icon.png', 150], ['/favicon.svg', 140], ['/favicon.ico', 60]] as const) {
    candidates.push({ url: new URL(path, root).toString(), kind: 'default', score });
  }
  return pickFirstUsable(candidates, deps);
}

// ── Logos found inside a program's own repository ─────────────────────────────

export interface RepoFile { path: string; size: number }

const IMAGE_FILE = /\.(svg|png|webp|jpe?g|ico)$/i;
const SKIP_PATH = /(^|\/)(node_modules|docs?|tests?|__tests__|screenshots?|plans|monteur|brand-source|\.github|dist|build|coverage|quran-sources)(\/|$)/i;
const SKIP_NAME = /(maskable|monochrome|mono\b|-mono|splash|(^|[-_])og([-_.]|$)|social|banner|hero|screenshot|favicon-(16|32)|whatsapp|safari-pinned|mstile|sprite|placeholder|avatar)/i;

/** Heuristic ranking of icon-like files, used when a repository has no (usable) web-app manifest. */
export function rankRepoIcons(files: RepoFile[]): string[] {
  const scored: Array<{ path: string; score: number }> = [];
  for (const file of files) {
    if (!IMAGE_FILE.test(file.path) || file.size < 100 || file.size > MAX_LOGO_BYTES || SKIP_PATH.test(file.path)) continue;
    const name = file.path.split('/').pop()!.toLowerCase();
    if (SKIP_NAME.test(name)) continue;
    let score = 0;
    if (/^(app-icon[\w-]*|icon|favicon|[a-z]+-icon)\.svg$/.test(name)) score = 300;
    else if (/icon-(192|256)([-.]|$)/.test(name) && name.endsWith('.png')) score = 290;
    else if (/^apple-touch-icon/.test(name)) score = 270;
    else if (/^logo\.svg$/.test(name)) score = 260;
    else if (/^logo\.png$|logo[-_\w]*\.(png|svg)$/.test(name)) score = 250;
    else if (/^icon\.png$/.test(name)) score = 200;
    else if (/^favicon\.png$/.test(name)) score = 100;
    else if (/^favicon\.ico$/.test(name)) score = 60;
    if (!score) continue;
    const version = name.match(/-v(\d+)/);
    score += (file.path.startsWith('public/') ? 15 : file.path.includes('/') ? -5 : 5) + (version ? Number(version[1]) / 10 : 0);
    scored.push({ path: file.path, score });
  }
  return scored.sort((a, b) => b.score - a.score).map(item => item.path);
}

/** Manifest files worth reading: `public/` first, then the repository root. Case-sensitive, so data manifests are ignored. */
export function findManifestPaths(files: RepoFile[]): string[] {
  const found = files.map(f => f.path).filter(p => /^(public\/)?(manifest\.json|manifest\.webmanifest|site\.webmanifest)$/.test(p));
  return found.sort((a, b) => Number(b.startsWith('public/')) - Number(a.startsWith('public/'))).slice(0, 2);
}

/**
 * The icons the program's owner declared for the installed app, mapped back to files that exist in the repository.
 * Plain icons near 192px come first; maskable-only icons (extra safe-zone margin) and oversized files are skipped.
 */
export function manifestIconRepoPaths(manifestPath: string, manifest: unknown, sizes: Map<string, number>): string[] {
  const icons = (manifest as { icons?: unknown })?.icons;
  if (!Array.isArray(icons)) return [];
  const dir = manifestPath.includes('/') ? manifestPath.slice(0, manifestPath.lastIndexOf('/') + 1) : '';
  const out: Array<{ path: string; score: number }> = [];
  for (const icon of icons.slice(0, 24) as Array<{ src?: unknown; sizes?: unknown; purpose?: unknown; type?: unknown }>) {
    if (typeof icon?.src !== 'string') continue;
    const clean = icon.src.split('?')[0].split('#')[0];
    if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(clean)) continue;
    const relative = clean.replace(/^\/+/, '');
    const attempts = clean.startsWith('/') ? ['public/' + relative, relative, dir + relative] : [dir + relative, 'public/' + relative, relative];
    const path = attempts.find(candidate => sizes.has(candidate));
    if (!path) continue;
    const size = sizes.get(path)!;
    if (size < 100 || size > MAX_LOGO_BYTES) continue;
    const purpose = String(icon.purpose || 'any');
    if (/monochrome/i.test(purpose) || (/maskable/i.test(purpose) && !/\bany\b/i.test(purpose))) continue;
    const svg = /\.svg$/i.test(path) || String(icon.type || '').includes('svg');
    const side = svg ? 192 : declaredSize(String(icon.sizes || '')) || 192;
    out.push({ path, score: 300 - Math.abs(side - 192) / 4 + (svg ? 0 : 5) });
  }
  return out.sort((a, b) => b.score - a.score).map(item => item.path);
}

/** Files to try, best first: the owner's declared app icons, then the general heuristic. */
export function pickRepoLogoPaths(files: RepoFile[], manifests: Array<{ path: string; json: unknown }>, limit = 4): string[] {
  const sizes = new Map(files.map(f => [f.path, f.size] as const));
  const ordered = [...manifests.flatMap(m => manifestIconRepoPaths(m.path, m.json, sizes)), ...rankRepoIcons(files)];
  return [...new Set(ordered)].slice(0, limit);
}
