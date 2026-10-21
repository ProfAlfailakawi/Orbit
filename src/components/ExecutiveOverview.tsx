import React, { useMemo, useState } from 'react';
import {
  Activity, ArrowLeft, ArrowUpLeft, BookOpen, CalendarDays, Check, Code2, Rocket, UserRound,
  ChevronLeft, CircleHelp, CloudOff, Copy, Database, FileText, GraduationCap, Layers3,
  LayoutDashboard, Radar, Search, ShieldCheck, ShoppingBag, Sparkles, TriangleAlert, Wifi,
} from 'lucide-react';
import type { IncidentCaseFile, PlatformRecord, RadarEvent } from '../core/types';
import { generateClaudeMissionPrompt } from '../core/engine';

type Filter = 'all' | 'verified' | 'attention' | 'pending';

interface ExecutiveOverviewProps {
  platforms: PlatformRecord[];
  incidents: IncidentCaseFile[];
  events: RadarEvent[];
  onOpenPlatform: (id: string) => void;
  onOpenIncident: (id: string) => void;
  onOpenRadar: () => void;
  onOpenFleet: () => void;
}

const isVerified = (p: PlatformRecord) => p.connectionVerified && p.dataIntegrity === 'Live';
const hasIssue = (p: PlatformRecord) => isVerified(p) && ['Incident', 'Degraded', 'Offline'].includes(p.healthStatus);

const iconFor = (code: string) => {
  const key = code.toUpperCase();
  if (key.includes('MIRAS')) return GraduationCap;
  if (key.includes('ORDER') || key.includes('MAJAL')) return ShoppingBag;
  if (key.includes('TEBYAN')) return BookOpen;
  if (key.includes('SCHEDULE')) return CalendarDays;
  if (key.includes('ADMIN')) return ShieldCheck;
  if (key.includes('ALFA')) return Sparkles;
  if (key.includes('NAHJ')) return Layers3;
  if (key.includes('MIZAN')) return Activity;
  if (key.includes('AHMAD')) return FileText;
  if (key.includes('ACADEM')) return Database;
  return LayoutDashboard;
};

const dot = (value: boolean | null | undefined, verified: boolean) => {
  if (!verified || value == null) return 'orbit-dot-muted';
  return value ? 'orbit-dot-good' : 'orbit-dot-bad';
};

const formatWhen = (value: string) => {
  const time = Date.parse(value);
  return Number.isFinite(time)
    ? new Intl.DateTimeFormat('ar-KW', { dateStyle: 'medium', timeStyle: 'short' }).format(time)
    : 'غير متوفر';
};

export function ExecutiveOverview({
  platforms, incidents, events, onOpenPlatform, onOpenIncident, onOpenRadar,
  onOpenFleet,
}: ExecutiveOverviewProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const fleet = useMemo(() => platforms.filter(p => p.lifecycleState !== 'unlinked' && p.lifecycleState !== 'archived'), [platforms]);
  const verified = fleet.filter(isVerified);
  const attention = fleet.filter(hasIssue);
  const pending = fleet.filter(p => !isVerified(p));
  const activeIncidents = useMemo(() => incidents
    .filter(i => i.dataIntegrity === 'Live' && events.some(e =>
      e.appId.toUpperCase() === i.appId.toUpperCase() && e.fingerprint === i.fingerprint && e.environment === 'production' && e.dataIntegrity === 'Live'
    ) && !['Resolved', 'False Positive', 'Expected Behavior', "Won't Fix"].includes(i.status))
    .sort((a, b) => (a.severity === 'Critical' ? -1 : a.severity === 'High' ? 0 : 1) -
                    (b.severity === 'Critical' ? -1 : b.severity === 'High' ? 0 : 1)), [incidents, events]);
  const firstIncident = activeIncidents[0];
  const selectedPlatform = firstIncident && fleet.find(p => p.codeName.toUpperCase() === firstIncident.appId.toUpperCase());
  const visible = fleet.filter(p => {
    const q = query.trim().toLowerCase();
    if (q && ![p.nameAr, p.codeName, p.description, p.repoName].join(' ').toLowerCase().includes(q)) return false;
    if (filter === 'verified') return isVerified(p);
    if (filter === 'attention') return hasIssue(p);
    if (filter === 'pending') return !isVerified(p);
    return true;
  });

  const copyMission = async () => {
    if (!firstIncident || !selectedPlatform) return;
    try {
      await navigator.clipboard.writeText(generateClaudeMissionPrompt(firstIncident, selectedPlatform, 'fix'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="orbit-executive" dir="rtl">
      <section className="orbit-intro" aria-label="ملخص غرفة القيادة">
        <div className="orbit-intro-copy">
          <h1>كل مواقعك. <span>بنظرة واحدة.</span></h1>
          <p>ملخص واضح لحالة مواقعك.</p>
          <div className="orbit-system-note"><CircleHelp size={15} aria-hidden="true" /> لم يكتمل الربط؟ لا يمكن تأكيد الحالة بعد.</div>
        </div>
        <div className="orbit-art" aria-hidden="true">
          <span className="orbit-art-ring orbit-art-ring-one" />
          <span className="orbit-art-ring orbit-art-ring-two" />
          <span className="orbit-art-ring orbit-art-ring-three" />
          <span className="orbit-art-center"><Radar size={32} strokeWidth={1.7} /></span>
          <span className="orbit-art-point orbit-art-point-a"><Code2 size={18} /></span>
          <span className="orbit-art-point orbit-art-point-b"><Rocket size={18} /></span>
          <span className="orbit-art-point orbit-art-point-c"><ShieldCheck size={18} /></span>
          <span className="orbit-art-label">رصد · دليل · نزاهة</span>
        </div>
      </section>

      <section className="orbit-stat-grid" aria-label="أرقام مؤكدة للمراقبة">
        <div className="orbit-stat-card"><span className="orbit-stat-icon orbit-tone-blue"><Layers3 size={19}/></span><span className="orbit-stat-number">{fleet.length}</span><span className="orbit-stat-name">المواقع</span></div>
        <div className="orbit-stat-card"><span className="orbit-stat-icon orbit-tone-mint"><Wifi size={19}/></span><span className="orbit-stat-number">{verified.length}</span><span className="orbit-stat-name">مواقع متصلة</span></div>
        <div className="orbit-stat-card"><span className="orbit-stat-icon orbit-tone-coral"><TriangleAlert size={19}/></span><span className="orbit-stat-number">{activeIncidents.length}</span><span className="orbit-stat-name">تنبيهات مؤكدة</span></div>
        <div className="orbit-stat-card"><span className="orbit-stat-icon orbit-tone-amber"><CloudOff size={19}/></span><span className="orbit-stat-number">{pending.length}</span><span className="orbit-stat-name">بانتظار الربط</span></div>
      </section>

      <div className="orbit-overview-columns">
        <section className="orbit-focus-panel" aria-label="الأولوية الحالية">
          <div className="orbit-panel-heading">
            <div><span className="orbit-kicker">أولاً</span><h2>ما يحتاج انتباهك</h2></div>
            <button type="button" className="orbit-subtle-link" onClick={onOpenRadar}>الرادار <ArrowUpLeft size={16}/></button>
          </div>
          {firstIncident ? (
            <div className="orbit-incident-inner">
              <span className="orbit-incident-pill"><span className="orbit-dot-bad" /> تنبيه مؤكد · {firstIncident.appId} · موقع فعلي</span>
              <h3>{firstIncident.title}</h3>
              <p>{firstIncident.summary}</p>
              <div className="orbit-incident-meta"><span>آخر رصد: {formatWhen(firstIncident.lastSeen)}</span><span>{firstIncident.occurrenceCount} تكرار</span></div>
              <div className="orbit-incident-actions">
                <button className="orbit-main-button" type="button" onClick={() => onOpenIncident(firstIncident.incidentId)}>التفاصيل <ChevronLeft size={15}/></button>
                <button className="orbit-quiet-button" type="button" onClick={copyMission} disabled={!selectedPlatform}>
                  {copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? 'تم النسخ' : 'نسخ المهمة'}
                </button>
              </div>
            </div>
          ) : (
            <div className="orbit-empty-state">
              <span className="orbit-empty-symbol"><ShieldCheck size={30} strokeWidth={1.5}/></span>
              <h3>لا توجد تنبيهات مؤكدة</h3>
              <p>{pending.length > 0 ? `باقي ربط ${pending.length} موقعاً.` : 'كل المواقع متصلة حالياً.'}</p>
              {pending.length > 0 && <button className="orbit-quiet-button" onClick={onOpenFleet} type="button">ربط المواقع <ArrowLeft size={15}/></button>}
            </div>
          )}
        </section>

      </div>

      <section className="orbit-fleet-section" aria-label="بطاقات البرامج">
        <div className="orbit-fleet-heading">
          <div><span className="orbit-kicker">نظرة سريعة</span><h2>مواقعي <span className="orbit-light-count">{fleet.length}</span></h2></div>
          <label className="orbit-searchbox"><Search size={17} aria-hidden="true"/><input type="search" aria-label="ابحث عن برنامج" placeholder="ابحث عن برنامج…" value={query} onChange={e => setQuery(e.target.value)}/></label>
        </div>
        <div className="orbit-filter-tabs" role="group" aria-label="تصفية البرامج">
          {([
            ['all', 'الكل', fleet.length],
            ['verified', 'متصل', verified.length],
            ['attention', 'تنبيه', attention.length],
            ['pending', 'يحتاج ربطاً', pending.length],
          ] as const).map(([value, title, count]) => <button type="button" aria-pressed={filter === value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)} key={value}>{title}<span>{count}</span></button>)}
        </div>
        {visible.length === 0 ? (
          <div className="orbit-fleet-none">لا توجد برامج مطابقة. <button type="button" onClick={() => { setFilter('all'); setQuery(''); }}>عرض الكل</button></div>
        ) : (
          <div className="orbit-app-grid">
            {visible.map(p => {
              const Icon = iconFor(p.codeName);
              const live = isVerified(p);
              const issue = hasIssue(p);
              const local = p.runtimeMode === 'local-only';
              return <button type="button" className="orbit-app-card" key={p.id} onClick={() => onOpenPlatform(p.id)} aria-label={'فتح تفاصيل ' + p.nameAr}>
                <div className="orbit-app-card-head">
                  <span className="orbit-app-icon"><Icon size={23} strokeWidth={1.7}/></span>
                  <ArrowUpLeft className="orbit-app-arrow" size={17} aria-hidden="true"/>
                </div>
                <strong className="orbit-app-name">{p.nameAr.replace(/\s*\([^)]*\)/g, '')}</strong>
                <div className="orbit-app-separator"/>
                <div className="orbit-app-status">
                  <span className={live ? (issue ? 'orbit-status-issue' : 'orbit-status-live') : 'orbit-status-pending'}>
                    <span className="orbit-indicator" />
                    {live ? (issue ? 'يحتاج متابعة' : 'متصل') : local ? 'محلي' : 'يحتاج ربطاً'}
                  </span>
                </div>
                <div className="orbit-signal-strip" aria-label="مؤشرات الموقع">
                  <span title="جودة الموقع" aria-label="جودة الموقع"><i className={dot(p.fourState?.ciPassed, live)}/><Code2 size={13}/></span>
                  <span title="آخر تحديث" aria-label="آخر تحديث"><i className={dot(p.fourState?.deploymentSucceeded, live)}/><Rocket size={13}/></span>
                  <span title="تجربة الزائر" aria-label="تجربة الزائر"><i className={dot(p.fourState?.userJourneyHealthy, live)}/><UserRound size={13}/></span>
                </div>
              </button>;
            })}
          </div>
        )}
      </section>
    </div>
  );
}
