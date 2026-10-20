/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpLeft,
  BrainCircuit,
  CheckCircle2,
  Cloud,
  Code2,
  Compass,
  Copy,
  Cpu,
  Eye,
  FolderGit2,
  GitCommit,
  Layers,
  Laptop,
  Lock,
  Moon,
  Play,
  Radar,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Settings2,
  Sun,
  Terminal,
  Unlock,
  Zap,
} from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  observeOperatorAuth,
  signInWithGoogleOperator,
  signOutGoogleOperator,
  subscribeToCloudSnapshot,
  syncStateToFirestore,
} from './firebase';
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
import {
  EngineeringIntelligenceView,
  OperationsAndGovernanceView,
} from './components/IntelligenceAndOpsView';
import {
  OfflineConnectivityBanner,
  PWAInstallButton,
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

export default function App() {
  const [isDark, setIsDark] = useState<boolean>(false);
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
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [cloudSyncedAt, setCloudSyncedAt] = useState<string | null>(null);
  const hydratingFromCloudRef = useRef<boolean>(false);

  // Claude Mission Pack State
  const [claudePromptText, setClaudePromptText] = useState<string>('');
  const [aiAnalysisResult, setAiAnalysisResult] = useState<{
    mode: string;
    analysis: string;
  } | null>(null);
  const [loadingAi, setLoadingAi] = useState<boolean>(false);
  const [copiedClaude, setCopiedClaude] = useState<boolean>(false);

  const fetchServerState = async () => {
    try {
      const res = await fetch('/api/state');
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

    let es: EventSource | null = null;
    if (typeof EventSource !== 'undefined') {
      try {
        es = new EventSource('/api/stream');
        es.onmessage = (evt) => {
          try {
            const data = JSON.parse(evt.data);
            if (data.type === 'STATE_UPDATE') {
              if (data.platforms) setPlatforms(data.platforms);
              if (data.events) setEvents(data.events);
              if (data.incidents) setIncidents(data.incidents);
              if (data.alerts) setAlerts(data.alerts);
              if (data.crossAppPatterns) setCrossAppPatterns(data.crossAppPatterns);
              if (data.innovations) setInnovations(data.innovations);
              if (data.featureMatrix) setFeatureMatrix(data.featureMatrix);
              if (data.acceptanceCriteria) setAcceptanceCriteria(data.acceptanceCriteria);
              if (data.engineeringMemory) setEngineeringMemory(data.engineeringMemory);
              if (data.selfHealth) setSelfHealth(data.selfHealth);
              if (data.costGuard) setCostGuard(data.costGuard);
              if (data.discoveredCandidates) setDiscoveredCandidates(data.discoveredCandidates);
              if (data.auditLogs) setAuditLogs(data.auditLogs);
            }
          } catch {
            // ignore malformed frame
          }
        };
      } catch {
        // fallback to interval polling
      }
    }

    return () => {
      clearInterval(timer);
      if (es) es.close();
    };
  }, [isLocked]);

  useEffect(() => {
    fetch('/api/auth/session').then(r => r.json()).then(data => {
      if (data.authenticated) setIsLocked(false);
    }).catch(() => {});
  }, []);

  // Firebase Auth & Real-Time Firestore Multi-Device Sync
  useEffect(() => {
    let unsubSnapshot: (() => void) | null = null;
    const unsubAuth = observeOperatorAuth((user) => {
      setFirebaseUser(user);
      if (unsubSnapshot) {
        unsubSnapshot();
        unsubSnapshot = null;
      }
      if (user && !isLocked) {
        unsubSnapshot = subscribeToCloudSnapshot(user.uid, (cloudData, syncedIso) => {
          hydratingFromCloudRef.current = true;
          if (Array.isArray(cloudData.platforms) && cloudData.platforms.length > 0) {
            setPlatforms(cloudData.platforms as PlatformRecord[]);
          }
          if (Array.isArray(cloudData.events)) {
            setEvents(cloudData.events as RadarEvent[]);
          }
          if (Array.isArray(cloudData.incidents)) {
            setIncidents(cloudData.incidents as IncidentCaseFile[]);
          }
          if (Array.isArray(cloudData.alerts)) {
            setAlerts(cloudData.alerts as AlertNotification[]);
          }
          if (Array.isArray(cloudData.engineeringMemory)) {
            setEngineeringMemory(cloudData.engineeringMemory as EngineeringMemoryEntry[]);
          }
          if (Array.isArray(cloudData.discoveredCandidates)) {
            setDiscoveredCandidates(cloudData.discoveredCandidates as DiscoveredRepoCandidate[]);
          }
          setCloudSyncedAt(syncedIso);
          void fetch('/api/state/hydrate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cloudData),
          }).catch(() => {});
          setTimeout(() => {
            hydratingFromCloudRef.current = false;
          }, 600);
        });
      }
    });
    return () => {
      unsubAuth();
      if (unsubSnapshot) unsubSnapshot();
    };
  }, []);

  // Auto-sync state changes to Cloud Firestore when operator is signed in with Google
  useEffect(() => {
    if (!firebaseUser || hydratingFromCloudRef.current) return;
    const timer = setTimeout(() => {
      void syncStateToFirestore({
        fleetCount: platforms.length,
        data: {
          platforms,
          events,
          incidents,
          alerts,
          engineeringMemory,
          discoveredCandidates,
        },
      })
        .then((res) => {
          if (res?.syncedAt) setCloudSyncedAt(res.syncedAt);
        })
        .catch(() => {});
    }, 1000);
    return () => clearTimeout(timer);
  }, [firebaseUser, platforms, events, incidents, alerts, engineeringMemory, discoveredCandidates]);

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
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passkey: passkeyInput }),
      });
      const data = await res.json();
      if (data.authenticated) {
        setIsLocked(false);
        setAuthError(null);
      } else {
        setAuthError(data.error || 'رمز الدخول غير صحيح.');
      }
    } catch {
      setAuthError('تعذر التحقق من الخادم. لا يمكن الدخول دون مصادقة.');
    }
  };

  const handleGoogleSignIn = async () => {
    if (isLocked) { setAuthError('سجّل الدخول إلى ORBIT أولاً قبل ربط Google.'); return; }
    try {
      const user = await signInWithGoogleOperator();
      const syncRes = await syncStateToFirestore({
        fleetCount: platforms.length,
        data: {
          platforms,
          events,
          incidents,
          alerts,
          engineeringMemory,
          discoveredCandidates,
        },
      });
      if (syncRes?.syncedAt) setCloudSyncedAt(syncRes.syncedAt);
      setSyncBanner(`تم ربط ومزامنة Firebase Cloud بنجاح (${user.email})`);
      setTimeout(() => setSyncBanner(null), 5000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'تعذر تسجيل الدخول عبر Google';
      setSyncBanner(`تنبيه مصادقة Google: ${msg}`);
      setTimeout(() => setSyncBanner(null), 5000);
    }
  };

  const handleManualCloudSync = async () => {
    if (!firebaseUser) {
      await handleGoogleSignIn();
      return;
    }
    try {
      const res = await syncStateToFirestore({
        fleetCount: platforms.length,
        data: {
          platforms,
          events,
          incidents,
          alerts,
          engineeringMemory,
          discoveredCandidates,
        },
      });
      if (res?.syncedAt) {
        setCloudSyncedAt(res.syncedAt);
        setSyncBanner(`تم حفظ الأسطول والحوادث في Firebase Firestore (${res.docId})`);
        setTimeout(() => setSyncBanner(null), 4500);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'خطأ أثناء الحفظ السحابي';
      setSyncBanner(`فشل الحفظ السحابي: ${msg}`);
      setTimeout(() => setSyncBanner(null), 4500);
    }
  };

  const handleRunCanary = async () => {
    try {
      const res = await fetch('/api/canary/run', { method: 'POST' });
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
    try {
      const res = await fetch('/api/github/sync', {
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
      setSyncBanner(`تم فحص ${checked} مستودعات؛ تأكد الوصول إلى ${successful}. هذا لا يثبت عمل المواقع الإنتاجية.`);
    } catch (error) {
      setSyncBanner(error instanceof Error ? error.message : 'تعذر الوصول إلى GitHub.');
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
    const res = await fetch('/api/radar/ingest', {
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
    const res = await fetch(`/api/incidents/${incidentId}/transition`, {
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
      const res = await fetch('/api/ai/diagnose', {
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
    const res = await fetch('/api/fleet/add', {
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
      const res = await fetch(`/api/fleet/${encodeURIComponent(id)}/verify`, { method: 'POST' });
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
    const res = await fetch(`/api/fleet/${id}/lifecycle`, {
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
    const res = await fetch(`/api/fleet/${id}/update`, {
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
    const res = await fetch(`/api/fleet/${id}/purge-history`, {
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
    const res = await fetch(`/api/fleet/discover/${codeName}/approve`, { method: 'POST' });
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
    const res = await fetch('/api/memory/save', {
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
    const res = await fetch('/api/self-health/simulate-outage', {
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
    const res = await fetch('/api/github/webhook-simulate', {
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
        className={`min-h-screen flex items-center justify-center p-6 ${
          isDark ? 'bg-[#070B14] text-slate-100' : 'bg-slate-50 text-slate-900'
        }`}
      >
        <form
          onSubmit={handleLoginSubmit}
          className={`w-full max-w-md rounded-2xl border p-8 space-y-5 ${surfaceCls}`}
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Radar className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">ORBIT | أوربت</h1>
              <p className="text-xs text-slate-400">بوابة التحكم السيادية · قراءة فقط</p>
            </div>
          </div>

          {authError && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-3 text-xs text-rose-300">
              {authError}
            </div>
          )}

          <div className="space-y-1.5 text-xs">
            <label htmlFor="orbit-passkey-input" className="block text-slate-300 font-medium">
              رمز المشغل الآمن (Operator Passkey):
            </label>
            <input
              id="orbit-passkey-input"
              type="password"
              value={passkeyInput}
              onChange={(e) => setPasskeyInput(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm font-mono text-slate-100"
            />
          </div>

          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-sky-400 transition-colors"
          >
            <Unlock className="w-4 h-4" />
            <span>دخول غرفة العمليات (Unlock ORBIT)</span>
          </button>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/30 px-4 py-2.5 text-xs font-bold text-emerald-300 hover:bg-emerald-900/40 transition-colors"
          >
            <Cloud className="w-4 h-4" />
            <span>دخول ومزامنة سحابية عبر Google</span>
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

      <header className="orbit-header">
        <div className="orbit-header-content">
          <button type="button" className="orbit-brand" onClick={() => { setSelectedPlatformId(null); setActiveNav('mission-control'); }} aria-label="العودة إلى غرفة القيادة">
            <span className="orbit-brand-mark"><Radar size={24} strokeWidth={1.7}/></span>
            <span className="orbit-brand-text"><strong>أوربت</strong><small>ORBIT</small></span>
          </button>
          <nav aria-label="التنقل الرئيسي" className="orbit-desktop-nav">
            {([
              { id: 'mission-control', name: 'الرئيسية', Icon: Activity },
              { id: 'universal-radar', name: 'الرادار', Icon: Radar },
              { id: 'fleet-manager', name: 'البرامج', Icon: Layers },
              { id: 'intelligence', name: 'الذكاء', Icon: BrainCircuit },
              { id: 'operations', name: 'الحماية', Icon: ShieldCheck },
            ] as const).map(({ id, name, Icon }) => (
              <button type="button" key={id} aria-current={activeNav === id && !selectedPlatformId ? 'page' : undefined}
                onClick={() => { setSelectedPlatformId(null); setActiveNav(id); }}
                className={activeNav === id && !selectedPlatformId ? 'orbit-nav-link active' : 'orbit-nav-link'}>
                <Icon size={16} strokeWidth={1.75}/>{name}
              </button>
            ))}
          </nav>
          <div className="orbit-header-controls">
            <span className="orbit-header-evidence"><span/> قيد التحقق</span>
            <details className="orbit-tools-menu">
              <summary aria-label="أدوات وإعدادات"><Settings2 size={18}/><span>الأدوات</span></summary>
              <div className="orbit-tools-popover">
                <button type="button" onClick={() => { void handleSyncGithub(); }}><RefreshCw size={17}/> مزامنة GitHub</button>
                <button type="button" onClick={() => { void handleManualCloudSync(); }}><Cloud size={17}/> {firebaseUser ? 'مزامنة السحابة' : 'ربط Firebase'}</button>
                {firebaseUser && <button type="button" onClick={() => { void signOutGoogleOperator(); }}><Lock size={17}/> خروج من Google</button>}
                <button type="button" onClick={() => setIsDark(!isDark)}><Moon size={17}/> {isDark ? 'المظهر الفاتح' : 'المظهر الداكن'}</button>
                <button type="button" onClick={() => { void handleRunCanary(); }}><ShieldCheck size={17}/> فحص ORBIT الذاتي</button>
                <div className="orbit-tools-install"><PWAInstallButton isDark={isDark}/></div>
              </div>
            </details>
            <button type="button" className="orbit-lock-control" title="قفل الجلسة" aria-label="قفل الجلسة"
              onClick={() => { void fetch('/api/auth/logout', { method: 'POST' }).finally(() => setIsLocked(true)); }}>
              <Lock size={17}/>
            </button>
          </div>
        </div>
        <nav aria-label="التنقل على الهاتف" className="orbit-mobile-nav">
          {([
            { id: 'mission-control', name: 'الرئيسية', Icon: Activity },
            { id: 'universal-radar', name: 'الرادار', Icon: Radar },
            { id: 'fleet-manager', name: 'البرامج', Icon: Layers },
            { id: 'intelligence', name: 'الذكاء', Icon: BrainCircuit },
            { id: 'operations', name: 'الحماية', Icon: ShieldCheck },
          ] as const).map(({ id, name, Icon }) => (
            <button type="button" key={id} aria-current={activeNav === id && !selectedPlatformId ? 'page' : undefined}
              onClick={() => { setSelectedPlatformId(null); setActiveNav(id); }}
              className={activeNav === id && !selectedPlatformId ? 'orbit-mobile-tab active' : 'orbit-mobile-tab'}>
              <Icon size={19} strokeWidth={1.75}/><span>{name}</span>
            </button>
          ))}
        </nav>
      </header>

      {/* Sync / Action Feedback Banner */}
      {syncBanner && (
        <div className="bg-sky-500/15 border-b border-sky-500/30 px-6 py-2 text-xs text-sky-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />
            <span>{syncBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setSyncBanner(null)}
            className="text-slate-400 hover:text-white"
          >
            إغلاق
          </button>
        </div>
      )}

      {(activeNav !== 'mission-control' || Boolean(selectedPlatformId)) && (
        <div role="status" className="orbit-evidence-note mx-auto max-w-[1440px]">
          <AlertTriangle size={15} />
          <span>بعض بيانات هذه الصفحة توضيحية أو مخزنة؛ تحقق من المصدر قبل اتخاذ قرار إنتاجي.</span>
        </div>
      )}

      {/* Main Content Container */}
      <main className="max-w-[1440px] mx-auto px-4 sm:px-8 py-6 space-y-6">
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
              const res = await fetch('/api/ai/diagnose', {
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
        ) : activeNav === 'fleet-manager' ? (
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
        ) : activeNav === 'intelligence' ? (
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
        ) : activeNav === 'operations' ? (
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
        ) : (
          /* =================================================================
             MISSION CONTROL — INFOGRAPHIC, ICON-FIRST, MINIMAL-TEXT DESIGN
             ================================================================= */
          <div className="space-y-6">
            <ExecutiveOverview
              platforms={platforms}
              incidents={incidents}
              onOpenPlatform={(id) => setSelectedPlatformId(id)}
              onOpenIncident={(id) => {
                setSelectedIncidentId(id);
                setActiveNav('universal-radar');
              }}
              onOpenRadar={() => setActiveNav('universal-radar')}
              onOpenFleet={() => setActiveNav('fleet-manager')}
              onOpenIntelligence={() => setActiveNav('intelligence')}
              onOpenOperations={() => setActiveNav('operations')}
            />
            <details className="orbit-advanced">
              <summary>المؤشرات والتحليلات التفصيلية · عرض اختياري</summary>
              <div className="space-y-6 pt-3">
            {/* ROW 1: 3 VISUAL INFOGRAPHIC HERO CARDS */}
            <section
              aria-label="ملخص المؤشرات البصرية"
              className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch"
            >
              {/* Infographic 1: Fleet Radial Donut + Icon Counters (4 cols) */}
              <div className={`lg:col-span-4 rounded-2xl border p-5 flex items-center gap-5 ${surfaceCls}`}>
                <RadialGauge
                  value={Math.round((healthyCount / Math.max(1, activeFleet.length)) * 100)}
                  size={88}
                  strokeWidth={8}
                  colorClass="text-emerald-400"
                />
                <div className="flex-1 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold">سلامة الأسطول ({activeFleet.length})</span>
                    <span className="font-mono text-xs text-sky-400 tabular-nums">
                      تغطية {avgCoveragePct}%
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono tabular-nums">
                    <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5 text-emerald-300">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{healthyCount} سليم</span>
                    </div>
                    <div className="flex items-center gap-2 rounded-xl bg-rose-500/10 border border-rose-500/20 px-2.5 py-1.5 text-rose-300">
                      <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{incidentCount} حادثة</span>
                    </div>
                    <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 text-amber-300">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>{degradedCount + gapCount} تنبيه</span>
                    </div>
                    <div className="flex items-center gap-2 rounded-xl bg-sky-500/10 border border-sky-500/20 px-2.5 py-1.5 text-sky-300">
                      <Laptop className="w-4 h-4 text-sky-400 shrink-0" />
                      <span>{localCount} محلي</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Infographic 2: Three-Eyes Visual Bars (3 cols) */}
              <div className={`lg:col-span-3 rounded-2xl border p-5 flex flex-col justify-between ${surfaceCls}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold flex items-center gap-2">
                    <Eye className="w-4 h-4 text-sky-400" />
                    <span>العيون الثلاث</span>
                  </span>
                  <span className="font-mono text-[11px] text-amber-400">بيانات أولية</span>
                </div>

                <div className="space-y-3 my-2">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1.5 text-slate-300">
                        <Code2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>الكود والمستودع</span>
                      </span>
                      <span className="font-mono tabular-nums text-emerald-400">—</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-400 w-[0%]" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1.5 text-slate-300">
                        <Activity className="w-3.5 h-3.5 text-sky-400" />
                        <span>رحلة المستخدم</span>
                      </span>
                      <span className="font-mono tabular-nums text-sky-400">—</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-full rounded-full bg-sky-400 w-[0%]" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1.5 text-slate-300">
                        <Terminal className="w-3.5 h-3.5 text-amber-400" />
                        <span>السجل الصامت</span>
                      </span>
                      <span className="font-mono tabular-nums text-amber-400">—</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-full rounded-full bg-amber-400 w-[0%]" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Infographic 3: 5-Second Visual Cockpit Pulse (5 cols) */}
              <div
                aria-label="شريط قراءة الخمس ثوانٍ"
                className={`lg:col-span-5 rounded-2xl border p-5 flex flex-col justify-between ${
                  topCriticalIncident
                    ? 'border-rose-500/40 bg-rose-950/15'
                    : 'border-emerald-500/30 bg-emerald-950/10'
                }`}
              >
                {topCriticalIncident ? (
                  <>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
                          <Zap className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-rose-300">
                            رادار الـ 5 ثوانٍ · {topCriticalIncident.incidentId}
                          </div>
                          <div className="text-sm font-bold text-white mt-0.5">
                            {topCriticalIncident.appId} — {topCriticalIncident.title || "حادثة تحتاج مراجعة"}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedIncidentId(topCriticalIncident.incidentId);
                          setCockpitDeck('incidents');
                          const el = document.getElementById('claude-mission-pack');
                          el?.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="rounded-xl bg-rose-500 px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-rose-400 transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>تشخيص + مهمة Claude</span>
                      </button>
                    </div>

                    {/* 3 Clean Icon-Stat Nodes with zero truncation */}
                    <div className="grid grid-cols-3 gap-2.5 mt-3 pt-3 border-t border-rose-500/20 text-xs font-mono tabular-nums">
                      <div className="rounded-xl bg-slate-950/60 px-3 py-2 border border-slate-800/80 flex items-center justify-between">
                        <span className="text-slate-400 font-sans">الالتزام</span>
                        <span className="font-bold text-rose-300">
                          {topCriticalIncident.suspectedCommitSha}
                        </span>
                      </div>
                      <div className="rounded-xl bg-slate-950/60 px-3 py-2 border border-slate-800/80 flex items-center justify-between">
                        <span className="text-slate-400 font-sans">الجلسات</span>
                        <span className="font-bold text-amber-300">
                          {topCriticalIncident.affectedSessions}
                        </span>
                      </div>
                      <div className="rounded-xl bg-slate-950/60 px-3 py-2 border border-slate-800/80 flex items-center justify-between">
                        <span className="text-slate-400 font-sans">الثقة</span>
                        <span className="font-bold text-emerald-300">
                          {topCriticalIncident.confidenceScore}%
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between h-full">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                      <div>
                        <div className="text-sm font-bold text-emerald-300">
                          لا توجد حوادث حرجة نشطة
                        </div>
                        <div className="text-xs text-slate-400">
                          لا توجد حوادث حرجة في البيانات المعروضة؛ يلزم التحقق المباشر
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* ROW 2: VISUAL FILTER CHIPS + FLEET INFOGRAPHIC CARDS */}
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Layers className="w-5 h-5 text-sky-400" />
                  <h2 className="text-base font-bold tracking-tight">
                    أسطول البرامج ({visibleFleet.length} من {activeFleet.length})
                  </h2>
                </div>

                {/* Interactive Filter Tabs with Icons */}
                <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl border border-slate-800 bg-slate-950/70">
                  {[
                    { id: 'ALL', label: `الكل (${activeFleet.length})` },
                    { id: 'Incident', label: `حادثة (${incidentCount})` },
                    { id: 'Degraded', label: `متدهور (${degradedCount})` },
                    { id: 'Healthy', label: `سليم (${healthyCount})` },
                    { id: 'Monitoring Gap', label: `فجوة (${gapCount})` },
                    { id: 'Local / Not Running', label: `محلي (${localCount})` },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setStatusFilter(tab.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        statusFilter === tab.id
                          ? 'bg-sky-500 text-slate-950 font-bold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Infographic Program Grid (4 columns on desktop — Icon + Gauge + 3-Eyes Bar) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {visibleFleet.map((platform) => {
                  const gaugeColor =
                    platform.healthStatus === 'Incident'
                      ? 'text-rose-400'
                      : platform.healthStatus === 'Degraded' ||
                        platform.healthStatus === 'Monitoring Gap'
                      ? 'text-amber-400'
                      : platform.healthStatus === 'Local / Not Running'
                      ? 'text-sky-400'
                      : 'text-emerald-400';

                  const cleanTitleAr = platform.nameAr.split('(')[0].trim();

                  return (
                    <div
                      key={platform.id}
                      className={`group rounded-2xl border p-4 flex flex-col justify-between gap-4 transition-all hover:border-sky-500/50 ${surfaceCls}`}
                    >
                      {/* Top Row: Domain Icon + Clean Title + Radial Donut Gauge */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <PlatformDomainIcon
                            codeName={platform.codeName}
                            status={platform.healthStatus}
                            size="md"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs font-bold text-sky-400">
                                {platform.codeName}
                              </span>
                              <span className="text-slate-600">·</span>
                              <span className="font-mono text-[11px] text-slate-400">
                                {platform.recentCommits[0]?.sha || 'HEAD'}
                              </span>
                            </div>
                            <h3 className="text-sm font-bold mt-0.5">
                              {cleanTitleAr}
                            </h3>
                          </div>
                        </div>

                        <RadialGauge
                          value={platform.monitoringCoveragePct}
                          size={48}
                          strokeWidth={4}
                          colorClass={gaugeColor}
                        />
                      </div>

                      {/* Middle Row: Visual 3-Eyes Infographic Strip */}
                      <ThreeEyesInfographicRow fourState={platform.fourState} />

                      {/* Bottom Row: Status + 1-Click Detail Button */}
                      <div className="flex items-center justify-between pt-2.5 border-t border-slate-800/70">
                        <HealthStatusIndicator status={platform.healthStatus} />
                        <button
                          type="button"
                          onClick={() => setSelectedPlatformId(platform.id)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-sky-400 hover:text-sky-300 whitespace-nowrap shrink-0"
                        >
                          <span>التفاصيل</span>
                          <ArrowUpLeft className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ROW 3: TABBED INFOGRAPHIC DECK (Zero Vertical Clutter!) */}
            <section id="claude-mission-pack" className={`rounded-2xl border p-5 space-y-5 ${surfaceCls}`}>
              {/* Deck Navigation Tabs */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    {
                      id: 'incidents',
                      label: `الحوادث ومهمة Claude (${incidents.length})`,
                      icon: Sparkles,
                    },
                    {
                      id: 'commits',
                      label: `أثر التغييرات (${changeImpacts.length})`,
                      icon: GitCommit,
                    },
                    {
                      id: 'memory',
                      label: `الذاكرة الهندسية (${engineeringMemory.length})`,
                      icon: BrainCircuit,
                    },
                    {
                      id: 'acceptance',
                      label: `معايير القبول (${acceptanceCriteria.length}/18)`,
                      icon: ShieldCheck,
                    },
                  ].map((tab) => {
                    const Icon = tab.icon;
                    const active = cockpitDeck === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setCockpitDeck(tab.id as CockpitDeckTab)}
                        className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                          active
                            ? 'bg-sky-500 text-slate-950'
                            : 'border border-slate-800 bg-slate-950/50 text-slate-300 hover:text-white'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* TAB 1: INCIDENTS & CLAUDE MISSION PACK */}
              {cockpitDeck === 'incidents' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
                  {/* Left 5 cols: Compact Visual Incident Selector Cards */}
                  <div className="lg:col-span-5 space-y-2.5">
                    {incidents.map((inc) => {
                      const isSelected = inc.incidentId === selectedIncidentId;
                      return (
                        <div
                          key={inc.incidentId}
                          onClick={() => setSelectedIncidentId(inc.incidentId)}
                          className={`cursor-pointer rounded-xl border p-3.5 transition-all ${
                            isSelected
                              ? 'border-sky-400 bg-sky-950/20'
                              : 'border-slate-800/90 bg-slate-950/40 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-sky-400">
                                {inc.appId}
                              </span>
                              <span className="text-slate-600">·</span>
                              <SeverityLabel severity={inc.severity} />
                            </div>
                            <span className="font-mono text-[11px] text-slate-400">{inc.status}</span>
                          </div>
                          <div className="text-xs font-bold text-slate-100 mt-1.5">{inc.title}</div>
                          <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-800/60 text-[11px] font-mono text-slate-400">
                            <span>Commit {inc.suspectedCommitSha}</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleTransitionIncident(
                                    inc.incidentId,
                                    'Investigating',
                                    false,
                                    'تم الاستلام'
                                  );
                                }}
                                className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-200 hover:bg-slate-700"
                              >
                                استلام
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleTransitionIncident(
                                    inc.incidentId,
                                    'Resolved',
                                    true,
                                    'تم التحقق التقني'
                                  );
                                }}
                                className="rounded bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[10px] text-emerald-300 hover:bg-emerald-500/30"
                              >
                                توثيق الحل
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Right 7 cols: Visual Claude Mission Generator */}
                  <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-slate-950/60 p-4 flex flex-col justify-between space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-sky-400" />
                        <span className="text-xs font-bold">
                          مشغل مهمة Claude الجاهزة ({selectedIncidentId})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedIncidentId && (
                          <button
                            type="button"
                            onClick={() => handleRequestAiAnalysis(selectedIncidentId)}
                            disabled={loadingAi}
                            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                          >
                            {loadingAi ? 'جاري التحليل...' : 'تحليل AI عميق'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(claudePromptText);
                            setCopiedClaude(true);
                            setTimeout(() => setCopiedClaude(false), 2500);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-400 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-sky-300"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>{copiedClaude ? 'تم النسخ!' : 'نسخ برومت Claude'}</span>
                        </button>
                      </div>
                    </div>

                    {aiAnalysisResult && (
                      <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 p-3 text-xs text-slate-200 whitespace-pre-wrap">
                        <div className="font-mono text-[11px] text-sky-400 mb-1">
                          [{aiAnalysisResult.mode}]
                        </div>
                        {aiAnalysisResult.analysis}
                      </div>
                    )}

                    <pre
                      dir="ltr"
                      className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-[11px] font-mono text-slate-200 overflow-x-auto max-h-56 leading-relaxed"
                    >
                      {claudePromptText}
                    </pre>
                  </div>
                </div>
              )}

              {/* TAB 2: CHANGE IMPACT INFOGRAPHIC */}
              {cockpitDeck === 'commits' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {changeImpacts.map((ci) => (
                    <div
                      key={ci.id}
                      className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-sky-400">
                          {ci.appId} · {ci.commitSha}
                        </span>
                        <ReleaseShieldLabel rating={ci.releaseShieldVerdict} />
                      </div>
                      <p className="text-xs font-semibold text-slate-200">{ci.commitMessage}</p>
                      <div className="grid grid-cols-2 gap-2 text-center font-mono text-xs pt-2 border-t border-slate-800/70">
                        <div className="rounded-lg bg-slate-900 p-2">
                          <div className="text-[10px] text-slate-400">أخطاء قبل ← بعد</div>
                          <div className="font-bold text-slate-100 mt-0.5">
                            {ci.preChangeErrorRate}% ← {ci.postChangeErrorRate}%
                          </div>
                        </div>
                        <div className="rounded-lg bg-slate-900 p-2">
                          <div className="text-[10px] text-slate-400">الارتباط</div>
                          <div className="font-bold text-sky-300 mt-0.5 truncate">
                            {ci.correlationType}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* TAB 3: SELF-LEARNING MEMORY CARDS */}
              {cockpitDeck === 'memory' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {engineeringMemory.map((mem) => (
                    <div
                      key={mem.id}
                      className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-2.5"
                    >
                      <div className="flex items-center justify-between font-mono text-xs">
                        <span className="text-sky-400 font-bold">{mem.appId}</span>
                        <span className="text-emerald-400">{mem.recurringPatternTag}</span>
                      </div>
                      <h3 className="text-xs font-bold text-slate-100">{mem.problemTitle}</h3>
                      <div className="text-xs text-emerald-300 bg-emerald-950/20 border border-emerald-500/20 rounded-lg p-2.5">
                        {mem.verifiedFixSummary}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* TAB 4: ACCEPTANCE MATRIX (18/18) */}
              {cockpitDeck === 'acceptance' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {acceptanceCriteria.map((ac) => (
                    <div
                      key={ac.id}
                      className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-3 flex items-center gap-2.5 text-xs"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-200 truncate">{ac.titleAr}</div>
                        <div className="text-[11px] text-slate-400 truncate">{ac.evidenceDetail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
              </div>
            </details>
          </div>
        )}
      </main>
    </div>
  );
}
