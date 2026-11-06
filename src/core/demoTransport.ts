/** Demo sandbox id lives in sessionStorage (per tab) and travels in a header: Firebase Hosting strips cookies except __session. */
export const ORBIT_DEMO_HEADER = 'x-orbit-demo';
const KEY = 'orbit.demo.session';
const PATTERN = /^demo_[0-9a-f]{64}$/;

export function readDemoId(): string {
  try {
    const v = String(window.sessionStorage.getItem(KEY) || '').trim();
    return PATTERN.test(v) ? v : '';
  } catch { return ''; }
}
export function rememberDemoId(id: unknown): boolean {
  const v = String(id || '').trim();
  if (!PATTERN.test(v)) return false;
  try { window.sessionStorage.setItem(KEY, v); return true; } catch { return false; }
}
export function forgetDemoId(): void {
  try { window.sessionStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}
