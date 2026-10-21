import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, ArrowLeft, ArrowUpLeft, Bell, BellOff, Check, CheckCheck, ChevronLeft,
  CircleAlert, CloudOff, Code2, Copy, Eye, Globe2, Layers3, RefreshCw,
  LockKeyhole, Plus, Radar, Search, ShieldCheck, Sparkles, WifiOff, Zap,
} from 'lucide-react';
import type { IncidentCaseFile, PlatformRecord, RadarEvent } from '../core/types';
import { generateClaudeMissionPrompt } from '../core/engine';
import { buildFleetReportForClaude, buildRepairIntelligenceAddendum, getLinkIssue, getProgramProblems } from '../core/guardian';
import './orbit-one.css';

interface ExecutiveOverviewProps {
  platforms: PlatformRecord[];
  incidents: IncidentCaseFile[];
  events: RadarEvent[];
  onOpenPlatform: (id: string) => void;
  onOpenIncident?: (id: string) => void;
  onOpenRadar?: () => void;
  onOpenFleet?: () => void;
  onQuickAdd: (name: string, url: string) => Promise<string>;
  onSyncGithub: () => void;
  isGithubSyncing: boolean;
  githubTokenConfigured?: boolean;
}

type Filter = 'all' | 'issues' | 'gaps';
const severityRank: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3, Informational: 4 };
const closedStatuses = new Set(['Resolved', 'False Positive', 'Expected Behavior', "Won't Fix"]);

const linked = (p: PlatformRecord) => p.connectionVerified && p.dataIntegrity === 'Live';
const sourceConnection = (p: PlatformRecord) => {
  if (linked(p)) {
    return {
      label: p.runtimeMode === 'github-web' || p.runtimeMode === 'github-local' ? 'GitHub مربوط' : 'المصدر متصل',
      tone: 'connected',
    };
  }
  if (p.runtimeMode === 'local-only') return { label: 'محلي', tone: 'local' };
  if (p.dataIntegrity === 'Cached') return { label: 'بيانات قديمة', tone: 'stale' };
  if (p.dataIntegrity === 'Unavailable' || p.connectionStatus === 'Unavailable') {
    return { label: 'تعذر الاتصال', tone: 'unavailable' };
  }
  return { label: 'بانتظار الربط', tone: 'pending' };
};
/** Linked to live GitHub evidence and the public site answered, with no known failing check. */
const journeyChecked = (p: PlatformRecord) =>
  linked(p) && p.productionUrlVerified && p.fourState?.siteReachable === true &&
  p.fourState?.ciPassed !== false && p.fourState?.deploymentSucceeded !== false && p.fourState?.userJourneyHealthy !== false;

const displayTime = (s: string) => {
  const date = Date.parse(s);
  return Number.isFinite(date)
    ? new Intl.DateTimeFormat('ar-KW', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(date)
    : 'غير متوفر';
};

const labelForSeverity = (s: string) =>
  s === 'Critical' ? 'حرجة' : s === 'High' ? 'مهمة' : s === 'Medium' ? 'متوسطة' : 'منخفضة';

const iconFor = (p: PlatformRecord) => {
  const name = p.codeName.toUpperCase();
  if (name.includes('ALFA')) return Sparkles;
  if (name.includes('ORDER') || name.includes('MAJAL')) return Zap;
  if (name.includes('MIRAS')) return Layers3;
  if (name.includes('ACADEM')) return Globe2;
  return Code2;
};

/** All prominent incident counts require a witnessed production event; demonstration data is excluded. */
export function getConfirmedProductionIncidents(incidents: IncidentCaseFile[], events: RadarEvent[]) {
  const witnessed = new Set(events
    .filter(e => e.environment === 'production' && e.dataIntegrity === 'Live')
    .map(e => e.appId.toUpperCase() + ':' + e.fingerprint));

  return incidents.filter(i =>
    i.dataIntegrity === 'Live' &&
    !closedStatuses.has(i.status) &&
    witnessed.has(i.appId.toUpperCase() + ':' + i.fingerprint)
  ).sort((a, b) =>
    (severityRank[a.severity] ?? 5) - (severityRank[b.severity] ?? 5) ||
    (Date.parse(b.lastSeen) || 0) - (Date.parse(a.lastSeen) || 0)
  );
}

export function ExecutiveOverview({
  platforms, incidents, events, onOpenPlatform, onOpenIncident, onOpenRadar, onOpenFleet, onQuickAdd,
  onSyncGithub, isGithubSyncing, githubTokenConfigured,
}: ExecutiveOverviewProps) {
  const [syncSeconds, setSyncSeconds] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const [showAllIssues, setShowAllIssues] = useState(false);
  const [expandedIssue, setExpandedIssue] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLink, setNewLink] = useState('');
  const [addFeedback, setAddFeedback] = useState('');
  const [adding, setAdding] = useState(false);
  const submitAdd = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAdding(true); setAddFeedback('');
    try {
      const message = await onQuickAdd(newName, newLink);
      setAddFeedback(message); setNewName(''); setNewLink('');
    } catch (error) { setAddFeedback(error instanceof Error ? error.message : 'تعذر إضافة البرنامج'); }
    finally { setAdding(false); }
  };
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [notifyMessage, setNotifyMessage] = useState('');
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isGithubSyncing) {
      setSyncSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => setSyncSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [isGithubSyncing]);

  const fleet = useMemo(
    () => platforms.filter(p => p.lifecycleState !== 'unlinked' && p.lifecycleState !== 'archived'),
    [platforms],
  );
  const confirmed = useMemo(
    () => getConfirmedProductionIncidents(incidents, events), [incidents, events],
  );
  const signals = useMemo(
    () => fleet.map(p => ({ p, problems: getProgramProblems(p) })).filter(x => x.problems.length),
    [fleet],
  );
  const linkIssues = useMemo(
    () => fleet.map(p => ({ p, issue: getLinkIssue(p) })).filter((x): x is { p: PlatformRecord; issue: string } => Boolean(x.issue)),
    [fleet],
  );
  const affected = new Set([...confirmed.map(i => i.appId.toUpperCase()), ...signals.map(x => x.p.codeName.toUpperCase())]);
  const problemOf = (p: PlatformRecord) => signals.find(x => x.p.id === p.id)?.problems[0];
  const checked = fleet.filter(journeyChecked);
  const gaps = fleet.filter(p => !journeyChecked(p));
  const urgent = confirmed.filter(i => i.severity === 'Critical' || i.severity === 'High');
  const coverage = fleet.length ? Math.round(checked.length * 100 / fleet.length) : 0;
  const status = urgent.length || signals.length ? 'attention' : gaps.length ? 'incomplete' : 'monitored';

  const visible = fleet.filter(p => {
    const q = query.trim().toLowerCase();
    if (q && !(p.nameAr + ' ' + p.codeName + ' ' + p.repoName).toLowerCase().includes(q)) return false;
    if (filter === 'issues') return affected.has(p.codeName.toUpperCase());
    if (filter === 'gaps') return !journeyChecked(p);
    return true;
  });

  useEffect(() => {
    if (!notifyEnabled || typeof window === 'undefined' || !('Notification' in window) ||
        Notification.permission !== 'granted') return;
    const ids = confirmed.map(i => i.incidentId + ':' + i.firstSeen);
    const next = confirmed.filter(i =>
      (i.severity === 'Critical' || i.severity === 'High') &&
      !seenRef.current.has(i.incidentId + ':' + i.firstSeen)
    );
    ids.forEach(id => seenRef.current.add(id));
    for (const incident of next) {
      try {
        new Notification('ORBIT ONE — ' + incident.appId, {
          body: incident.title,
          tag: 'orbit-' + incident.incidentId,
        });
      } catch { /* Browser may deny notifications despite the permission state. */ }
    }
  }, [confirmed, notifyEnabled]);

  const enableNotifications = async () => {
    if (notifyEnabled) {
      setNotifyEnabled(false);
      setNotifyMessage('تنبيهات هذه الصفحة متوقفة');
      return;
    }
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotifyMessage('التنبيهات غير مدعومة في هذا المتصفح');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setNotifyMessage('فعّل إذن الإشعارات من إعدادات المتصفح');
        return;
      }
      seenRef.current = new Set(confirmed.map(i => i.incidentId + ':' + i.firstSeen));
      setNotifyEnabled(true);
      setNotifyMessage('مفعّلة أثناء فتح ORBIT فقط');
    } catch { setNotifyMessage('تعذر تفعيل إشعارات المتصفح'); }
  };

  const copyReport = async (list: PlatformRecord[], key: string) => {
    try {
      await navigator.clipboard.writeText(buildFleetReportForClaude(list, key === 'all' ? incidents : []));
      setCopied(key);
      window.setTimeout(() => setCopied(c => (c === key ? null : c)), 2500);
    } catch { setCopied(null); }
  };

  const copyMission = async (incident: IncidentCaseFile) => {
    const platform = fleet.find(p => p.codeName.toUpperCase() === incident.appId.toUpperCase());
    if (!platform) return;
    try {
      await navigator.clipboard.writeText(generateClaudeMissionPrompt(incident, platform, 'fix') + '\n' + buildRepairIntelligenceAddendum(incident, platform, fleet));
      setCopied(incident.incidentId);
    } catch { setCopied(null); }
  };

  return (
    <div className="orbit-executive orbit-one" dir="rtl">
      <section className="one-hero" aria-label="غرفة مراقبة البرامج">
        <div className="one-hero-content">
          <span className="one-eyebrow"><span className="one-pulse"/> ORBIT ONE <span className="one-eyebrow-divider"/> غرفة عملياتك الهادئة</span>
          <h1>كل برامجك.<br/><span>تحت نظرك.</span></h1>
          <p>نرصد ما يحدث. نختصر الضوضاء. ونعطيك ما تحتاج لإصلاح المشكلة بخطوة واحدة.</p>
          <div className={'one-state one-state-' + status}>
            {status === 'attention' ? <CircleAlert size={18}/> : status === 'incomplete' ? <CloudOff size={18}/> : <ShieldCheck size={18}/>}
            <span>{status === 'attention' ? 'توجد مشاكل تحتاج انتباهك' :
              status === 'incomplete' ? 'لا توجد مشاكل مؤكدة معروضة، لكن الرصد غير مكتمل' :
              'لا توجد مشاكل مؤكدة ضمن نطاق المراقبة المثبت'}</span>
          </div>
          {status === 'incomplete' && (
            <p className="one-monitoring-gap" role="status">
              {linkIssues.length
                ? `${linkIssues.length} من ${fleet.length} برامج غير مربوطة بقراءة حية. الأسباب في الأسفل، ويمكنك نسخها لكلود.`
                : 'مزامنة GitHub تفحص المستودع ونتائج CI؛ اكتمال الرصد يتطلب أيضاً فحص رابط الموقع.'}
            </p>
          )}
          <div className="one-hero-actions">
            <button className="one-button one-button-primary" type="button" onClick={() => void copyReport(fleet, 'all')}>
              {copied === 'all' ? <Check size={17}/> : <Copy size={17}/>} {copied === 'all' ? 'تم النسخ — الصقه في كلود' : 'انسخ تقرير المشاكل لكلود'}
            </button>
            <button className="one-button one-button-ghost" type="button" onClick={onSyncGithub} disabled={isGithubSyncing} aria-busy={isGithubSyncing}>
              <RefreshCw size={17} className={isGithubSyncing ? 'animate-spin' : ''}/>{isGithubSyncing ? `جارٍ فحص GitHub · ${syncSeconds} ث` : 'مزامنة GitHub الآن'}
            </button>
            <button className="one-button one-button-ghost" type="button" onClick={() => { setAddOpen(true); document.getElementById("orbit-one-programs")?.scrollIntoView({behavior:"smooth"}); }}>
              <Plus size={17}/> إضافة برنامج
            </button>
          </div>
          {isGithubSyncing && (
            <p className="one-sync-progress" role="status" aria-live="polite">
              نفحص المستودعات المسجلة ونتائج GitHub Actions بالتتابع. قد يستغرق الفحص نحو نصف دقيقة.
            </p>
          )}
        </div>
        <div className="one-orbit-art" aria-label={'تم التحقق من عمل الموقع في ' + checked.length + ' من ' + fleet.length + ' برامج'}>
          <div className="one-orbit-glow"/>
          <div className="one-ring one-ring-outer"><span className="one-orbit-star one-star-a"/><span className="one-orbit-star one-star-b"/></div>
          <div className="one-ring one-ring-middle"/>
          <div className="one-ring one-ring-inner"/>
          <div className="one-orbit-core">
            <Radar size={27} strokeWidth={1.6}/>
            <span>ORBIT</span>
            <strong>ONE</strong>
          </div>
          <div className="one-float-chip one-chip-top"><ShieldCheck size={15}/> رصد من أدلة حقيقية</div>
          <div className="one-float-chip one-chip-bottom"><Layers3 size={15}/> {fleet.length} برنامج</div>
        </div>
      </section>

      <section className="one-score-row" aria-label="المؤشرات الرئيسية">
        <div className="one-score-card">
          <span className="one-score-icon one-icon-blue"><Layers3 size={21}/></span>
          <strong>{fleet.length}</strong><span>برنامج في المدار</span><small>الحالية والمضافة مستقبلاً</small>
        </div>
        <div className="one-score-card">
          <span className="one-score-icon one-icon-coral"><CircleAlert size={21}/></span>
          <strong>{affected.size}</strong><span>برنامج فيه مشكلة</span><small>من أدلة موثقة فقط</small>
        </div>
        <div className="one-score-card">
          <span className="one-score-icon one-icon-amber"><WifiOff size={21}/></span>
          <strong>{gaps.length}</strong><span>رصد غير مكتمل</span><small>لا نعتبرها سليمة بلا دليل</small>
        </div>
        <div className="one-score-card one-coverage-card">
          <div className="one-coverage-ring" style={{ background: 'conic-gradient(#70d8ad ' + coverage + '%, rgba(150,161,178,.16) 0)' }}>
            <span>{coverage}%</span>
          </div>
          <div><span>مواقع تعمل</span><small>{checked.length} من {fleet.length} برنامج</small></div>
        </div>
      </section>

      <div className="one-content-grid">
        <section id="orbit-one-incidents" className="one-panel one-incidents" aria-label="الحوادث التي تحتاج انتباهك">
          <header className="one-panel-heading">
            <div><span className="one-section-tag">الأهم الآن</span><h2>ما يحتاج تدخّلك</h2></div>
            <div className="one-quiet-actions"><button type="button" className="one-bell-control" onClick={() => void enableNotifications()} title="إشعارات المتصفح أثناء فتح أوربت فقط" aria-label={notifyEnabled ? 'إيقاف إشعارات المتصفح' : 'تفعيل إشعارات المتصفح'} aria-pressed={notifyEnabled}>{notifyEnabled ? <Bell size={18}/> : <BellOff size={18}/>}</button><span className={'one-counter ' + (confirmed.length ? 'one-counter-alert' : '')}>{confirmed.length}</span></div>
          </header>
          {notifyMessage && <span className="one-notice-inline" role="status">{notifyMessage}</span>}
          {githubTokenConfigured === false && (
            <p className="one-monitoring-gap" role="status">لم يُضبط توكن GitHub على الخادم: المستودعات الخاصة لن تُقرأ، والمستودعات العامة محدودة بـ60 طلباً في الساعة.</p>
          )}
          {linkIssues.length > 0 && (
            <div className="one-link-issues" role="status">
              <strong>سبب عدم ربط بعض البرامج</strong>
              <ul>{linkIssues.map(({ p, issue }) => <li key={p.id}><b>{p.nameAr.replace(/\s*\([^)]*\)/g, '')}:</b> {issue}</li>)}</ul>
              <button className="one-button one-button-link" type="button" onClick={() => void copyReport(fleet, 'all')}>
                {copied === 'all' ? <Check size={16}/> : <Copy size={16}/>} انسخ التقرير لكلود
              </button>
            </div>
          )}
          {signals.length > 0 && (
            <div className="one-incidents-list">
              {signals.map(({ p, problems }) => (
                <article className="one-issue" key={'sig-' + p.id}>
                  <div className="one-issue-titleline">
                    <span className="one-severity one-severity-critical"><span className="one-severity-dot"/>تحتاج فحصاً</span>
                    <span className="one-issue-app">{p.nameAr.replace(/\s*\([^)]*\)/g, '')}</span>
                  </div>
                  <ul className="one-issue-problems">{problems.map(x => <li key={x}>{x}</li>)}</ul>
                  <div className="one-issue-actions">
                    <button className="one-button one-button-primary" type="button" onClick={() => void copyReport([p], 'sig-' + p.id)}>
                      {copied === 'sig-' + p.id ? <Check size={16}/> : <Copy size={16}/>}
                      {copied === 'sig-' + p.id ? 'تم النسخ' : 'انسخ لكلود'}
                    </button>
                    <button className="one-button one-button-link" type="button" onClick={() => onOpenPlatform(p.id)}>التفاصيل <ChevronLeft size={16}/></button>
                  </div>
                </article>
              ))}
            </div>
          )}
          {confirmed.length ? (
            <div className="one-incidents-list">
              {(showAllIssues ? confirmed : confirmed.slice(0, 4)).map(incident => {
                const p = fleet.find(p => p.codeName.toUpperCase() === incident.appId.toUpperCase());
                return (
                  <article className="one-issue" key={incident.incidentId}>
                    <div className="one-issue-titleline">
                      <span className={'one-severity one-severity-' + (incident.severity === 'Critical' ? 'critical' : 'other')}>
                        <span className="one-severity-dot"/>{labelForSeverity(incident.severity)}
                      </span>
                      <span className="one-issue-app">{p?.nameAr || incident.appId}</span>
                      <time className="one-time">{displayTime(incident.lastSeen)}</time>
                    </div>
                    <h3>{incident.title}</h3>
                    <p>{incident.summary}</p>
                    <div className="one-issue-meta">
                      <span><Activity size={13}/> {incident.occurrenceCount} تكرار</span>
                      <span><Eye size={13}/> {incident.affectedSessions} جلسة مرصودة</span>
                      <span><CheckCheck size={13}/> مصدر إنتاجي موثّق</span>
                    </div>
                    <div className="one-issue-actions">
                      <button className="one-button one-button-primary" type="button" disabled={!p} onClick={() => void copyMission(incident)}>
                        {copied === incident.incidentId ? <Check size={16}/> : <Copy size={16}/>}
                        {copied === incident.incidentId ? 'تم نسخ المهمة' : 'انسخ المهمة لكلود أو ChatGPT'}
                      </button>
                      <button className="one-button one-button-link" type="button" onClick={() => setExpandedIssue(expandedIssue === incident.incidentId ? null : incident.incidentId)}>
                        الأدلة <ChevronLeft size={16}/>
                      </button>
                    </div>
                    {expandedIssue === incident.incidentId && (
                      <div className="one-incident-evidence">
                        <strong>أدلة المشكلة</strong>
                        <p>{incident.confirmedEvidence.length ? incident.confirmedEvidence.slice(0, 4).join(' • ') : 'تحتاج أدلة إضافية قبل تحديد السبب.'}</p>
                        <span>السبب الجذري لا يُعتمد قبل التحقق. انسخ المهمة للتحليل الآمن.</span>
                      </div>
                    )}
                  </article>
                );
              })}
              {confirmed.length > 4 && <button type="button" className="one-inline-action" onClick={() => setShowAllIssues(!showAllIssues)}>{showAllIssues ? 'عرض أقل' : 'عرض بقية المشاكل'} <ArrowUpLeft size={15}/></button>}
            </div>
          ) : signals.length ? null : (
            <div className="one-no-incident">
              <div className="one-no-incident-icon"><ShieldCheck size={31} strokeWidth={1.6}/></div>
              <h3>لا توجد مشاكل إنتاج مؤكدة حالياً</h3>
              <p>{gaps.length ? 'هذا لا يعني سلامة كل البرامج؛ هناك برامج تحتاج استكمال الرصد.' : 'المصادر المتحققة لم تسجل حادثة مفتوحة.'}</p>
              {gaps.length > 0 && <button className="one-inline-action" type="button" onClick={() => { setAddOpen(true); document.getElementById("orbit-one-programs")?.scrollIntoView({behavior:"smooth"}); }}>استكمال ربط المراقبة <ArrowLeft size={15}/></button>}
            </div>
          )}
        </section>

      </div>

      <section id="orbit-one-programs" className="one-program-section" aria-label="دليل البرامج">
        <header className="one-program-heading">
          <div><span className="one-section-tag">مدارك الرقمية</span><h2>برامجك <span>{fleet.length}</span></h2><p>حالة واضحة لكل برنامج، بدون تفاصيل تقنية مزعجة.</p></div>
          <button className="one-button one-button-light" onClick={() => { setAddOpen(true); document.getElementById("orbit-one-programs")?.scrollIntoView({behavior:"smooth"}); }} type="button"><Plus size={17}/> إضافة وإدارة</button>
        </header>
        {addOpen && <form className="one-quick-add" onSubmit={submitAdd} aria-label="إضافة برنامج جديد">
          <div className="one-quick-add-intro"><strong>إضافة برنامج</strong><p>الاسم والرابط فقط. بدون إعدادات برمجية.</p></div>
          <label>اسم البرنامج<input type="text" value={newName} maxLength={100} onChange={event => setNewName(event.target.value)} required placeholder="مثال: برنامجي الجديد"/></label>
          <label>رابط GitHub أو الموقع<input type="url" value={newLink} onChange={event => setNewLink(event.target.value)} required placeholder="https://github.com/owner/project" dir="ltr"/></label>
          <div className="one-quick-add-actions">
            <button className="one-button one-button-primary" disabled={adding} type="submit">{adding ? 'جاري الإضافة…' : 'إضافة البرنامج'} <Plus size={16}/></button>
            <button type="button" className="one-button one-button-light" onClick={() => setAddOpen(false)}>إغلاق</button>
          </div>
          {addFeedback && <p className="one-quick-add-feedback" role="status">{addFeedback}</p>}
          <small>إضافة البرنامج لا تعني أن مراقبة مستخدميه متصلة؛ سيظهر «الرصد غير مكتمل» حتى يثبت العكس.</small>
        </form>}
        <div className="one-program-tools">
          <div className="orbit-filter-tabs" role="group" aria-label="تصفية البرامج">
            <button type="button" className={filter === 'all' ? 'active' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>الكل <span>{fleet.length}</span></button>
            <button type="button" className={filter === 'issues' ? 'active' : ''} aria-pressed={filter === 'issues'} onClick={() => setFilter('issues')}>المشاكل <span>{fleet.filter(p => affected.has(p.codeName.toUpperCase())).length}</span></button>
            <button type="button" className={filter === 'gaps' ? 'active' : ''} aria-pressed={filter === 'gaps'} onClick={() => setFilter('gaps')}>رصد ناقص <span>{gaps.length}</span></button>
          </div>
          <label className="one-search"><Search size={16}/><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="ابحث عن برنامج..." aria-label="ابحث عن برنامج"/></label>
        </div>
        {visible.length ? <div className="one-program-grid">
          {visible.map(p => {
            const Icon = iconFor(p);
            const issue = affected.has(p.codeName.toUpperCase());
            const verified = journeyChecked(p);
            const local = p.runtimeMode === 'local-only' || p.runtimeMode === 'github-local';
            const connection = sourceConnection(p);
            return <button type="button" className="orbit-app-card one-program-card" key={p.id} onClick={() => onOpenPlatform(p.id)} aria-label={'فتح تفاصيل ' + p.nameAr}>
              <span className="one-program-top"><span className="one-program-icon"><Icon size={22} strokeWidth={1.65}/></span><span className={'one-connection-indicator one-connection-' + connection.tone} role="status" aria-label={connection.label} title={connection.label}><span className="one-connection-dot"/>{connection.label}</span><ArrowUpLeft size={17}/></span>
              <strong>{p.nameAr.replace(/\s*\([^)]*\)/g, '')}</strong>
              <span className="one-program-code" dir="ltr">{p.codeName}</span>
              <span className={'one-program-status ' + (issue ? 'one-program-bad' : verified ? 'one-program-good' : 'one-program-unknown')}>
                <span/>{issue ? (problemOf(p) || 'مشكلة مؤكدة') : verified ? 'الموقع يعمل' : local ? 'برنامج محلي' : 'الرصد غير مكتمل'}
              </span>
            </button>;
          })}
        </div> : <div className="one-empty-filter">لا توجد برامج مطابقة. <button type="button" onClick={() => {setFilter('all'); setQuery('');}}>عرض الكل</button></div>}
      </section>
      <footer className="one-footer"><LockKeyhole size={15}/><span>أوربت يراقب ويقترح. لا يعدّل برامجك أو الدفع أو البيانات أو ينشر إصلاحات تلقائياً.</span></footer>
    </div>
  );
}
