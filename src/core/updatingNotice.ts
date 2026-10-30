/**
 * «أوربت يتلقّى تحديثاً» داخل التطبيق.
 *
 * أثناء النشر تجيب واجهةُ Google الأمامية طلباتِ /api بصفحة HTML إنجليزية
 * (500/502/503/504) لا يكتبها خادمُنا. هنا يُعرف ذلك الجواب، ويظهر شريطٌ واحد
 * بهيئة لافتات أوربت أسفل الصفحة بدل الخطأ، ويُسأل /api/version حتى يعود الخادم فيختفي
 * ويُطلق SERVER_BACK_EVENT.
 */

const UPDATING_STATUSES = new Set([500, 502, 503, 504]);

export const UPDATING_MESSAGE = 'أوربت يتلقّى تحديثاً، ويعود الاتصال وحده بعد قليل.';
/** Fired on window when the server answers again. */
export const SERVER_BACK_EVENT = 'orbit:server-back';
export const HEALTH_PATH = '/api/version';

/** The platform's answer, not ours: a 5xx whose body is not JSON. */
export const isPlatformUpdating = (status: number, contentType: string | null | undefined) =>
  UPDATING_STATUSES.has(status) && !String(contentType || '').includes('application/json');

/** Backoff between health checks: 3 s, then slowly up to 15 s. */
export const nextDelay = (tries: number) => Math.min(15_000, Math.round(3000 * Math.pow(1.3, Math.max(0, tries - 5))));

let notice: HTMLElement | null = null;

/** Shows the bar once however many requests fail, and hides it when `probe` answers. */
export function showUpdatingNotice(probe: () => Promise<boolean>): void {
  if (notice || typeof document === 'undefined' || !document.body) return;
  // Shaped like Orbit's own .banner (card, small corner, start-aligned) with the hero's pulse dot.
  const bar = document.createElement('div');
  bar.className = 'orbit-updating-notice';
  bar.setAttribute('role', 'status');
  bar.setAttribute('aria-live', 'polite');
  bar.dir = 'rtl';
  bar.style.cssText = [
    'position:fixed', 'inset-inline:0', 'bottom:max(16px,env(safe-area-inset-bottom))', 'margin:0 auto', 'width:min(1080px,calc(100vw - 32px))',
    'z-index:2147483000', 'display:flex', 'align-items:center', 'gap:10px', 'padding:10px 16px', 'border-radius:var(--r-sm,12px)',
    'font-family:inherit', 'font-size:.9rem', 'line-height:1.6', 'text-align:start',
    'background:var(--card,#fff)', 'color:var(--ink,#10162f)', 'border:1px solid var(--line,#dfe3f1)',
    'box-shadow:var(--shadow,0 10px 28px -14px rgba(63,70,224,.22))', 'pointer-events:none',
  ].join(';');
  const dot = document.createElement('span');
  dot.setAttribute('aria-hidden', 'true');
  dot.style.cssText = 'flex:none;width:8px;height:8px;border-radius:50%;background:var(--ok-edge,#0d8d52);box-shadow:0 0 0 3px var(--ok-bg,#e9f8f0)';
  const text = document.createElement('span');
  text.textContent = UPDATING_MESSAGE;
  bar.append(dot, text);
  document.body.appendChild(bar);
  notice = bar;
  let tries = 0;
  const ask = async () => {
    const back = await probe().catch(() => false);
    if (!back) { tries++; window.setTimeout(ask, nextDelay(tries)); return; }
    bar.remove();
    notice = null;
    window.dispatchEvent(new Event(SERVER_BACK_EVENT));
  };
  window.setTimeout(ask, 3000);
}
