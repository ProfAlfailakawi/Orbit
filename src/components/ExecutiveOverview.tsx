import React, { useMemo, useState } from 'react';
import {
  Activity, ArrowLeft, ArrowUpLeft, BookOpen, CalendarDays, Check, CheckCircle2,
  ChevronLeft, CircleHelp, CloudOff, Code2, Copy, Database, ExternalLink,
  Eye, FileText, GraduationCap, Layers3, LayoutDashboard, LockKeyhole,
  Radar, Search, ShieldCheck, ShoppingBag, Sparkles, TriangleAlert, Wifi,
} from 'lucide-react';
import type { IncidentCaseFile, PlatformRecord } from '../core/types';
import { generateClaudeMissionPrompt } from '../core/engine';

type Filter = 'all' | 'verified' | 'attention' | 'pending';

interface ExecutiveOverviewProps {
  platforms: PlatformRecord[];
  incidents: IncidentCaseFile[];
  onOpenPlatform: (id: string) => void;
  onOpenIncident: (id: string) => void;
  onOpenRadar: () => void;
  onOpenFleet: () => void;
  onOpenIntelligence: () => void;
  onOpenOperations: () => void;
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
  platforms, incidents, onOpenPlatform, onOpenIncident, onOpenRadar,
  onOpenFleet, onOpenIntelligence, onOpenOperations,
}: ExecutiveOverviewProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const fleet = useMemo(() => platforms.filter(p => p.lifecycleState !== 'unlinked' && p.lifecycleState !== 'archived'), [platforms]);
  const verified = fleet.filter(isVerified);
  const attention = fleet.filter(hasIssue);
  const pending = fleet.filter(p => !isVerified(p));
  const activeIncidents = useMemo(() => incidents
    .filter(i => i.dataIntegrity === 'Live' && !['Resolved', 'False Positive', 'Expected Behavior', "Won't Fix"].includes(i.status))
    .sort((a, b) => (a.severity === 'Critical' ? -1 : a.severity === 'High' ? 0 : 1) -
                    (b.severity === 'Critical' ? -1 : b.severity === 'High' ? 0 : 1)), [incidents]);
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
          <span className="orbit-eyebrow"><span className="orbit-eyebrow-dot" /> ORBIT / COMMAND CENTER</span>
          <h1>كل برامجك. <span>رؤية واحدة.</span></h1>
          <p>الأهم أمامك، والباقي عند الحاجة. بدون تعقيد أو أرقام غير موثوقة.</p>
          <div className="orbit-intro-actions">
            <button type="button" className="orbit-main-button" onClick={onOpenRadar}>
              <Radar size={17} aria-hidden="true" /> افتح الرادار <ArrowLeft size={16} aria-hidden="true" />
            </button>
            <button type="button" className="orbit-quiet-button" onClick={onOpenFleet}>
              <Layers3 size={17} aria-hidden="true" /> إدارة البرامج
            </button>
          </div>
          <div className="orbit-system-note"><CircleHelp size={15} aria-hidden="true" /> حالة الربط تُعرض كما هي، ولا تعني عدم وجود بلاغات أن المواقع سليمة.</div>
        </div>
        <div className="orbit-art" aria-hidden="true">
          <div className="orbit-art-ring orbit-art-ring-one" />
          <div className="orbit-art-ring orbit-art-ring-two" />
          <div className="orbit-art-ring orbit-art-ring-three" />
          <div className="orbit-art-center"><Radar size={36} strokeWidth={1.6} /></div>
          <div className="orbit-art-point orbit-art-point-a"><Code2 size={18}/></div>
          <div className="orbit-art-point orbit-art-point-b"><Eye size={18}/></div>
          <div className="orbit-art-point orbit-art-point-c"><Activity size={18}/></div>
          <div className="orbit-art-label">ORBIT INTELLIGENCE</div>
        </div>
      </section>

      <section className="orbit-stat-grid" aria-label="أرقام مؤكدة للمراقبة">
        <div className="orbit-stat-card"><span className="orbit-stat-icon orbit-tone-blue"><Layers3 size={19}/></span><span className="orbit-stat-number">{fleet.length}</span><span className="orbit-stat-name">البرامج المسجلة</span><small>تشمل البرامج المحلية</small></div>
        <div className="orbit-stat-card"><span className="orbit-stat-icon orbit-tone-mint"><Wifi size={19}/></span><span className="orbit-stat-number">{verified.length}</span><span className="orbit-stat-name">ربط مباشر مؤكد</span><small>مصدر بيانات Live فقط</small></div>
        <div className="orbit-stat-card"><span className="orbit-stat-icon orbit-tone-coral"><TriangleAlert size={19}/></span><span className="orbit-stat-number">{activeIncidents.length}</span><span className="orbit-stat-name">حوادث مباشرة مفتوحة</span><small>ليست اختبارات أو عينات</small></div>
        <div className="orbit-stat-card"><span className="orbit-stat-icon orbit-tone-amber"><CloudOff size={19}/></span><span className="orbit-stat-number">{pending.length}</span><span className="orbit-stat-name">بانتظار التحقق</span><small>لا نفترض أنها سليمة</small></div>
      </section>

      <div className="orbit-overview-columns">
        <section className="orbit-focus-panel" aria-label="الأولوية الحالية">
          <div className="orbit-panel-heading">
            <div><span className="orbit-kicker">أولاً</span><h2>ما يحتاج انتباهك</h2></div>
            <button type="button" className="orbit-subtle-link" onClick={onOpenRadar}>الرادار <ArrowUpLeft size={16}/></button>
          </div>
          {firstIncident ? (
            <div className="orbit-incident-inner">
              <span className="orbit-incident-pill"><span className="orbit-dot-bad" /> حادثة موثقة · {firstIncident.appId}</span>
              <h3>{firstIncident.title}</h3>
              <p>{firstIncident.summary}</p>
              <div className="orbit-incident-meta"><span>آخر رصد: {formatWhen(firstIncident.lastSeen)}</span><span>{firstIncident.occurrenceCount} تكرار</span></div>
              <div className="orbit-incident-actions">
                <button className="orbit-main-button" type="button" onClick={copyMission} disabled={!selectedPlatform}>
                  {copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? 'تم نسخ المهمة' : 'انسخ مهمة Claude'}
                </button>
                <button className="orbit-quiet-button" type="button" onClick={() => onOpenIncident(firstIncident.incidentId)}>افتح التفاصيل <ChevronLeft size={15}/></button>
              </div>
            </div>
          ) : (
            <div className="orbit-empty-state">
              <span className="orbit-empty-symbol"><ShieldCheck size={30} strokeWidth={1.5}/></span>
              <h3>لا توجد حوادث مباشرة مؤكدة في السجلات المعروضة</h3>
              <p>{pending.length > 0 ? 'لكن بعض البرامج لم يكتمل ربطها. ابدأ بالتحقق حتى تصبح المؤشرات معبّرة عن الواقع.' : 'استمر في متابعة الرادار والتحقق من مصادر المراقبة.'}</p>
              <button className="orbit-quiet-button" onClick={onOpenFleet} type="button">تحقق من الاتصالات <ArrowLeft size={15}/></button>
            </div>
          )}
        </section>

        <section className="orbit-quick-panel" aria-label="مجالات الفحص">
          <div className="orbit-panel-heading"><div><span className="orbit-kicker">ثانياً</span><h2>أين تريد النظر؟</h2></div></div>
          <div className="orbit-quick-list">
            <button type="button" onClick={onOpenRadar}><span className="orbit-quick-icon orbit-tone-blue"><Radar size={20}/></span><span><strong>الرادار الشامل</strong><small>الأخطاء والإنذارات</small></span><ArrowUpLeft size={18}/></button>
            <button type="button" onClick={onOpenFleet}><span className="orbit-quick-icon orbit-tone-mint"><Database size={20}/></span><span><strong>برامجي</strong><small>الربط والتحقق</small></span><ArrowUpLeft size={18}/></button>
            <button type="button" onClick={onOpenIntelligence}><span className="orbit-quick-icon orbit-tone-violet"><Sparkles size={20}/></span><span><strong>الذكاء الهندسي</strong><small>التحليل ومهمات Claude</small></span><ArrowUpLeft size={18}/></button>
            <button type="button" onClick={onOpenOperations}><span className="orbit-quick-icon orbit-tone-amber"><LockKeyhole size={20}/></span><span><strong>التحقق والحماية</strong><small>الاختبارات والضوابط</small></span><ArrowUpLeft size={18}/></button>
          </div>
        </section>
      </div>

      <section className="orbit-fleet-section" aria-label="بطاقات البرامج">
        <div className="orbit-fleet-heading">
          <div><span className="orbit-kicker">نظرة شاملة</span><h2>مدار البرامج <span className="orbit-light-count">{fleet.length}</span></h2><p>كل برنامج في بطاقة واحدة — بدون ازدحام.</p></div>
          <label className="orbit-searchbox"><Search size={17} aria-hidden="true"/><input type="search" aria-label="ابحث عن برنامج" placeholder="ابحث عن برنامج…" value={query} onChange={e => setQuery(e.target.value)}/></label>
        </div>
        <div className="orbit-filter-tabs" role="group" aria-label="تصفية البرامج">
          {([
            ['all', 'الجميع', fleet.length],
            ['verified', 'مباشر', verified.length],
            ['attention', 'تحتاج انتباه', attention.length],
            ['pending', 'غير متحقق', pending.length],
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
                <span className="orbit-app-code" dir="ltr">{p.codeName}</span>
                <div className="orbit-app-separator"/>
                <div className="orbit-app-status">
                  <span className={live ? (issue ? 'orbit-status-issue' : 'orbit-status-live') : 'orbit-status-pending'}>
                    <span className="orbit-indicator" />
                    {live ? (issue ? 'تحتاج متابعة' : 'متصل · ' + (p.healthStatus === 'Healthy' ? 'سليم' : p.healthStatus)) : local ? 'برنامج محلي' : 'الربط غير مؤكد'}
                  </span>
                </div>
                <div className="orbit-signal-strip" aria-label="حالة الكود والنشر وتجربة المستخدم">
                  <span><i className={dot(p.fourState?.ciPassed, live)}/>الكود</span>
                  <span><i className={dot(p.fourState?.deploymentSucceeded, live)}/>النشر</span>
                  <span><i className={dot(p.fourState?.userJourneyHealthy, live)}/>التجربة</span>
                </div>
              </button>;
            })}
          </div>
        )}
        <div className="orbit-legend"><span><i className="orbit-dot-good"/> تم التحقق</span><span><i className="orbit-dot-bad"/> يحتاج مراجعة</span><span><i className="orbit-dot-muted"/> غير متاح</span></div>
      </section>
      <div className="orbit-bottom-note"><ShieldCheck size={16}/><span>ORBIT لا يغيّر مواقعك أو أنظمة الدفع أو الإشعارات تلقائياً.</span><span className="orbit-note-divider"/> <span>التجارب والأرقام غير الموثقة لا تُعرض كحالة إنتاجية.</span></div>
    </div>
  );
}
