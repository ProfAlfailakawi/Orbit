import React, { useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Cpu,
  Eye,
  FileCode2,
  Filter,
  History,
  Play,
  Send,
  ShieldAlert,
} from 'lucide-react';
import {
  ClaudeMissionType,
  generateClaudeMissionPrompt,
  MANDATORY_CLAUDE_GUARDRAIL,
} from '../core/engine';
import type {
  IncidentCaseFile,
  IncidentStatus,
  ObservabilityEye,
  PlatformRecord,
  RadarEvent,
} from '../core/types';
import { DataIntegrityTag, SeverityLabel } from './Primitives';

const INCIDENT_LIFECYCLE_STATUSES: IncidentStatus[] = [
  'Detected',
  'Triaged',
  'Investigating',
  'Action Proposed',
  'Fix In Progress',
  'Verification',
  'Resolved',
  'Reopened',
  'False Positive',
  'Expected Behavior',
  'Monitoring Gap',
  "Won't Fix",
];

interface UniversalRadarViewProps {
  platforms: PlatformRecord[];
  events: RadarEvent[];
  incidents: IncidentCaseFile[];
  selectedIncidentId: string | null;
  onSelectIncident: (id: string) => void;
  onIngestEvent: (payload: {
    appId: string;
    operationName: string;
    errorCode: string;
    errorMessage: string;
    isSilentMismatch: boolean;
    isUserVisible: boolean;
  }) => Promise<void>;
  onTransitionIncident: (params: {
    incidentId: string;
    nextStatus: IncidentStatus;
    note: string;
    technicalVerificationPassed: boolean;
    addToMemory: boolean;
  }) => Promise<void>;
  onRunCanary: () => Promise<void>;
  onRequestAiDiagnosis: (incidentId: string) => Promise<{ mode: string; analysis: string }>;
  isDark: boolean;
}

export const UniversalRadarView: React.FC<UniversalRadarViewProps> = ({
  platforms,
  events,
  incidents,
  selectedIncidentId,
  onSelectIncident,
  onIngestEvent,
  onTransitionIncident,
  onRunCanary,
  onRequestAiDiagnosis,
  isDark,
}) => {
  const [eyeFilter, setEyeFilter] = useState<string>('ALL');
  const [appFilter, setAppFilter] = useState<string>('ALL');
  const [missionType, setMissionType] = useState<ClaudeMissionType>('fix');
  const [copiedMission, setCopiedMission] = useState<string | null>(null);

  // Live Event Test Form State
  const [simAppId, setSimAppId] = useState<string>('MIRAS');
  const [simOpName, setSimOpName] = useState<string>('submission.attachment.upload');
  const [simErrorCode, setSimErrorCode] = useState<string>('ERR_UPLOAD_CHUNK_TIMEOUT');
  const [simMessage, setSimMessage] = useState<string>(
    'تعذر رفع المرفق بعد مهلة 15200ms للطالب student@kuwait.edu مع رمز Bearer ghp_secretToken1234567890'
  );
  const [simSilent, setSimSilent] = useState<boolean>(false);
  const [simVisible, setSimVisible] = useState<boolean>(true);
  const [formError, setFormError] = useState<string | null>(null);

  // Incident Transition State
  const [transitionNote, setTransitionNote] = useState<string>(
    'تم فحص الأدلة وتجهيز التوصية الهندسية.'
  );
  const [techVerifiedCheck, setTechVerifiedCheck] = useState<boolean>(false);
  const [saveToMemoryCheck, setSaveToMemoryCheck] = useState<boolean>(false);

  // Optional AI Diagnosis State
  const [aiDiagLoading, setAiDiagLoading] = useState<boolean>(false);
  const [aiDiagResult, setAiDiagResult] = useState<{ mode: string; analysis: string } | null>(null);

  const activeIncident =
    incidents.find((i) => i.incidentId === selectedIncidentId) || incidents[0] || null;
  const activePlatform =
    platforms.find(
      (p) => p.codeName.toUpperCase() === (activeIncident?.appId || 'MIRAS').toUpperCase()
    ) || platforms[0];

  const filteredEvents = events.filter((ev) => {
    const matchEye = eyeFilter === 'ALL' || ev.eyeLayer === eyeFilter;
    const matchApp = appFilter === 'ALL' || ev.appId.toUpperCase() === appFilter.toUpperCase();
    return matchEye && matchApp;
  });

  const surfaceCls = isDark
    ? 'border-slate-800/90 bg-[#0F172A]/85 text-slate-100'
    : 'border-slate-200 bg-white text-slate-900';

  const handleCopyPrompt = (type: ClaudeMissionType) => {
    if (!activeIncident || !activePlatform) return;
    setMissionType(type);
    const text = generateClaudeMissionPrompt(activeIncident, activePlatform, type);
    navigator.clipboard.writeText(text);
    setCopiedMission(type);
    setTimeout(() => setCopiedMission(null), 2200);
  };

  const handleIngestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simAppId.trim() || !simOpName.trim() || !simErrorCode.trim() || !simMessage.trim()) {
      setFormError('جميع الحقول مطلوبة لإرسال حدث الرادار.');
      return;
    }
    setFormError(null);
    await onIngestEvent({
      appId: simAppId,
      operationName: simOpName,
      errorCode: simErrorCode,
      errorMessage: simMessage,
      isSilentMismatch: simSilent,
      isUserVisible: simVisible,
    });
  };

  const handleTriggerAiDiagnosis = async () => {
    if (!activeIncident) return;
    setAiDiagLoading(true);
    try {
      const res = await onRequestAiDiagnosis(activeIncident.incidentId);
      setAiDiagResult(res);
    } finally {
      setAiDiagLoading(false);
    }
  };

  return (
    <div className="orbit-subpage orbit-radar-page space-y-6">
      {/* Top Control & Three-Eyes Filter Bar */}
      <div className={`rounded-xl border p-6 space-y-4 ${surfaceCls}`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              الرادار الشامل
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              الحوادث والأدلة في مكان واحد. نميّز بين البلاغ الحقيقي والتجربة.
            </p>
          </div>
          <button
            type="button"
            onClick={onRunCanary}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400 transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
            <span>تجربة الرادار الآمنة</span>
          </button>
        </div>

        {/* Three Eyes Selector */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/70">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'ALL', label: 'جميع المصادر' },
                { id: 'Eye 1: Client Experience', label: 'تجربة المستخدم' },
                { id: 'Eye 2: Server & Infrastructure', label: 'الخادم' },
                { id: 'Eye 3: Code & Deployment', label: 'Eye 3 — الكود وGitHub Actions' },
              ] as const
            ).map((eye) => (
              <button
                key={eye.id}
                type="button"
                onClick={() => setEyeFilter(eye.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  eyeFilter === eye.id
                    ? 'bg-sky-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                {eye.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <label htmlFor="radar-app-filter" className="text-slate-400">
              البرنامج:
            </label>
            <select
              id="radar-app-filter"
              value={appFilter}
              onChange={(e) => setAppFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-200 font-mono"
            >
              <option value="ALL">جميع البرامج ({platforms.length})</option>
              {platforms.map((p) => (
                <option key={p.id} value={p.codeName}>
                  {p.codeName} — {p.nameAr}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Split: Left = Event Stream & Live Ingester | Right = Selected Incident Case File + Claude Mission Pack */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Incidents & Events Stream + Live Test Ingester */}
        <div className="lg:col-span-5 space-y-6">
          {/* Active Incidents List */}
          <div className={`rounded-xl border p-5 space-y-4 ${surfaceCls}`}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">الحوادث الموحدة (Deduplicated Incidents)</h2>
              <span className="text-xs font-mono text-slate-400 tabular-nums">
                {incidents.length} قضايا
              </span>
            </div>
            <div className="space-y-2.5">
              {incidents.map((inc) => {
                const isSelected = activeIncident?.incidentId === inc.incidentId;
                return (
                  <button
                    key={inc.incidentId}
                    type="button"
                    onClick={() => {
                      onSelectIncident(inc.incidentId);
                      setAiDiagResult(null);
                    }}
                    className={`w-full text-right rounded-lg border p-3.5 transition-colors space-y-1.5 ${
                      isSelected
                        ? 'border-sky-500 bg-sky-950/25'
                        : 'border-slate-800/80 hover:border-slate-700 bg-slate-950/30'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-mono font-bold text-sky-400">
                        {inc.incidentId} · {inc.appId}
                      </span>
                      <SeverityLabel severity={inc.severity} />
                    </div>
                    <div className="text-xs font-semibold leading-snug">{inc.title}</div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 font-mono tabular-nums">
                      <span>الحالة: {inc.status}</span>
                      <span>·</span>
                      <span>التكرار: {inc.occurrenceCount}</span>
                      <span>·</span>
                      <span>الجلسات: {inc.affectedSessions}</span>
                      <span>·</span>
                      <span>{inc.technicallyVerified ? 'موثق تقنياً' : 'غير موثق بعد'}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interactive Event Ingestion Sandbox */}
          <form
            onSubmit={handleIngestSubmit}
            className={`rounded-xl border p-5 space-y-3.5 ${surfaceCls}`}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                محاكاة استقبال حدث حي (Event Ingestion & Deduplication Test)
              </h2>
              <span className="text-[11px] font-mono text-emerald-400">Sanitizer Active</span>
            </div>
            <p className="text-xs text-slate-400">
              أرسل حدثاً اختبارياً للتحقق من تنقية الأسرار، حساب البصمة (Fingerprint)، ودمج التكرارات تلقائياً.
            </p>
            {formError && (
              <div className="text-xs text-rose-400 bg-rose-950/40 border border-rose-500/30 rounded-lg p-2">
                {formError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label htmlFor="sim-app-select" className="block text-slate-400 mb-1">
                  البرنامج:
                </label>
                <select
                  id="sim-app-select"
                  value={simAppId}
                  onChange={(e) => setSimAppId(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-slate-100 font-mono"
                >
                  {platforms
                    .filter((p) => p.lifecycleState !== 'unlinked')
                    .map((p) => (
                      <option key={p.id} value={p.codeName}>
                        {p.codeName}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label htmlFor="sim-error-code" className="block text-slate-400 mb-1">
                  رمز الخطأ (Error Code):
                </label>
                <input
                  id="sim-error-code"
                  type="text"
                  value={simErrorCode}
                  onChange={(e) => setSimErrorCode(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-slate-100 font-mono"
                />
              </div>
            </div>
            <div className="text-xs">
              <label htmlFor="sim-op-name" className="block text-slate-400 mb-1">
                اسم العملية (Operation Name):
              </label>
              <input
                id="sim-op-name"
                type="text"
                value={simOpName}
                onChange={(e) => setSimOpName(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-slate-100 font-mono"
              />
            </div>
            <div className="text-xs">
              <label htmlFor="sim-error-msg" className="block text-slate-400 mb-1">
                رسالة الحدث (تُنقّى تلقائياً من الإيميلات والتوكنات قبل الحفظ):
              </label>
              <textarea
                id="sim-error-msg"
                rows={2}
                value={simMessage}
                onChange={(e) => setSimMessage(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-slate-100 text-xs"
              />
            </div>
            <div className="flex items-center gap-4 text-xs">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={simVisible}
                  onChange={(e) => setSimVisible(e.target.checked)}
                />
                <span>خطأ مرئي للمستخدم</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={simSilent}
                  onChange={(e) => setSimSilent(e.target.checked)}
                />
                <span>عطل صامت (Silent Failure)</span>
              </label>
            </div>
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>إرسال الحدث إلى الرادار الشامل</span>
            </button>
          </form>

          {/* Raw Normalized Event Stream (All 23 Attributes) */}
          <div className={`rounded-xl border p-5 space-y-3 ${surfaceCls}`}>
            <h2 className="text-sm font-semibold">
              سجل الأحداث المفصل ({filteredEvents.length} حدث)
            </h2>
            <div className="divide-y divide-slate-800/70 max-h-96 overflow-y-auto text-xs">
              {filteredEvents.map((ev) => (
                <div key={ev.eventId} className="py-3 space-y-1">
                  <div className="flex items-center justify-between font-mono">
                    <span className="text-sky-400 font-semibold">
                      {ev.eventId} · {ev.appId} ({ev.environment})
                    </span>
                    <DataIntegrityTag state={ev.dataIntegrity} />
                  </div>
                  <div className="text-slate-200 font-medium">{ev.safeErrorMessage}</div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    FP: {ev.fingerprint} · SHA: {ev.commitSha} · Ver: {ev.releaseVersion} · Trace:{' '}
                    {ev.traceId} · Source: {ev.detectionSource} · Occurrences: {ev.occurrenceCount}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Evidence Engine Case File + Incident Workflow + Black Box + Claude Mission Pack */}
        <div className="lg:col-span-7 space-y-6">
          {activeIncident ? (
            <>
              {/* Case File Header & Evidence Engine (Section 20) */}
              <div className={`rounded-xl border p-6 space-y-5 ${surfaceCls}`}>
                <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-800/70">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                      <span className="text-sky-400 font-bold">{activeIncident.incidentId}</span>
                      <span>·</span>
                      <span>{activeIncident.appId}</span>
                      <span>·</span>
                      <SeverityLabel severity={activeIncident.severity} />
                      <span>·</span>
                      <span>{activeIncident.eyeLayer}</span>
                      <span>·</span>
                      <DataIntegrityTag state={activeIncident.dataIntegrity} />
                    </div>
                    <h2 className="text-lg font-bold">{activeIncident.title}</h2>
                  </div>
                  <div className="text-left font-mono text-xs">
                    <div className="text-slate-400">درجة الثقة في الأدلة</div>
                    <div className="text-lg font-bold text-emerald-400 tabular-nums">
                      {activeIncident.confidenceScore}%
                    </div>
                  </div>
                </div>

                <p className="text-sm text-slate-300 leading-relaxed">{activeIncident.summary}</p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono border border-slate-800/80 rounded-lg p-3.5 bg-slate-950/40 tabular-nums">
                  <div>
                    <div className="text-slate-400">أول ظهور</div>
                    <div className="text-slate-200 mt-0.5">{activeIncident.firstSeen.slice(0, 19)}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">آخر ظهور</div>
                    <div className="text-slate-200 mt-0.5">{activeIncident.lastSeen.slice(0, 19)}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">مرات التكرار</div>
                    <div className="text-sky-400 font-bold text-sm mt-0.5">
                      {activeIncident.occurrenceCount}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">الجلسات المتأثرة</div>
                    <div className="text-amber-400 font-bold text-sm mt-0.5">
                      {activeIncident.affectedSessions}
                    </div>
                  </div>
                </div>

                {/* Confirmed Evidence vs Hypotheses vs Disproven */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="rounded-lg border border-slate-800 p-4 space-y-2">
                    <div className="font-semibold text-emerald-400">
                      الأدلة المؤكدة (Confirmed Evidence)
                    </div>
                    <ul className="space-y-1.5 text-slate-300">
                      {activeIncident.confirmedEvidence.map((ev, i) => (
                        <li key={i}>• {ev}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-lg border border-slate-800 p-4 space-y-2">
                    <div className="font-semibold text-amber-300">
                      الفرضيات المحتملة وما تم استبعاده (Time Machine)
                    </div>
                    <ul className="space-y-1 text-slate-300">
                      {activeIncident.probableHypotheses.map((h, i) => (
                        <li key={i}>• [مرجح]: {h}</li>
                      ))}
                      {activeIncident.falsifiedHypotheses.map((f, i) => (
                        <li key={i} className="text-slate-400">
                          • [مستبعد بالدليل]: {f}
                        </li>
                      ))}
                    </ul>
                    <div className="pt-2 font-mono text-[11px] text-sky-400">
                      Commit مشتبه به زمنياً: {activeIncident.suspectedCommitSha} · الملفات:{' '}
                      {activeIncident.suspectedFiles.join(', ')}
                    </div>
                  </div>
                </div>

                {/* Section 17: BLACK BOX — Flight Recorder */}
                <div className="space-y-2.5 pt-2 border-t border-slate-800/70">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-sky-400">
                      الصندوق الأسود (Black Box Flight Recorder — خالٍ من الأسرار والبيانات الشخصية)
                    </span>
                    <span className="font-mono text-slate-400">Retention: 90 Days</span>
                  </div>
                  <div className="divide-y divide-slate-800/60 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs font-mono">
                    {activeIncident.blackBoxFrames.map((frame) => (
                      <div key={frame.frameId} className="py-2 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="text-sky-400">[{frame.requestType}]</span>{' '}
                          <span className="text-slate-200">{frame.operationName}</span> →{' '}
                          <span
                            className={
                              frame.outcome === 'Success' ? 'text-emerald-400' : 'text-rose-400 font-semibold'
                            }
                          >
                            {frame.statusCode} ({frame.outcome})
                          </span>
                          <div className="text-slate-400 text-[11px] font-sans mt-0.5">
                            {frame.sanitizedPayloadSummary} (حقول منقّاة: {frame.redactedFieldsCount})
                          </div>
                        </div>
                        <span className="text-slate-500 text-[11px]">{frame.timestamp.slice(11, 19)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Section 21: CLAUDE MISSION PACK */}
              <div className={`rounded-xl border p-6 space-y-4 ${surfaceCls}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-sky-400">
                      CLAUDE MISSION PACK — تجهيز مهمة الإصلاح الهندسية
                    </h3>
                    <p className="text-xs text-slate-400">
                      يعتمد على التحليل الحتمي والأدلة أولاً، مع تضمين شرط الحماية الإلزامي دائماً.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyPrompt('fix')}
                    className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-sky-400 transition-colors shadow-xs"
                  >
                    {copiedMission === 'fix' ? (
                      <ClipboardCheck className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                    <span>
                      {copiedMission === 'fix'
                        ? 'تم نسخ مهمة الإصلاح إلى Claude'
                        : 'نسخ مهمة الإصلاح إلى Claude'}
                    </span>
                  </button>
                </div>

                {/* 5 Separate Mission Copy Buttons required by Section 21 */}
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  {(
                    [
                      { id: 'inspect', label: 'نسخ مهمة الفحص' },
                      { id: 'fix', label: 'نسخ مهمة الإصلاح' },
                      { id: 'tests', label: 'نسخ مهمة الاختبارات' },
                      { id: 'report', label: 'نسخ تقرير الحادثة' },
                      { id: 'plan', label: 'نسخ خطة التطوير' },
                    ] as const
                  ).map((btn) => (
                    <button
                      key={btn.id}
                      type="button"
                      onClick={() => handleCopyPrompt(btn.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        missionType === btn.id
                          ? 'border-sky-500 bg-sky-500/15 text-sky-300'
                          : 'border-slate-700 hover:bg-slate-800 text-slate-300'
                      }`}
                    >
                      {copiedMission === btn.id ? `${btn.label}` : btn.label}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={handleTriggerAiDiagnosis}
                    disabled={aiDiagLoading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-emerald-500/40 text-emerald-300 hover:bg-emerald-950/40 transition-colors"
                  >
                    <Cpu className="w-3.5 h-3.5" />
                    <span>
                      {aiDiagLoading ? 'جاري التشخيص...' : 'تشخيص AI اختياري عند الطلب (On-Demand)'}
                    </span>
                  </button>
                </div>

                {aiDiagResult && (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-4 text-xs space-y-1.5">
                    <div className="font-mono font-semibold text-emerald-400">
                      [{aiDiagResult.mode}]
                    </div>
                    <div className="whitespace-pre-wrap text-slate-200 leading-relaxed">
                      {aiDiagResult.analysis}
                    </div>
                  </div>
                )}

                <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-200 font-medium">
                  شرط الحماية المدمج دائماً في البرومت: {MANDATORY_CLAUDE_GUARDRAIL}
                </div>

                <pre className="p-4 rounded-lg bg-slate-950 text-slate-200 font-mono text-xs whitespace-pre-wrap max-h-72 overflow-y-auto border border-slate-800 leading-relaxed">
                  {generateClaudeMissionPrompt(activeIncident, activePlatform, missionType)}
                </pre>
              </div>

              {/* Section 31: INCIDENT WORKFLOW LIFECYCLE */}
              <div className={`rounded-xl border p-6 space-y-4 ${surfaceCls}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">
                      دورة حياة الحادثة والتحقق التقني (Incident Workflow Lifecycle)
                    </h3>
                    <p className="text-xs text-slate-400">
                      يميّز ORBIT بين الإغلاق الإداري وبين التحقق التقني الفعلي من الإصلاح.
                    </p>
                  </div>
                  <span className="font-mono text-xs text-sky-400">
                    الحالة الحالية: {activeIncident.status}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label htmlFor="inc-transition-note" className="block text-slate-400 mb-1">
                      ملاحظة التدقيق (Audit Note):
                    </label>
                    <input
                      id="inc-transition-note"
                      type="text"
                      value={transitionNote}
                      onChange={(e) => setTransitionNote(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-slate-100"
                    />
                  </div>
                  <div className="flex flex-col justify-end gap-1.5">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={techVerifiedCheck}
                        onChange={(e) => setTechVerifiedCheck(e.target.checked)}
                      />
                      <span>تأكيد نجاح التحقق التقني واختبارات عدم التراجع</span>
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={saveToMemoryCheck}
                        onChange={(e) => setSaveToMemoryCheck(e.target.checked)}
                      />
                      <span>إثراء الذاكرة الهندسية الدائمة (Engineering Memory)</span>
                    </label>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {INCIDENT_LIFECYCLE_STATUSES.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() =>
                        onTransitionIncident({
                          incidentId: activeIncident.incidentId,
                          nextStatus: st,
                          note: transitionNote,
                          technicalVerificationPassed: techVerifiedCheck,
                          addToMemory: saveToMemoryCheck,
                        })
                      }
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-mono transition-colors border ${
                        activeIncident.status === st
                          ? 'bg-sky-500 text-slate-950 border-sky-400 font-bold'
                          : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>

                <div className="space-y-2 pt-3 border-t border-slate-800/70 text-xs">
                  <div className="font-semibold text-slate-300">سجل تغييرات الحادثة (Audit Trail):</div>
                  {activeIncident.history.map((h, i) => (
                    <div key={i} className="flex flex-wrap items-center justify-between gap-2 text-slate-400 font-mono">
                      <span>
                        [{h.timestamp.slice(11, 19)}] {h.actor}: {h.fromStatus} →{' '}
                        <strong className="text-slate-200">{h.toStatus}</strong> — {h.note}
                      </span>
                      {h.isTechnicalVerification && (
                        <span className="text-emerald-400">[Verified Fix]</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
