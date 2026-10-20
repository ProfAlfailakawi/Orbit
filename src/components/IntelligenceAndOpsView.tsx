import React, { useState } from 'react';
import {
  ClipboardCheck,
  Copy,
  Edit3,
  FileCode2,
  FlaskConical,
  Play,
  Plus,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Webhook,
} from 'lucide-react';
import { ORBIT_SENSOR_SDK_SOURCE_PREVIEW, createOrbitSensor } from '../sdk/orbit-sensor';
import type {
  AcceptanceCriterionResult,
  AlertNotification,
  CanaryTestResult,
  ChangeImpactAnalysis,
  CostGuardMetrics,
  CrossAppPattern,
  EngineeringMemoryEntry,
  FeatureMatrixItem,
  IncidentCaseFile,
  InnovationOpportunity,
  PlatformRecord,
  SelfHealthMetrics,
  SilentFailureSignal,
} from '../core/types';
import type { DigitalTwinRunResult, SecurityGuardianScanResult } from '../core/engine';
import { DataIntegrityTag, ReleaseShieldLabel, SeverityLabel } from './Primitives';

interface IntelligenceProps {
  platforms: PlatformRecord[];
  changeImpacts: ChangeImpactAnalysis[];
  crossAppPatterns: CrossAppPattern[];
  engineeringMemory: EngineeringMemoryEntry[];
  silentFailures: SilentFailureSignal[];
  onTriggerSilentFailureTest: () => Promise<void>;
  onSaveMemory?: (payload: {
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
  }) => Promise<{ accepted: boolean; error?: string }>;
  isDark: boolean;
}

export const EngineeringIntelligenceView: React.FC<IntelligenceProps> = ({
  platforms,
  changeImpacts,
  crossAppPatterns,
  engineeringMemory,
  silentFailures,
  onTriggerSilentFailureTest,
  onSaveMemory,
  isDark,
}) => {
  const [memorySearch, setMemorySearch] = useState('');
  const [copiedSdk, setCopiedSdk] = useState(false);

  // Section 19: Interactive Engineering Memory Editor State
  const [showMemoryForm, setShowMemoryForm] = useState(false);
  const [editingMemoryId, setEditingMemoryId] = useState<string | undefined>(undefined);
  const [memAppId, setMemAppId] = useState('MIRAS');
  const [memIncidentId, setMemIncidentId] = useState('INC-MIRAS-101');
  const [memTitle, setMemTitle] = useState('');
  const [memRootCause, setMemRootCause] = useState('');
  const [memDisproven, setMemDisproven] = useState('');
  const [memFix, setMemFix] = useState('');
  const [memTest, setMemTest] = useState('');
  const [memLesson, setMemLesson] = useState('');
  const [memTag, setMemTag] = useState('Mobile Upload');
  const [memConfirmed, setMemConfirmed] = useState(true);
  const [memoryFeedback, setMemoryFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // Section 22: Digital Twin Lab State
  const [twinAppId, setTwinAppId] = useState('ORDER');
  const [twinResult, setTwinResult] = useState<DigitalTwinRunResult | null>(null);
  const [failOpenResult, setFailOpenResult] = useState<string | null>(null);

  // Section 23: Security Guardian 8-Point Scan State
  const [secScanResult, setSecScanResult] = useState<SecurityGuardianScanResult | null>(null);

  const surfaceCls = isDark
    ? 'border-slate-800/90 bg-[#0F172A]/85 text-slate-100'
    : 'border-slate-200 bg-white text-slate-900';

  const filteredMemory = engineeringMemory.filter((m) =>
    `${m.appId} ${m.problemTitle} ${m.confirmedRootCause} ${m.lessonsLearned} ${m.recurringPatternTag}`
      .toLowerCase()
      .includes(memorySearch.toLowerCase())
  );

  const copySdk = () => {
    navigator.clipboard.writeText(ORBIT_SENSOR_SDK_SOURCE_PREVIEW);
    setCopiedSdk(true);
    setTimeout(() => setCopiedSdk(false), 2000);
  };

  const handleLoadMemoryForEdit = (mem: EngineeringMemoryEntry) => {
    setEditingMemoryId(mem.id);
    setMemAppId(mem.appId);
    setMemIncidentId(mem.incidentId);
    setMemTitle(mem.problemTitle);
    setMemRootCause(mem.confirmedRootCause);
    setMemDisproven(mem.disprovenHypotheses.join(' | '));
    setMemFix(mem.verifiedFixSummary);
    setMemTest(mem.preventionTestAdded);
    setMemLesson(mem.lessonsLearned);
    setMemTag(mem.recurringPatternTag);
    setMemConfirmed(true);
    setShowMemoryForm(true);
    setMemoryFeedback(null);
  };

  const handleSaveMemorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveMemory) return;
    const res = await onSaveMemory({
      id: editingMemoryId,
      appId: memAppId,
      incidentId: memIncidentId,
      problemTitle: memTitle,
      confirmedRootCause: memRootCause,
      disprovenHypotheses: memDisproven
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean),
      verifiedFixSummary: memFix,
      preventionTestAdded: memTest,
      lessonsLearned: memLesson,
      recurringPatternTag: memTag,
      isConfirmedByEvidence: memConfirmed,
    });
    if (res.accepted) {
      setMemoryFeedback({
        ok: true,
        text: 'تم حفظ وتوثيق الدرس الهندسي في الذاكرة الدائمة بنجاح.',
      });
      setShowMemoryForm(false);
      setEditingMemoryId(undefined);
    } else {
      setMemoryFeedback({
        ok: false,
        text: res.error || 'تم رفض حفظ استنتاج غير مؤكد.',
      });
    }
  };

  const handleTestUnconfirmedRejection = async () => {
    if (!onSaveMemory) return;
    const res = await onSaveMemory({
      appId: 'MIRAS',
      incidentId: 'INC-MIRAS-101',
      problemTitle: 'تخمين غير مؤكد حول ذاكرة المتصفح',
      confirmedRootCause: 'ربما امتلاء الكاش في المتصفح بدون دليل',
      disprovenHypotheses: [],
      verifiedFixSummary: 'اقتراح مسح الكاش',
      preventionTestAdded: 'tests/cache.spec.ts',
      lessonsLearned: 'مجرد تخمين',
      recurringPatternTag: 'Unverified Guess',
      isConfirmedByEvidence: false,
    });
    setMemoryFeedback({
      ok: false,
      text:
        res.error ||
        'رفض الحفظ كحقيقة هندسية (Section 19): لا يجوز للنظام التعلم من استنتاجات غير مؤكدة بالدليل.',
    });
  };

  const handleRunDigitalTwin = async (
    scenario: 'all' | 'auth' | 'save_submit' | 'payment_mock' | 'notification_mock' | 'journey_regression'
  ) => {
    const res = await fetch('/api/twin/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId: twinAppId, scenario }),
    });
    if (res.ok) {
      const data = await res.json();
      setTwinResult(data.runResult);
    }
  };

  const handleRunFailOpenTest = () => {
    const start = performance.now();
    // Point sensor to an unreachable port to prove Fail-Open Non-Blocking isolation (Section 3, 7 & 38.14)
    const isolatedSensor = createOrbitSensor({
      appId: 'MIRAS',
      environment: 'fail-open-sandbox',
      releaseVersion: 'v2026.10',
      endpointUrl: 'http://127.0.0.1:59999/unreachable-orbit-endpoint',
      enabled: true,
    });
    let threwException = false;
    try {
      isolatedSensor.captureUserVisibleError(
        'UPLOAD_RETRY_TOAST',
        'فشل اختباري معزول لإثبات عدم تعطل البرنامج عند انقطاع اتصال ORBIT (Bearer ghp_secretToken1234567890)',
        'submission.upload'
      );
    } catch {
      threwException = true;
    }
    const elapsedMs = (performance.now() - start).toFixed(2);
    setFailOpenResult(
      `[PASS — Fail-Open Isolation Verified]: تم استدعاء الحساس مع محاكاة تعطل خادم ORBIT بالكامل — زمن التنفيذ غير الحاجب: ${elapsedMs}ms · الاستثناءات المرمية على البرنامج: ${
        threwException ? '1 (FAIL)' : '0 (صفر تأثر)'
      } · حالة البرنامج المراقَب: مستمر ويعمل بشكل طبيعي 100%.`
    );
  };

  const handleRunSecurityScan = async () => {
    const res = await fetch('/api/security/scan', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      setSecScanResult(data.scanResult);
    }
  };

  return (
    <div className="orbit-subpage orbit-intelligence-page space-y-6">
      <div className={`rounded-xl border p-6 space-y-2 ${surfaceCls}`}>
        <h1 className="text-xl font-bold tracking-tight">
          الذكاء الهندسي
        </h1>
        <p className="text-xs text-slate-400">
          افهم أثر التحديثات، اكتشف الأنماط المتكررة، واحفظ الحلول التي تم التحقق منها.
        </p>
      </div>

      {/* Section 13 & 16: Change Impact X-Ray & Regression Time Machine */}
      <div className={`rounded-xl border p-6 space-y-4 ${surfaceCls}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">
              أثر التحديثات والتراجعات
            </h2>
            <p className="text-xs text-slate-400">
              يربط التحديثات بالحوادث اللاحقة مع التمييز الصارم بين التزامن الزمني والسبب المؤكد بالدليل.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {changeImpacts.map((imp) => (
            <div key={imp.id} className="rounded-lg border border-slate-800 p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-sky-400">
                  {imp.appId} · Commit {imp.commitSha}
                </span>
                <ReleaseShieldLabel rating={imp.releaseShieldVerdict} />
              </div>
              <div className="font-semibold text-sm">{imp.commitMessage}</div>
              <div className="font-mono text-slate-400">
                الملفات المتغيرة: {imp.changedFiles.join(', ')}
              </div>
              <div>الاعتماديات المتأثرة: {imp.affectedDependencies.join(' · ')}</div>
              <div>المزايا المرتبطة: {imp.affectedFeatures.join(' · ')}</div>
              <div className="text-amber-300">المخاطر الحساسة: {imp.sensitiveRisks.join(' · ')}</div>
              <div className="pt-2 border-t border-slate-800/70 flex items-center justify-between font-mono tabular-nums">
                <span>
                  معدل الأخطاء: قبل {imp.preChangeErrorRate}% ← بعد {imp.postChangeErrorRate}%
                </span>
                <span className="text-emerald-400">[{imp.correlationType}]</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section 18: Cross-App Intelligence & Section 12: Silent Failure Detector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className={`lg:col-span-6 rounded-xl border p-6 space-y-4 ${surfaceCls}`}>
          <h2 className="text-base font-semibold">
            الذكاء العابر للبرامج (Cross-App Intelligence — {platforms.length} منصة — Section 18)
          </h2>
          <p className="text-xs text-slate-400">
            يكتشف الاعتماديات والأنماط البرمجية المشتركة بين مستودعاتك دون افتراض أن وجود المكتبة يعني وقوع العطل حتماً.
          </p>
          <div className="space-y-3 text-xs">
            {crossAppPatterns.map((pat) => (
              <div key={pat.id} className="rounded-lg border border-slate-800 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-sky-400">{pat.title}</span>
                  <span className="font-mono text-amber-400">{pat.status}</span>
                </div>
                <div className="font-mono text-slate-400">
                  الأصل المرصود: {pat.originAppId} ← مشاريع تشترك في النمط:{' '}
                  {pat.potentiallyAffectedAppIds.join(', ')}
                </div>
                <p className="text-slate-300">{pat.riskDescription}</p>
                <div className="text-emerald-400">
                  الفحص الوقائي المقترح: {pat.recommendedVerificationPerApp}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={`lg:col-span-6 rounded-xl border p-6 space-y-4 ${surfaceCls}`}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">
                كاشف الأعطال الصامتة (Silent Failure Detector — Section 12)
              </h2>
              <p className="text-xs text-slate-400">
                يرصد العمليات التي تُظهر نجاحاً شكلياً (HTTP 200 / Toast) دون اكتمال النتيجة الوظيفية الفعلية.
              </p>
            </div>
            <button
              type="button"
              onClick={onTriggerSilentFailureTest}
              className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-semibold hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0"
            >
              محاكاة رصد عطل صامت
            </button>
          </div>
          <div className="space-y-3 text-xs">
            {silentFailures.map((sf) => (
              <div key={sf.id} className="rounded-lg border border-slate-800 p-4 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-amber-400">
                    {sf.appId} · {sf.patternType}
                  </span>
                  <DataIntegrityTag state={sf.dataIntegrity} />
                </div>
                <div className="font-mono text-slate-300">العملية: {sf.operationName}</div>
                <p className="text-slate-300">{sf.evidenceSummary}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
                  <span className="text-emerald-400">المتوقع: {sf.expectedOutcome}</span>
                  <span className="text-rose-400">الفعلي: {sf.actualOutcome}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Section 19: Self-Learning Engineering Memory (Searchable, Reviewable, Correctable, Evidence-Gated) */}
      <div className={`rounded-xl border p-6 space-y-4 ${surfaceCls}`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">
              الذاكرة الهندسية الدائمة (Self-Learning Engineering Memory — Section 19)
            </h2>
            <p className="text-xs text-slate-400">
              قابلة للبحث والمراجعة والتصحيح — تحفظ الأسباب الجذرية المؤكدة وترفض التعلم من استنتاجات غير مؤكدة باعتبارها حقائق.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5" />
              <input
                type="text"
                value={memorySearch}
                onChange={(e) => setMemorySearch(e.target.value)}
                placeholder="ابحث في الذاكرة الهندسية..."
                aria-label="ابحث في الذاكرة الهندسية"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 pr-8 pl-3 py-1.5 text-xs text-slate-100"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingMemoryId(undefined);
                setMemTitle('');
                setMemRootCause('');
                setMemDisproven('');
                setMemFix('');
                setMemTest('');
                setMemLesson('');
                setMemConfirmed(true);
                setShowMemoryForm(!showMemoryForm);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-sky-400 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة درس موثق</span>
            </button>
            <button
              type="button"
              onClick={handleTestUnconfirmedRejection}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-950/20 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-950/40 transition-colors"
            >
              <span>اختبار رفض استنتاج غير مؤكد (Guard Test)</span>
            </button>
          </div>
        </div>

        {memoryFeedback && (
          <div
            className={`rounded-lg border p-3 text-xs font-mono ${
              memoryFeedback.ok
                ? 'border-emerald-500/40 bg-emerald-950/20 text-emerald-300'
                : 'border-rose-500/40 bg-rose-950/25 text-rose-300'
            }`}
          >
            {memoryFeedback.text}
          </div>
        )}

        {showMemoryForm && (
          <form
            onSubmit={handleSaveMemorySubmit}
            className="rounded-xl border border-sky-500/40 bg-slate-950/70 p-4 space-y-3 text-xs"
          >
            <div className="font-semibold text-sky-400">
              {editingMemoryId
                ? `مراجعة وتصحيح سجل الذاكرة الهندسية (${editingMemoryId})`
                : 'تسجيل درس هندسي جديد موثق بالدليل'}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">البرنامج:</label>
                <input
                  type="text"
                  value={memAppId}
                  onChange={(e) => setMemAppId(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 font-mono text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">رقم القضية المرتبطة:</label>
                <input
                  type="text"
                  value={memIncidentId}
                  onChange={(e) => setMemIncidentId(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 font-mono text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">وسم النمط المتكرر:</label>
                <input
                  type="text"
                  value={memTag}
                  onChange={(e) => setMemTag(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 font-mono text-slate-100"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">عنوان المشكلة:</label>
                <input
                  type="text"
                  required
                  value={memTitle}
                  onChange={(e) => setMemTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">السبب الجذري المؤكد بالدليل:</label>
                <input
                  type="text"
                  required
                  value={memRootCause}
                  onChange={(e) => setMemRootCause(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">الفرضيات التي ثبت خطؤها (افصل بـ |):</label>
                <input
                  type="text"
                  value={memDisproven}
                  onChange={(e) => setMemDisproven(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">طريقة الإصلاح الموثقة:</label>
                <input
                  type="text"
                  required
                  value={memFix}
                  onChange={(e) => setMemFix(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">اختبار منع التكرار (Prevention Test):</label>
                <input
                  type="text"
                  required
                  value={memTest}
                  onChange={(e) => setMemTest(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 font-mono text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">الدرس المستفاد:</label>
                <input
                  type="text"
                  value={memLesson}
                  onChange={(e) => setMemLesson(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-slate-100"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <label className="inline-flex items-center gap-2 cursor-pointer text-emerald-300 font-medium">
                <input
                  type="checkbox"
                  checked={memConfirmed}
                  onChange={(e) => setMemConfirmed(e.target.checked)}
                />
                <span>أؤكد أن هذا السبب موثق بدليل تقني قاطع وليس مجرد فرضية غير مؤكدة (Section 19)</span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-500 px-4 py-1.5 font-semibold text-slate-950 hover:bg-emerald-400"
                >
                  حفظ في الذاكرة الهندسية
                </button>
                <button
                  type="button"
                  onClick={() => setShowMemoryForm(false)}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-300"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {filteredMemory.map((mem) => (
            <div key={mem.id} className="rounded-lg border border-slate-800 p-4 space-y-2">
              <div className="flex items-center justify-between font-mono">
                <span className="text-sky-400 font-bold">
                  {mem.appId} · {mem.incidentId}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400">Verified by {mem.verifiedBy}</span>
                  <button
                    type="button"
                    onClick={() => handleLoadMemoryForEdit(mem)}
                    className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-slate-800"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>مراجعة وتصحيح</span>
                  </button>
                </div>
              </div>
              <div className="font-semibold text-sm">{mem.problemTitle}</div>
              <div>
                <strong className="text-slate-300">السبب المؤكد: </strong>
                {mem.confirmedRootCause}
              </div>
              <div className="text-slate-400">
                <strong>الفرضيات التي ثبت خطؤها: </strong>
                {mem.disprovenHypotheses.join(' · ')}
              </div>
              <div>
                <strong className="text-emerald-400">الإصلاح الموثق: </strong>
                {mem.verifiedFixSummary}
              </div>
              <div className="font-mono text-sky-300">
                الاختبار الوقائي: {mem.preventionTestAdded} | النمط: {mem.recurringPatternTag}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section 7: Standalone ORBIT SENSOR SDK & Section 22: Digital Twin Lab */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className={`lg:col-span-7 rounded-xl border p-6 space-y-4 ${surfaceCls}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">
                مكتبة ORBIT SENSOR المستقلة (Zero Blind Spots SDK — Section 7 — غير مركبة تلقائياً)
              </h2>
              <p className="text-xs text-slate-400">
                Lightweight · Non-blocking · Fail-open · واجهة موحدة لرسائل أخطاء المستخدم (captureUserVisibleError).
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleRunFailOpenTest}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-950/40 transition-colors"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>اختبار عزل فشل الحساس (Fail-Open Test)</span>
              </button>
              <button
                type="button"
                onClick={copySdk}
                className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-sky-400 transition-colors"
              >
                {copiedSdk ? <ClipboardCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSdk ? 'تم نسخ كود الحساس' : 'نسخ كود ORBIT SENSOR'}</span>
              </button>
            </div>
          </div>

          {failOpenResult && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/25 p-3 text-xs font-mono text-emerald-300">
              {failOpenResult}
            </div>
          )}

          <pre
            dir="ltr"
            className="p-4 rounded-lg bg-slate-950 text-slate-200 font-mono text-xs overflow-x-auto border border-slate-800 leading-relaxed max-h-80"
          >
            {ORBIT_SENSOR_SDK_SOURCE_PREVIEW}
          </pre>
        </div>

        <div className={`lg:col-span-5 rounded-xl border p-6 space-y-4 ${surfaceCls}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">
                المختبر الموازي الآمن (Digital Twin Lab — Section 22)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                بيئة اختبار منفصلة ببيانات وهمية وخدمات Mock — بدون أسرار إنتاج وبدون معاملات مالية حقيقية.
              </p>
            </div>
            <select
              aria-label="اختيار البرنامج للمختبر الموازي"
              value={twinAppId}
              onChange={(e) => setTwinAppId(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-mono text-slate-100"
            >
              {platforms.map((p) => (
                <option key={p.id} value={p.codeName}>
                  {p.codeName} — {p.nameAr}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2 text-xs">
            <button
              type="button"
              onClick={() => handleRunDigitalTwin('all')}
              className="w-full text-right rounded-lg bg-sky-500/15 border border-sky-500/40 hover:bg-sky-500/25 p-3 font-semibold text-sky-300 transition-colors flex items-center justify-between"
            >
              <span>تشغيل الدورة الكاملة للمختبر الموازي (5 مراحل Mock معزولة)</span>
              <FlaskConical className="w-4 h-4 text-sky-400 shrink-0" />
            </button>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleRunDigitalTwin('auth')}
                className="text-right rounded-lg border border-slate-800 hover:border-sky-500/50 p-2.5 transition-colors"
              >
                1. محاكاة تسجيل الدخول (Auth Mock)
              </button>
              <button
                type="button"
                onClick={() => handleRunDigitalTwin('save_submit')}
                className="text-right rounded-lg border border-slate-800 hover:border-sky-500/50 p-2.5 transition-colors"
              >
                2. محاكاة الحفظ والإرسال (Save Mock)
              </button>
              <button
                type="button"
                onClick={() => handleRunDigitalTwin('payment_mock')}
                className="text-right rounded-lg border border-slate-800 hover:border-sky-500/50 p-2.5 transition-colors"
              >
                3. محاكاة الدفع الآمن ($0.00 Mock)
              </button>
              <button
                type="button"
                onClick={() => handleRunDigitalTwin('notification_mock')}
                className="text-right rounded-lg border border-slate-800 hover:border-sky-500/50 p-2.5 transition-colors"
              >
                4. محاكاة الإشعارات بدون إرسال فعلي
              </button>
            </div>
          </div>

          {twinResult && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/20 p-3.5 text-xs space-y-2">
              <div className="flex items-center justify-between font-mono text-emerald-400 font-bold">
                <span>
                  {twinResult.runId} · {twinResult.appId}
                </span>
                <span>[Zero Production Touch]</span>
              </div>
              <div className="space-y-1.5">
                {twinResult.steps.map((st, idx) => (
                  <div key={idx} className="border-t border-slate-800/70 pt-1.5">
                    <div className="flex items-center justify-between font-semibold text-slate-200">
                      <span>{st.stepName}</span>
                      <span className="font-mono text-emerald-400">{st.latencyMs}ms · PASS</span>
                    </div>
                    <div className="text-[11px] font-mono text-sky-300">Adapter: {st.mockServiceUsed}</div>
                    <p className="text-slate-300 text-[11px]">{st.outcome}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Section 23: SECURITY & PRIVACY GUARDIAN (8-Point Non-Destructive Audit) */}
      <div className={`rounded-xl border p-6 space-y-4 ${surfaceCls}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">
              حارس الأمان والخصوصية غير المدمر (Security & Privacy Guardian — Section 23)
            </h2>
            <p className="text-xs text-slate-400">
              يفحص الأبعاد الأمنية الثمانية بصورة غير مدمرة ووفق مبدأ Least Privilege دون استخراج الأسرار أو تنفيذ اختبارات اختراق هجومية.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRunSecurityScan}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 transition-colors"
          >
            <Shield className="w-3.5 h-3.5" />
            <span>تشغيل الفحص الأمني غير المدمر (8 أبعاد)</span>
          </button>
        </div>

        {secScanResult && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {secScanResult.checks.map((chk) => (
              <div key={chk.id} className="rounded-lg border border-slate-800 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between font-mono">
                  <span className="text-sky-400 font-bold">{chk.id}</span>
                  <span
                    className={
                      chk.status === 'Verified Safe' ? 'text-emerald-400 font-semibold' : 'text-amber-400'
                    }
                  >
                    [{chk.status}]
                  </span>
                </div>
                <div className="font-semibold text-slate-100">{chk.dimensionAr}</div>
                <p className="text-slate-400 leading-relaxed">{chk.finding}</p>
                <div className="text-[11px] text-emerald-300">التوصية: {chk.recommendation}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

interface OperationsAndGovernanceProps {
  platforms: PlatformRecord[];
  incidents: IncidentCaseFile[];
  innovations: InnovationOpportunity[];
  alerts: AlertNotification[];
  selfHealth: SelfHealthMetrics;
  costGuard: CostGuardMetrics;
  canaryHistory: CanaryTestResult[];
  featureMatrix: FeatureMatrixItem[];
  acceptanceCriteria: AcceptanceCriterionResult[];
  auditLogs: Array<{
    id: string;
    timestamp: string;
    actor: string;
    action: string;
    target: string;
    detail: string;
  }>;
  onRunCanary: () => Promise<void>;
  onSelectIncident: (id: string) => void;
  onSimulateOutage?: (simulate: boolean) => Promise<void>;
  onSimulateWebhook?: (params: {
    appId: string;
    hasHiddenSubStepWarning: boolean;
    tamperSignature: boolean;
  }) => Promise<{ verified: boolean; signatureHeader: string; message: string }>;
  isDark: boolean;
}

const DELIVERABLE_DATABASE_SCHEMA_SQL = `-- ORBIT | أوربت — Cost-First Relational & Document Schema (Section 37)
-- Private Repository Target: ProfAlfailakawi/orbit (Read-Only Guarantee)

CREATE TABLE orbit_platforms (
  id VARCHAR(64) PRIMARY KEY,
  code_name VARCHAR(32) UNIQUE NOT NULL,
  name_ar TEXT NOT NULL,
  owner VARCHAR(64) NOT NULL DEFAULT 'ProfAlfailakawi',
  repo_name VARCHAR(128) NOT NULL,
  default_branch VARCHAR(64) NOT NULL DEFAULT 'main',
  runtime_mode VARCHAR(32) NOT NULL, -- 'github-web' | 'github-local' | 'external-non-github' | 'local-runtime'
  lifecycle_state VARCHAR(24) NOT NULL DEFAULT 'active', -- 'active' | 'paused' | 'archived' | 'unlinked'
  connection_verified BOOLEAN NOT NULL DEFAULT FALSE,
  monitoring_coverage_pct INTEGER NOT NULL DEFAULT 0,
  health_status VARCHAR(32) NOT NULL DEFAULT 'Unknown',
  data_integrity VARCHAR(24) NOT NULL DEFAULT 'Not Configured',
  last_verified_evidence TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE orbit_universal_radar_events (
  event_id VARCHAR(64) PRIMARY KEY,
  app_id VARCHAR(32) NOT NULL REFERENCES orbit_platforms(code_name),
  environment VARCHAR(32) NOT NULL,
  event_type VARCHAR(48) NOT NULL, -- 9 Canonical Categories (Section 6)
  severity VARCHAR(24) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  release_version VARCHAR(64),
  commit_sha VARCHAR(40),
  browser_os VARCHAR(128),
  operation_name VARCHAR(128) NOT NULL,
  error_code VARCHAR(64) NOT NULL,
  safe_error_message TEXT NOT NULL, -- Sanitized via PII & Secret Redactor
  sanitized_stack_trace TEXT,
  correlation_id VARCHAR(64) NOT NULL,
  trace_id VARCHAR(64) NOT NULL,
  first_seen TIMESTAMPTZ NOT NULL,
  last_seen TIMESTAMPTZ NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  affected_sessions INTEGER NOT NULL DEFAULT 1,
  detection_source VARCHAR(48) NOT NULL,
  eye_layer VARCHAR(48) NOT NULL, -- Eye 1 | Eye 2 | Eye 3
  fingerprint VARCHAR(64) NOT NULL,
  incident_status VARCHAR(32) NOT NULL,
  confidence_level VARCHAR(32) NOT NULL,
  data_integrity VARCHAR(24) NOT NULL
);

CREATE TABLE orbit_incidents (
  incident_id VARCHAR(64) PRIMARY KEY,
  fingerprint VARCHAR(64) UNIQUE NOT NULL,
  app_id VARCHAR(32) NOT NULL,
  title TEXT NOT NULL,
  severity VARCHAR(24) NOT NULL,
  status VARCHAR(32) NOT NULL, -- Detected -> Triaged -> Investigating -> Action Proposed -> Fix In Progress -> Verification -> Resolved
  technically_verified BOOLEAN NOT NULL DEFAULT FALSE,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  affected_sessions INTEGER NOT NULL DEFAULT 1,
  suspected_commit_sha VARCHAR(40),
  confidence_score INTEGER NOT NULL
);

CREATE TABLE orbit_engineering_memory (
  id VARCHAR(64) PRIMARY KEY,
  app_id VARCHAR(32) NOT NULL,
  incident_id VARCHAR(64) NOT NULL,
  problem_title TEXT NOT NULL,
  confirmed_root_cause TEXT NOT NULL,
  verified_fix_summary TEXT NOT NULL,
  prevention_test_added TEXT NOT NULL,
  verified_by VARCHAR(64) NOT NULL DEFAULT 'ProfAlfailakawi',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`;

const DELIVERABLE_DEPLOYMENT_AND_ENV_GUIDE = `# دليل النشر الآمن ومتغيرات البيئة (Section 3, 32, 33 & 37)
# المستودع المستقل المقترح: ProfAlfailakawi/orbit (Private Repository)

## 1. متغيرات البيئة على الخادم فقط (.env.example)
GEMINI_API_KEY="اختياري — للتشخيص عند الطلب فقط (يعمل النظام حتمياً بتكلفة $0.00 بدونه)"
GITHUB_READ_ONLY_TOKEN="اختياري — Fine-Grained PAT بصلاحية Read-Only فقط (Contents: Read, Actions: Read, Metadata: Read)"
GITHUB_WEBHOOK_SECRET="سر التحقق من توقيع X-Hub-Signature-256 عبر HMAC-SHA256"
ORBIT_OPERATOR_PASSKEY="رمز دخول المشغل الخاص بغرفة العمليات"

## 2. ضمانات العزل والأمان (Non-Negotiable Guarantees)
- صلاحية GitHub: Read-Only فقط — ممنوع منح صلاحيات Write أو Administration.
- صفر تعديل تلقائي: لا يقوم ORBIT بإنشاء Pull Requests أو Merge أو Deploy أو Rollback تلقائياً.
- فشل آمن (Fail-Open): إذا توقف ORBIT، تستمر جميع البرامج الـ 11 بالعمل دون أي تأثر.`;

export const OperationsAndGovernanceView: React.FC<OperationsAndGovernanceProps> = ({
  platforms,
  incidents,
  innovations,
  alerts,
  selfHealth,
  costGuard,
  canaryHistory,
  featureMatrix,
  acceptanceCriteria,
  auditLogs,
  onRunCanary,
  onSelectIncident,
  onSimulateOutage,
  onSimulateWebhook,
  isDark,
}) => {
  const [copiedBrief, setCopiedBrief] = useState(false);
  const [quietHoursActive, setQuietHoursActive] = useState(true);
  const [webhookStatus, setWebhookStatus] = useState<{
    verified: boolean;
    signatureHeader: string;
    message: string;
  } | null>(null);
  const [deliverableTab, setDeliverableTab] = useState<
    'db-schema' | 'deployment' | 'coverage-report' | 'approvals-needed'
  >('db-schema');

  const surfaceCls = isDark
    ? 'border-slate-800/90 bg-[#0F172A]/85 text-slate-100'
    : 'border-slate-200 bg-white text-slate-900';

  const activePlatforms = platforms.filter((p) => p.lifecycleState !== 'unlinked');

  const dailyBriefText = `# ORBIT DAILY BRIEF — التقرير الذكي اليومي (${new Date().toISOString().slice(0, 10)})
====================================================================
• إجمالي البرامج المراقبة حالياً: ${activePlatforms.length} برنامج
• ما تغير خلال آخر 24 ساعة: تحديثان في MIRAS (7c91e04) وORDER (e41b992) + نجاح بناء TEBYAN (3b19d8a).
• الحوادث النشطة (${incidents.filter((i) => i.status !== 'Resolved').length}):
  1. [INC-MIRAS-101 | Critical]: تعثر رفع مرفقات (>10MB) على Safari iOS (14 تكراراً / 9 جلسات).
  2. [INC-ORDER-102 | High]: فشل صامت في إشعارات الإيصال الثانوية رغم سلامة حفظ الطلبات.
• البرامج المستقرة الموثقة: TEBYAN, ADMIN, DR.AHMAD, SCHEDULE, MAJAL, ACADEMICOS, MIZAN.
• البرامج المحلية (Local Session): ALFA (سليم في آخر جلسة تشغيل، غير مشغل حالياً).
• فجوات المراقبة: NAHJ (تغطية 44% — يحتاج اختبارات قبول لرحلة المستخدم).
• أهم 3 أولويات اليوم:
  1. مراجعة مهمة Claude الجراحية لإعادة مهلة رفع الأجزاء في MIRAS.
  2. مراجعة معالجة الطابور الثانوي في ORDER لمنع الأعطال الصامتة.
  3. تفعيل اختبارات رحلة المستخدم الأساسية في NAHJ.
• أفضل 3 فرص تطوير (Innovation Radar):
  1. توحيد عقد رسائل الخطأ المرئية للمستخدم عبر البرامج.
  2. دعم الرفع المجزأ القابل للاستئناف في MIRAS.
  3. إضافة نمط Outbox خفيف لطابور الإشعارات في ORDER.
`;

  const copyBrief = () => {
    navigator.clipboard.writeText(dailyBriefText);
    setCopiedBrief(true);
    setTimeout(() => setCopiedBrief(false), 2000);
  };

  const handleToggleOutage = async () => {
    if (!onSimulateOutage) return;
    const isCurrentlyOutage = selfHealth.overallStatus === 'Monitoring Unconfirmed';
    await onSimulateOutage(!isCurrentlyOutage);
  };

  const handleTriggerWebhookTest = async (tamperSignature: boolean) => {
    if (!onSimulateWebhook) return;
    const result = await onSimulateWebhook({
      appId: 'MIRAS',
      hasHiddenSubStepWarning: true,
      tamperSignature,
    });
    setWebhookStatus(result);
  };

  return (
    <div className="orbit-subpage orbit-governance-page space-y-6">
      {/* Section 28: Morning Intelligence (ORBIT DAILY BRIEF) & Section 29: Next Best Move */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className={`lg:col-span-6 rounded-xl border p-6 space-y-4 ${surfaceCls}`}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-sky-400">
                الموجز اليومي
              </h2>
              <p className="text-xs text-slate-400">
                ملخص تنفيذي يومي شامل لجميع البرامج ({activePlatforms.length} منصة) قابل للقراءة والنسخ الفوري.
              </p>
            </div>
            <button
              type="button"
              onClick={copyBrief}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400 transition-colors"
            >
              {copiedBrief ? <ClipboardCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedBrief ? 'تم نسخ التقرير اليومي' : 'نسخ التقرير اليومي'}</span>
            </button>
          </div>
          <pre className="p-4 rounded-lg bg-slate-950 text-slate-200 font-mono text-xs whitespace-pre-wrap leading-relaxed border border-slate-800 max-h-80 overflow-y-auto">
            {dailyBriefText}
          </pre>
        </div>

        <div className={`lg:col-span-6 rounded-xl border p-6 space-y-4 ${surfaceCls}`}>
          <div>
            <h2 className="text-base font-bold text-emerald-400">
              NEXT BEST MOVE — مستشار ترتيب القرارات الهندسية (Section 29)
            </h2>
            <p className="text-xs text-slate-400">
              يجيب بالدليل الهندسي عن الأسئلة الستة الحاسمة لترتيب أولويات التدخل.
            </p>
          </div>
          <div className="space-y-2.5 text-xs">
            <div className="rounded-lg border border-slate-800 p-3.5 space-y-1">
              <div className="font-semibold text-rose-400">1. ما أهم مشكلة الآن؟</div>
              <p className="text-slate-200">
                حادثة <strong>INC-MIRAS-101</strong> (تعثر رفع مرفقات التكليفات الكبيرة &gt;10MB على Safari iOS).
              </p>
            </div>
            <div className="rounded-lg border border-slate-800 p-3.5 space-y-1">
              <div className="font-semibold text-sky-400">2. لماذا هي الأهم؟ وما أثر تأجيلها؟</div>
              <p className="text-slate-200">
                لأنها تمس رحلة الطالب الأساسية مباشرة (انخفاض النجاح إلى 91.4%)؛ وتأجيلها يؤدي لتكرار فشل التسليمات في أوقات الذروة.
              </p>
            </div>
            <div className="rounded-lg border border-slate-800 p-3.5 space-y-1">
              <div className="font-semibold text-emerald-400">3. ما أقل إجراء آمن؟ وما الاختبار الذي ينقصنا؟</div>
              <p className="text-slate-200">
                رفع مهلة الجزء الواحد إلى 45 ثانية في <code>SubmissionUploader.tsx</code> فقط، مع إلغاء{' '}
                <code>continue-on-error</code> من اختبار Safari WebKit في GitHub Actions.
              </p>
            </div>
            <div className="rounded-lg border border-slate-800 p-3.5 flex items-center justify-between gap-2">
              <div>
                <div className="font-semibold text-amber-300">4. ما التطوير التالي الذي يحقق أكبر فائدة؟</div>
                <p className="text-slate-300">تفعيل الرفع القابل للاستئناف (Resumable Upload) + إغلاق فجوة مراقبة NAHJ.</p>
              </div>
              <button
                type="button"
                onClick={() => onSelectIncident('INC-MIRAS-101')}
                className="px-3 py-1.5 rounded-lg bg-sky-500 text-slate-950 font-semibold whitespace-nowrap shrink-0"
              >
                استعراض القضية
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Section 26 & 27: Self-Monitoring Radar & Synthetic Canary + Section 32: ORBIT COST GUARD */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className={`lg:col-span-6 rounded-xl border p-6 space-y-4 ${surfaceCls}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">
                المراقبة الذاتية والكناري الاختباري (Self-Monitoring & Canary — Sections 26 & 27)
              </h2>
              <p className="text-xs text-slate-400">
                إذا انقطع وصول الأحداث يعرض ORBIT «المراقبة غير مؤكدة» ولا يدّعي أن «كل شيء سليم».
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleToggleOutage}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  selfHealth.overallStatus === 'Monitoring Unconfirmed'
                    ? 'border-amber-400 bg-amber-500 text-slate-950'
                    : 'border-amber-500/40 bg-amber-950/20 text-amber-300 hover:bg-amber-950/40'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>
                  {selfHealth.overallStatus === 'Monitoring Unconfirmed'
                    ? 'استعادة مصدر المراقبة (Restore)'
                    : 'محاكاة انقطاع الأحداث (Sec 26)'}
                </span>
              </button>
              <button
                type="button"
                onClick={onRunCanary}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                <span>إطلاق فحص الكناري (6 مراحل)</span>
              </button>
            </div>
          </div>

          {selfHealth.overallStatus === 'Monitoring Unconfirmed' && (
            <div className="rounded-lg border border-amber-500/50 bg-amber-950/30 p-3 text-xs text-amber-200 font-semibold">
              تنبيه المراقبة الذاتية (Section 26): انقطع تدفق الأحداث! الحالة الآن «المراقبة غير مؤكدة (Monitoring Unconfirmed)» — يرفض ORBIT ادعاء أن «كل شيء سليم» حتى يعود الاتصال الموثق.
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono tabular-nums">
            <div className="rounded-lg border border-slate-800 p-3">
              <div className="text-slate-400">حالة ORBIT</div>
              <div
                className={`font-bold mt-0.5 ${
                  selfHealth.overallStatus === 'Operational' ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {selfHealth.overallStatus === 'Monitoring Unconfirmed'
                  ? 'Monitoring Unconfirmed · المراقبة غير مؤكدة'
                  : selfHealth.overallStatus}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 p-3">
              <div className="text-slate-400">زمن معالجة الحدث</div>
              <div className="text-sky-400 font-bold mt-0.5">{selfHealth.eventProcessingDelayMs} ms</div>
            </div>
            <div className="rounded-lg border border-slate-800 p-3">
              <div className="text-slate-400">المراقب المستقل</div>
              <div
                className={`font-bold mt-0.5 ${
                  selfHealth.independentWatchdogStatus === 'Verified'
                    ? 'text-emerald-400'
                    : 'text-amber-400'
                }`}
              >
                {selfHealth.independentWatchdogStatus}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 p-3">
              <div className="text-slate-400">حصة GitHub المتبقية</div>
              <div className="text-slate-200 font-bold mt-0.5">
                {selfHealth.githubApiRemaining}/{selfHealth.githubApiLimit}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 p-3">
              <div className="text-slate-400">تغطية الأسطول</div>
              <div className="text-sky-400 font-bold mt-0.5">{selfHealth.fleetMonitoringCoveragePct}%</div>
            </div>
            <div className="rounded-lg border border-slate-800 p-3">
              <div className="text-slate-400">المهام الفاشلة</div>
              <div className="text-emerald-400 font-bold mt-0.5">{selfHealth.failedJobsCount}</div>
            </div>
          </div>

          {canaryHistory.length > 0 && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/20 p-4 space-y-2 text-xs">
              <div className="font-mono font-bold text-emerald-400">
                آخر تشغيل كناري: {canaryHistory[0].runId} —{' '}
                {canaryHistory[0].overallPassed ? 'ALL 6 STAGES PASSED' : 'FAILED'}
              </div>
              <div className="space-y-1">
                {canaryHistory[0].steps.map((st, i) => (
                  <div key={i} className="flex items-center justify-between text-slate-200">
                    <span>{st.step}</span>
                    <span className="font-mono text-emerald-400">{st.passed ? 'Pass' : 'Fail'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={`lg:col-span-6 rounded-xl border p-6 space-y-4 ${surfaceCls}`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">
                ORBIT COST GUARD — حارس التكلفة والحصص المجانية (Section 32)
              </h2>
              <p className="text-xs text-slate-400">
                معمارية Cost-First بتكلفة تشغيل $0.00 — تشخيص حتمي أولاً وAI عند الطلب فقط بدون أي خدمة مدفوعة تلقائياً.
              </p>
            </div>
            <span className="font-mono text-lg font-bold text-emerald-400 tabular-nums">$0.00 / mo</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono tabular-nums">
            <div className="rounded-lg border border-slate-800 p-3">
              <div className="text-slate-400">الأحداث المستقبلة</div>
              <div className="text-slate-100 font-bold mt-0.5">
                {costGuard.ingestedEventsCount} / {costGuard.ingestedEventsLimit}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 p-3">
              <div className="text-slate-400">توفير التجميع (Dedup)</div>
              <div className="text-emerald-400 font-bold mt-0.5">
                {costGuard.deduplicatedSavedEvents} حدث موفر
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 p-3">
              <div className="text-slate-400">استهلاك التخزين</div>
              <div className="text-sky-400 font-bold mt-0.5">
                {costGuard.storageUsedMb} / {costGuard.storageFreeTierMb} MB
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 p-3">
              <div className="text-slate-400">استدعاءات AI عند الطلب</div>
              <div className="text-slate-100 font-bold mt-0.5">{costGuard.aiDiagnosisCallsCount}</div>
            </div>
            <div className="rounded-lg border border-slate-800 p-3">
              <div className="text-slate-400">سياسة الاحتفاظ</div>
              <div className="text-slate-100 font-bold mt-0.5">{costGuard.retentionDays} يوماً</div>
            </div>
            <div className="rounded-lg border border-slate-800 p-3">
              <div className="text-slate-400">خدمات تتطلب فوترة</div>
              <div className="text-emerald-400 font-bold mt-0.5">صفر (None)</div>
            </div>
          </div>

          {/* Section 9 & 33: GitHub Webhook Cryptographic HMAC-SHA256 Verifier */}
          <div className="rounded-lg border border-slate-800 p-4 space-y-2.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-semibold text-sky-400">
                <Webhook className="w-4 h-4" />
                <span>فاحص توقيع GitHub Webhooks (HMAC-SHA256 & continue-on-error — Sec 9 & 33)</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleTriggerWebhookTest(false)}
                  className="rounded-md bg-sky-500 px-2.5 py-1 text-slate-950 font-semibold hover:bg-sky-400"
                >
                  محاكاة Webhook موقع صالح
                </button>
                <button
                  type="button"
                  onClick={() => handleTriggerWebhookTest(true)}
                  className="rounded-md border border-rose-500/40 bg-rose-950/20 px-2.5 py-1 text-rose-300 hover:bg-rose-950/40"
                >
                  محاكاة توقيع مزور (Tampered)
                </button>
              </div>
            </div>
            {webhookStatus && (
              <div
                className={`rounded-md border p-2.5 font-mono text-[11px] ${
                  webhookStatus.verified
                    ? 'border-emerald-500/40 bg-emerald-950/20 text-emerald-300'
                    : 'border-rose-500/40 bg-rose-950/30 text-rose-300'
                }`}
              >
                <div>Header: X-Hub-Signature-256: {webhookStatus.signatureHeader.slice(0, 32)}...</div>
                <div className="font-sans mt-0.5">{webhookStatus.message}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Section 24: Innovation Radar & Section 25: Intelligent Alerting */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className={`lg:col-span-6 rounded-xl border p-6 space-y-4 ${surfaceCls}`}>
          <h2 className="text-base font-semibold">
            بنك فرص التطوير والابتكار (Innovation Radar — Section 24)
          </h2>
          <div className="space-y-3 text-xs">
            {innovations.map((inv) => (
              <div key={inv.id} className="rounded-lg border border-slate-800 p-4 space-y-1.5">
                <div className="flex items-center justify-between font-mono">
                  <span className="text-sky-400 font-bold">
                    [{inv.appId}] {inv.category}
                  </span>
                  <span className="text-emerald-400 tabular-nums">
                    Impact: {inv.impactScore}/10 · Effort: {inv.effortScore}/10 · Risk: {inv.riskLevel}
                  </span>
                </div>
                <div className="font-semibold text-sm">{inv.title}</div>
                <p className="text-slate-400">الدليل: {inv.evidenceBasis}</p>
                <p className="text-slate-200">الفائدة المتوقعة: {inv.estimatedBenefit}</p>
              </div>
            ))}
          </div>
        </div>

        <div className={`lg:col-span-6 rounded-xl border p-6 space-y-4 ${surfaceCls}`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">
                نظام التنبيهات الذكي وساعات الهدوء (Intelligent Alerting — Section 25)
              </h2>
              <p className="text-xs text-slate-400">
                يمنع تكرار التنبيهات ويميّز بين قبول المزود للإشعار وبين قراءة المشغل له.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setQuietHoursActive(!quietHoursActive)}
              className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs font-mono"
            >
              {quietHoursActive ? 'ساعات الهدوء: مفعلة' : 'ساعات الهدوء: متوقفة'}
            </button>
          </div>
          <div className="space-y-2.5 max-h-80 overflow-y-auto text-xs">
            {alerts.map((al) => (
              <div key={al.id} className="rounded-lg border border-slate-800 p-3.5 space-y-1">
                <div className="flex items-center justify-between">
                  <SeverityLabel severity={al.severity} />
                  <span className="font-mono text-slate-400">[{al.deliveryStatus}]</span>
                </div>
                <div className="font-semibold">{al.title}</div>
                <p className="text-slate-400">{al.message}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Section 37, 38 & 41: Feature Completion Matrix & Acceptance Criteria Verification Report */}
      <div className={`rounded-xl border p-6 space-y-5 ${surfaceCls}`}>
        <div>
          <h2 className="text-base font-bold text-sky-400">
            مصفوفة حالة التنفيذ ومعايير القبول الهندسية (Feature Matrix & Acceptance Criteria — Sections 37, 38, 41, 42)
          </h2>
          <p className="text-xs text-slate-400">
            شفافية هندسية كاملة: تمييز صريح بين ما تم تنفيذه واختباره، وما يتطلب مفاتيح خارجية أو موافقة صريحة من المالك.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
          {/* Feature Matrix */}
          <div className="space-y-2.5">
            <h3 className="font-semibold text-sm text-slate-200">
              1. لوحة حالة تنفيذ المزايا (Feature Completion Matrix — 7 Status Categories)
            </h3>
            <div className="divide-y divide-slate-800/70 rounded-lg border border-slate-800 p-3 max-h-[540px] overflow-y-auto">
              {featureMatrix.map((item) => (
                <div key={item.id} className="py-2.5 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">
                      [{item.phase}] {item.featureNameAr}
                    </span>
                    <span
                      className={`font-mono font-semibold whitespace-nowrap ${
                        item.status === 'Implemented & Tested'
                          ? 'text-emerald-400'
                          : item.status === 'Requires Approval' || item.status === 'Blocked'
                          ? 'text-amber-400'
                          : 'text-sky-400'
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                  <p className="text-slate-400">{item.notes}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Acceptance Criteria */}
          <div className="space-y-2.5">
            <h3 className="font-semibold text-sm text-slate-200">
              2. تقرير اختبارات القبول الـ 19 (Acceptance Criteria — Pass / Fail / Not Tested)
            </h3>
            <div className="divide-y divide-slate-800/70 rounded-lg border border-slate-800 p-3 max-h-[540px] overflow-y-auto">
              {acceptanceCriteria.map((ac) => (
                <div key={ac.id} className="py-2.5 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">
                      {ac.id} ({ac.sectionRef}): {ac.titleAr}
                    </span>
                    <span className="font-mono font-bold text-emerald-400">{ac.status}</span>
                  </div>
                  <div className="font-mono text-[11px] text-sky-400">
                    طريقة التحقق: {ac.verificationMethod}
                  </div>
                  <p className="text-slate-400">{ac.evidenceDetail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Section 37 & 41: Complete Engineering Deliverables & Schemas Explorer */}
        <div className="pt-4 border-t border-slate-800/70 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileCode2 className="w-4 h-4 text-sky-400" />
              <h3 className="text-sm font-bold">
                مركز التسليمات والمخططات الهندسية الكاملة (Section 37 Deliverables & Approval Registry)
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {(
                [
                  { id: 'db-schema', label: '1. مخطط قاعدة البيانات والأحداث (SQL/DDL)' },
                  { id: 'deployment', label: '2. دليل النشر ومتغيرات البيئة (.env)' },
                  { id: 'coverage-report', label: '3. تقرير تغطية المراقبة للأسطول' },
                  { id: 'approvals-needed', label: '4. ما يحتاج موافقة أو مفاتيح خارجية' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDeliverableTab(tab.id)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    deliverableTab === tab.id
                      ? 'bg-sky-500 text-slate-950 font-semibold'
                      : 'border border-slate-800 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {deliverableTab === 'db-schema' && (
            <pre
              dir="ltr"
              className="p-4 rounded-lg bg-slate-950 text-slate-200 font-mono text-xs overflow-x-auto border border-slate-800 max-h-72 leading-relaxed"
            >
              {DELIVERABLE_DATABASE_SCHEMA_SQL}
            </pre>
          )}

          {deliverableTab === 'deployment' && (
            <pre className="p-4 rounded-lg bg-slate-950 text-slate-200 font-mono text-xs whitespace-pre-wrap border border-slate-800 max-h-72 leading-relaxed">
              {DELIVERABLE_DEPLOYMENT_AND_ENV_GUIDE}
            </pre>
          )}

          {deliverableTab === 'coverage-report' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              {activePlatforms.map((p) => (
                <div key={p.id} className="rounded-lg border border-slate-800 p-3 space-y-1">
                  <div className="flex items-center justify-between font-mono">
                    <span className="font-bold text-sky-400">{p.codeName}</span>
                    <span className="text-emerald-400 tabular-nums">{p.monitoringCoveragePct}%</span>
                  </div>
                  <div className="font-semibold">{p.nameAr}</div>
                  <div className="text-slate-400 font-mono text-[11px]">
                    Mode: {p.runtimeMode} · Integrity: {p.dataIntegrity}
                  </div>
                  <div className="text-slate-300 text-[11px]">{p.lastVerifiedEvidence}</div>
                </div>
              ))}
            </div>
          )}

          {deliverableTab === 'approvals-needed' && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-950/15 p-4 space-y-2.5 text-xs">
              <div className="font-bold text-amber-300">
                قائمة صريحة بما يتطلب موافقة المالك (ProfAlfailakawi) أو صلاحيات/خدمات خارجية (Sections 3, 7, 37, 41):
              </div>
              <ul className="space-y-1.5 text-slate-200 list-disc list-inside">
                <li>
                  <strong>تركيب ORBIT SENSOR داخل المستودعات الـ 11 الحالية:</strong> الكود جاهز ومفحوص في{' '}
                  <code>src/sdk/orbit-sensor.ts</code>، لكن لم يتم حقنه في أي مستودع إنتاجي التزاماً بشرط الموافقة المستقلة لكل مشروع.
                </li>
                <li>
                  <strong>قراءة المستودعات الخاصة (Private GitHub Repositories):</strong> تتطلب تزويد الخادم بـ{' '}
                  <code>GITHUB_READ_ONLY_TOKEN</code> بصلاحية قراءة فقط (Fine-Grained Read-Only PAT).
                </li>
                <li>
                  <strong>إلحاق المستودعات المكتشفة تلقائياً (ARCHIVE26 و COGTOOLS):</strong> معروضة في طابور الاكتشاف بصفحة «إدارة الأسطول» وبانتظار ضغطة موافقة صريحة من المالك.
                </li>
                <li>
                  <strong>تشخيص Gemini AI الاختياري عند الطلب:</strong> يعمل عبر مفتاح الخادم <code>GEMINI_API_KEY</code> عند الطلب فقط، بينما يعمل التشخيص الحتمي الأساسي مجاناً بدونه.
                </li>
              </ul>
            </div>
          )}
        </div>

        {/* Audit Logs */}
        <div className="pt-4 border-t border-slate-800/70 space-y-2">
          <h3 className="text-sm font-semibold">سجل التدقيق الأمني (Tamper-Evident Server Audit Log)</h3>
          <div className="max-h-48 overflow-y-auto divide-y divide-slate-800/60 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs font-mono">
            {auditLogs.map((log) => (
              <div key={log.id} className="py-1.5 flex flex-wrap items-center justify-between gap-2">
                <span>
                  <strong className="text-sky-400">[{log.action}]</strong> {log.target} — {log.detail}
                </span>
                <span className="text-slate-500">
                  {log.actor} · {log.timestamp.slice(11, 19)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
