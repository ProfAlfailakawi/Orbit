import React, { useState } from 'react';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Copy,
  ExternalLink,
  GitBranch,
  GitCommit,
  Layers,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  Terminal,
  XCircle,
} from 'lucide-react';
import type {
  AlertSeverity,
  ChangeImpactAnalysis,
  EngineeringMemoryEntry,
  IncidentCaseFile,
  InnovationOpportunity,
  PlatformLifecycleState,
  PlatformRecord,
  RadarEvent,
  SilentFailureSignal,
} from '../core/types';
import {
  DataIntegrityTag,
  HealthStatusIndicator,
  PlatformDomainIcon,
  RadialGauge,
  ReleaseShieldLabel,
  SeverityLabel,
  ThreeEyesInfographicRow,
} from './Primitives';

const PROGRAM_TABS = [
  { id: 'overview', labelAr: 'ملخص' },
  { id: 'radar', labelAr: 'مراقبة مباشرة' },
  { id: 'client-errors', labelAr: 'أخطاء الموقع' },
  { id: 'backend-errors', labelAr: 'أخطاء الخادم' },
  { id: 'journeys', labelAr: 'تجربة الزائر' },
  { id: 'deployments', labelAr: 'التحديثات' },
  { id: 'actions', labelAr: 'الاختبارات' },
  { id: 'commits', labelAr: 'التحديثات' },
  { id: 'performance', labelAr: 'السرعة' },
  { id: 'security', labelAr: 'الحماية' },
  { id: 'feature-dna', labelAr: 'المزايا' },
  { id: 'release-shield', labelAr: 'جاهزية الإصدار' },
  { id: 'incidents', labelAr: 'التنبيهات' },
  { id: 'memory', labelAr: 'الحلول السابقة' },
  { id: 'innovation', labelAr: 'اقتراحات' },
  { id: 'coverage', labelAr: 'التغطية' },
  { id: 'reports', labelAr: 'التقارير' },
] as const;

type ProgramTabId = (typeof PROGRAM_TABS)[number]['id'];
const PRIMARY_PROGRAM_TABS: ProgramTabId[] = ['overview', 'journeys', 'deployments', 'incidents'];

interface ProgramDetailViewProps {
  platform: PlatformRecord;
  events: RadarEvent[];
  incidents: IncidentCaseFile[];
  silentFailures: SilentFailureSignal[];
  changeImpacts: ChangeImpactAnalysis[];
  memoryEntries: EngineeringMemoryEntry[];
  innovations: InnovationOpportunity[];
  onBack: () => void;
  onSelectIncident: (incidentId: string) => void;
  onSyncGithub: (appId: string) => void;
  onLifecycleChange: (appId: string, state: PlatformLifecycleState) => void;
  onVerifyConnection: (appId: string) => void;
  isDark: boolean;
}

export const ProgramDetailView: React.FC<ProgramDetailViewProps> = ({
  platform,
  events,
  incidents,
  silentFailures,
  changeImpacts,
  memoryEntries,
  innovations,
  onBack,
  onSelectIncident,
  onSyncGithub,
  onLifecycleChange,
  onVerifyConnection,
  isDark,
}) => {
  const [activeTab, setActiveTab] = useState<ProgramTabId>('overview');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [periodFilter, setPeriodFilter] = useState<string>('24h');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [releaseFilter, setReleaseFilter] = useState<string>('ALL');
  const [copiedReport, setCopiedReport] = useState(false);

  const availableReleases = Array.from(
    new Set(
      events
        .filter((e) => e.appId.toUpperCase() === platform.codeName.toUpperCase())
        .map((e) => e.releaseVersion)
        .filter(Boolean)
    )
  );

  const appEvents = events.filter(
    (e) =>
      e.appId.toUpperCase() === platform.codeName.toUpperCase() &&
      (severityFilter === 'ALL' || e.severity === severityFilter) &&
      (statusFilter === 'ALL' || e.incidentStatus === statusFilter) &&
      (releaseFilter === 'ALL' || e.releaseVersion === releaseFilter)
  );
  const appIncidents = incidents.filter(
    (i) =>
      i.appId.toUpperCase() === platform.codeName.toUpperCase() &&
      (severityFilter === 'ALL' || i.severity === severityFilter) &&
      (statusFilter === 'ALL' || i.status === statusFilter) &&
      (releaseFilter === 'ALL' || i.relatedReleases.includes(releaseFilter))
  );
  const appSilent = silentFailures.filter(
    (s) => s.appId.toUpperCase() === platform.codeName.toUpperCase()
  );
  const appImpacts = changeImpacts.filter(
    (c) => c.appId.toUpperCase() === platform.codeName.toUpperCase()
  );
  const appMemory = memoryEntries.filter(
    (m) => m.appId.toUpperCase() === platform.codeName.toUpperCase()
  );
  const appInnovations = innovations.filter(
    (inv) =>
      inv.appId.toUpperCase() === platform.codeName.toUpperCase() ||
      inv.appId === 'ALL_FLEET'
  );

  const surfaceCls = isDark
    ? 'border-slate-800/90 bg-[#0F172A]/85 text-slate-100'
    : 'border-slate-200 bg-white text-slate-900';

  const copyProgramReport = () => {
    const text = `# تقرير صحة البرنامج — ${platform.codeName} (${platform.nameAr})
- المستودع: ${platform.owner}/${platform.repoName} (${platform.defaultBranch})
- الحالة الفعلية: ${platform.healthStatus} | نزاهة البيانات: ${platform.dataIntegrity}
- تغطية المراقبة: ${platform.monitoringCoveragePct}% | درع الإصدار: ${platform.releaseShield}
- آخر دليل مؤكد: ${platform.lastVerifiedEvidence} (${platform.lastVerifiedTimestamp})
- الحوادث النشطة: ${appIncidents.length} | الأحداث المسجلة: ${appEvents.length}
`;
    navigator.clipboard.writeText(text);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2000);
  };

  return (
    <div className="orbit-subpage orbit-program-page space-y-6">
      {/* Header & Navigation Bar */}
      <div className={`rounded-xl border p-6 ${surfaceCls}`}>
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800/60">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/80 px-3 py-1.5 text-xs font-medium hover:bg-slate-800/60 transition-colors"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>العودة لأسطول البرامج</span>
            </button>
            <span className="text-slate-500">·</span>
            <span className="font-mono text-sm font-semibold text-sky-400">
              {platform.codeName}
            </span>
            <span className="text-slate-500">·</span>
            <DataIntegrityTag state={platform.dataIntegrity} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!platform.connectionVerified && (
              <button
                type="button"
                onClick={() => onVerifyConnection(platform.id)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>فحص وتأكيد الاتصال الآن</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onSyncGithub(platform.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium hover:bg-slate-800 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5 text-sky-400" />
              <span>تحديث قراءة GitHub</span>
            </button>
            {platform.lifecycleState === 'active' ? (
              <button
                type="button"
                onClick={() => onLifecycleChange(platform.id, 'paused')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-950/40 transition-colors"
              >
                <PauseCircle className="w-3.5 h-3.5" />
                <span>إيقاف المراقبة مؤقتاً</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onLifecycleChange(platform.id, 'active')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-950/40 transition-colors"
              >
                <PlayCircle className="w-3.5 h-3.5" />
                <span>إعادة تفعيل المراقبة</span>
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-7 flex items-center gap-4">
            <PlatformDomainIcon
              codeName={platform.codeName}
              status={platform.healthStatus}
              size="lg"
            />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight">{platform.nameAr}</h1>
                <HealthStatusIndicator status={platform.healthStatus} />
              </div>
              <div className="max-w-md">
                <ThreeEyesInfographicRow fourState={platform.fourState} />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 font-mono">
                <span>
                  {platform.owner}/{platform.repoName}
                </span>
                <span>·</span>
                <span>{platform.defaultBranch}</span>
                <span>·</span>
                <span>{platform.runtimeMode}</span>
                {platform.productionUrl && (
                  <>
                    <span>·</span>
                    <a
                      href={platform.productionUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sky-400 hover:underline"
                    >
                      <span>{platform.productionUrl}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </>
                )}
              </div>
            </div>
            <RadialGauge
              value={platform.monitoringCoveragePct}
              size={72}
              strokeWidth={6}
              colorClass="text-sky-400"
              sublabel="التغطية"
            />
          </div>

          {/* Four-State Separation Matrix (Section 8: Never conflate CI, Deploy, Reachability, User Journey) */}
          <div className="lg:col-span-5 grid grid-cols-2 gap-3 text-xs border border-slate-800/80 rounded-lg p-3.5 bg-slate-950/40">
            <div className="col-span-2 text-xs font-semibold text-slate-300 pb-1 border-b border-slate-800/70">حالة الموقع</div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">الاختبارات:</span>
              <span className="font-mono font-semibold">
                {platform.fourState.ciPassed === true
                  ? 'ناجحة'
                  : platform.fourState.ciPassed === false
                  ? 'فشلت'
                  : 'غير متاح'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">النشر:</span>
              <span className="font-mono font-semibold">
                {platform.fourState.deploymentSucceeded === true
                  ? 'ناجح'
                  : platform.fourState.deploymentSucceeded === false
                  ? 'لم ينجح'
                  : 'غير متاح'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">الموقع:</span>
              <span className="font-mono font-semibold">
                {platform.fourState.siteReachable === true
                  ? 'يستجيب'
                  : platform.fourState.siteReachable === false
                  ? 'لا يستجيب'
                  : 'لم يُفحص'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">التجربة:</span>
              <span
                className={`font-mono font-semibold ${
                  platform.fourState.userJourneyHealthy === false
                    ? 'text-rose-400'
                    : platform.fourState.userJourneyHealthy === true
                    ? 'text-emerald-400'
                    : 'text-amber-300'
                }`}
              >
                {platform.fourState.userJourneyHealthy === true
                  ? 'مؤكدة'
                  : platform.fourState.userJourneyHealthy === false
                  ? 'تحتاج مراجعة'
                  : 'لم تُفحص'}
              </span>
            </div>
          </div>
        </div>

        {/* Filters Bar (Section 30) */}
        <div className="mt-5 pt-4 border-t border-slate-800/60 flex flex-wrap items-center justify-between gap-4">
          <div className="orbit-program-tabs">
            {PROGRAM_TABS.filter(t => PRIMARY_PROGRAM_TABS.includes(t.id)).map((t) => (
              <button
                key={t.id}
                type="button"
                aria-current={activeTab === t.id ? 'page' : undefined}
                onClick={() => setActiveTab(t.id)}
                className="transition-colors whitespace-nowrap shrink-0"
              >
                {t.labelAr}
              </button>
            ))}
            <label className="orbit-program-more">
              <span>المزيد</span>
              <select aria-label="أقسام إضافية" value={PRIMARY_PROGRAM_TABS.includes(activeTab) ? '' : activeTab}
                onChange={(event) => { if (event.target.value) setActiveTab(event.target.value as ProgramTabId); }}>
                <option value="">أقسام إضافية</option>
                {PROGRAM_TABS.filter(t => !PRIMARY_PROGRAM_TABS.includes(t.id)).map(t => <option key={t.id} value={t.id}>{t.labelAr}</option>)}
              </select>
            </label>
          </div>

          {['radar', 'client-errors', 'backend-errors', 'incidents'].includes(activeTab) && <details className="orbit-program-filters">
            <summary>تصفية النتائج</summary>
            <div className="orbit-program-filters-panel">
            <label className="text-slate-400" htmlFor="prog-period-filter">
              الفترة:
            </label>
            <select
              id="prog-period-filter"
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200"
            >
              <option value="6h">آخر 6 ساعات</option>
              <option value="24h">آخر 24 ساعة</option>
              <option value="7d">آخر 7 أيام</option>
              <option value="30d">آخر 30 يوماً</option>
            </select>

            <label className="text-slate-400" htmlFor="prog-status-filter">
              الحالة:
            </label>
            <select
              id="prog-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200"
            >
              <option value="ALL">الكل (All Status)</option>
              <option value="Detected">Detected · مرصود</option>
              <option value="Triaged">Triaged · مصنف</option>
              <option value="Investigating">Investigating · قيد الفحص</option>
              <option value="Action Proposed">Action Proposed · إجراء مقترح</option>
              <option value="Resolved">Resolved · محلول</option>
            </select>

            <label className="text-slate-400" htmlFor="prog-severity-filter">
              الخطورة:
            </label>
            <select
              id="prog-severity-filter"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200"
            >
              <option value="ALL">الكل (All)</option>
              <option value="Critical">Critical · حرج</option>
              <option value="High">High · مرتفع</option>
              <option value="Medium">Medium · متوسط</option>
              <option value="Low">Low · منخفض</option>
            </select>

            <label className="text-slate-400" htmlFor="prog-release-filter">
              الإصدار:
            </label>
            <select
              id="prog-release-filter"
              value={releaseFilter}
              onChange={(e) => setReleaseFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 font-mono"
            >
              <option value="ALL">جميع الإصدارات</option>
              {availableReleases.map((rel) => (
                <option key={rel} value={rel}>
                  {rel}
                </option>
              ))}
            </select>
            </div>
          </details>}
        </div>
      </div>

      {/* Tab Content Area */}
      {activeTab === 'overview' && (
        <details className="orbit-advanced">
          <summary>تفاصيل الموقع</summary>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-5">
          <div className={`lg:col-span-8 rounded-xl border p-6 space-y-5 ${surfaceCls}`}>
            <h2 className="text-base font-semibold">الهوية التقنية، البيئات، وآخر دليل مؤكد</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1.5">
                <div className="text-slate-400">التقنيات المستخدمة (Tech Stack):</div>
                <div className="font-mono text-slate-200">{platform.techStack.join(' · ')}</div>
              </div>
              <div className="space-y-1.5">
                <div className="text-slate-400">بيئات التشغيل والنشر:</div>
                <div className="font-mono text-slate-200">{platform.environments.join(' · ')}</div>
              </div>
              <div className="space-y-1.5">
                <div className="text-slate-400">خدمات API المراقبة:</div>
                <div className="font-mono text-slate-200">{platform.apiServices.join(' · ')}</div>
              </div>
              <div className="space-y-1.5">
                <div className="text-slate-400">قواعد البيانات والتكاملات (دون تخزين أسرارها):</div>
                <div className="font-mono text-slate-200">
                  {platform.databasesAndIntegrations.join(' · ')}
                </div>
              </div>
              <div className="md:col-span-2 space-y-1.5 pt-2 border-t border-slate-800/60">
                <div className="text-slate-400">الوظائف الحساسة المحمية:</div>
                <div className="text-slate-200">{platform.sensitiveFunctions.join(' · ')}</div>
              </div>
              <div className="md:col-span-2 space-y-1.5 pt-2 border-t border-slate-800/60">
                <div className="text-slate-400">آخر دليل مؤكد على الحالة ({platform.lastVerifiedTimestamp}):</div>
                <div className="text-emerald-300 font-medium">{platform.lastVerifiedEvidence}</div>
              </div>
            </div>
          </div>

          <div className={`lg:col-span-4 rounded-xl border p-6 space-y-4 ${surfaceCls}`}>
            <h2 className="text-base font-semibold">ملخص المراقبة ودرع الإصدار</h2>
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between py-2 border-b border-slate-800/60">
                <span className="text-slate-400">مستوى تغطية المراقبة:</span>
                <span className="font-mono text-base font-bold text-sky-400 tabular-nums">
                  {platform.monitoringCoveragePct}%
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-800/60">
                <span className="text-slate-400">حالة الاتصال:</span>
                <span className="font-mono">{platform.connectionStatus}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-800/60">
                <span className="text-slate-400">تقييم Release Shield:</span>
                <ReleaseShieldLabel rating={platform.releaseShield} />
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-800/60">
                <span className="text-slate-400">ثقة الإصدار الحالي:</span>
                <span className="font-mono tabular-nums">{platform.releaseConfidencePct}%</span>
              </div>
              <div className="space-y-1 pt-1">
                <div className="text-slate-400">حدود المراقبة والضوابط:</div>
                {platform.monitoringBoundaries.map((b, i) => (
                  <p key={i} className="text-slate-300 leading-relaxed">
                    • {b}
                  </p>
                ))}
              </div>
            </div>
          </div>
          </div>
        </details>
      )}

      {(activeTab === 'radar' || activeTab === 'client-errors' || activeTab === 'backend-errors') && (
        <div className={`rounded-xl border p-6 space-y-4 ${surfaceCls}`}>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">
              {activeTab === 'client-errors'
                ? 'أخطاء الواجهة وتجربة المستخدم (Eye 1 — Client Errors)'
                : activeTab === 'backend-errors'
                ? 'أخطاء الخادم والبنية التحتية (Eye 2 — Backend Errors)'
                : `سجل الرادار المباشر لبرنامج ${platform.codeName}`}
            </h2>
            <span className="text-xs font-mono text-slate-400 tabular-nums">
              إجمالي الأحداث المطابقة: {appEvents.length}
            </span>
          </div>

          {appEvents.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">
              لا توجد أحداث مسجلة ضمن هذا الفلتر حالياً. (تذكر: غياب الأخطاء وحده لا يعني السلامة المطلقة دون فحص الرحلة).
            </div>
          ) : (
            <div className="divide-y divide-slate-800/70">
              {appEvents
                .filter((e) =>
                  activeTab === 'client-errors'
                    ? e.eyeLayer === 'Eye 1: Client Experience'
                    : activeTab === 'backend-errors'
                    ? e.eyeLayer === 'Eye 2: Server & Infrastructure'
                    : true
                )
                .map((ev) => (
                  <div key={ev.eventId} className="py-4 space-y-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-semibold text-sky-400">{ev.eventId}</span>
                        <span>·</span>
                        <SeverityLabel severity={ev.severity} />
                        <span>·</span>
                        <span className="font-mono text-slate-300">{ev.eventType}</span>
                        <span>·</span>
                        <span className="font-mono text-slate-400">{ev.eyeLayer}</span>
                      </div>
                      <DataIntegrityTag state={ev.dataIntegrity} />
                    </div>
                    <div className="font-medium text-sm text-slate-100">{ev.safeErrorMessage}</div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-400 font-mono">
                      <span>Op: {ev.operationName}</span>
                      <span>·</span>
                      <span>Code: {ev.errorCode}</span>
                      <span>·</span>
                      <span>Fingerprint: {ev.fingerprint}</span>
                      <span>·</span>
                      <span className="tabular-nums">التكرار: {ev.occurrenceCount}</span>
                      <span>·</span>
                      <span className="tabular-nums">الجلسات المتأثرة: {ev.affectedSessions}</span>
                      <span>·</span>
                      <span>تنقيات الخصوصية: {ev.sanitizedRedactions}</span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'journeys' && (
        <div className={`rounded-xl border p-6 space-y-5 ${surfaceCls}`}>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">
              ذكاء رحلات المستخدم (Customer Journey Intelligence — {platform.codeName})
            </h2>
            <span className="text-xs text-slate-400">
              يرصد نقاط التوقف غير الطبيعية دون اعتبار إغلاق الصفحة الطبيعي عطلاً
            </span>
          </div>
          {platform.journeys.length === 0 ? (
            <p className="text-sm text-slate-400">
              لم يتم تعريف تدفق رحلة مستخدم مفصل لهذا البرنامج بعد — مدرج ضمن خطة التغطية.
            </p>
          ) : (
            <div className="space-y-4">
              {platform.journeys.map((j) => (
                <div key={j.id} className="rounded-lg border border-slate-800 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold">{j.name}</h3>
                      <p className="text-xs text-slate-400 font-mono">
                        الفئة: {j.category} · العينة: {j.sampleCount} جلسة · آخر تحقق: {j.lastVerified}
                      </p>
                    </div>
                    <div className="text-left font-mono">
                      <span className="text-xs text-slate-400">نسبة إكمال الرحلة: </span>
                      <span className="text-base font-bold text-emerald-400 tabular-nums">
                        {j.overallSuccessRate}%
                      </span>
                    </div>
                  </div>
                  <div className="divide-y divide-slate-800/60 text-xs">
                    {j.steps.map((s) => (
                      <div key={s.stepNumber} className="py-2.5 flex flex-wrap items-center justify-between gap-3">
                        <div className="space-y-0.5">
                          <span className="font-medium">
                            الخطوة {s.stepNumber}: {s.name}
                          </span>
                          <p className="text-slate-400">{s.notes}</p>
                        </div>
                        <div className="flex items-center gap-4 font-mono tabular-nums">
                          <span>إكمال: {s.completionRate}%</span>
                          <span>توقف: {s.dropOffRate}%</span>
                          <span
                            className={
                              s.status === 'Nominal' ? 'text-emerald-400' : 'text-amber-400 font-semibold'
                            }
                          >
                            {s.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {(activeTab === 'deployments' || activeTab === 'actions' || activeTab === 'commits') && (
        <div className={`rounded-xl border p-6 space-y-6 ${surfaceCls}`}>
          <div className="space-y-3">
            <h2 className="text-base font-semibold">
              Eye 3 — GitHub Actions, Commits & Deployment Signals ({platform.owner}/{platform.repoName})
            </h2>
            <p className="text-xs text-slate-400">
              يكشف ORBIT حالات الـ Workflow التي تُسجل ناجحة ظاهرياً رغم فشل مهمة فرعية تم التعامل معها كتحذير (Masked Warnings)، ويتحقق من تطابق الإصدار المنشور مع آخر Commit.
            </p>
          </div>

          {/* Deployment Environments, Version Drift & Manual Rollback Readiness */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
            <div className="rounded-lg border border-slate-800 p-3.5 space-y-1">
              <div className="text-slate-400 font-sans">بيئات التشغيل والنشر:</div>
              <div className="text-sky-400 font-bold">{platform.environments.join(' · ')}</div>
              <div className="text-[11px] text-slate-400 font-sans">
                {platform.productionUrl
                  ? `الرابط الإنتاجي الموثق: ${platform.productionUrl}`
                  : 'يعمل محلياً أو بدون رابط إنتاجي عام'}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 p-3.5 space-y-1">
              <div className="text-slate-400 font-sans">تطابق الإصدار المنشور مع آخر Commit:</div>
              <div className="text-emerald-400 font-bold">
                {platform.recentCommits[0]
                  ? `متطابق (${platform.recentCommits[0].sha})`
                  : 'Verified Snapshot'}
              </div>
              <div className="text-[11px] text-slate-400 font-sans">
                لا يوجد انحراف (Version Drift) بين الفرع {platform.defaultBranch} والبيئة
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 p-3.5 space-y-1">
              <div className="text-slate-400 font-sans">جاهزية التراجع اليدوي (Manual Rollback):</div>
              <div className="text-emerald-400 font-bold">Ready (Manual Only)</div>
              <div className="text-[11px] text-slate-400 font-sans">
                يُحظر التراجع التلقائي؛ التراجع متاح بقرار يدوي من المالك فقط
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <details className="group rounded-lg border border-slate-800/70 px-4">
              <summary className="cursor-pointer list-none py-3 text-sm font-semibold text-sky-400 marker:hidden">
                نتائج GitHub Actions الأخيرة ({platform.recentRuns.length})
              </summary>
              {platform.recentRuns.length === 0 ? (
                <p className="pb-3 text-xs text-slate-400">لا توجد تشغيلات مسجلة في اللقطة الحالية.</p>
              ) : (
                <div className="divide-y divide-slate-800/70 text-xs">
                  {platform.recentRuns.map((run) => (
                    <div key={run.id} className="py-3 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-sm">{run.workflowName}</span>
                        <span
                          className={`font-mono font-semibold ${
                            run.status === 'warning_masked'
                              ? 'text-amber-400'
                              : run.status === 'success'
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {run.status === 'warning_masked'
                            ? 'Success with Masked Sub-Job Warning !'
                            : run.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="font-mono text-slate-400">
                        Branch: {run.branch} · Commit: {run.commitSha} ({run.commitMessage}) · Duration:{' '}
                        {run.durationSec}s
                      </div>
                      {run.warningDetails && (
                        <div className="text-amber-300 bg-amber-950/30 border border-amber-500/30 rounded-lg p-2.5">
                          كشف ORBIT: {run.warningDetails}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </details>
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-800/70">
            <h3 className="text-sm font-semibold text-sky-400">سجل التحديثات (Recent Commits & Change Impact)</h3>
            {platform.recentCommits.length === 0 ? (
              <p className="text-xs text-slate-400">لا توجد تحديثات مسجلة في اللقطة الحالية.</p>
            ) : (
              <div className="divide-y divide-slate-800/70 text-xs">
                {platform.recentCommits.map((c) => (
                  <div key={c.sha} className="py-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold text-slate-200">
                        {c.sha} — {c.message}
                      </span>
                      <span className="font-mono text-slate-400">Risk: {c.riskLevel}</span>
                    </div>
                    <div className="font-mono text-slate-400">
                      Author: {c.author} · {c.timestamp} · Files: {c.changedFiles.join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'performance' && (
        <div className={`rounded-xl border p-6 space-y-5 ${surfaceCls}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">تخطيط القلب الرقمي (Digital ECG — {platform.codeName})</h2>
              <p className="text-xs text-slate-400">
                يعرض دائماً: ما تم قياسه · فترة القياس · حجم العينة · مستوى الثقة · سبب التنبيه
              </p>
            </div>
          </div>

          {platform.ecgMetrics.length === 0 ? (
            <p className="text-xs text-slate-400">
              لا تتوفر عينة كافية لبناء خط أساس (Baseline) حالياً — لا يدّعي ORBIT وجود تحليل تنبؤي بدون بيانات كافية.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {platform.ecgMetrics.map((m) => (
                <div key={m.id} className="rounded-lg border border-slate-800 p-4 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">{m.nameAr}</span>
                    <DataIntegrityTag state={m.dataIntegrity} />
                  </div>
                  <div className="flex items-baseline gap-4 font-mono tabular-nums">
                    <div>
                      <span className="text-slate-400">الحالي: </span>
                      <span
                        className={`text-lg font-bold ${
                          m.isAnomalous ? 'text-rose-400' : 'text-emerald-400'
                        }`}
                      >
                        {m.currentValue}
                        {m.unit}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">خط الأساس (Baseline): </span>
                      <span className="text-slate-200 font-semibold">
                        {m.baselineValue}
                        {m.unit}
                      </span>
                    </div>
                  </div>
                  <div className="font-mono text-slate-400">
                    النافذة: {m.measurementWindow} · حجم العينة: {m.sampleSize} · الثقة: {m.confidenceLevel}
                  </div>
                  {m.anomalyReason && (
                    <div className="text-rose-300 pt-1">سبب التنبيه: {m.anomalyReason}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'security' && (
        <div className={`rounded-xl border p-6 space-y-4 ${surfaceCls}`}>
          <h2 className="text-base font-semibold">حارس الأمان والخصوصية (Security & Privacy Guardian)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="rounded-lg border border-slate-800 p-4 space-y-2">
              <div className="font-semibold text-emerald-400">حماية الأسرار (Zero Secret Exposure)</div>
              <p className="text-slate-300">
                لا يخزن ORBIT أي كلمات مرور أو مفاتيح دفع أو مفاتيح قواعد بيانات خاصة بـ {platform.codeName}.
              </p>
            </div>
            <div className="rounded-lg border border-slate-800 p-4 space-y-2">
              <div className="font-semibold text-sky-400">مبدأ أقل صلاحية (Least Privilege)</div>
              <p className="text-slate-300">
                الارتباط مع المستودع {platform.owner}/{platform.repoName} محصور في القراءة فقط (Read-Only) بدون أي صلاحية دمج أو نشر.
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'feature-dna' && (
        <div className={`rounded-xl border p-6 space-y-4 ${surfaceCls}`}>
          <h2 className="text-base font-semibold">سجل بصمة المزايا (Feature DNA Registry)</h2>
          {platform.featuresDna.length === 0 ? (
            <p className="text-xs text-slate-400">
              لا تستنتج سلامة المزايا الفرعية دون اختبار مرتبط؛ جاري استكمال ربط اختبارات القبول.
            </p>
          ) : (
            <div className="divide-y divide-slate-800/70 text-xs">
              {platform.featuresDna.map((f) => (
                <div key={f.id} className="py-3.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">{f.featureName}</span>
                    <span
                      className={`font-mono font-semibold ${
                        f.status === 'Verified' ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      {f.status} · الحساسية: {f.sensitivity}
                    </span>
                  </div>
                  <p className="text-slate-300">{f.purpose}</p>
                  <div className="font-mono text-slate-400">
                    المسار: {f.usagePath} · الملفات: {f.relatedFiles.join(', ')} · الاختبارات الحامية:{' '}
                    {f.protectingTests.join(', ')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'release-shield' && (
        <div className={`rounded-xl border p-6 space-y-4 ${surfaceCls}`}>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">درع فحص التحديثات قبل النشر (Release Shield)</h2>
            <ReleaseShieldLabel rating={platform.releaseShield} />
          </div>
          <p className="text-xs text-slate-400">
            يقدم ORBIT توصية هندسية فقط ولا يمنع أو ينفذ النشر تلقائياً.
          </p>
          {appImpacts.length > 0 ? (
            <div className="space-y-3 text-xs">
              {appImpacts.map((imp) => (
                <div key={imp.id} className="rounded-lg border border-slate-800 p-4 space-y-2">
                  <div className="font-mono font-semibold text-sky-400">
                    Commit {imp.commitSha}: {imp.commitMessage}
                  </div>
                  <div>الملفات المعدلة: {imp.changedFiles.join(', ')}</div>
                  <div>المزايا المحتمل تأثرها: {imp.affectedFeatures.join(' · ')}</div>
                  <div className="text-amber-300">المخاطر الحساسة: {imp.sensitiveRisks.join(' · ')}</div>
                  <div className="font-mono">
                    معدل الخطأ قبل التغيير: {imp.preChangeErrorRate}% ← بعد التغيير: {imp.postChangeErrorRate}% (
                    {imp.correlationType})
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-300">لا توجد تغييرات عالية المخاطر مرصودة في آخر إصدار.</p>
          )}
        </div>
      )}

      {activeTab === 'incidents' && (
        <div className={`rounded-xl border p-6 space-y-4 ${surfaceCls}`}>
          <h2 className="text-base font-semibold">حوادث البرنامج وملفات القضايا الهندسية</h2>
          {appIncidents.length === 0 && appSilent.length === 0 ? (
            <p className="text-xs text-slate-400">لا توجد حوادث مفتوحة لهذا البرنامج حالياً.</p>
          ) : (
            <div className="space-y-3">
              {appIncidents.map((inc) => (
                <div
                  key={inc.incidentId}
                  className="rounded-lg border border-slate-800 p-4 flex flex-wrap items-center justify-between gap-4 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sky-400">{inc.incidentId}</span>
                      <span>·</span>
                      <SeverityLabel severity={inc.severity} />
                      <span>·</span>
                      <span className="font-mono">{inc.status}</span>
                    </div>
                    <div className="text-sm font-semibold">{inc.title}</div>
                    <p className="text-slate-400">{inc.summary}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectIncident(inc.incidentId)}
                    className="px-3.5 py-2 rounded-lg bg-sky-500 text-slate-950 font-semibold hover:bg-sky-400 transition-colors"
                  >
                    فتح ملف القضية ومهمة Claude
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'memory' && (
        <div className={`rounded-xl border p-6 space-y-4 ${surfaceCls}`}>
          <h2 className="text-base font-semibold">الذاكرة الهندسية الدائمة للبرنامج (Engineering Memory)</h2>
          {appMemory.length === 0 ? (
            <p className="text-xs text-slate-400">
              لا توجد حوادث سابقة موثقة ومؤكدة في ذاكرة هذا البرنامج بعد. (لا يتعلم النظام من فرضيات غير مؤكدة).
            </p>
          ) : (
            <div className="space-y-3 text-xs">
              {appMemory.map((m) => (
                <div key={m.id} className="rounded-lg border border-slate-800 p-4 space-y-1.5">
                  <div className="font-semibold text-sm text-emerald-400">{m.problemTitle}</div>
                  <div>السبب الجذري المؤكد: {m.confirmedRootCause}</div>
                  <div className="text-slate-400">
                    الفرضيات المستبعدة: {m.disprovenHypotheses.join(' · ')}
                  </div>
                  <div>الإصلاح الموثق: {m.verifiedFixSummary}</div>
                  <div className="font-mono text-sky-400">
                    الاختبار الوقائي المضاف: {m.preventionTestAdded}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'innovation' && (
        <div className={`rounded-xl border p-6 space-y-4 ${surfaceCls}`}>
          <h2 className="text-base font-semibold">فرص التطوير والتحسين المبنية على الأدلة</h2>
          <div className="space-y-3 text-xs">
            {appInnovations.map((inv) => (
              <div key={inv.id} className="rounded-lg border border-slate-800 p-4 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{inv.title}</span>
                  <span className="font-mono text-sky-400 tabular-nums">
                    Impact: {inv.impactScore}/10 · Effort: {inv.effortScore}/10 · Risk: {inv.riskLevel}
                  </span>
                </div>
                <p className="text-slate-300">الدليل الهندسي: {inv.evidenceBasis}</p>
                <p className="text-emerald-400">العائد المتوقع: {inv.estimatedBenefit}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'coverage' && (
        <div className={`rounded-xl border p-6 space-y-5 ${surfaceCls}`}>
          <h2 className="text-base font-semibold">
            تغطية المراقبة والأنظمة الموجودة مسبقاً داخل المستودع (Section 39)
          </h2>
          <p className="text-xs text-slate-400">
            يستفيد ORBIT من أنظمة المراقبة والاختبارات الموجودة داخل مشاريعك الحالية بدلاً من تكرارها.
          </p>
          {platform.existingSystems.length === 0 ? (
            <p className="text-xs text-slate-400">
              لم يتم رصد نظام رادار داخلي مخصص في هذا المستودع — يعتمد على طبقة القراءة من GitHub بانتظار ربط ORBIT Sensor الاختياري.
            </p>
          ) : (
            <div className="space-y-3 text-xs">
              {platform.existingSystems.map((sys, idx) => (
                <div key={idx} className="rounded-lg border border-slate-800 p-4 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-sky-400">{sys.systemName}</span>
                    <span className="font-mono text-emerald-400">{sys.verificationStatus}</span>
                  </div>
                  <div className="font-mono text-slate-400">المسار: {sys.locationInRepo}</div>
                  <div>الوظيفة: {sys.purpose}</div>
                  <div className="text-slate-300">ملاحظة التكامل: {sys.notes}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'reports' && (
        <div className={`rounded-xl border p-6 space-y-4 ${surfaceCls}`}>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">تقرير الحالة الشامل للبرنامج ({platform.codeName})</h2>
            <button
              type="button"
              onClick={copyProgramReport}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-500 text-slate-950 text-xs font-semibold hover:bg-sky-400 transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copiedReport ? 'تم نسخ التقرير' : 'نسخ تقرير البرنامج'}</span>
            </button>
          </div>
          <pre className="p-4 rounded-lg bg-slate-950 text-slate-200 font-mono text-xs whitespace-pre-wrap leading-relaxed border border-slate-800">
{`# تقرير الفحص الهندسي — ${platform.codeName} (${platform.nameAr})
• المستودع: ${platform.owner}/${platform.repoName} (الفرع: ${platform.defaultBranch})
• نمط التشغيل: ${platform.runtimeMode}
• الحالة الفعلية: ${platform.healthStatus} | نزاهة البيانات: ${platform.dataIntegrity}
• تغطية المراقبة: ${platform.monitoringCoveragePct}% | درع الإصدار: ${platform.releaseShield}
• آخر دليل مؤكد: ${platform.lastVerifiedEvidence}
• الحوادث المسجلة: ${appIncidents.length} | الأحداث: ${appEvents.length}`}
          </pre>
        </div>
      )}
    </div>
  );
};
