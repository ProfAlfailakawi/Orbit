/**
 * What a real browser saw on one page, judged the way a careful visitor would: pure functions over a plain snapshot,
 * so the robot script only collects facts and every judgement here is unit-tested.
 */

export type Device = 'desktop' | 'phone' | 'phone-slow';

export interface PageSnapshot {
  lang: string;
  /** Computed text direction of the page body. */
  direction: string;
  /** Visible text of the page (capped by the collector). */
  text: string;
  /** The page scrolls sideways. */
  overflowX: boolean;
  images: number;
  brokenImages: number;
  /** Buttons, links and fields with no name a screen reader could read. */
  unnamedControls: number;
  /** Tap targets smaller than 24×24 px. */
  smallTargets: number;
  consoleErrors: string[];
  loadMs: number;
}

export interface Audit { problems: string[]; warnings: string[] }

const DEVICE_TAG: Record<Device, string> = { desktop: '', phone: '[جوال] ', 'phone-slow': '[جوال بطيء] ' };

const PLACEHOLDER = /lorem ipsum|لوريم إيبسوم|\bTODO\b|\bTBD\b|اكتب النص هنا|نص تجريبي|عنوان تجريبي|your text here|placeholder text/i;
const BROKEN_TOKEN = /(^|[\s:|•(])(undefined|NaN|\[object Object\])($|[\s.,:|•)])/;
const ARABIC = /[؀-ۿ]/g;
const LONG_ENGLISH = /\b[A-Za-z]{2,}(?:[ \t]+[A-Za-z'’]+){5,}/;

const short = (text: string, n = 90) => text.replace(/\s+/g, ' ').trim().slice(0, n);

export function auditSnapshot(s: PageSnapshot, device: Device = 'desktop'): Audit {
  const tag = DEVICE_TAG[device];
  const problems: string[] = [];
  const warnings: string[] = [];
  const text = s.text || '';

  const placeholder = text.match(PLACEHOLDER);
  if (placeholder) problems.push(`${tag}نص مؤقت منسي ظاهر في الصفحة («${short(placeholder[0], 30)}»)`);
  const broken = text.match(BROKEN_TOKEN);
  if (broken) problems.push(`${tag}ظهر نص برمجي «${broken[2]}» للزائر بدل قيمة حقيقية`);
  if (s.brokenImages > 0) problems.push(`${tag}${s.brokenImages} من ${s.images} صور لا تُحمَّل`);
  if (s.consoleErrors.length) problems.push(`${tag}أخطاء في المتصفح: ${short(s.consoleErrors[0], 110)}${s.consoleErrors.length > 1 ? ` (+${s.consoleErrors.length - 1})` : ''}`);
  if (device !== 'desktop' && s.overflowX) problems.push(`${tag}الصفحة أعرض من شاشة الجوال، فيضطر الزائر للتمرير جانبيًا`);
  if (device === 'phone-slow' && s.loadMs > 10_000) problems.push(`${tag}الصفحة تحتاج ${Math.round(s.loadMs / 1000)} ثانية للتحميل على اتصال ضعيف`);
  else if (device === 'desktop' && s.loadMs > 8000) problems.push(`الصفحة بطيئة: ${Math.round(s.loadMs / 1000)} ثانية للتحميل`);

  const arabicLetters = (text.match(ARABIC) || []).length;
  const arabicPage = arabicLetters > 40 || /^ar/i.test(s.lang);
  if (arabicPage && arabicLetters > 40 && LONG_ENGLISH.test(text)) warnings.push(`${tag}جملة إنجليزية طويلة داخل صفحة عربية (ترجمة ناقصة؟)`);
  if (arabicLetters > 40 && arabicLetters / Math.max(text.length, 1) > 0.3 && s.direction === 'ltr') problems.push(`${tag}الصفحة عربية لكن اتجاهها من اليسار لليمين، فيظهر النص مقلوبًا`);
  if (!s.lang) warnings.push(`${tag}لغة الصفحة (lang) غير محددة، وهذا يربك قارئات الشاشة ومحركات البحث`);
  if (s.unnamedControls > 0) warnings.push(`${tag}${s.unnamedControls} أزرار أو حقول بلا اسم يقرؤه قارئ الشاشة`);
  if (device !== 'desktop' && s.smallTargets >= 3) warnings.push(`${tag}${s.smallTargets} عناصر ضغط أصغر من أن تُلمس بسهولة على الجوال`);
  return { problems, warnings };
}

/** Missing hardening headers on the home page: hygiene, so only ever a warning. */
export function auditHeaders(headers: Record<string, string>): string[] {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const out: string[] = [];
  if (!h['strict-transport-security']) out.push('الموقع لا يرسل Strict-Transport-Security (لا يُجبر المتصفح على HTTPS)');
  if (!/nosniff/i.test(h['x-content-type-options'] || '')) out.push('الموقع لا يرسل X-Content-Type-Options: nosniff');
  if (!h['x-frame-options'] && !/frame-ancestors/i.test(h['content-security-policy'] || '')) out.push('الموقع يمكن تضمينه داخل صفحات غريبة (لا X-Frame-Options ولا frame-ancestors)');
  return out;
}

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/ghp_[A-Za-z0-9]{36}/, 'مفتاح GitHub شخصي'],
  [/github_pat_[A-Za-z0-9_]{50,}/, 'مفتاح GitHub شخصي'],
  [/sk-ant-[A-Za-z0-9_-]{20,}/, 'مفتاح Anthropic'],
  [/AKIA[0-9A-Z]{16}/, 'مفتاح AWS'],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/, 'مفتاح Slack'],
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'مفتاح خاص (private key)'],
  [/"private_key_id"\s*:\s*"[0-9a-f]{20,}"/, 'ملف حساب خدمة Google (service account)'],
];

/** Secrets that must never be served to browsers. Reports what kind and where, never the value itself. */
export function scanForSecrets(content: string, fileName: string): string[] {
  const found = new Set<string>();
  for (const [pattern, label] of SECRET_PATTERNS) if (pattern.test(content)) found.add(label);
  return [...found].map(label => `${label} ظاهر داخل الملف ${short(fileName, 40)} المُرسل للزوّار، أزله وبدّل المفتاح فورًا`);
}

/** Same-origin pages worth crawling after the home page: real navigation targets, nothing that logs out or deletes. */
export function crawlTargets(links: string[], pageUrl: string, limit = 5): string[] {
  const home = new URL(pageUrl);
  const seen = new Set<string>([home.origin + home.pathname.replace(/\/+$/, '')]);
  const out: string[] = [];
  for (const href of links) {
    let url: URL;
    try { url = new URL(href, pageUrl); } catch { continue; }
    if (url.origin !== home.origin) continue;
    if (/\.(pdf|zip|png|jpe?g|gif|svg|webp|mp4|mp3|xml|json|txt|docx?|xlsx?)$/i.test(url.pathname)) continue;
    if (/logout|signout|sign-out|log-out|delete|remove|unsubscribe|خروج|حذف|api\//i.test(decodeURIComponent(url.pathname + url.search))) continue;
    const key = url.origin + url.pathname.replace(/\/+$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url.origin + url.pathname);
    if (out.length >= limit) break;
  }
  return out;
}

/** 64-bit average hash of an 8×8 grayscale thumbnail, as 16 hex digits. */
export function averageHash(gray: number[]): string {
  if (gray.length !== 64) throw new Error('expected 64 samples');
  const mean = gray.reduce((a, b) => a + b, 0) / 64;
  let out = '';
  for (let i = 0; i < 64; i += 4) out += gray.slice(i, i + 4).reduce((n, v) => n * 2 + (v >= mean ? 1 : 0), 0).toString(16);
  return out;
}

export function hashDistance(a: string, b: string): number {
  if (!/^[0-9a-f]{16}$/.test(a) || !/^[0-9a-f]{16}$/.test(b)) return 0;
  let bits = 0;
  for (let i = 0; i < 16; i++) { let x = parseInt(a[i], 16) ^ parseInt(b[i], 16); while (x) { bits += x & 1; x >>= 1; } }
  return bits;
}

export const VISUAL_CHANGE_BITS = 20;
