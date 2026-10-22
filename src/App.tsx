/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, clearOrbitSessionToken, setOrbitSessionToken } from './core/api';
import type { IncidentCaseFile, PlatformLifecycleState, PlatformRecord, RadarEvent } from './core/types';
import { buildRows, sharedLinkReason, summarize } from './core/fleetStatus';
import { Dashboard } from './components/Dashboard';
import { Mark } from './components/Mark';

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
  const [syncBanner, setSyncBanner] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const autoSyncedRef = useRef(false);
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
    const interval = window.setInterval(() => { void checkRelease(); }, 120_000);
    window.addEventListener('pageshow', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    void checkRelease();
    return () => {
      stopped = true;
      window.clearInterval(interval);
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
      return data as { platforms: PlatformRecord[] };
    } catch {
      // Offline: keep the last state on screen.
    }
  };

  const handleSync = async () => {
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
      void fetchServerState();
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
      if (!data || autoSyncedRef.current) return;
      autoSyncedRef.current = true;
      // Link on open: refresh once if any GitHub-backed program was never verified or its evidence is over 6 hours old.
      const sixHours = 6 * 60 * 60_000;
      const needsLink = data.platforms.some(p =>
        p.lifecycleState === 'active' && p.runtimeMode === 'github-web' &&
        (!p.connectionVerified || !(Date.now() - Date.parse(p.lastVerifiedTimestamp || '') < sixHours)));
      if (needsLink) void handleSync();
    })();
    const timer = setInterval(fetchServerState, 12000);
    return () => clearInterval(timer);
  }, [isLocked]);

  useEffect(() => {
    apiFetch('/api/auth/session').then(r => r.json()).then(data => {
      if (data.authenticated) setIsLocked(false);
      else clearOrbitSessionToken();
    }).catch(() => {});
  }, []);

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

  const handleLogout = () => {
    void apiFetch('/api/auth/logout', { method: 'POST' }).finally(() => {
      clearOrbitSessionToken();
      autoSyncedRef.current = false;
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
    return 'تمت الإضافة. اضغط «تحديث» لربطه.';
  };

  const handleRemove = async (id: string) => {
    const next: PlatformLifecycleState = 'unlinked';
    const res = await apiFetch(`/api/fleet/${encodeURIComponent(id)}/lifecycle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nextLifecycle: next }),
    });
    const data = await res.json();
    if (data.platforms) setPlatforms(data.platforms);
  };

  const rows = useMemo(() => buildRows(platforms, incidents, events), [platforms, incidents, events]);
  const summary = useMemo(() => summarize(rows, sharedLinkReason(platforms)), [rows, platforms]);

  if (isLocked) {
    return (
      <div className="login-wrap" dir="rtl">
        <form className="card login" onSubmit={handleLogin}>
          <div className="login-brand"><Mark size={44} /><h1>أوربت</h1></div>
          <label htmlFor="orbit-passkey-input">رمز الدخول</label>
          <input id="orbit-passkey-input" type="password" autoComplete="current-password" value={passkeyInput} onChange={event => setPasskeyInput(event.target.value)} />
          {authError && <p role="alert" className="error">{authError}</p>}
          <button type="submit" className="btn btn-primary">دخول</button>
        </form>
      </div>
    );
  }

  return (
    <div dir="rtl" className="shell">
      <header className="bar">
        <span className="brand"><Mark />أوربت</span>
        <div className="bar-actions">
          <button type="button" className="btn" onClick={() => void handleSync()} disabled={isSyncing} aria-busy={isSyncing}>
            {isSyncing ? 'جارٍ الفحص…' : 'تحديث'}
          </button>
          <button type="button" className="btn" onClick={handleLogout}>خروج</button>
        </div>
      </header>
      {!online && <p className="banner banner-warn" role="status">لا يوجد اتصال بالإنترنت. المعروض آخر ما وصل.</p>}
      {syncBanner && <p className="banner" role="status">{syncBanner}</p>}
      <Dashboard
        rows={rows}
        summary={summary}
        platforms={platforms}
        tokenMissing={githubTokenConfigured === false}
        onAdd={handleAdd}
        onRemove={handleRemove}
      />
    </div>
  );
}
