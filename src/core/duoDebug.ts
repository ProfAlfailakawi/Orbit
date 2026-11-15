// iPhone Duo diagnostics: open the site with ?duo-debug=1. Loaded only when that parameter is present (see main.tsx).
// Draws the reserved widget zone as a translucent red frame (pointer-events: none) and a small panel with the numbers a bug report needs.
// The panel sits bottom-left, outside the zone. Nothing here touches the page's layout, data or sign-in.

function probe(side: 'top' | 'right' | 'bottom' | 'left'): string {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;visibility:hidden;pointer-events:none;padding-${side}:env(safe-area-inset-${side}, 0px)`;
  document.body.appendChild(el);
  const value = getComputedStyle(el).getPropertyValue(`padding-${side}`) || '0px';
  el.remove();
  return value;
}

export function mountDuoDebug(): void {
  const root = document.documentElement;
  // Live calibration on the device: ?duo-debug=1&duo-w=110&duo-h=270 overrides the zone (only while duo-debug is on).
  const params = new URLSearchParams(window.location.search);
  const ow = Number(params.get('duo-w')), oh = Number(params.get('duo-h'));
  if (ow > 0) root.style.setProperty('--duo-widget-w', `${ow}px`);
  if (oh > 0) root.style.setProperty('--duo-widget-h', `${oh}px`);
  const frame = document.createElement('div');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;top:0;right:0;pointer-events:none;z-index:2147483646;box-sizing:border-box;border:2px solid rgba(255,0,0,.9);background:rgba(255,0,0,.12)';
  const panel = document.createElement('pre');
  panel.style.cssText = 'position:fixed;left:6px;bottom:6px;margin:0;max-width:calc(100vw - 100px);padding:8px 10px;border-radius:10px;background:rgba(0,0,0,.82);color:#fff;font:11px/1.45 ui-monospace,Menlo,monospace;white-space:pre-wrap;pointer-events:none;z-index:2147483647;direction:ltr;text-align:left';
  document.body.append(frame, panel);

  const render = () => {
    const cs = getComputedStyle(root);
    const v = (name: string) => cs.getPropertyValue(name).trim();
    const w = v('--duo-widget-w') || '0px';
    const h = v('--duo-widget-h') || '0px';
    frame.style.width = w;
    frame.style.height = h;
    const vv = window.visualViewport;
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
    const standalone = Boolean((navigator as unknown as { standalone?: boolean }).standalone) || window.matchMedia('(display-mode: standalone)').matches;
    const px = (s: string) => parseFloat(s) || 0;
    panel.textContent = [
      `zone active: ${px(w) > 0 ? 'YES' : 'no'}   (${w} x ${getComputedStyle(frame).height})`,
      `--duo-widget-w ${w}  gap ${v('--duo-widget-gap')}  h ${v('--duo-widget-h')}`,
      `--duo-col ${v('--duo-col')}  reserve-r ${v('--duo-reserve-r')}  extra ${v('--duo-extra')}`,
      `safe-area t/r/b/l: ${probe('top')} / ${probe('right')} / ${probe('bottom')} / ${probe('left')}`,
      `inner ${window.innerWidth}x${window.innerHeight}  visualViewport ${vv ? `${Math.round(vv.width)}x${Math.round(vv.height)}@${vv.scale}` : 'n/a'}`,
      `dir ${document.dir || root.dir || getComputedStyle(document.body).direction}  orientation ${window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape'}`,
      `Capacitor: ${cap?.isNativePlatform?.() ? `native ${cap.getPlatform?.() ?? '?'}` : cap ? 'present, not native' : 'absent (browser)'}`,
      `UA has "Safari/": ${/Safari\//.test(navigator.userAgent)}  (app WKWebView: false)  standalone ${standalone}`,
      `UA: ${navigator.userAgent.slice(0, 110)}`,
      `override duo-w=${params.get('duo-w') ?? '-'} duo-h=${params.get('duo-h') ?? '-'}  (send a screenshot with the frame; adjust duo-w/duo-h until the red frame covers the capsule)`,
      `segments h/v: ${window.matchMedia('(horizontal-viewport-segments: 2)').matches}/${window.matchMedia('(vertical-viewport-segments: 2)').matches}`,
    ].join('\n');
  };
  render();
  window.addEventListener('resize', render);
  window.visualViewport?.addEventListener('resize', render);
}
