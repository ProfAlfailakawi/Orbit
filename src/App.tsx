/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch, clearOrbitSessionToken, setOrbitSessionToken } from './core/api';
import {
  Activity,
  AlertTriangle,
  ArrowUpLeft,
  CheckCircle2,
  Compass,
  Copy,
  Cpu,
  Ellipsis,
  Eye,
  FolderGit2,
  GitCommit,
  Laptop,
  Lock,
  Play,
  Radar,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Sun,
  Terminal,
  Unlock,
  Zap,
} from 'lucide-react';
import { generateClaudeMissionPrompt } from './core/engine';
import {
  INITIAL_ACCEPTANCE_CRITERIA,
  INITIAL_ALERTS,
  INITIAL_CHANGE_IMPACTS,
  INITIAL_COST_GUARD,
  INITIAL_CROSS_APP_PATTERNS,
  INITIAL_DISCOVERED_CANDIDATES,
  INITIAL_ENGINEERING_MEMORY,
  INITIAL_EVENTS,
  INITIAL_FEATURE_MATRIX,
  INITIAL_INCIDENTS,
  INITIAL_INNOVATION_OPPORTUNITIES,
  INITIAL_PLATFORMS,
  INITIAL_SELF_HEALTH,
  INITIAL_SILENT_FAILURES,
} from './core/seedData';
import type {
  AcceptanceCriterionResult,
  AlertNotification,
  AppRuntimeMode,
  CanaryTestResult,
  ChangeImpactAnalysis,
  CostGuardMetrics,
  CrossAppPattern,
  DiscoveredRepoCandidate,
  EngineeringMemoryEntry,
  FeatureMatrixItem,
  IncidentCaseFile,
  IncidentStatus,
  InnovationOpportunity,
  PlatformLifecycleState,
  PlatformRecord,
  RadarEvent,
  SelfHealthMetrics,
  SilentFailureSignal,
} from './core/types';
import { DynamicFleetView } from './components/DynamicFleetView';
import { ExecutiveOverview } from './components/ExecutiveOverview';
import { WorkspaceOverview } from './components/WorkspaceOverview';
import {
  EngineeringIntelligenceView,
  OperationsAndGovernanceView,
} from './components/IntelligenceAndOpsView';
import {
  OfflineConnectivityBanner,
} from './components/PWAInstallButton';
import {
  DataIntegrityTag,
  HealthStatusIndicator,
  PlatformDomainIcon,
  RadialGauge,
  ReleaseShieldLabel,
  SeverityLabel,
  ThreeEyesInfographicRow,
} from './components/Primitives';
import { ProgramDetailView } from './components/ProgramDetailView';
import { UniversalRadarView } from './components/UniversalRadarView';

type MainNavId =
  | 'mission-control'
  | 'universal-radar'
  | 'fleet-manager'
  | 'intelligence'
  | 'operations';

type CockpitDeckTab = 'incidents' | 'commits' | 'memory' | 'acceptance';

const ORBIT_BUILD_ID = import.meta.env.VITE_ORBIT_BUILD_ID || 'development';

export default function App() {
  const isDark = false;
  const [activeNav, setActiveNav] = useState<MainNavId>('mission-control');
  const [cockpitDeck, setCockpitDeck] = useState<CockpitDeckTab>('incidents');
  const [selectedPlatformId, setSelectedPlatformId] = useState<string | null>(null);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [globalSearch, setGlobalSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Authentication Gate State
  const [isLocked, setIsLocked] = useState<boolean>(true);
  const [passkeyInput, setPasskeyInput] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);

  // Application State synchronized with Express Backend & Firebase Cloud
  const [platforms, setPlatforms] = useState<PlatformRecord[]>([]);
  const [events, setEvents] = useState<RadarEvent[]>([]);
  const [incidents, setIncidents] = useState<IncidentCaseFile[]>([]);
  const [alerts, setAlerts] = useState<AlertNotification[]>([]);
  const [silentFailures, setSilentFailures] =
    useState<SilentFailureSignal[]>([]);
  const [changeImpacts, setChangeImpacts] =
    useState<ChangeImpactAnalysis[]>([]);
  const [crossAppPatterns, setCrossAppPatterns] = useState<CrossAppPattern[]>([]);
  const [engineeringMemory, setEngineeringMemory] = useState<EngineeringMemoryEntry[]>(
    []
  );
  const [innovations, setInnovations] = useState<InnovationOpportunity[]>([]);
  const [selfHealth, setSelfHealth] = useState<SelfHealthMetrics>(INITIAL_SELF_HEALTH);
  const [costGuard, setCostGuard] = useState<CostGuardMetrics>(INITIAL_COST_GUARD);
  const [discoveredCandidates, setDiscoveredCandidates] = useState<DiscoveredRepoCandidate[]>(
    []
  );
  const [featureMatrix, setFeatureMatrix] = useState<FeatureMatrixItem[]>([]);
  const [acceptanceCriteria, setAcceptanceCriteria] = useState<AcceptanceCriterionResult[]>([]);
  const [canaryHistory, setCanaryHistory] = useState<CanaryTestResult[]>([]);
  const [auditLogs, setAuditLogs] = useState<
    Array<{
      id: string;
      timestamp: string;
      actor: string;
      action: string;
      target: string;
      detail: string;
    }>
  >([]);
  const [syncBanner, setSyncBanner] = useState<string | null>(null);
  const [isGithubSyncing, setIsGithubSyncing] = useState(false);

  // Claude Mission Pack State
  const [claudePromptText, setClaudePromptText] = useState<string>('');
  const [aiAnalysisResult, setAiAnalysisResult] = useState<{
    mode: string;
    analysis: string;
  } | null>(null);
  const [loadingAi, setLoadingAi] = useState<boolean>(false);
  const [copiedClaude, setCopiedClaude] = useState<boolean>(false);

  // Keep already-open tabs current after a production deployment. As in
  // SCHEDULE, compare the page's baked build id with a no-cache server beacon;
  // defer navigation while a dialog, form field, or busy task is in progress.
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
      setAlerts(data.alerts);
      setSilentFailures(data.silentFailures);
      setChangeImpacts(data.changeImpacts);
      setCrossAppPatterns(data.crossAppPatterns || []);
      setInnovations(data.innovations || []);
      setFeatureMatrix(data.featureMatrix || []);
      setAcceptanceCriteria(data.acceptanceCriteria || []);
      setEngineeringMemory(data.engineeringMemory);
      setSelfHealth(data.selfHealth);
      setCostGuard(data.costGuard);
      setDiscoveredCandidates(data.discoveredCandidates);
      setCanaryHistory(data.canaryHistory || []);
      setAuditLogs(data.auditLogs || []);
    } catch {
      // Offline / Cached fallback
    }
  };

  useEffect(() => {
    if (isLocked) return;
    fetchServerState();
    const timer = setInterval(fetchServerState, 12000);

    return () => {
      clearInterval(timer);
    };
  }, [isLocked]);

  useEffect(() => {
    apiFetch('/api/auth/session').then(r => r.json()).then(data => {
      if (data.authenticated) setIsLocked(false);
      else clearOrbitSessionToken();
    }).catch(() => {});
  }, []);

  // Keyboard shortcuts (Alt+1..5 for rapid cockpit navigation)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === '1') {
        setSelectedPlatformId(null);
        setActiveNav('mission-control');
      } else if (e.altKey && e.key === '2') {
        setSelectedPlatformId(null);
        setActiveNav('universal-radar');
      } else if (e.altKey && e.key === '3') {
        setSelectedPlatformId(null);
        setActiveNav('fleet-manager');
      } else if (e.altKey && e.key === '4') {
        setSelectedPlatformId(null);
        setActiveNav('intelligence');
      } else if (e.altKey && e.key === '5') {
        setSelectedPlatformId(null);
        setActiveNav('operations');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Compute Claude Mission Prompt synchronously when selectedIncidentId changes
  useEffect(() => {
    const inc = incidents.find((i) => i.incidentId === selectedIncidentId) || incidents[0];
    if (!inc) return;
    const plat =
      platforms.find((p) => p.codeName.toUpperCase() === inc.appId.toUpperCase()) || platforms[0];
    if (!plat) return;
    setClaudePromptText(generateClaudeMissionPrompt(inc, plat, 'fix'));
  }, [selectedIncidentId, incidents, platforms]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      const res = await apiFetch('/api/auth/verify', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ passkey: passkeyInput }),
      });
      const text = await res.text();
      let data: { authenticated?: boolean; error?: string; sessionToken?: string } | null = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
      if (!data) {
        setAuthError('تعذر التحقق من الخادم. لا يمكن الدخول دون مصادقة.');
        return;
      }
      if (res.ok && data.authenticated) {
        if (data.sessionToken) setOrbitSessionToken(data.sessionToken);
        setIsLocked(false);
        setPasskeyInput('');
        setAuthError(null);
        await fetchServerState();
      } else {
        setAuthError(data.error || 'رمز الدخول غير صحيح.');
      }
    } catch {
      setAuthError('تعذر التحقق من الخادم. لا يمكن الدخول دون مصادقة.');
    }
  };

  const handleRunCanary = async () => {
    try {
      const res = await apiFetch('/api/canary/run', { method: 'POST' });
      const data = await res.json();
      if (data.canaryResult) {
        setCanaryHistory(data.canaryHistory || [data.canaryResult]);
        setEvents(data.events || events);
        setIncidents(data.incidents || incidents);
        setAlerts(data.alerts || alerts);
        setSelfHealth(data.selfHealth || selfHealth);
        setAuditLogs(data.auditLogs || auditLogs);
        setSyncBanner(
          `اكتمل فحص الكناري الذاتي (${data.canaryResult.runId}) — جميع المراحل הـ 6 ناجحة (${data.canaryResult.totalLatencyMs}ms)`
        );
        setTimeout(() => setSyncBanner(null), 5000);
      }
    } catch {
      // ignore
    }
  };

  const handleSyncGithub = async (appCode?: string) => {
    if (isGithubSyncing) return;
    setIsGithubSyncing(true);
    try {
      const res = await apiFetch('/api/github/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId: appCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذر مزامنة GitHub.');
      if (data.platforms) setPlatforms(data.platforms);
      if (data.auditLogs) setAuditLogs(data.auditLogs);
      const checked = Array.isArray(data.syncedResults) ? data.syncedResults.length : 0;
      const successful = Array.isArray(data.syncedResults)
        ? data.syncedResults.filter((item: { integrity: string }) => item.integrity === 'Live').length : 0;
      setSyncBanner(`اكتمل فحص GitHub: تم تأكيد الوصول إلى ${successful} من ${checked} مستودعاً. فحص GitHub لا يؤكد عمل المواقع الإنتاجية.`);
    } catch (error) {
      setSyncBanner(error instanceof Error ? error.message : 'تعذر الوصول إلى GitHub.');
    } finally {
      setIsGithubSyncing(false);
    }
  };

  const handleInjectEvent = async (payload: {
    appId: string;
    operationName: string;
    errorCode: string;
    errorMessage: string;
    isSilentMismatch: boolean;
    isUserVisible: boolean;
    environment: string;
  }) => {
    const res = await apiFetch('/api/radar/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `UI-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.events) setEvents(data.events);
    if (data.incidents) setIncidents(data.incidents);
    if (data.alerts) setAlerts(data.alerts);
    if (data.auditLogs) setAuditLogs(data.auditLogs);
  };

  const handleTransitionIncident = async (
    incidentId: string,
    nextStatus: IncidentStatus,
    technicallyVerified: boolean,
    note: string,
    addToMemory = false
  ) => {
    const res = await apiFetch(`/api/incidents/${incidentId}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nextStatus, technicalVerificationPassed: technicallyVerified, note, addToMemory }),
    });
    const data = await res.json();
    if (data.incidents) setIncidents(data.incidents);
    if (data.engineeringMemory) setEngineeringMemory(data.engineeringMemory);
    if (data.auditLogs) setAuditLogs(data.auditLogs);
  };

  const handleRequestAiAnalysis = async (incidentId: string) => {
    setLoadingAi(true);
    try {
      const res = await apiFetch('/api/ai/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incidentId }),
      });
      const data = await res.json();
      setAiAnalysisResult({ mode: data.mode, analysis: data.analysis });
      if (data.costGuard) setCostGuard(data.costGuard);
    } finally {
      setLoadingAi(false);
    }
  };

  // The executive owner adds a future application from a name and one URL.
  // Never grants access to monitored repositories or claims functional monitoring on registration.
  const handleQuickAddProgram = async (nameAr: string, link: string): Promise<string> => {
    const title = nameAr.trim();
    if (!title || title.length < 2) throw new Error('اكتب اسم البرنامج أولاً.');
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
        description: 'برنامج مضاف من ORBIT ONE، بانتظار تفعيل المراقبة الحقيقية.',
        runtimeMode: github ? 'github-web' : 'non-github-web',
        productionUrl: github ? '' : parsed.origin,
        techStack: '', defaultBranch: 'main',
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'تعذر إضافة البرنامج.');
    if (data.platforms) setPlatforms(data.platforms);
    if (data.auditLogs) setAuditLogs(data.auditLogs);
    return 'تمت إضافة البرنامج. الربط والمراقبة الفعلية يحتاجان تحققاً مستقلاً.';
  };

  // Section 42 Fleet Handlers
  const handleAddPlatform = async (payload: {
    owner: string;
    repoName: string;
    codeName: string;
    nameAr: string;
    description: string;
    runtimeMode: AppRuntimeMode;
    productionUrl: string;
    techStack: string;
    defaultBranch: string;
  }) => {
    const res = await apiFetch('/api/fleet/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.platforms) setPlatforms(data.platforms);
    if (data.auditLogs) setAuditLogs(data.auditLogs);
  };

  const handleVerifyConnection = async (id: string) => {
    try {
      const res = await apiFetch(`/api/fleet/${encodeURIComponent(id)}/verify`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذر التحقق من الاتصال.');
      if (data.platforms) setPlatforms(data.platforms);
      if (data.auditLogs) setAuditLogs(data.auditLogs);
      setSyncBanner('تم تأكيد الوصول إلى GitHub فقط؛ أداء الموقع والمستخدمين ما زال يحتاج فحصاً مستقلاً.');
    } catch (error) {
      setSyncBanner(error instanceof Error ? error.message : 'تعذر التحقق من الاتصال.');
    }
  };

  const handleLifecycleChange = async (id: string, nextLifecycle: PlatformLifecycleState) => {
    const res = await apiFetch(`/api/fleet/${id}/lifecycle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nextLifecycle }),
    });
    const data = await res.json();
    if (data.platforms) setPlatforms(data.platforms);
    if (data.auditLogs) setAuditLogs(data.auditLogs);
  };

  const handleUpdateSettings = async (
    id: string,
    payload: {
      nameAr: string;
      description: string;
      defaultBranch: string;
      productionUrl: string | null;
      runtimeMode: AppRuntimeMode;
    }
  ) => {
    const res = await apiFetch(`/api/fleet/${id}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.platforms) setPlatforms(data.platforms);
    if (data.auditLogs) setAuditLogs(data.auditLogs);
  };

  const handlePurgeHistory = async (
    id: string,
    confirmationToken: string
  ): Promise<{ purged: boolean; error?: string }> => {
    const res = await apiFetch(`/api/fleet/${id}/purge-history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmationToken }),
    });
    const data = await res.json();
    if (data.purged) {
      if (data.events) setEvents(data.events);
      if (data.incidents) setIncidents(data.incidents);
      if (data.alerts) setAlerts(data.alerts);
      if (data.auditLogs) setAuditLogs(data.auditLogs);
      return { purged: true };
    }
    return { purged: false, error: data.error };
  };

  const handleApproveDiscovered = async (codeName: string) => {
    const res = await apiFetch(`/api/fleet/discover/${codeName}/approve`, { method: 'POST' });
    const data = await res.json();
    if (data.platforms) setPlatforms(data.platforms);
    if (data.discoveredCandidates) setDiscoveredCandidates(data.discoveredCandidates);
    if (data.auditLogs) setAuditLogs(data.auditLogs);
  };

  const handleSaveMemory = async (payload: {
    id?: string;
    appId: string;
    incidentId: string;
    problemTitle: string;
    confirmedRootCause: string;
    disprovenHypotheses: string[];
    verifiedFixSummary: string;
    preventionTestAdded: string;
    lessonsLearned: string;
    recurringPatternTag: string;
    isConfirmedByEvidence: boolean;
  }): Promise<{ accepted: boolean; error?: string }> => {
    const res = await apiFetch('/api/memory/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.engineeringMemory) setEngineeringMemory(data.engineeringMemory);
    if (data.auditLogs) setAuditLogs(data.auditLogs);
    return { accepted: Boolean(data.accepted), error: data.error };
  };

  const handleSimulateOutage = async (simulateOutage: boolean) => {
    const res = await apiFetch('/api/self-health/simulate-outage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ simulateOutage }),
    });
    const data = await res.json();
    if (data.selfHealth) setSelfHealth(data.selfHealth);
    if (data.auditLogs) setAuditLogs(data.auditLogs);
  };

  const handleSimulateWebhook = async (payload: {
    appId: string;
    hasHiddenSubStepWarning: boolean;
    tamperSignature: boolean;
  }): Promise<{ verified: boolean; signatureHeader: string; message: string }> => {
    const res = await apiFetch('/api/github/webhook-simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.events) setEvents(data.events);
    if (data.incidents) setIncidents(data.incidents);
    if (data.alerts) setAlerts(data.alerts);
    if (data.auditLogs) setAuditLogs(data.auditLogs);
    return {
      verified: Boolean(data.verified),
      signatureHeader: data.signatureHeader || '',
      message: data.message || '',
    };
  };

  // Dynamic Fleet Calculations
  const visibleFleet = useMemo(() => {
    return platforms.filter((p) => {
      if (p.lifecycleState === 'unlinked' && statusFilter !== 'UNLINKED') return false;
      const matchesSearch =
        !globalSearch.trim() ||
        `${p.codeName} ${p.nameAr} ${p.description} ${p.repoName} ${p.techStack.join(' ')}`
          .toLowerCase()
          .includes(globalSearch.toLowerCase());
      const matchesStatus =
        statusFilter === 'ALL'
          ? true
          : statusFilter === 'UNLINKED'
          ? p.lifecycleState === 'unlinked'
          : p.healthStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [platforms, globalSearch, statusFilter]);

  const activeFleet = platforms.filter((p) => p.lifecycleState !== 'unlinked');
  const healthyCount = activeFleet.filter((p) => p.healthStatus === 'Healthy').length;
  const incidentCount = activeFleet.filter((p) => p.healthStatus === 'Incident').length;
  const degradedCount = activeFleet.filter((p) => p.healthStatus === 'Degraded').length;
  const gapCount = activeFleet.filter((p) => p.healthStatus === 'Monitoring Gap').length;
  const localCount = activeFleet.filter((p) => p.healthStatus === 'Local / Not Running').length;

  const avgCoveragePct = useMemo(() => {
    if (activeFleet.length === 0) return 0;
    const sum = activeFleet.reduce((acc, p) => acc + p.monitoringCoveragePct, 0);
    return Math.round(sum / activeFleet.length);
  }, [activeFleet]);

  const topCriticalIncident =
    incidents.find(
      (i) => i.severity === 'Critical' && i.status !== 'Resolved' && i.appId !== 'ORBIT-CANARY'
    ) ||
    incidents.find(
      (i) => i.severity === 'High' && i.status !== 'Resolved' && i.appId !== 'ORBIT-CANARY'
    ) ||
    incidents.find((i) => i.status !== 'Resolved' && i.appId !== 'ORBIT-CANARY') ||
    incidents[0] ||
    null;

  const selectedPlatform = platforms.find((p) => p.id === selectedPlatformId) || null;

  const surfaceCls = isDark
    ? 'border-slate-800/80 bg-[#0D1322]/90 text-slate-100'
    : 'border-slate-200 bg-white text-slate-900';

  if (isLocked) {
    return (
      <div
        dir="rtl"
        className={`orbit-shell ${isDark ? 'orbit-dark' : ''} min-h-screen flex items-center justify-center p-6 ${
          isDark ? 'bg-[#070B14] text-slate-100' : 'bg-[#F4F7FB] text-slate-900'
        }`}
      >
        <form
          onSubmit={handleLoginSubmit}
          className={`w-full max-w-md rounded-3xl border p-8 space-y-5 shadow-sm ${
            isDark
              ? 'border-slate-800 bg-[#141f31] text-slate-100'
              : 'border-slate-200 bg-white text-slate-900'
          }`}
        >
          <div className="flex items-center gap-3.5">
            <div className="orbit-brand-mark shrink-0">
              <Radar className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">ORBIT | أوربت</h1>
              <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                بوابة التحكم السيادية · قراءة فقط
              </p>
            </div>
          </div>

          {authError && (
            <div
              role="alert"
              className={`rounded-xl border p-3.5 text-xs font-semibold ${
                isDark
                  ? 'border-rose-400/40 bg-rose-950/60 text-rose-200'
                  : 'border-rose-200 bg-rose-50 text-rose-700'
              }`}
            >
              {authError}
            </div>
          )}

          <div className="space-y-2 text-xs">
            <label
              htmlFor="orbit-passkey-input"
              className={`block font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}
            >
              رمز المشغل الآمن (Operator Passkey):
            </label>
            <input
              id="orbit-passkey-input"
              type="password"
              value={passkeyInput}
              onChange={(e) => setPasskeyInput(e.target.value)}
              className={`w-full rounded-xl border px-4 py-2.5 text-sm font-mono focus:ring-2 focus:ring-blue-500 ${
                isDark
                  ? 'border-slate-700 bg-slate-900 text-slate-100 focus:bg-slate-950'
                  : 'border-slate-300 bg-slate-50 text-slate-900 focus:bg-white'
              }`}
            />
          </div>

          <button
            type="submit"
            className="orbit-main-button w-full"
          >
            <Unlock className="w-4 h-4" />
            <span>دخول غرفة العمليات (Unlock ORBIT)</span>
          </button>

        </form>
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      className={`orbit-shell ${isDark ? 'orbit-dark' : ''} min-h-screen w-full max-w-full overflow-x-hidden transition-colors ${
        isDark ? 'bg-[#070B14] text-slate-100' : 'bg-[#F4F7FB] text-slate-900'
      }`}
    >
      <OfflineConnectivityBanner />

      <header className="orbit-header one-unified-header">
        <div className="orbit-header-content">
          <button type="button" className="orbit-brand" onClick={() => { setSelectedPlatformId(null); setActiveNav('mission-control'); window.scrollTo({top:0,behavior:'smooth'}); }} aria-label="العودة إلى الصفحة الواحدة">
            <span className="orbit-brand-mark"><Radar size={24} strokeWidth={1.7}/></span>
            <span className="orbit-brand-text"><strong>أوربت <span className="one-brand-one">ONE</span></strong><small>مراقبة كل برامجك</small></span>
          </button>
          <div className="orbit-header-controls one-unified-controls">
            <button type="button" className="orbit-lock-control" title="قفل الجلسة" aria-label="قفل الجلسة"
              onClick={() => { void apiFetch('/api/auth/logout', { method: 'POST' }).finally(() => { clearOrbitSessionToken(); setIsLocked(true); }); }}>
              <Lock size={17}/>
            </button>
          </div>
        </div>
      </header>

      {/* Sync / Action Feedback Banner */}
      {syncBanner && (
        <div role="status" aria-live="polite" className="bg-sky-50 border-b border-sky-200 px-6 py-3 text-sm font-medium text-sky-950 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-sky-700 shrink-0" />
            <span>{syncBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setSyncBanner(null)}
            className="text-slate-600 hover:text-slate-950"
          >
            إغلاق
          </button>
        </div>
      )}

      {false && (
        <div role="status" className="orbit-evidence-note mx-auto max-w-[1440px]">
          <AlertTriangle size={15} />
          <span>بعض بيانات هذه الصفحة توضيحية أو مخزنة؛ تحقق من المصدر قبل اتخاذ قرار إنتاجي.</span>
        </div>
      )}

      {/* One executive page. Every technical view opens as a temporary overlay. */}
      <main className="one-main max-w-[1440px] mx-auto px-4 sm:px-8 py-6 space-y-6">
        <ExecutiveOverview
          platforms={platforms}
          incidents={incidents}
          events={events}
          onOpenPlatform={(id) => { setSelectedPlatformId(id); setActiveNav('mission-control'); }}
          onOpenIncident={(id) => { setSelectedIncidentId(id); setActiveNav('universal-radar'); }}
          onOpenRadar={() => document.getElementById('orbit-one-incidents')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          onOpenFleet={() => { setSelectedPlatformId(null); setActiveNav('fleet-manager'); }}
          onQuickAdd={handleQuickAddProgram}
          onSyncGithub={() => { void handleSyncGithub(); }}
          isGithubSyncing={isGithubSyncing}
        />
        {(selectedPlatform || activeNav !== 'mission-control') && (
          <div className="one-overlay-backdrop">
            <section className="one-overlay-panel" role="dialog" aria-modal="true" aria-label="تفاصيل أوربت">
              <div className="one-overlay-heading">
                <div><span>ORBIT ONE</span><strong>{selectedPlatform ? 'تفاصيل البرنامج' : 'الإعدادات والتشخيص'}</strong></div>
                <button type="button" className="one-close-overlay" onClick={() => { setSelectedPlatformId(null); setSelectedIncidentId(null); setActiveNav('mission-control'); }} aria-label="العودة للصفحة الرئيسية">
                  <span>العودة</span> <ArrowUpLeft size={18}/>
                </button>
              </div>
        {selectedPlatform ? (
          <ProgramDetailView
            platform={selectedPlatform}
            events={events}
            incidents={incidents}
            silentFailures={silentFailures}
            changeImpacts={changeImpacts}
            memoryEntries={engineeringMemory}
            innovations={innovations}
            onBack={() => setSelectedPlatformId(null)}
            onSelectIncident={(incId) => {
              setSelectedPlatformId(null);
              setSelectedIncidentId(incId);
              setActiveNav('universal-radar');
            }}
            onSyncGithub={(code) => handleSyncGithub(code)}
            onLifecycleChange={handleLifecycleChange}
            onVerifyConnection={handleVerifyConnection}
            isDark={isDark}
          />
        ) : activeNav === 'universal-radar' ? (
          <div className="space-y-5">
            <WorkspaceOverview
              mode="radar"
              platforms={platforms}
              incidents={incidents}
              events={events}
              engineeringMemory={engineeringMemory}
              changeImpacts={changeImpacts}
              silentFailures={silentFailures}
              alerts={alerts}
              acceptanceCriteria={acceptanceCriteria}
              selfHealth={selfHealth}
              canaryHistory={canaryHistory}
              openAdvanced={() => {
                const el = document.getElementById('orbit-advanced-radar') as HTMLDetailsElement | null;
                if (el) { el.open = true; el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
              }}
              openPlatform={(id) => setSelectedPlatformId(id)}
              openIncident={(id) => { setSelectedIncidentId(id); setActiveNav('universal-radar'); }}
              syncGithub={() => { void handleSyncGithub(); }}
            />
            <details id="orbit-advanced-radar" className="orbit-advanced orbit-specialist-advanced">
              <summary>الرادار المتقدم والتشخيص · اختياري</summary>
              <div className="pt-3 space-y-6">
          <UniversalRadarView
            platforms={activeFleet}
            events={events}
            incidents={incidents}
            selectedIncidentId={selectedIncidentId}
            onSelectIncident={(id) => setSelectedIncidentId(id)}
            onIngestEvent={async (payload) => {
              await handleInjectEvent({ ...payload, environment: 'production' });
            }}
            onTransitionIncident={async (params) => {
              await handleTransitionIncident(
                params.incidentId,
                params.nextStatus,
                params.technicalVerificationPassed,
                params.note,
                params.addToMemory
              );
            }}
            onRunCanary={handleRunCanary}
            onRequestAiDiagnosis={async (incidentId) => {
              const res = await apiFetch('/api/ai/diagnose', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ incidentId }),
              });
              const data = await res.json();
              if (data.costGuard) setCostGuard(data.costGuard);
              return { mode: data.mode, analysis: data.analysis };
            }}
            isDark={isDark}
          />
              </div>
            </details>
          </div>
        ) : activeNav === 'fleet-manager' ? (
          <div className="space-y-5">
            <WorkspaceOverview
              mode="fleet"
              platforms={platforms}
              incidents={incidents}
              events={events}
              engineeringMemory={engineeringMemory}
              changeImpacts={changeImpacts}
              silentFailures={silentFailures}
              alerts={alerts}
              acceptanceCriteria={acceptanceCriteria}
              selfHealth={selfHealth}
              canaryHistory={canaryHistory}
              openAdvanced={() => {
                const el = document.getElementById('orbit-advanced-fleet') as HTMLDetailsElement | null;
                if (el) { el.open = true; el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
              }}
              openPlatform={(id) => setSelectedPlatformId(id)}
              openIncident={(id) => { setSelectedIncidentId(id); setActiveNav('universal-radar'); }}
              syncGithub={() => { void handleSyncGithub(); }}
            />
            <details id="orbit-advanced-fleet" className="orbit-advanced orbit-specialist-advanced">
              <summary>إضافة أو تعديل أو أرشفة البرامج · إدارة متقدمة</summary>
              <div className="pt-3 space-y-6">
          <DynamicFleetView
            platforms={platforms}
            discoveredCandidates={discoveredCandidates}
            onAddPlatform={handleAddPlatform}
            onVerifyConnection={handleVerifyConnection}
            onLifecycleChange={handleLifecycleChange}
            onUpdateSettings={handleUpdateSettings}
            onPurgeHistory={handlePurgeHistory}
            onApproveDiscovered={handleApproveDiscovered}
            onSelectPlatform={(id) => setSelectedPlatformId(id)}
            isDark={isDark}
          />
              </div>
            </details>
          </div>
        ) : activeNav === 'intelligence' ? (
          <div className="space-y-5">
            <WorkspaceOverview
              mode="intelligence"
              platforms={platforms}
              incidents={incidents}
              events={events}
              engineeringMemory={engineeringMemory}
              changeImpacts={changeImpacts}
              silentFailures={silentFailures}
              alerts={alerts}
              acceptanceCriteria={acceptanceCriteria}
              selfHealth={selfHealth}
              canaryHistory={canaryHistory}
              openAdvanced={() => {
                const el = document.getElementById('orbit-advanced-intelligence') as HTMLDetailsElement | null;
                if (el) { el.open = true; el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
              }}
              openPlatform={(id) => setSelectedPlatformId(id)}
              openIncident={(id) => { setSelectedIncidentId(id); setActiveNav('universal-radar'); }}
              syncGithub={() => { void handleSyncGithub(); }}
            />
            <details id="orbit-advanced-intelligence" className="orbit-advanced orbit-specialist-advanced">
              <summary>التحليلات والذاكرة والمختبر · أدوات متقدمة</summary>
              <div className="pt-3 space-y-6">
          <EngineeringIntelligenceView
            platforms={activeFleet}
            changeImpacts={changeImpacts}
            crossAppPatterns={crossAppPatterns}
            engineeringMemory={engineeringMemory}
            silentFailures={silentFailures}
            onTriggerSilentFailureTest={async () => {
              await handleInjectEvent({
                appId: 'ORDER',
                environment: 'production',
                operationName: 'order.checkout.confirmNotification',
                errorCode: 'SILENT_SECONDARY_WEBHOOK_DROP',
                errorMessage: 'HTTP 200 OK مع فشل صامت في إرسال إشعار تأكيد الطلب الثانوي',
                isSilentMismatch: true,
                isUserVisible: false,
              });
            }}
            onSaveMemory={handleSaveMemory}
            isDark={isDark}
          />
              </div>
            </details>
          </div>
        ) : activeNav === 'operations' ? (
          <div className="space-y-5">
            <WorkspaceOverview
              mode="operations"
              platforms={platforms}
              incidents={incidents}
              events={events}
              engineeringMemory={engineeringMemory}
              changeImpacts={changeImpacts}
              silentFailures={silentFailures}
              alerts={alerts}
              acceptanceCriteria={acceptanceCriteria}
              selfHealth={selfHealth}
              canaryHistory={canaryHistory}
              openAdvanced={() => {
                const el = document.getElementById('orbit-advanced-operations') as HTMLDetailsElement | null;
                if (el) { el.open = true; el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
              }}
              openPlatform={(id) => setSelectedPlatformId(id)}
              openIncident={(id) => { setSelectedIncidentId(id); setActiveNav('universal-radar'); }}
              syncGithub={() => { void handleSyncGithub(); }}
            />
            <details id="orbit-advanced-operations" className="orbit-advanced orbit-specialist-advanced">
              <summary>فحوص الحماية والتقارير والتجارب · أدوات متقدمة</summary>
              <div className="pt-3 space-y-6">
          <OperationsAndGovernanceView
            platforms={activeFleet}
            incidents={incidents}
            innovations={innovations}
            alerts={alerts}
            selfHealth={selfHealth}
            costGuard={costGuard}
            canaryHistory={canaryHistory}
            featureMatrix={featureMatrix}
            acceptanceCriteria={acceptanceCriteria}
            auditLogs={auditLogs}
            onRunCanary={handleRunCanary}
            onSelectIncident={(id) => {
              setSelectedIncidentId(id);
              setActiveNav('universal-radar');
            }}
            onSimulateOutage={handleSimulateOutage}
            onSimulateWebhook={handleSimulateWebhook}
            isDark={isDark}
          />
              </div>
            </details>
          </div>
        ) : null}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
