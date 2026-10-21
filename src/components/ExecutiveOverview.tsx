import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, ArrowLeft, ArrowUpLeft, Bell, BellOff, Check, CheckCheck, ChevronLeft,
  CircleAlert, CircleHelp, CloudOff, Code2, Copy, Eye, Globe2, Layers3,
  LockKeyhole, Plus, Radar, Search, ShieldCheck, Sparkles, WifiOff, Zap,
} from 'lucide-react';
import type { IncidentCaseFile, PlatformRecord, RadarEvent } from '../core/types';
import { generateClaudeMissionPrompt } from '../core/engine';
import './orbit-one.css';

interface ExecutiveOverviewProps {
  platforms: PlatformRecord[];
  incidents: IncidentCaseFile[];
  events: RadarEvent[];
  onOpenPlatform: (id: string) => void;
  onOpenIncident: (id: string) => void;
  onOpenRadar: () => void;
  onOpenFleet: () => void;
}

type Filter = 'all' | 'issues' | 'gaps';
const severityRank: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3, Informational: 4 };
const closedStatuses = new Set(['Resolved', 'False Positive', 'Expected Behavior', "Won't Fix"]);

const linked = (p: PlatformRecord) => p.connectionVerified && p.dataIntegrity === 'Live';
const journeyChecked = (p: PlatformRecord) =>
  linked(p) && p.productionUrlVerified &&
  p.fourState?.siteReachable === true && p.fourState?.userJourneyHealthy === true;

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
  platforms, incidents, events, onOpenPlatform, onOpenIncident, onOpenRadar, onOpenFleet,
}: ExecutiveOverviewProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [notifyMessage, setNotifyMessage] = useState('');
  const seenRef = useRef<Set<string>>(new Set());

  const fleet = useMemo(
    () => platforms.filter(p => p.lifecycleState !== 'unlinked' && p.lifecycleState !== 'archived'),
    [platforms],
  );
  const confirmed = useMemo(
    () => getConfirmedProductionIncidents(incidents, events), [incidents, events],
  );
  const affected = new Set(confirmed.map(i => i.appId.toUpperCase()));
  const checked = fleet.filter(journeyChecked);
  const gaps = fleet.filter(p => !journeyChecked(p));
  const urgent = confirmed.filter(i => i.severity === 'Critical' || i.severity === 'High');
  const productionEvents = events.filter(e => e.environment === 'production' && e.dataIntegrity === 'Live');
  const signalCounts = [
    { title: 'تجربة المستخدم', icon: Eye, count: productionEvents.filter(e => e.eyeLayer === 'Eye 1: Client Experience').length, tone: 'peach' },
    { title: 'الخادم والعمليات', icon: Activity, count: productionEvents.filter(e => e.eyeLayer === 'Eye 2: Server & Infrastructure').length, tone: 'mint' },
    { title: 'الكود والتحديثات', icon: Code2, count: productionEvents.filter(e => e.eyeLayer === 'Eye 3: Code & Deployment').length, tone: 'lilac' },
  ];
  const totalSignals = signalCounts.reduce((sum, x) => sum + x.count, 0);
  const coverage = fleet.length ? Math.round(checked.length * 100 / fleet.length) : 0;
  const status = urgent.length ? 'attention' : gaps.length ? 'incomplete' : 'monitored';

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

  const copyMission = async (incident: IncidentCaseFile) => {
    const platform = fleet.find(p => p.codeName.toUpperCase() === incident.appId.toUpperCase());
    if (!platform) return;
    try {
      await navigator.clipboard.writeText(generateClaudeMissionPrompt(incident, platform, 'fix'));
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
            <span>{status === 'attention' ? 'توجد مشاكل مؤكدة تحتاج انتباهك' :
              status === 'incomplete' ? 'لا توجد مشاكل مؤكدة معروضة، لكن الرصد غير مكتمل' :
              'لا توجد مشاكل مؤكدة ضمن نطاق المراقبة المثبت'}</span>
          </div>
          <div className="one-hero-actions">
            <button className="one-button one-button-primary" type="button" onClick={onOpenRadar}>
              <Radar size={17}/> عرض المشاكل <ArrowLeft size={17}/>
            </button>
            <button className="one-button one-button-ghost" type="button" onClick={onOpenFleet}>
              <Plus size={17}/> إضافة برنامج
            </button>
          </div>
        </div>
        <div className="one-orbit-art" aria-label={'تم التحقق من تجربة المستخدم في ' + checked.length + ' من ' + fleet.length + ' برامج'}>
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
          <strong>{confirmed.length}</strong><span>مشكلة مؤكدة</span><small>إشارات إنتاج موثقة فقط</small>
        </div>
        <div className="one-score-card">
          <span className="one-score-icon one-icon-amber"><WifiOff size={21}/></span>
          <strong>{gaps.length}</strong><span>رصد غير مكتمل</span><small>لا نعتبرها سليمة بلا دليل</small>
        </div>
        <div className="one-score-card one-coverage-card">
          <div className="one-coverage-ring" style={{ background: 'conic-gradient(#70d8ad ' + coverage + '%, rgba(150,161,178,.16) 0)' }}>
            <span>{coverage}%</span>
          </div>
          <div><span>تجربة موثقة</span><small>{checked.length} من {fleet.length} برنامج</small></div>
        </div>
      </section>

      <div className="one-content-grid">
        <section className="one-panel one-incidents" aria-label="الحوادث التي تحتاج انتباهك">
          <header className="one-panel-heading">
            <div><span className="one-section-tag">الأهم الآن</span><h2>ما يحتاج تدخّلك</h2></div>
            <span className={'one-counter ' + (confirmed.length ? 'one-counter-alert' : '')}>{confirmed.length}</span>
          </header>
          {confirmed.length ? (
            <div className="one-incidents-list">
              {confirmed.slice(0, 4).map(incident => {
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
                      <button className="one-button one-button-link" type="button" onClick={() => onOpenIncident(incident.incidentId)}>
                        الأدلة <ChevronLeft size={16}/>
                      </button>
                    </div>
                  </article>
                );
              })}
              {confirmed.length > 4 && <button type="button" className="one-inline-action" onClick={onOpenRadar}>عرض بقية المشاكل <ArrowUpLeft size={15}/></button>}
            </div>
          ) : (
            <div className="one-no-incident">
              <div className="one-no-incident-icon"><ShieldCheck size={31} strokeWidth={1.6}/></div>
              <h3>لا توجد مشاكل إنتاج مؤكدة حالياً</h3>
              <p>{gaps.length ? 'هذا لا يعني سلامة كل البرامج؛ هناك برامج تحتاج استكمال الرصد.' : 'المصادر المتحققة لم تسجل حادثة مفتوحة.'}</p>
              {gaps.length > 0 && <button className="one-inline-action" type="button" onClick={onOpenFleet}>استكمال ربط المراقبة <ArrowLeft size={15}/></button>}
            </div>
          )}
        </section>

        <aside className="one-side-column">
          <section className="one-panel one-signal-panel" aria-label="مصادر إشارات الإنتاج">
            <header className="one-panel-heading"><div><span className="one-section-tag">عيون أوربت</span><h2>من وين نرصد؟</h2></div><Eye size={19}/></header>
            <p className="one-muted">إشارات إنتاج مسجلة، وليست نسبة ضمان أو تغطية.</p>
            <div className="one-signal-list">
              {signalCounts.map(s => {
                const Icon = s.icon;
                return <div className="one-signal" key={s.title}>
                  <span className={'one-signal-icon one-icon-' + s.tone}><Icon size={18}/></span>
                  <div className="one-signal-content">
                    <div><span>{s.title}</span><b>{s.count}</b></div>
                    <div className="one-signal-track"><i className={'one-fill-' + s.tone} style={{width: (totalSignals ? s.count / totalSignals * 100 : 0) + '%'}}/></div>
                  </div>
                </div>;
              })}
            </div>
            {totalSignals === 0 && <p className="one-signal-note"><CircleHelp size={14}/> ما وصلتنا إشارات إنتاج موثقة بعد.</p>}
          </section>
          <section className="one-notice-card">
            <div className="one-notice-icon"><Bell size={20}/></div>
            <div><h3>تنبيهات بدون إزعاج</h3><p>إشعار للمشاكل المهمة أثناء فتح أوربت. إشعارات الهاتف بالخلفية تحتاج خدمة Push مستقلة.</p></div>
            <button className="one-notify-button" type="button" aria-pressed={notifyEnabled} onClick={() => void enableNotifications()}>
              {notifyEnabled ? <BellOff size={15}/> : <Bell size={15}/>}
              {notifyEnabled ? 'إيقاف' : 'تفعيل'}
            </button>
            {notifyMessage && <small className="one-notice-message" role="status">{notifyMessage}</small>}
          </section>
        </aside>
      </div>

      <section className="one-program-section" aria-label="دليل البرامج">
        <header className="one-program-heading">
          <div><span className="one-section-tag">مدارك الرقمية</span><h2>برامجك <span>{fleet.length}</span></h2><p>حالة واضحة لكل برنامج، بدون تفاصيل تقنية مزعجة.</p></div>
          <button className="one-button one-button-light" onClick={onOpenFleet} type="button"><Plus size={17}/> إضافة وإدارة</button>
        </header>
        <div className="one-program-tools">
          <div className="orbit-filter-tabs" role="group" aria-label="تصفية البرامج">
            <button type="button" className={filter === 'all' ? 'active' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>الكل <span>{fleet.length}</span></button>
            <button type="button" className={filter === 'issues' ? 'active' : ''} aria-pressed={filter === 'issues'} onClick={() => setFilter('issues')}>المشاكل <span>{fleet.filter(p => affected.has(p.codeName.toUpperCase())).length}</span></button>
            <button type="button" className={filter === 'gaps' ? 'active' : ''} aria-pressed={filter === 'gaps'} onClick={() => setFilter('gaps')}>يحتاج ربط <span>{gaps.length}</span></button>
          </div>
          <label className="one-search"><Search size={16}/><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="ابحث عن برنامج..." aria-label="ابحث عن برنامج"/></label>
        </div>
        {visible.length ? <div className="one-program-grid">
          {visible.map(p => {
            const Icon = iconFor(p);
            const issue = affected.has(p.codeName.toUpperCase());
            const verified = journeyChecked(p);
            const local = p.runtimeMode === 'local-only' || p.runtimeMode === 'github-local';
            return <button type="button" className="orbit-app-card one-program-card" key={p.id} onClick={() => onOpenPlatform(p.id)} aria-label={'فتح تفاصيل ' + p.nameAr}>
              <span className="one-program-top"><span className="one-program-icon"><Icon size={22} strokeWidth={1.65}/></span><ArrowUpLeft size={17}/></span>
              <strong>{p.nameAr.replace(/\s*\([^)]*\)/g, '')}</strong>
              <span className="one-program-code" dir="ltr">{p.codeName}</span>
              <span className={'one-program-status ' + (issue ? 'one-program-bad' : verified ? 'one-program-good' : 'one-program-unknown')}>
                <span/>{issue ? 'مشكلة مؤكدة' : verified ? 'تجربة أساسية موثقة' : local ? 'برنامج محلي' : 'الرصد غير مكتمل'}
              </span>
            </button>;
          })}
        </div> : <div className="one-empty-filter">لا توجد برامج مطابقة. <button type="button" onClick={() => {setFilter('all'); setQuery('');}}>عرض الكل</button></div>}
      </section>
      <footer className="one-footer"><LockKeyhole size={15}/><span>أوربت يراقب ويقترح. لا يعدّل برامجك أو الدفع أو البيانات أو ينشر إصلاحات تلقائياً.</span></footer>
    </div>
  );
}
