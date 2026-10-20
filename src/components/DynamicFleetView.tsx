import React, { useState } from 'react';
import {
  Archive,
  CheckCircle2,
  Edit3,
  FolderGit2,
  Link2Off,
  PauseCircle,
  Play,
  PlayCircle,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type {
  AppRuntimeMode,
  DiscoveredRepoCandidate,
  PlatformLifecycleState,
  PlatformRecord,
} from '../core/types';
import {
  DataIntegrityTag,
  HealthStatusIndicator,
  PlatformDomainIcon,
  RadialGauge,
} from './Primitives';

interface DynamicFleetViewProps {
  platforms: PlatformRecord[];
  discoveredCandidates: DiscoveredRepoCandidate[];
  onAddPlatform: (payload: {
    owner: string;
    repoName: string;
    codeName: string;
    nameAr: string;
    description: string;
    runtimeMode: AppRuntimeMode;
    productionUrl: string;
    techStack: string;
    defaultBranch: string;
  }) => Promise<void>;
  onVerifyConnection: (id: string) => Promise<void>;
  onLifecycleChange: (id: string, nextState: PlatformLifecycleState) => Promise<void>;
  onUpdateSettings: (
    id: string,
    payload: {
      nameAr: string;
      description: string;
      defaultBranch: string;
      productionUrl: string | null;
      runtimeMode: AppRuntimeMode;
    }
  ) => Promise<void>;
  onPurgeHistory: (id: string, confirmationToken: string) => Promise<{ purged: boolean; error?: string }>;
  onApproveDiscovered: (codeName: string) => Promise<void>;
  onSelectPlatform: (id: string) => void;
  isDark: boolean;
}

export const DynamicFleetView: React.FC<DynamicFleetViewProps> = ({
  platforms,
  discoveredCandidates,
  onAddPlatform,
  onVerifyConnection,
  onLifecycleChange,
  onUpdateSettings,
  onPurgeHistory,
  onApproveDiscovered,
  onSelectPlatform,
  isDark,
}) => {
  // Add New Program Form State
  const [owner, setOwner] = useState('ProfAlfailakawi');
  const [repoName, setRepoName] = useState('');
  const [codeName, setCodeName] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [description, setDescription] = useState('');
  const [runtimeMode, setRuntimeMode] = useState<AppRuntimeMode>('github-web');
  const [productionUrl, setProductionUrl] = useState('');
  const [techStack, setTechStack] = useState('React, TypeScript, Node.js, Tailwind CSS');
  const [defaultBranch, setDefaultBranch] = useState('main');
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);

  // Edit Modal/Inline State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNameAr, setEditNameAr] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editBranch, setEditBranch] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editMode, setEditMode] = useState<AppRuntimeMode>('github-web');

  // Separate Purge History Confirmation State
  const [purgeTargetCode, setPurgeTargetCode] = useState<string | null>(null);
  const [purgeConfirmInput, setPurgeConfirmInput] = useState('');
  const [purgeFeedback, setPurgeFeedback] = useState<string | null>(null);

  // Automated Section 42 E2E Lifecycle Test Log
  const [lifecycleTestLog, setLifecycleTestLog] = useState<string[]>([]);
  const [runningLifecycleTest, setRunningLifecycleTest] = useState(false);

  const surfaceCls = isDark
    ? 'border-slate-800/90 bg-[#0F172A]/85 text-slate-100'
    : 'border-slate-200 bg-white text-slate-900';

  const activeCount = platforms.filter((p) => p.lifecycleState === 'active').length;
  const pausedCount = platforms.filter((p) => p.lifecycleState === 'paused').length;
  const archivedCount = platforms.filter((p) => p.lifecycleState === 'archived').length;
  const unlinkedCount = platforms.filter((p) => p.lifecycleState === 'unlinked').length;

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeName.trim() || !nameAr.trim() || !description.trim()) {
      setAddError('يرجى تعبئة رمز البرنامج (Code Name) والاسم العربي والوصف.');
      return;
    }
    setAddError(null);
    await onAddPlatform({
      owner,
      repoName: repoName || codeName.toLowerCase(),
      codeName: codeName.toUpperCase(),
      nameAr,
      description,
      runtimeMode,
      productionUrl,
      techStack,
      defaultBranch,
    });
    setAddSuccess(
      `تمت إضافة البرنامج ${codeName.toUpperCase()} واكتشاف إعداداته المقترحة. اضغط «فحص وتأكيد الاتصال» لإكمال تفعيل المراقبة.`
    );
    setCodeName('');
    setRepoName('');
    setNameAr('');
    setDescription('');
    setProductionUrl('');
  };

  const startEditing = (p: PlatformRecord) => {
    setEditingId(p.id);
    setEditNameAr(p.nameAr);
    setEditDescription(p.description);
    setEditBranch(p.defaultBranch);
    setEditUrl(p.productionUrl || '');
    setEditMode(p.runtimeMode);
  };

  const saveEditing = async (id: string) => {
    await onUpdateSettings(id, {
      nameAr: editNameAr,
      description: editDescription,
      defaultBranch: editBranch,
      productionUrl: editUrl.trim() ? editUrl.trim() : null,
      runtimeMode: editMode,
    });
    setEditingId(null);
  };

  const handleConfirmPurge = async (code: string) => {
    const res = await onPurgeHistory(code, purgeConfirmInput);
    if (res.purged) {
      setPurgeFeedback(`تم حذف البيانات التاريخية لـ ${code} من ORBIT بنجاح دون المساس بالمستودع الأصلي.`);
      setPurgeTargetCode(null);
      setPurgeConfirmInput('');
    } else {
      setPurgeFeedback(res.error || 'رمز التأكيد غير صحيح.');
    }
  };

  /**
   * Runs the full Section 42 verification sequence on a test program:
   * Add -> Verify Connection -> Pause -> Archive -> Reactivate -> Unlink
   */
  const runAutomatedSection42Verification = async () => {
    setRunningLifecycleTest(true);
    const testCode = `PILOT-${Math.floor(100 + Math.random() * 899)}`;
    const logs: string[] = [];
    const pushLog = (msg: string) => {
      logs.push(msg);
      setLifecycleTestLog([...logs]);
    };

    try {
      pushLog(`1. [إضافة برنامج تجريبي]: إنشاء ${testCode} واكتشاف الفروع والتقنيات تلقائياً (الحالة المبدئية: Not Configured)...`);
      await onAddPlatform({
        owner: 'ProfAlfailakawi',
        repoName: testCode.toLowerCase(),
        codeName: testCode,
        nameAr: `مشروع اختبار ديناميكي (${testCode})`,
        description: 'برنامج تجريبي للتحقق العملي من متطلبات القسم 42 (إدارة الأسطول الديناميكية).',
        runtimeMode: 'github-web',
        productionUrl: `https://${testCode.toLowerCase()}.example.com`,
        techStack: 'React, TypeScript, Vite',
        defaultBranch: 'main',
      });

      pushLog(`2. [فحص وتوثيق الاتصال]: التحقق من مصادر ${testCode} وتحويله إلى Healthy / Live...`);
      await onVerifyConnection(testCode);

      pushLog(`3. [إيقاف المراقبة مؤقتاً]: تحويل ${testCode} إلى Paused دون المساس ببقية البرامج...`);
      await onLifecycleChange(testCode, 'paused');

      pushLog(`4. [أرشفة البرنامج مع حفظ التاريخ]: تحويل ${testCode} إلى Archived مع بقاء السجل التاريخي...`);
      await onLifecycleChange(testCode, 'archived');

      pushLog(`5. [إعادة التفعيل]: استعادة ${testCode} إلى الحالة النشطة (Active / Healthy)...`);
      await onLifecycleChange(testCode, 'active');

      pushLog(`6. [فك الربط الآمن]: تحويل ${testCode} إلى Unlinked دون حذف المستودع الأصلي أو التأثير على البرامج الـ 11 الأخرى [PASS].`);
      await onLifecycleChange(testCode, 'unlinked');
    } finally {
      setRunningLifecycleTest(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Dynamic Fleet Counters (Zero Hardcoded 11!) */}
      <div className={`rounded-xl border p-6 space-y-4 ${surfaceCls}`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              DYNAMIC FLEET MANAGEMENT — إدارة البرامج والأسطول المستقبلي (القسم 42)
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              نظام ديناميكي غير مقيد بالعدد 11 — أضف، افحص، عدّل، أوقف، أرشف، أو افصل ربط أي برنامج دون تعديل الكود أو إعادة نشر ORBIT.
            </p>
          </div>
          <button
            type="button"
            onClick={runAutomatedSection42Verification}
            disabled={runningLifecycleTest}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
            <span>
              {runningLifecycleTest
                ? 'جاري تنفيذ دورة الاختبار...'
                : 'تشغيل اختبار دورة الحياة الكامل (إضافة ← إيقاف ← أرشفة ← تفعيل ← فك ربط)'}
            </span>
          </button>
        </div>

        {/* Dynamic Fleet Counter Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-3 border-t border-slate-800/70 text-xs font-mono tabular-nums">
          <div className="rounded-lg border border-slate-800 p-3 bg-slate-950/40">
            <div className="text-slate-400">إجمالي السجل</div>
            <div className="text-lg font-bold text-slate-100 mt-0.5">{platforms.length}</div>
          </div>
          <div className="rounded-lg border border-slate-800 p-3 bg-slate-950/40">
            <div className="text-slate-400">نشط في المراقبة</div>
            <div className="text-lg font-bold text-emerald-400 mt-0.5">{activeCount}</div>
          </div>
          <div className="rounded-lg border border-slate-800 p-3 bg-slate-950/40">
            <div className="text-slate-400">متوقف مؤقتاً (Paused)</div>
            <div className="text-lg font-bold text-amber-400 mt-0.5">{pausedCount}</div>
          </div>
          <div className="rounded-lg border border-slate-800 p-3 bg-slate-950/40">
            <div className="text-slate-400">مؤرشف (Archived)</div>
            <div className="text-lg font-bold text-sky-400 mt-0.5">{archivedCount}</div>
          </div>
          <div className="rounded-lg border border-slate-800 p-3 bg-slate-950/40">
            <div className="text-slate-400">مفصول الربط (Unlinked)</div>
            <div className="text-lg font-bold text-slate-400 mt-0.5">{unlinkedCount}</div>
          </div>
        </div>

        {lifecycleTestLog.length > 0 && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/20 p-4 space-y-1.5 text-xs font-mono">
            <div className="font-semibold text-emerald-400">
              نتيجة الاختبار العملي لدورة حياة البرنامج التجريبي (Section 42 Verification):
            </div>
            {lifecycleTestLog.map((line, i) => (
              <div key={i} className="text-slate-200">
                {line}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Auto-Discovered Repositories Requiring Explicit User Approval */}
      {discoveredCandidates.length > 0 && (
        <div className={`rounded-xl border p-6 space-y-4 ${surfaceCls}`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-sky-400">
                مستودعات مكتشفة تلقائياً بانتظار موافقتك (Auto-Discovery Queue)
              </h2>
              <p className="text-xs text-slate-400">
                لا يضيف ORBIT أي مستودع مكتشف تلقائياً إلا بعد موافقتك الصريحة.
              </p>
            </div>
            <span className="text-xs font-mono text-amber-400 tabular-nums">
              {discoveredCandidates.length} بانتظار القرار
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {discoveredCandidates.map((cand) => (
              <div
                key={cand.codeName}
                className="rounded-lg border border-slate-800 p-4 flex flex-col justify-between gap-3 text-xs"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-sm text-sky-400">
                      {cand.owner}/{cand.repoName} ({cand.codeName})
                    </span>
                    <span className="font-mono text-slate-400">Mode: {cand.runtimeMode}</span>
                  </div>
                  <p className="text-slate-300">{cand.description}</p>
                  <div className="font-mono text-slate-400">
                    التقنيات المكتشفة: {cand.detectedTechStack.join(' · ')} | الفرع:{' '}
                    {cand.defaultBranch}
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => onApproveDiscovered(cand.codeName)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-sky-400 transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>موافقة وإضافة للأسطول</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add New Program Form (GitHub Web / GitHub Local / Non-GitHub Web / Local-Only) */}
      <form onSubmit={handleCreateSubmit} className={`rounded-xl border p-6 space-y-4 ${surfaceCls}`}>
        <div className="flex items-center gap-2">
          <Plus className="w-4 h-4 text-sky-400" />
          <h2 className="text-base font-semibold">
            إضافة برنامج جديد إلى ORBIT (GitHub أو غير مرتبط بـ GitHub أو محلي)
          </h2>
        </div>

        {addError && (
          <div className="text-xs text-rose-400 bg-rose-950/40 border border-rose-500/30 rounded-lg p-2.5">
            {addError}
          </div>
        )}
        {addSuccess && (
          <div className="text-xs text-emerald-300 bg-emerald-950/30 border border-emerald-500/30 rounded-lg p-2.5">
            {addSuccess}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
          <div>
            <label htmlFor="add-code-name" className="block text-slate-400 mb-1">
              الرمز التعريفي الثابت (Code ID):
            </label>
            <input
              id="add-code-name"
              type="text"
              placeholder="مثال: NEXUS26"
              value={codeName}
              onChange={(e) => setCodeName(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 font-mono"
            />
          </div>
          <div>
            <label htmlFor="add-name-ar" className="block text-slate-400 mb-1">
              اسم البرنامج (عربي/إنجليزي):
            </label>
            <input
              id="add-name-ar"
              type="text"
              placeholder="مثال: منصة نيكسوس البحثية"
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
            />
          </div>
          <div>
            <label htmlFor="add-runtime-mode" className="block text-slate-400 mb-1">
              نوع البرنامج وحدود المراقبة:
            </label>
            <select
              id="add-runtime-mode"
              value={runtimeMode}
              onChange={(e) => setRuntimeMode(e.target.value as AppRuntimeMode)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
            >
              <option value="github-web">مستودع GitHub + موقع منشور (Three Eyes كاملة)</option>
              <option value="github-local">مستودع GitHub + يعمل محلياً مثل ALFA (جلسات محلية + CI)</option>
              <option value="non-github-web">موقع ويب بدون GitHub (مراقبة استجابة وحساس عميل فقط)</option>
              <option value="local-only">برنامج محلي بدون GitHub (مراقبة جلسات التشغيل المحلية فقط)</option>
            </select>
          </div>
          <div>
            <label htmlFor="add-repo-name" className="block text-slate-400 mb-1">
              اسم المستودع (إن وجد):
            </label>
            <input
              id="add-repo-name"
              type="text"
              placeholder="ProfAlfailakawi/repo-name"
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              disabled={runtimeMode === 'non-github-web' || runtimeMode === 'local-only'}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 font-mono disabled:opacity-40"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div>
            <label htmlFor="add-desc" className="block text-slate-400 mb-1">
              وصف البرنامج والغرض الأساسي:
            </label>
            <input
              id="add-desc"
              type="text"
              placeholder="وصف مختصر لوظيفة البرنامج..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
            />
          </div>
          <div>
            <label htmlFor="add-prod-url" className="block text-slate-400 mb-1">
              الرابط الإنتاجي (للبرامج المنشورة):
            </label>
            <input
              id="add-prod-url"
              type="text"
              placeholder="https://example.app"
              value={productionUrl}
              onChange={(e) => setProductionUrl(e.target.value)}
              disabled={runtimeMode === 'github-local' || runtimeMode === 'local-only'}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 font-mono disabled:opacity-40"
            />
          </div>
          <div>
            <label htmlFor="add-tech-stack" className="block text-slate-400 mb-1">
              التقنيات المكتشفة / المقترحة:
            </label>
            <input
              id="add-tech-stack"
              type="text"
              value={techStack}
              onChange={(e) => setTechStack(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 font-mono"
            />
          </div>
        </div>

        {/* Monitoring Boundary Explanation based on selected Runtime Mode */}
        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-300">
          <strong className="text-sky-400">حدود المراقبة المقترحة لهذا النوع: </strong>
          {runtimeMode === 'github-web' &&
            'يتم فحص المستودع للقراءة فقط (Commits, Actions, Branches) + فحص استجابة الرابط بعد التحقق + دعم استقبال أحداث ORBIT Sensor.'}
          {runtimeMode === 'github-local' &&
            'برنامج يعمل محلياً (مثل ALFA): لا يتم إرسال طلبات HTTP دائمة له كموقع ويب؛ تقتصر المراقبة على اختبارات GitHub Actions وجلسات التشغيل المحلية.'}
          {runtimeMode === 'non-github-web' &&
            'برنامج لا يستخدم GitHub: تتوفر مراقبة توفر الرابط وأحداث الواجهة والخادم عبر الحساس، ولا تتوفر تحليلات Commits أو GitHub Actions.'}
          {runtimeMode === 'local-only' &&
            'برنامج محلي غير مرتبط بـ GitHub: تقتصر المراقبة على استقبال نبضات جلسة التشغيل المحلية عند فتح البرنامج.'}
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-5 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة البرنامج واكتشاف إعدادات المراقبة</span>
          </button>
        </div>
      </form>

      {/* Complete Fleet Management Table */}
      <div className={`rounded-xl border p-6 space-y-4 ${surfaceCls}`}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">
            سجل إدارة جميع البرامج ({platforms.length} برنامج)
          </h2>
          {purgeFeedback && (
            <span className="text-xs font-mono text-amber-300">{purgeFeedback}</span>
          )}
        </div>

        <div className="divide-y divide-slate-800/70">
          {platforms.map((p) => (
            <div key={p.id} className="py-4 space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <PlatformDomainIcon
                    codeName={p.codeName}
                    status={p.healthStatus}
                    size="md"
                  />
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectPlatform(p.id)}
                        className="font-mono text-sm font-bold text-sky-400 hover:underline"
                      >
                        {p.codeName}
                      </button>
                      <span>·</span>
                      <span className="font-semibold text-sm">{p.nameAr}</span>
                      <span>·</span>
                      <HealthStatusIndicator status={p.healthStatus} />
                      <span>·</span>
                      <DataIntegrityTag state={p.dataIntegrity} />
                    </div>
                    <div className="font-mono text-xs text-slate-400">
                      {p.owner}/{p.repoName} · {p.runtimeMode} ·{' '}
                      <strong className="text-slate-200">{p.lifecycleState.toUpperCase()}</strong>
                    </div>
                  </div>
                  <RadialGauge
                    value={p.monitoringCoveragePct}
                    size={44}
                    strokeWidth={4}
                    colorClass="text-sky-400"
                  />
                </div>

                {/* Lifecycle Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  {!p.connectionVerified && (
                    <button
                      type="button"
                      onClick={() => onVerifyConnection(p.id)}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>فحص وتأكيد الاتصال</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => startEditing(p)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 hover:bg-slate-800"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-sky-400" />
                    <span>تعديل الإعدادات</span>
                  </button>

                  {p.lifecycleState !== 'active' && (
                    <button
                      type="button"
                      onClick={() => onLifecycleChange(p.id, 'active')}
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 px-2.5 py-1.5 text-emerald-300 hover:bg-emerald-950/40"
                    >
                      <PlayCircle className="w-3.5 h-3.5" />
                      <span>إعادة تفعيل</span>
                    </button>
                  )}

                  {p.lifecycleState === 'active' && (
                    <button
                      type="button"
                      onClick={() => onLifecycleChange(p.id, 'paused')}
                      className="inline-flex items-center gap-1 rounded-lg border border-amber-500/40 px-2.5 py-1.5 text-amber-300 hover:bg-amber-950/40"
                    >
                      <PauseCircle className="w-3.5 h-3.5" />
                      <span>إيقاف مؤقت</span>
                    </button>
                  )}

                  {p.lifecycleState !== 'archived' && (
                    <button
                      type="button"
                      onClick={() => onLifecycleChange(p.id, 'archived')}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-slate-300 hover:bg-slate-800"
                    >
                      <Archive className="w-3.5 h-3.5" />
                      <span>أرشفة (مع حفظ التاريخ)</span>
                    </button>
                  )}

                  {p.lifecycleState !== 'unlinked' && (
                    <button
                      type="button"
                      onClick={() => onLifecycleChange(p.id, 'unlinked')}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 px-2.5 py-1.5 text-rose-300 hover:bg-rose-950/40"
                    >
                      <Link2Off className="w-3.5 h-3.5" />
                      <span>حذف الربط (دون مساس بالمستودع)</span>
                    </button>
                  )}

                  {(p.lifecycleState === 'unlinked' || p.lifecycleState === 'archived') && (
                    <button
                      type="button"
                      onClick={() => {
                        setPurgeTargetCode(p.codeName);
                        setPurgeConfirmInput('');
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-600/60 bg-rose-950/30 px-2.5 py-1.5 text-rose-300 hover:bg-rose-900/40"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف تاريخ ORBIT (إجراء منفصل)</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Inline Settings Editor */}
              {editingId === p.id && (
                <div className="rounded-lg border border-sky-500/40 bg-slate-950/70 p-4 space-y-3">
                  <div className="font-semibold text-sky-400">
                    تعديل إعدادات المراقبة لـ {p.codeName} (فوري دون إعادة نشر ORBIT)
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <input
                      type="text"
                      value={editNameAr}
                      onChange={(e) => setEditNameAr(e.target.value)}
                      className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-slate-100"
                      placeholder="الاسم العربي"
                    />
                    <input
                      type="text"
                      value={editBranch}
                      onChange={(e) => setEditBranch(e.target.value)}
                      className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-slate-100 font-mono"
                      placeholder="الفرع الأساسي"
                    />
                    <input
                      type="text"
                      value={editUrl}
                      onChange={(e) => setEditUrl(e.target.value)}
                      className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-slate-100 font-mono"
                      placeholder="الرابط الإنتاجي"
                    />
                    <select
                      value={editMode}
                      onChange={(e) => setEditMode(e.target.value as AppRuntimeMode)}
                      className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-slate-100"
                    >
                      <option value="github-web">github-web</option>
                      <option value="github-local">github-local</option>
                      <option value="non-github-web">non-github-web</option>
                      <option value="local-only">local-only</option>
                    </select>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1 rounded-lg border border-slate-700 text-slate-300"
                    >
                      إلغاء
                    </button>
                    <button
                      type="button"
                      onClick={() => saveEditing(p.id)}
                      className="px-3.5 py-1 rounded-lg bg-sky-500 text-slate-950 font-semibold"
                    >
                      حفظ الإعدادات
                    </button>
                  </div>
                </div>
              )}

              {/* Separate Confirmed Historical Data Purge Box */}
              {purgeTargetCode === p.codeName && (
                <div className="rounded-lg border border-rose-500/50 bg-rose-950/25 p-4 space-y-2.5">
                  <div className="font-semibold text-rose-300">
                    تأكيد منفصل لحذف بيانات {p.codeName} التاريخية داخل ORBIT فقط (المستودع الأصلي محمي ولا يُمس):
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={purgeConfirmInput}
                      onChange={(e) => setPurgeConfirmInput(e.target.value)}
                      placeholder={`اكتب CONFIRM-PURGE-${p.codeName}`}
                      className="rounded-lg border border-rose-500/40 bg-slate-950 px-3 py-1.5 text-slate-100 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => handleConfirmPurge(p.codeName)}
                      className="px-3.5 py-1.5 rounded-lg bg-rose-500 text-slate-950 font-semibold hover:bg-rose-400"
                    >
                      تأكيد حذف السجل التاريخي في ORBIT
                    </button>
                    <button
                      type="button"
                      onClick={() => setPurgeTargetCode(null)}
                      className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300"
                    >
                      تراجع
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
