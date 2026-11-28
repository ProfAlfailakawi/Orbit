import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './app.css';

/* iPhone Duo markers, read only by CSS rules scoped to html[data-device="duo"] (iPhone and iPad never change).
   data-shell: "app" inside the native shell or a home-screen install, else "browser". */
const nav = navigator as Navigator & { standalone?: boolean };
const isApp = Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.())
  || nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
document.documentElement.dataset.shell = isApp ? 'app' : 'browser';
/* data-device="duo": an almost square screen (outer 466x678, inner 669x951; ratio <= 1.48). Every iPhone is >= 1.7, every iPad wider than 700. */
const markDevice = () => {
  const lo = Math.min(screen.width, screen.height), hi = Math.max(screen.width, screen.height);
  document.documentElement.dataset.device = lo >= 440 && lo <= 700 && hi / lo <= 1.48 ? 'duo' : 'other';
};
markDevice();
window.addEventListener('resize', markDevice);
/* data-widget-side: which side iOS reports for the clock column (safe area). Safari reports none. */
const sideProbe = document.createElement('div');
sideProbe.setAttribute('aria-hidden', 'true');
sideProbe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;box-sizing:content-box;padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right)';
document.documentElement.appendChild(sideProbe);
const markWidgetSide = () => {
  const cs = getComputedStyle(sideProbe), l = parseFloat(cs.paddingLeft) || 0, r = parseFloat(cs.paddingRight) || 0;
  document.documentElement.dataset.widgetSide = l > 20 && l > r ? 'left' : r > 20 ? 'right' : 'none';
};
markWidgetSide();
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(markWidgetSide).observe(sideProbe, { box: 'border-box' });
window.addEventListener('resize', () => { requestAnimationFrame(markWidgetSide); window.setTimeout(markWidgetSide, 400); });

createRoot(document.getElementById('root')!).render(<App />);

// Hidden iPhone Duo diagnostics, only when ?duo-debug=1 is in the address (nothing is downloaded otherwise).
if (new URLSearchParams(window.location.search).get('duo-debug') === '1') {
  void import('./core/duoDebug.ts').then(m => m.mountDuoDebug());
}
