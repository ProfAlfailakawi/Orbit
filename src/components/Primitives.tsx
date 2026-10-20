import React from 'react';
import {
  Activity,
  AlertTriangle,
  Archive,
  Award,
  BookOpen,
  Briefcase,
  Calendar,
  CheckCircle2,
  Clock,
  Code2,
  Compass,
  Cpu,
  GraduationCap,
  HelpCircle,
  Landmark,
  Laptop,
  PauseCircle,
  QrCode,
  Shield,
  ShieldAlert,
  ShoppingBag,
  Terminal,
  WifiOff,
} from 'lucide-react';
import type {
  AlertSeverity,
  AppHealthStatus,
  DataIntegrityState,
  ReleaseShieldRating,
} from '../core/types';

/**
 * SVG Circular Ring Gauge (Infographic Donut)
 */
export const RadialGauge: React.FC<{
  value: number;
  size?: number;
  strokeWidth?: number;
  colorClass?: string;
  sublabel?: string;
}> = ({
  value,
  size = 56,
  strokeWidth = 5,
  colorClass = 'text-emerald-400',
  sublabel,
}) => {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <svg className="w-full h-full -rotate-90" viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-slate-800/80"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={`transition-all duration-300 ${colorClass}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-none">
        <span className="font-mono text-xs font-bold tabular-nums">{clamped}%</span>
        {sublabel && <span className="text-[9px] text-slate-400 mt-0.5">{sublabel}</span>}
      </div>
    </div>
  );
};

/**
 * Visual Domain Icon Emblem for each of the 11+ Platforms
 */
export const PlatformDomainIcon: React.FC<{
  codeName: string;
  status: AppHealthStatus;
  size?: 'sm' | 'md' | 'lg';
}> = ({ codeName, status, size = 'md' }) => {
  const code = codeName.toUpperCase();
  const iconCls = size === 'lg' ? 'w-6 h-6' : size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  const boxCls =
    size === 'lg'
      ? 'w-12 h-12 rounded-2xl'
      : size === 'sm'
      ? 'w-8 h-8 rounded-lg'
      : 'w-10 h-10 rounded-xl';

  const toneCls =
    status === 'Incident'
      ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
      : status === 'Degraded' || status === 'Monitoring Gap'
      ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
      : status === 'Local / Not Running'
      ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
      : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';

  const renderIcon = () => {
    switch (code) {
      case 'TEBYAN':
        return <BookOpen className={iconCls} />;
      case 'ORDER':
        return <ShoppingBag className={iconCls} />;
      case 'MIRAS':
        return <GraduationCap className={iconCls} />;
      case 'SCHEDULE':
        return <Calendar className={iconCls} />;
      case 'DR.AHMAD':
        return <Award className={iconCls} />;
      case 'ADMIN':
        return <Shield className={iconCls} />;
      case 'ATTEND':
      case 'MIZAN':
        return <QrCode className={iconCls} />;
      case 'DEPT':
      case 'ACADEMICOS':
        return <Landmark className={iconCls} />;
      case 'OFFICE':
      case 'MAJAL':
        return <Briefcase className={iconCls} />;
      case 'NAHJ':
        return <Compass className={iconCls} />;
      case 'ALFA':
        return <Laptop className={iconCls} />;
      default:
        return <Cpu className={iconCls} />;
    }
  };

  return (
    <div className={`inline-flex items-center justify-center shrink-0 ${boxCls} ${toneCls}`}>
      {renderIcon()}
    </div>
  );
};

/**
 * Visual 3-Eyes Infographic Indicator (Eye 1: Code, Eye 2: Runtime, Eye 3: Silent CI)
 */
export const ThreeEyesInfographicRow: React.FC<{
  fourState?: {
    ciPassed?: boolean | null;
    deploymentSucceeded?: boolean | null;
    siteReachable?: boolean | null;
    userJourneyHealthy?: boolean | null;
  };
  eye1?: 'Healthy' | 'Warning' | 'Critical' | 'Unknown';
  eye2?: 'Healthy' | 'Warning' | 'Critical' | 'Local' | 'Unknown';
  eye3?: 'Healthy' | 'Warning' | 'Critical' | 'Unknown';
}> = ({ fourState, eye1, eye2, eye3 }) => {
  const e1 =
    eye1 ||
    (fourState?.ciPassed === true
      ? 'Healthy'
      : fourState?.ciPassed === false
      ? 'Critical'
      : 'Unknown');
  const e2 =
    eye2 ||
    (fourState?.userJourneyHealthy === true
      ? 'Healthy'
      : fourState?.userJourneyHealthy === false
      ? 'Critical'
      : fourState?.siteReachable === null
      ? 'Local'
      : 'Warning');
  const e3 =
    eye3 ||
    (fourState?.deploymentSucceeded === true
      ? 'Healthy'
      : fourState?.deploymentSucceeded === false
      ? 'Critical'
      : 'Local');

  const getTone = (state: string) => {
    if (state === 'Healthy') return 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30';
    if (state === 'Critical') return 'text-rose-400 bg-rose-500/15 border-rose-500/30';
    if (state === 'Warning') return 'text-amber-400 bg-amber-500/15 border-amber-500/30';
    if (state === 'Local') return 'text-sky-400 bg-sky-500/15 border-sky-500/30';
    return 'text-slate-400 bg-slate-800/50 border-slate-700';
  };

  return (
    <div className="grid grid-cols-3 gap-1.5 w-full" aria-label="حالة العيون الثلاث">
      <div
        className={`flex items-center justify-center gap-1.5 rounded-lg border py-1.5 px-2 text-[11px] font-medium ${getTone(
          e1
        )}`}
        title={`العين 1 (الكود): ${e1}`}
      >
        <Code2 className="w-3.5 h-3.5 shrink-0" />
        <span>الكود</span>
      </div>
      <div
        className={`flex items-center justify-center gap-1.5 rounded-lg border py-1.5 px-2 text-[11px] font-medium ${getTone(
          e2
        )}`}
        title={`العين 2 (التشغيل): ${e2}`}
      >
        <Activity className="w-3.5 h-3.5 shrink-0" />
        <span>التشغيل</span>
      </div>
      <div
        className={`flex items-center justify-center gap-1.5 rounded-lg border py-1.5 px-2 text-[11px] font-medium ${getTone(
          e3
        )}`}
        title={`العين 3 (السجل): ${e3}`}
      >
        <Terminal className="w-3.5 h-3.5 shrink-0" />
        <span>السجل</span>
      </div>
    </div>
  );
};

/**
 * Unboxed, concise Data Integrity indicator (Section 34)
 */
export const DataIntegrityTag: React.FC<{ state: DataIntegrityState }> = ({ state }) => {
  const map: Record<DataIntegrityState, { labelAr: string; colorClass: string }> = {
    Live: { labelAr: 'حي · Live', colorClass: 'text-emerald-400' },
    Cached: { labelAr: 'موثق · Cached', colorClass: 'text-sky-400' },
    Demo: { labelAr: 'محاكاة · Demo', colorClass: 'text-amber-400' },
    Unavailable: { labelAr: 'غير متاح · Unavailable', colorClass: 'text-rose-400' },
    'Not Configured': { labelAr: 'غير مهيأ · Not Configured', colorClass: 'text-slate-400' },
  };
  const cfg = map[state] || map['Not Configured'];
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-mono ${cfg.colorClass}`}>
      <span>{cfg.labelAr}</span>
    </span>
  );
};

/**
 * Semantic Health Status Indicator with accessible icon + concise label
 */
export const HealthStatusIndicator: React.FC<{ status: AppHealthStatus }> = ({ status }) => {
  switch (status) {
    case 'Healthy':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>سليم موثق</span>
        </span>
      );
    case 'Incident':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-400">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>حادثة نشطة</span>
        </span>
      );
    case 'Degraded':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>أداء متدهور</span>
        </span>
      );
    case 'Monitoring Gap':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-300">
          <Clock className="w-4 h-4 shrink-0" />
          <span>فجوة مراقبة</span>
        </span>
      );
    case 'Local / Not Running':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-300">
          <Laptop className="w-4 h-4 shrink-0" />
          <span>محلي (Local)</span>
        </span>
      );
    case 'Offline':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-500">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>غير متاح</span>
        </span>
      );
    case 'Paused':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400">
          <PauseCircle className="w-4 h-4 shrink-0" />
          <span>متوقف (Paused)</span>
        </span>
      );
    case 'Archived':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400">
          <Archive className="w-4 h-4 shrink-0" />
          <span>مؤرشف (Archived)</span>
        </span>
      );
    case 'Unknown':
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400">
          <HelpCircle className="w-4 h-4 shrink-0" />
          <span>غير مؤكد</span>
        </span>
      );
  }
};

export const SeverityLabel: React.FC<{ severity: AlertSeverity }> = ({ severity }) => {
  const styles: Record<AlertSeverity, string> = {
    Critical: 'text-rose-400 font-semibold',
    High: 'text-amber-400 font-semibold',
    Medium: 'text-sky-400 font-medium',
    Low: 'text-slate-300 font-normal',
    Informational: 'text-slate-400 font-normal',
  };
  const labels: Record<AlertSeverity, string> = {
    Critical: 'حرج · Critical',
    High: 'مرتفع · High',
    Medium: 'متوسط · Medium',
    Low: 'منخفض · Low',
    Informational: 'معلومة · Info',
  };
  return <span className={`text-xs font-mono ${styles[severity]}`}>{labels[severity]}</span>;
};

export const ReleaseShieldLabel: React.FC<{ rating: ReleaseShieldRating }> = ({ rating }) => {
  const map: Record<ReleaseShieldRating, { text: string; cls: string }> = {
    Ready: { text: 'جاهز للنشر', cls: 'text-emerald-400' },
    'Needs Review': { text: 'يحتاج مراجعة', cls: 'text-amber-400' },
    'High Risk': { text: 'مخاطرة عالية', cls: 'text-rose-400' },
    'Insufficient Evidence': { text: 'أدلة غير كافية', cls: 'text-slate-400' },
  };
  const item = map[rating] || map['Insufficient Evidence'];
  return <span className={`text-xs font-mono font-medium ${item.cls}`}>{item.text}</span>;
};
