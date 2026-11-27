import React, { useEffect, useRef, useState } from 'react';
import { forgetPasskeyDevice, loginWithPasskey, passkeyDeviceRemembered, passkeySupported, PasskeyError } from '../core/passkeys';
import { Icon } from './Mark';

/**
 * «الدخول بالبصمة» on the login screen (same behaviour as schedule-kw after its fixes):
 *  - Shown only on a device where a passkey was registered and WebAuthn with a user-verifying authenticator exists.
 *    Otherwise the code form stays exactly as it was; the code login is always the fallback.
 *  - Opens by itself once per tab, after the page is actually visible and settled (450 ms), so it is not refused behind a
 *    hidden screen. Inside the iPhone app the system may refuse it because the page has no focus yet: it is retried quickly
 *    (up to three times) on the first focus or after a short delay.
 *  - A deliberate cancel of the automatic prompt is silent and stops it opening by itself again in this tab; the button stays.
 *    Coming back to the app after a real absence (≥ 1.5 s, the Face ID sheet itself does not count) arms it again, unless it
 *    was cancelled. An explicit sign-out arms it for the next visit (rearmPasskeyAuto).
 *  - It never opens by itself while the owner is typing in the code field (for example the reviewers' demo code).
 */
const AUTO_KEY = 'orbit.passkey.auto-tried';
const SUPPRESS_KEY = 'orbit.passkey.auto-suppressed';
const AUTO_SETTLE_MS = 450;
let ceremonyBusy = false;
const session = {
  get: (key: string) => { try { return sessionStorage.getItem(key) || ''; } catch { return ''; } },
  set: (key: string) => { try { sessionStorage.setItem(key, '1'); } catch { /* unavailable */ } },
  remove: (key: string) => { try { sessionStorage.removeItem(key); } catch { /* unavailable */ } },
};
const autoTried = () => session.get(AUTO_KEY) === '1';
const autoSuppressed = () => session.get(SUPPRESS_KEY) === '1';

/** Explicit sign-out: the next visit to the login screen may open the passkey by itself again. */
export const rearmPasskeyAuto = () => { session.remove(AUTO_KEY); session.remove(SUPPRESS_KEY); };

export default function PasskeyEntry({ onSuccess, holdAuto }: {
  onSuccess: (data: { authenticated?: boolean; sessionToken?: string }) => void;
  /** The owner is typing in the code field: no automatic prompt. */
  holdAuto: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const holdRef = useRef(holdAuto);
  holdRef.current = holdAuto;

  useEffect(() => {
    if (!passkeyDeviceRemembered()) return;
    let alive = true;
    void passkeySupported().then(ok => { if (alive) setReady(ok); });
    return () => { alive = false; };
  }, []);

  const go = async (automatic = false, attempt = 0): Promise<void> => {
    if (ceremonyBusy) return;
    if (automatic && holdRef.current) return;
    ceremonyBusy = true;
    setBusy(true);
    setMessage('');
    try {
      const data = await loginWithPasskey();
      session.remove(SUPPRESS_KEY);
      onSuccess(data);
    } catch (error) {
      const failure = error instanceof PasskeyError ? error : null;
      // The passkey was removed from the list: the button stops promising what cannot happen.
      if (failure?.failure === 'not-registered') { forgetPasskeyDevice(); setReady(false); }
      if (automatic && attempt < 3 && failure?.notFocused) {
        let fired = false;
        const retry = () => { if (fired) return; fired = true; window.removeEventListener('focus', retry); void goRef.current(true, attempt + 1); };
        window.addEventListener('focus', retry);
        window.setTimeout(retry, 500 + attempt * 400);
        return;
      }
      // A deliberate cancel of the automatic prompt: never reopen by itself in this tab (no loop); the button stays.
      if (automatic && failure?.failure === 'cancelled' && !failure.notFocused) session.set(SUPPRESS_KEY);
      if (!(automatic && failure?.failure === 'cancelled')) setMessage(failure?.message || 'تعذّر الدخول بالبصمة. ادخل برمز الدخول.');
    } finally {
      ceremonyBusy = false;
      setBusy(false);
    }
  };
  const goRef = useRef(go);
  goRef.current = go;

  // Back in the app after a real absence: the app and Home Screen web apps keep sessionStorage across closing and reopening.
  const [resumeTick, setResumeTick] = useState(0);
  useEffect(() => {
    let hiddenAt = 0;
    const rearm = () => {
      if (ceremonyBusy || autoSuppressed()) return;
      session.remove(AUTO_KEY);
      setResumeTick(v => v + 1);
    };
    const onVisibility = () => {
      // The Face ID sheet hides the page for a moment: an absence that started during it is not a return.
      if (document.visibilityState === 'hidden') { hiddenAt = ceremonyBusy ? 0 : Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt >= 1500) rearm();
      hiddenAt = 0;
    };
    const onShow = (event: PageTransitionEvent) => { if (event.persisted) rearm(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', onShow);
    return () => { document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('pageshow', onShow); };
  }, []);

  useEffect(() => {
    if (!ready || autoTried() || autoSuppressed()) return;
    session.set(AUTO_KEY);
    let timer = 0;
    let cancelled = false;
    const onVisible = () => { if (document.visibilityState !== 'visible') return; document.removeEventListener('visibilitychange', onVisible); arm(); };
    const arm = () => {
      if (cancelled) return;
      if (document.visibilityState !== 'visible') { document.addEventListener('visibilitychange', onVisible); return; }
      timer = window.setTimeout(() => {
        if (cancelled) return;
        if (document.visibilityState !== 'visible') { arm(); return; }
        void goRef.current(true);
      }, AUTO_SETTLE_MS);
    };
    arm();
    return () => { cancelled = true; window.clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [ready, resumeTick]);

  if (!ready) return null;
  return (
    <div className="passkey-entry">
      <button type="button" className="btn passkey-go" onClick={() => { void go(); }} disabled={busy} aria-busy={busy}>
        <Icon name="key" size={18} />{busy ? 'جارٍ التحقق…' : 'الدخول بالبصمة'}
      </button>
      {message && <p role="alert" className="error">{message}</p>}
    </div>
  );
}
