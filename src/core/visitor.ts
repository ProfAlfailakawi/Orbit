/**
 * The light visitor: opens a program's public page like a browser would fetch it and checks that it is actually usable —
 * the page answers, it is HTML (not an error page), and the app files it references load as scripts/styles
 * (a broken deploy often serves the page but not its files, or answers every file with the page itself).
 */

export interface VisitDeps {
  get(url: string, opts: { maxBytes: number; method?: 'GET' | 'HEAD'; accept?: string }): Promise<{ status: number; bytes: Uint8Array; contentType: string; finalUrl: string; ms: number } | null>;
  /** Pause between a failed attempt and its one retry; tests pass an instant one. */
  wait?(ms: number): Promise<void>;
}

type Reply = Awaited<ReturnType<VisitDeps['get']>>;
const RETRY_PAUSE_MS = 2000;
/** One visit may spend this many retries in total, so a really broken site is judged quickly. */
const RETRIES_PER_VISIT = 2;

/**
 * A single failed request is often the network, not the site (a slow answer, a dropped connection, an edge node mid-update).
 * An unanswered request or a 5xx is asked once more before it counts; a 4xx is an answer and is never retried.
 */
async function getOnce(deps: VisitDeps, budget: { left: number }, url: string, opts: Parameters<VisitDeps['get']>[1]): Promise<Reply> {
  const first = await deps.get(url, opts);
  if (first && first.status < 500) return first;
  if (budget.left <= 0) return first;
  budget.left -= 1;
  await (deps.wait ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))))(RETRY_PAUSE_MS);
  return (await deps.get(url, opts)) ?? first;
}

export interface VisitResult {
  reachable: boolean;
  ok: boolean;
  status: number | null;
  problems: string[];
  evidence: string;
  ms: number;
  /** True when a request was repeated: the time then includes the pause and the extra attempt, so it says nothing about the site's speed. */
  retried?: boolean;
  /** Size of the home page HTML: a sudden jump usually means a different deploy. */
  htmlBytes?: number;
}

const ERROR_PAGE = /(application error|502 bad gateway|503 service (temporarily )?unavailable|service unavailable|error 404 \(not found\)|site not found|the page you requested|this site can[’']?t be reached|cloudflare[^<]{0,40}error \d{3}|something went wrong on the server|internal server error)/i;

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** Same-origin script / stylesheet / modulepreload URLs in the page, in document order, de-duplicated. */
export function pageAssets(html: string, pageUrl: string, limit = 6): Array<{ url: string; kind: 'script' | 'style' }> {
  const out: Array<{ url: string; kind: 'script' | 'style' }> = [];
  const origin = new URL(pageUrl).origin;
  const seen = new Set<string>();
  const push = (href: string | undefined, kind: 'script' | 'style') => {
    if (!href) return;
    try {
      const url = new URL(href, pageUrl);
      if (url.origin !== origin || url.protocol !== 'https:') return;
      url.hash = '';
      const key = url.toString();
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ url: key, kind });
    } catch { /* not a URL */ }
  };
  for (const tag of html.match(/<(script|link)\b[^>]*>/gi) || []) {
    const attr = (name: string) => tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i'))?.slice(1).find(Boolean);
    if (/^<script/i.test(tag)) push(attr('src'), 'script');
    else {
      const rel = (attr('rel') || '').toLowerCase();
      if (/\bstylesheet\b/.test(rel)) push(attr('href'), 'style');
      else if (/\bmodulepreload\b/.test(rel)) push(attr('href'), 'script');
    }
  }
  return out.slice(0, limit);
}

const fileName = (url: string) => decodeURIComponent(new URL(url).pathname.split('/').pop() || url).slice(0, 48);
const isScript = (type: string) => /javascript|ecmascript|wasm/i.test(type);
const isStyle = (type: string) => /css/i.test(type);

export async function visitSite(url: string, deps: VisitDeps): Promise<VisitResult> {
  const started = Date.now();
  const budget = { left: RETRIES_PER_VISIT };
  const page = await getOnce(deps, budget, url, { maxBytes: 1_500_000, accept: 'text/html,*/*;q=0.5' });
  if (!page) return { reachable: false, ok: false, status: null, problems: ['الموقع لا يستجيب'], evidence: 'تعذر فتح الصفحة الرئيسية.', ms: Date.now() - started, retried: budget.left < RETRIES_PER_VISIT };
  const problems: string[] = [];
  const status = page.status;
  if (status >= 500) problems.push(`الموقع يعيد خطأ في الخادم (HTTP ${status})`);
  else if (status === 404) problems.push('الصفحة الرئيسية غير موجودة (404)');
  else if (status >= 400 && status !== 401 && status !== 403) problems.push(`الصفحة الرئيسية ترجع خطأ (HTTP ${status})`);
  const reachable = status < 500 && status !== 404;
  if (problems.length) return { reachable, ok: false, status, problems, evidence: `الصفحة الرئيسية HTTP ${status}.`, ms: Date.now() - started, retried: budget.left < RETRIES_PER_VISIT };

  const html = text(page.bytes);
  if (status < 400) {
    if (!/html/i.test(page.contentType) && !/^\s*<!doctype html|^\s*<html/i.test(html)) problems.push('الصفحة الرئيسية لا تعيد صفحة ويب');
    else if (ERROR_PAGE.test(html.slice(0, 6000)) && html.length < 20_000) problems.push('الصفحة الرئيسية تعرض رسالة خطأ');
    else if (html.length < 200) problems.push('الصفحة الرئيسية فارغة');
  }

  let checked = 0;
  if (!problems.length && status < 400) {
    for (const asset of pageAssets(html, page.finalUrl)) {
      let res = await getOnce(deps, budget, asset.url, { maxBytes: 4_000_000, method: 'HEAD', accept: '*/*' });
      if (res && (res.status === 405 || res.status === 501 || res.status === 403)) res = await getOnce(deps, budget, asset.url, { maxBytes: 4_000_000, accept: '*/*' });
      checked += 1;
      if (!res || res.status >= 400) { problems.push(`ملف التطبيق ${fileName(asset.url)} لا يُحمَّل${res ? ` (HTTP ${res.status})` : ''}`); continue; }
      const wrongType = asset.kind === 'script' ? !isScript(res.contentType) && res.contentType !== '' : !isStyle(res.contentType) && res.contentType !== '';
      if (wrongType && /html/i.test(res.contentType)) problems.push(`ملف التطبيق ${fileName(asset.url)} يعيد صفحة بدل الملف (النشر ناقص)`);
    }
  }
  const evidence = problems.length
    ? problems.join('؛ ')
    : status >= 400 ? `الصفحة محمية (HTTP ${status}) وتستجيب.` : `الصفحة الرئيسية HTTP ${status} (${page.ms}ms)${checked ? `؛ ${checked} ملفات تطبيق سليمة` : ''}.`;
  return { reachable, ok: problems.length === 0, status, problems, evidence, ms: Date.now() - started, htmlBytes: page.bytes.length, retried: budget.left < RETRIES_PER_VISIT };
}
