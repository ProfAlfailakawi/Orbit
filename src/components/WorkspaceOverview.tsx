import React, { useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowLeft, ArrowUpLeft, BookOpenCheck, BrainCircuit, Check,
  CheckCircle2, ChevronLeft, ClipboardCopy, CloudOff, Code2, Copy, Database,
  ExternalLink, FileClock, Gauge, GitCommitHorizontal, GitPullRequest, History,
  Layers3, LockKeyhole, Radar, Search, ShieldCheck, Sparkles, Wifi, Wrench,
} from 'lucide-react';
import type {
  PlatformRecord, IncidentCaseFile, RadarEvent, EngineeringMemoryEntry,
  ChangeImpactAnalysis, SilentFailureSignal, AlertNotification,
  AcceptanceCriterionResult, SelfHealthMetrics, CanaryTestResult,
} from '../core/types';
import { generateClaudeMissionPrompt } from '../core/engine';

type Mode = 'radar' | 'fleet' | 'intelligence' | 'operations';
interface Props {
  mode: Mode;
  platforms: PlatformRecord[];
  incidents: IncidentCaseFile[];
  events: RadarEvent[];
  engineeringMemory: EngineeringMemoryEntry[];
  changeImpacts: ChangeImpactAnalysis[];
  silentFailures: SilentFailureSignal[];
  alerts: AlertNotification[];
  acceptanceCriteria: AcceptanceCriterionResult[];
  selfHealth: SelfHealthMetrics;
  canaryHistory: CanaryTestResult[];
  openAdvanced: () => void;
  openPlatform: (id: string) => void;
  openIncident: (id: string) => void;
  syncGithub: () => void;
}

const getLive = (platform: PlatformRecord) => platform.dataIntegrity === 'Live' && platform.connectionVerified;
const liveIncidents = (incidents: IncidentCaseFile[]) =>
  incidents.filter(i => i.dataIntegrity === 'Live' && !['Resolved', 'False Positive', 'Expected Behavior', "Won't Fix"].includes(i.status));
const severityOrder: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
const dateAr = (date?: string) => {
  if (!date || Number.isNaN(Date.parse(date))) return 'غير متوفر';
  return new Intl.DateTimeFormat('ar-KW', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(date));
};
const ModeMeta = {
  radar: {
    eyebrow: 'OBSERVABILITY / RADAR',
    title: 'كل إشارة. في مكان واحد.',
    lead: 'ترصد ORBIT الأحداث المؤكدة، وتفصلها عن التجارب. بدون ضوضاء أو إنذارات وهمية.',
    action: 'افتح أدوات الرادار',
    Icon: Radar,
  },
  fleet: {
    eyebrow: 'FLEET / YOUR WORKSPACE',
    title: 'برامجك، مرتبة وواضحة.',
    lead: 'كل موقع له بطاقته وحالة ربطه. تستطيع إضافة برنامج أو إيقاف مراقبته عند الحاجة.',
    action: 'إضافة وإدارة البرامج',
    Icon: Layers3,
  },
  intelligence: {
    eyebrow: 'INTELLIGENCE / ENGINEERING',
    title: 'من المشكلة إلى الفهم.',
    lead: 'تتبّع الأثر، تعلّم من الحلول الموثقة، وانسخ تعليمات Claude عندما يوجد دليل.',
    action: 'أدوات الذكاء والتحليل',
    Icon: BrainCircuit,
  },
  operations: {
    eyebrow: 'ASSURANCE / OPERATIONS',
    title: 'وضوح قبل أي قرار.',
    lead: 'التحقق والحماية والتقارير. لا شهادة سلامة بلا اختبارات حقيقية.',
    action: 'الاختبارات والتقارير',
    Icon: ShieldCheck,
  },
} as const;

export function WorkspaceOverview({
  mode, platforms, incidents, events, engineeringMemory, changeImpacts, silentFailures,
  alerts, acceptanceCriteria, selfHealth, canaryHistory,
  openAdvanced, openPlatform, openIncident, syncGithub,
}: Props) {
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const meta = ModeMeta[mode];
  const Icon = meta.Icon;
  const fleet = useMemo(() => platforms.filter(p => p.lifecycleState !== 'unlinked' && p.lifecycleState !== 'archived'), [platforms]);
  const connected = fleet.filter(getLive);
  const pending = fleet.filter(p => !getLive(p));
  const local = fleet.filter(p => p.runtimeMode === 'local-only' || p.runtimeMode === 'github-local');
  const openCases = useMemo(() => liveIncidents(incidents).sort((a, b) =>
    (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4)), [incidents]);
  const verifiedMemory = engineeringMemory.filter(m => m.verifiedBy && m.incidentId && incidents.some(i => i.incidentId === m.incidentId && i.dataIntegrity === 'Live'));
  const recentEvidencedEvents = events.filter(e => e.dataIntegrity === 'Live' && e.environment !== 'canary-sandbox');
  const proof = acceptanceCriteria.filter(c => c.status === 'Pass').length;
  const totalCriteria = acceptanceCriteria.length;

  const copyIncident = async (incident: IncidentCaseFile) => {
    const p = platforms.find(x => x.codeName.toUpperCase() === incident.appId.toUpperCase());
    if (!p) { openIncident(incident.incidentId); return; }
    try {
      await navigator.clipboard.writeText(generateClaudeMissionPrompt(incident, p, 'fix'));
      setCopied(incident.incidentId);
    } catch {
      setCopied(null);
    }
  };

  const view = mode === 'radar' ? {
    kpis: [
      { Icon: AlertTriangle, value: openCases.length, label: 'الحوادث المباشرة', description: 'المفتوحة المؤكدة', tone: 'coral' },
      { Icon: Activity, value: recentEvidencedEvents.length, label: 'أحداث حقيقية', description: 'استُقبلت مع مصدر', tone: 'blue' },
      { Icon: CloudOff, value: pending.length, label: 'فجوات الربط', description: 'لم يثبت اتصالها', tone: 'amber' },
      { Icon: ShieldCheck, value: canaryHistory.length, label: 'تجارب معزولة', description: 'لا تُعد أعطال إنتاج', tone: 'mint' },
    ],
    section: 'الحوادث التي تحتاج النظر',
    note: 'سجل الرادار لا يثبت سلامة برنامج لا يرسل بيانات.',
  } : mode === 'fleet' ? {
    kpis: [
      { Icon: Layers3, value: fleet.length, label: 'البرامج المسجلة', description: 'ضمن المدار', tone: 'blue' },
      { Icon: Wifi, value: connected.length, label: 'مصادر متصلة', description: 'GitHub أو حساس موثّق', tone: 'mint' },
      { Icon: CloudOff, value: pending.length, label: 'تحتاج تحققاً', description: 'لا نفترض السلامة', tone: 'amber' },
      { Icon: Code2, value: local.length, label: 'برامج محلية', description: 'ليست مواقع عامة', tone: 'violet' },
    ],
    section: 'دليل البرامج',
    note: 'اتصال GitHub لا يثبت عمل الموقع أو نجاح المدفوعات والإشعارات.',
  } : mode === 'intelligence' ? {
    kpis: [
      { Icon: BrainCircuit, value: openCases.length, label: 'حوادث للتحليل', description: 'مصدر Live فقط', tone: 'coral' },
      { Icon: BookOpenCheck, value: verifiedMemory.length, label: 'حلول مرتبطة بأدلة', description: 'ذاكرة تم التحقق منها', tone: 'mint' },
      { Icon: GitCommitHorizontal, value: changeImpacts.filter(c => fleet.some(p => p.codeName === c.appId && getLive(p))).length, label: 'تغييرات قيد المراجعة', description: 'لا نثبت السببية تلقائياً', tone: 'blue' },
      { Icon: Gauge, value: silentFailures.filter(x => x.dataIntegrity === 'Live').length, label: 'إشارات صامتة', description: 'تحتاج فحصاً مستقلاً', tone: 'amber' },
    ],
    section: 'أين تبدأ التحليل؟',
    note: 'الاستنتاجات فرضيات حتى تدعمها أدلة واختبارات.',
  } : {
    kpis: [
      { Icon: ShieldCheck, value: proof, label: 'بنود مثبتة', description: `من أصل ${totalCriteria} بنداً`, tone: 'mint' },
      { Icon: CloudOff, value: totalCriteria - proof, label: 'بنود غير مثبتة', description: 'تحتاج اختباراً موثقاً', tone: 'amber' },
      { Icon: Database, value: connected.length, label: 'ربط متحقق', description: 'لا يعني صحة الوظائف', tone: 'blue' },
      { Icon: Activity, value: canaryHistory.length, label: 'اختبارات داخلية', description: 'منفصلة عن الإنتاج', tone: 'violet' },
    ],
    section: 'التحقق والحماية',
    note: 'الفحص الداخلي لا يثبت أمن المستودعات أو صلاحية النسخ الاحتياطية.',
  };

  return (
    <div className="orbit-workspace-overview" dir="rtl" data-mode={mode}>
      <section className="orbit-workspace-hero">
        <div className="orbit-workspace-heading">
          <span className="orbit-eyebrow"><span className="orbit-eyebrow-dot"/>{meta.eyebrow}</span>
          <h1>{meta.title}</h1>
          <p>{meta.lead}</p>
          <div className="orbit-workspace-hero-actions">
            <button type="button" className="orbit-main-button" onClick={openAdvanced}><Wrench size={16}/>{meta.action}<ArrowLeft size={15}/></button>
            {mode === 'fleet' && <button type="button" className="orbit-quiet-button" onClick={syncGithub}><GitPullRequest size={16}/> افحص GitHub</button>}
          </div>
        </div>
        <div className="orbit-workspace-symbol" aria-hidden="true"><span className="orbit-workspace-aura"/><Icon size={55} strokeWidth={1.2}/></div>
      </section>

      <section className="orbit-workspace-stat-grid" aria-label="الأرقام المعروضة">
        {view.kpis.map(({ Icon: CardIcon, value, label, description, tone }) =>
          <div className="orbit-workspace-stat" key={label}>
            <span className={'orbit-workspace-stat-icon orbit-tone-' + tone}><CardIcon size={19}/></span>
            <strong>{value}</strong><span>{label}</span><small>{description}</small>
          </div>
        )}
      </section>

      <section className="orbit-workspace-content">
        <div className="orbit-workspace-section-head">
          <div><span className="orbit-kicker">ملخص قابل للتنفيذ</span><h2>{view.section}</h2></div>
          <span className="orbit-workspace-source"><span/> {view.note}</span>
        </div>

        {mode === 'fleet' ? (
          <>
            <label className="orbit-searchbox orbit-workspace-search"><Search size={16}/><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث عن برنامج…" aria-label="تصفية دليل البرامج"/></label>
            <div className="orbit-workspace-fleet">
              {fleet.filter(p => [p.codeName,p.nameAr,p.description].join(' ').toLowerCase().includes(search.trim().toLowerCase())).map(p =>
                <button type="button" key={p.id} className="orbit-workspace-fleet-item" onClick={() => openPlatform(p.id)}>
                  <span className="orbit-workspace-fleet-icon"><Layers3 size={21}/></span>
                  <span className="orbit-workspace-fleet-text"><strong>{p.nameAr.replace(/\s*\([^)]*\)/g, '')}</strong><small dir="ltr">{p.codeName}</small></span>
                  <span className={getLive(p) ? 'orbit-workspace-mini-state live' : 'orbit-workspace-mini-state'}>
                    {getLive(p) ? 'اتصال موثّق' : (p.runtimeMode === 'local-only' || p.runtimeMode === 'github-local') ? 'محلي' : 'غير مؤكد'}
                  </span>
                  <ArrowUpLeft size={16} className="orbit-workspace-fleet-arrow"/>
                </button>
              )}
            </div>
          </>
        ) : mode === 'radar' ? (
          openCases.length ? <div className="orbit-workspace-case-list">
            {openCases.slice(0, 8).map(c => <article className="orbit-workspace-case" key={c.incidentId}>
              <div className="orbit-workspace-case-top"><span className="orbit-incident-pill"><span className="orbit-dot-bad"/>{c.appId} · {c.severity}</span><time>{dateAr(c.lastSeen)}</time></div>
              <h3>{c.title}</h3><p>{c.summary}</p>
              <div className="orbit-workspace-case-actions">
                <button type="button" className="orbit-main-button" onClick={() => copyIncident(c)}>{copied === c.incidentId ? <Check size={15}/> : <Copy size={15}/>} {copied === c.incidentId ? 'تم النسخ' : 'انسخ مهمة Claude'}</button>
                <button type="button" className="orbit-quiet-button" onClick={() => openIncident(c.incidentId)}>الأدلة والتفاصيل <ChevronLeft size={14}/></button>
              </div>
            </article>)}
          </div> : <div className="orbit-workspace-blank"><ShieldCheck size={28}/><h3>لا توجد حوادث مباشرة مؤكدة في البيانات المعروضة</h3><p>قد يكون السبب أن البرامج لم ترسل إشارات بعد؛ ابدأ بفحص الربط قبل الحكم على سلامتها.</p><button type="button" className="orbit-quiet-button" onClick={openAdvanced}>افحص المحرك والاختبارات <ArrowLeft size={15}/></button></div>
        ) : mode === 'intelligence' ? (
          <div className="orbit-workspace-tiles">
            <button type="button" onClick={openAdvanced}><span className="orbit-tone-blue"><FileClock size={25}/></span><strong>أثر التغييرات</strong><small>شوف ما تغير ولماذا يستحق الفحص</small><ArrowUpLeft size={16}/></button>
            <button type="button" onClick={openAdvanced}><span className="orbit-tone-mint"><BookOpenCheck size={25}/></span><strong>الذاكرة الهندسية</strong><small>الحلول التي تم توثيقها واختبارها</small><ArrowUpLeft size={16}/></button>
            <button type="button" onClick={openAdvanced}><span className="orbit-tone-amber"><AlertTriangle size={25}/></span><strong>الأعطال الصامتة</strong><small>مشاكل تختبئ خلف شاشة «تم بنجاح»</small><ArrowUpLeft size={16}/></button>
          </div>
        ) : (
          <div className="orbit-workspace-tiles">
            <button type="button" onClick={openAdvanced}><span className="orbit-tone-blue"><ClipboardCopy size={25}/></span><strong>تقرير اليوم</strong><small>ملخص مبني على الأدلة المتوفرة</small><ArrowUpLeft size={16}/></button>
            <button type="button" onClick={openAdvanced}><span className="orbit-tone-mint"><ShieldCheck size={25}/></span><strong>اختبارات الحماية</strong><small>ما اجتاز الفحص وما يحتاج اختباراً</small><ArrowUpLeft size={16}/></button>
            <button type="button" onClick={openAdvanced}><span className="orbit-tone-violet"><History size={25}/></span><strong>مختبر وتجارب</strong><small>تجارب معزولة عن البرامج الحقيقية</small><ArrowUpLeft size={16}/></button>
          </div>
        )}
      </section>
      <div className="orbit-workspace-footnote"><LockKeyhole size={16}/><span>برامجك مستقلة. لا تعديل تلقائي على المزايا أو المستخدمين أو الدفع أو الإشعارات أو النشر.</span></div>
    </div>
  );
}
