/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, clearOrbitSessionToken, setOrbitSessionToken } from './core/api';
import { forgetDemoId, readDemoId, rememberDemoId } from './core/demoTransport';
import { SERVER_BACK_EVENT } from './core/updatingNotice';
import type { IncidentCaseFile, PlatformLifecycleState, PlatformRecord, RadarEvent } from './core/types';
import { buildRows, minutesPhrase, sharedLinkReason, summarize, watchHealth } from './core/fleetStatus';
import { tokenNotice } from './core/expiry';
import { Dashboard, type Explanation, type Logos } from './components/Dashboard';
import { Icon, LoginArt, Mark } from './components/Mark';
import { disablePush, enablePush, readPushState, type PushState } from './core/pushClient';

const ORBIT_BUILD_ID = import.meta.env.VITE_ORBIT_BUILD_ID || 'development';

function useOnline() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  return online;
}

export default function App() {
  const online = useOnline();
  const [isLocked, setIsLocked] = useState(true);
  const [passkeyInput, setPasskeyInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [platforms, setPlatforms] = useState<PlatformRecord[]>([]);
  const [events, setEvents] = useState<RadarEvent[]>([]);
  const [incidents, setIncidents] = useState<IncidentCaseFile[]>([]);
  const [githubTokenConfigured, setGithubTokenConfigured] = useState<boolean | undefined>(undefined);
  const [tokenExpiresAt, setTokenExpiresAt] = useState<string | null>(null);
  const [syncBanner, setSyncBanner] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [logos, setLogos] = useState<Logos>({});
  const [isDemo, setIsDemo] = useState(() => Boolean(readDemoId()));
  const [demoAvailable, setDemoAvailable] = useState(false);
  const [pushState, setPushState] = useState<PushState>('unsupported');
  const autoSyncedRef = useRef(false);
  const logosAskedRef = useRef(false);
  const bannerTimer = useRef<number | undefined>(undefined);

  const showBanner = (message: string) => {
    setSyncBanner(message);
    window.clearTimeout(bannerTimer.current);
    bannerTimer.current = window.setTimeout(() => setSyncBanner(null), 8000);
  };

  // Keep already-open tabs current after a production deployment. Compare the page's
  // baked build id with a no-cache server beacon; defer navigation while a dialog,
  // form field, or busy task is in progress.
  useEffect(() => {
    if (!import.meta.env.PROD || !ORBIT_BUILD_ID || ORBIT_BUILD_ID === 'development') return;

    let stopped = false;
    const retryKey = 'orbit.release.reload-attempt';
    const isBusy = () => {
      if (document.querySelector('dialog[open],[role="dialog"],[aria-busy="true"]')) return true;
      const active = document.activeElement;
      return active instanceof HTMLElement && active.matches(
        'input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]),textarea,select,[contenteditable="true"]',
      );
    };

    const checkRelease = async () => {
      if (stopped || document.visibilityState === 'hidden') return;
      try {
        const response = await fetch('/api/version', { cache: 'no-store', credentials: 'same-origin' });
        if (!response.ok) return;
        const release = await response.json() as { build?: string };
        if (!release.build || release.build === ORBIT_BUILD_ID) {
          window.sessionStorage.removeItem(retryKey);
          return;
        }
        if (isBusy()) return;

        // Backend and Hosting deploy separately. A short cooldown prevents a
        // reload loop if a tab sees the new API just before the new UI lands.
        const previous = window.sessionStorage.getItem(retryKey) || '';
        const [previousBuild, previousAt] = previous.split('|');
        if (previousBuild === release.build && Date.now() - Number(previousAt) < 60_000) return;
        window.sessionStorage.setItem(retryKey, `${release.build}|${Date.now()}`);
        window.location.reload();
      } catch {
        // Offline or temporarily unavailable: the next visibility/interval check retries.
      }
    };

    const onVisible = () => { if (document.visibilityState === 'visible') void checkRelease(); };
    // The server came back from a deploy: this tab may now be the old build.
    const onServerBack = () => { void checkRelease(); };
    const interval = window.setInterval(() => { void checkRelease(); }, 120_000);
    window.addEventListener(SERVER_BACK_EVENT, onServerBack);
    window.addEventListener('pageshow', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    void checkRelease();
    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.removeEventListener(SERVER_BACK_EVENT, onServerBack);
      window.removeEventListener('pageshow', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const fetchServerState = async () => {
    try {
      const res = await apiFetch('/api/state');
      if (!res.ok) return;
      const data = await res.json();
      setPlatforms(data.platforms);
      setEvents(data.events);
      setIncidents(data.incidents);
      if (typeof data.hasGithubTokenConfigured === 'boolean') setGithubTokenConfigured(data.hasGithubTokenConfigured);
      setTokenExpiresAt(typeof data.githubTokenExpiresAt === 'string' ? data.githubTokenExpiresAt : null);
      return data as { platforms: PlatformRecord[] };
    } catch {
      // Offline: keep the last state on screen.
    }
  };

  const loadLogos = async () => {
    try {
      const res = await apiFetch('/api/logos');
      if (res.ok) setLogos((await res.json()).logos || {});
    } catch { /* monograms stand in */ }
  };

  // Asks the server to find logos for programs that have none (or an old one), then shows whatever it has.
  const refreshLogos = async (id?: string) => {
    try {
      // The server handles a few programs per request; ask again until none are waiting.
      for (let round = 0; round < 5; round += 1) {
        const res = await apiFetch('/api/logos/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(id ? { id, force: true } : {}),
        });
        if (!res.ok) return;
        const data = await res.json();
        setLogos(data.logos || {});
        if (id || !data.remaining) return;
      }
    } catch { /* monograms stand in */ }
  };

  // Real website of each program, found from its repository (the server does a few per request).
  const refreshSites = async (id?: string) => {
    try {
      for (let round = 0; round < 5; round += 1) {
        const res = await apiFetch('/api/sites/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(id ? { id, force: true } : {}),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (id || !data.remaining) return;
      }
    } catch { /* the next visit retries */ }
  };

  // Visit every site now (page + app files) and show the result.
  const runWatch = async () => {
    try {
      const res = await apiFetch('/api/watch/run', { method: 'POST' });
      if (res.ok) await fetchServerState();
    } catch { /* the daily watch covers it */ }
  };

  /** «تحديث»: read GitHub, then visit every site, so one press refreshes everything the daily schedule would. */
  const handleSync = async ({ visitSites = true }: { visitSites?: boolean } = {}) => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await apiFetch('/api/github/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذر الفحص الآن.');
      if (data.platforms) setPlatforms(data.platforms);
      const checked = Array.isArray(data.syncedResults) ? data.syncedResults.length : 0;
      const linked = Array.isArray(data.syncedResults)
        ? data.syncedResults.filter((item: { integrity: string }) => item.integrity === 'Live').length : 0;
      showBanner(checked > 0 && linked === 0
        ? 'تعذر الربط بـGitHub. سبب كل برنامج مكتوب تحته.'
        : `تم الفحص: ${linked} من ${checked} مربوطة.`);
      if (visitSites) await runWatch();
      else void fetchServerState();
    } catch (error) {
      // Browser network errors are English ("Failed to fetch"); show only Arabic messages.
      showBanner(error instanceof Error && /[؀-ۿ]/.test(error.message) ? error.message : 'تعذر الوصول إلى الخادم.');
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (isLocked) return;
    void (async () => {
      const data = await fetchServerState();
      if (data && !logosAskedRef.current) {
        logosAskedRef.current = true;
        void loadLogos().then(() => refreshLogos());
      }
      if (!data || autoSyncedRef.current) return;
      autoSyncedRef.current = true;
      await refreshSites();
      await runWatch();
      // Link on open: refresh once if any GitHub-backed program was never verified or its evidence is over 6 hours old.
      const sixHours = 6 * 60 * 60_000;
      const needsLink = data.platforms.some(p =>
        p.lifecycleState === 'active' && p.runtimeMode === 'github-web' &&
        (!p.connectionVerified || !(Date.now() - Date.parse(p.lastVerifiedTimestamp || '') < sixHours)));
      if (needsLink) void handleSync({ visitSites: false }); // the sites were just visited above
    })();
    const timer = setInterval(fetchServerState, 12000);
    return () => clearInterval(timer);
  }, [isLocked]);

  useEffect(() => {
    apiFetch('/api/auth/session').then(r => r.json()).then(data => {
      if (data.authenticated) setIsLocked(false);
      else {
        clearOrbitSessionToken();
        if (readDemoId()) { forgetDemoId(); setIsDemo(false); } // demo expired or switched off
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (readDemoId()) return;
    fetch('/api/demo/config', { cache: 'no-store' }).then(r => r.json()).then(d => setDemoAvailable(d?.enabled === true)).catch(() => {});
  }, []);

  const handleDemoEnter = async () => {
    setAuthError(null);
    try {
      const res = await fetch('/api/demo/enter', { method: 'POST', headers: { Accept: 'application/json' } });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !rememberDemoId(data.sessionId)) { setAuthError(data?.error || 'تعذر فتح العرض التجريبي الآن.'); return; }
      clearOrbitSessionToken();
      setIsDemo(true);
      setIsLocked(false);
    } catch { setAuthError('تعذر الاتصال بالخادم.'); }
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthError(null);
    try {
      const res = await apiFetch('/api/auth/verify', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ passkey: passkeyInput }),
      });
      let data: { authenticated?: boolean; error?: string; sessionToken?: string } | null = null;
      try { data = JSON.parse(await res.text()); } catch { data = null; }
      if (!data) { setAuthError('تعذر الاتصال بالخادم.'); return; }
      if (res.ok && data.authenticated) {
        if (data.sessionToken) setOrbitSessionToken(data.sessionToken);
        setIsLocked(false);
        setPasskeyInput('');
        await fetchServerState();
      } else setAuthError(data.error || 'رمز الدخول غير صحيح.');
    } catch {
      setAuthError('تعذر الاتصال بالخادم.');
    }
  };

  useEffect(() => {
    if (!isLocked) void readPushState().then(setPushState);
  }, [isLocked]);

  const handlePush = async () => {
    if (pushState === 'ios-install') return showBanner('لتفعيل التنبيهات على الآيفون: من Safari اضغط «مشاركة» ثم «إضافة إلى الشاشة الرئيسية»، وافتح أوربت من هناك.');
    if (pushState === 'blocked') return showBanner('التنبيهات محجوبة. فعّلها من إعدادات المتصفح لهذا الموقع.');
    try {
      const next = pushState === 'on' ? await disablePush() : await enablePush();
      setPushState(next);
      if (next === 'on') showBanner('تم تفعيل التنبيهات. سيصلك إشعار عند أي مشكلة جديدة.');
      if (next === 'blocked') showBanner('التنبيهات محجوبة. فعّلها من إعدادات المتصفح لهذا الموقع.');
    } catch { showBanner('تعذر تفعيل التنبيهات الآن.'); }
  };

  const handleLogout = () => {
    void apiFetch('/api/auth/logout', { method: 'POST' }).finally(() => {
      clearOrbitSessionToken();
      forgetDemoId();
      setIsDemo(false);
      autoSyncedRef.current = false;
      logosAskedRef.current = false;
      setLogos({});
      setIsLocked(true);
    });
  };

  // Adding a program needs only a name and one link. Registration never claims monitoring is connected.
  const handleAdd = async (nameAr: string, link: string): Promise<string> => {
    const title = nameAr.trim();
    if (title.length < 2) throw new Error('اكتب اسم البرنامج أولاً.');
    let parsed: URL;
    try { parsed = new URL(link.trim()); } catch { throw new Error('اكتب رابطاً صحيحاً يبدأ بـ https://'); }
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
      throw new Error('الرابط لازم يكون آمناً ويبدأ بـ https://');
    }
    const github = parsed.hostname.toLowerCase() === 'github.com';
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (github && parts.length !== 2) throw new Error('انسخ رابط المستودع مثل github.com/owner/project');
    const owner = github ? parts[0] : 'ProfAlfailakawi';
    const repoName = github ? parts[1].replace(/\.git$/i, '') : parsed.hostname.toLowerCase();
    const codeName = (github ? repoName : parsed.hostname.replace(/\W+/g, '-'))
      .replace(/[^a-zA-Z0-9_-]/g, '-').toUpperCase().slice(0, 48);
    const response = await apiFetch('/api/fleet/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner, repoName, codeName, nameAr: title,
        description: 'برنامج مضاف من أوربت، بانتظار تفعيل المراقبة الحقيقية.',
        runtimeMode: github ? 'github-web' : 'non-github-web',
        productionUrl: github ? '' : parsed.origin,
        techStack: '', defaultBranch: 'main',
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'تعذر إضافة البرنامج.');
    if (data.platforms) setPlatforms(data.platforms);
    // The new program gets its own logo right away, from its site or repository.
    if (data.platform?.id) {
      void refreshLogos(data.platform.id);
      void refreshSites(data.platform.id).then(runWatch);
    }
    return 'تمت الإضافة. اضغط «تحديث» لربطه.';
  };

  const handleRemove = async (id: string) => {
    const next: PlatformLifecycleState = 'unlinked';
    const res = await apiFetch(`/api/fleet/${encodeURIComponent(id)}/lifecycle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nextLifecycle: next }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'تعذرت الإزالة الآن، حاول بعد قليل.');
    if (data.platforms) setPlatforms(data.platforms);
  };

  const rows = useMemo(() => buildRows(platforms, incidents, events), [platforms, incidents, events]);
  const summary = useMemo(() => summarize(rows, sharedLinkReason(platforms)), [rows, platforms]);
  const watch = useMemo(() => watchHealth(platforms), [platforms]);
  const tokenWarning = useMemo(() => tokenNotice(tokenExpiresAt), [tokenExpiresAt]);

  const handleExplain = async (id: string): Promise<Explanation> => {
    const response = await apiFetch('/api/explain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    if (!response.ok) throw new Error('تعذر الشرح الآن');
    return response.json();
  };

  if (isLocked) {
    return (
      <div className="login-wrap" dir="rtl">
        <div className="login-stage">
        <aside className="login-aside" aria-label="عن أوربت">
          <LoginArt />
          <div className="login-copy">
            <h2>كل برامجك في مدار واحد</h2>
            <p>يراقب مواقعك ومستودعاتك ويقول لك بالضبط ما الذي يحتاج انتباهك.</p>
            <ul className="login-points">
              <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7.8 12.4 2.8 2.8 5.6-6" /></svg>يفحص برامجك باستمرار</li>
              <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7v6.2" /><circle cx="12" cy="16.9" r=".6" /></svg>ينبّهك عند أي مشكلة</li>
              <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 9h8M8 13h5" /></svg>يجهّز لك نصّها لتلصقه في كلود</li>
            </ul>
          </div>
        </aside>
        <form className="card login" onSubmit={handleLogin}>
          <div className="login-brand"><Mark size={44} /><div><h1>أوربت</h1><p className="login-sub">مراقب برامجك</p></div></div>
          <label htmlFor="orbit-passkey-input" className="login-label"><Icon name="key" size={16} />رمز الدخول</label>
          <input id="orbit-passkey-input" type="password" autoComplete="current-password" value={passkeyInput} onChange={event => setPasskeyInput(event.target.value)} />
          {authError && <p role="alert" className="error">{authError}</p>}
          <button type="submit" className="btn btn-primary">دخول</button>
          {demoAvailable && (
            <button type="button" className="btn btn-demo" onClick={() => void handleDemoEnter()}>
              <Icon name="play" size={16} />تجربة بدون حساب (بيانات وهمية)
            </button>
          )}
        </form>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="shell">
      <header className="bar">
        <span className="brand"><Mark />أوربت</span>
        <div className="bar-actions">
          <button type="button" className="btn" onClick={() => void handleSync()} disabled={isSyncing} aria-busy={isSyncing}>
            <Icon name="refresh" /><span className="btn-label">{isSyncing ? 'جارٍ الفحص…' : 'تحديث'}</span>
          </button>
          {!isDemo && pushState !== 'unsupported' && (
            <button type="button" className={'btn' + (pushState === 'on' ? ' is-on' : '')} onClick={() => void handlePush()} aria-pressed={pushState === 'on'}>
              <Icon name="bell" /><span className="btn-label">{pushState === 'on' ? 'التنبيهات ✓' : 'التنبيهات'}</span>
            </button>
          )}
          <button type="button" className="btn" onClick={handleLogout}><Icon name="logout" /><span className="btn-label">خروج</span></button>
        </div>
      </header>
      {isDemo && <p className="banner banner-warn banner-demo" role="status"><strong>وضع تجريبي</strong> بيانات وهمية معزولة تمامًا؛ لا اتصال بأي موقع أو مستودع أو سجل حقيقي، وتُمحى تلقائيًا.</p>}
      {!online && <p className="banner banner-warn" role="status">لا يوجد اتصال بالإنترنت. المعروض آخر ما وصل.</p>}
      {watch?.stale && <p className="banner banner-warn" role="status">المراقبة التلقائية صامتة منذ {minutesPhrase(watch.minutes)}، فقد لا تصلك التنبيهات. افحص جدولة GitHub Actions.</p>}
      {tokenWarning && <p className="banner banner-warn" role="status">{tokenWarning.text}</p>}
      {syncBanner && <p className="banner" role="status">{syncBanner}</p>}
      <Dashboard
        isDemo={isDemo}
        rows={rows}
        logos={logos}
        summary={summary}
        platforms={platforms}
        tokenMissing={githubTokenConfigured === false}
        onAdd={handleAdd}
        onRemove={handleRemove}
        onExplain={handleExplain}
      />
    </div>
  );
}
