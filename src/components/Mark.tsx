import React from 'react';

/** ORBIT mark: a ring with a small satellite. Decorative; the word «أوربت» always accompanies it. */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="mark-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--btn)" />
          <stop offset="1" stopColor="var(--btn2)" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="11" fill="none" stroke="url(#mark-g)" strokeWidth="3.2" />
      <circle cx="16" cy="16" r="3.4" fill="url(#mark-g)" />
      <circle cx="25.2" cy="8.4" r="3" fill="var(--ok-edge)" stroke="var(--card)" strokeWidth="1.6" />
    </svg>
  );
}

/** Decorative orbit for the sign-in screen: the same rings and satellites as the dashboard, but only a picture (no data). */
export function LoginArt() {
  const sats = [
    { a: -90, r: 120, c: '#6be8be' }, { a: -20, r: 120, c: '#6be8be' }, { a: 52, r: 120, c: '#f7b23c' },
    { a: 128, r: 120, c: '#6be8be' }, { a: 200, r: 120, c: '#98a2cc' }, { a: 20, r: 70, c: '#6be8be' }, { a: 200, r: 70, c: '#6be8be' },
  ];
  return (
    <svg className="login-art" viewBox="0 0 280 280" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="la-glow" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#69ffcd" stopOpacity=".3" /><stop offset="1" stopColor="#33bfa6" stopOpacity="0" /></radialGradient>
        <linearGradient id="la-core" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2b6a69" /><stop offset="1" stopColor="#142c40" /></linearGradient>
      </defs>
      <circle cx="140" cy="140" r="138" fill="url(#la-glow)" />
      <circle cx="140" cy="140" r="120" fill="none" stroke="rgba(153,234,217,.34)" strokeDasharray="3 6" />
      <circle cx="140" cy="140" r="70" fill="none" stroke="rgba(116,230,204,.34)" />
      <circle cx="140" cy="140" r="38" fill="url(#la-core)" stroke="rgba(159,255,223,.5)" />
      <circle cx="140" cy="140" r="9" fill="#86edc9" />
      <g className="la-spin la-out">
        {sats.filter(s => s.r === 120).map(s => <circle key={s.a} cx={140 + s.r * Math.cos((s.a * Math.PI) / 180)} cy={140 + s.r * Math.sin((s.a * Math.PI) / 180)} r="9" fill="#fff" stroke={s.c} strokeWidth="3.5" />)}
      </g>
      <g className="la-spin la-inn">
        {sats.filter(s => s.r === 70).map(s => <circle key={s.a} cx={140 + s.r * Math.cos((s.a * Math.PI) / 180)} cy={140 + s.r * Math.sin((s.a * Math.PI) / 180)} r="8" fill="#fff" stroke={s.c} strokeWidth="3.5" />)}
      </g>
    </svg>
  );
}

export type IconName = 'refresh' | 'bell' | 'logout' | 'copy' | 'spark' | 'plus' | 'calendar' | 'play' | 'tap' | 'check' | 'close' | 'key';

/** Small line icons beside short labels. Decorative only: the label next to each icon stays the accessible name. */
export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    refresh: <><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" /><path d="M4 3.5V8h4.5" /><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" /><path d="M20 20.5V16h-4.5" /></>,
    bell: <><path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 1.5h-15z" /><path d="M10 20.5a2.2 2.2 0 0 0 4 0" /></>,
    logout: <><path d="M10 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20H10" /><path d="M14.5 8 18.5 12l-4 4" /><path d="M18.5 12H9" /></>,
    copy: <><rect x="8.5" y="8.5" width="11" height="11" rx="2.5" /><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" /></>,
    spark: <><path d="M12 3.5 13.8 9a2 2 0 0 0 1.2 1.2l5.5 1.8-5.5 1.8a2 2 0 0 0-1.2 1.2L12 20.5 10.2 15A2 2 0 0 0 9 13.8L3.5 12 9 10.2A2 2 0 0 0 10.2 9z" /></>,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    calendar: <><rect x="4" y="5.5" width="16" height="14.5" rx="3" /><path d="M8 3.5v4M16 3.5v4M4 10h16" /><path d="M8.5 14h3" /></>,
    play: <path d="M8 5.5v13l10-6.5z" />,
    tap: <><path d="M9.5 11.5V5.8a1.6 1.6 0 0 1 3.2 0v5" /><path d="M12.7 10.2a1.6 1.6 0 0 1 3.2 0v1.2a1.6 1.6 0 0 1 3.1.4v3.4a5.5 5.5 0 0 1-5.5 5.3h-1.2a5 5 0 0 1-4.1-2.2l-2.6-3.8a1.6 1.6 0 0 1 2.6-1.8l1.3 1.6" /></>,
    check: <path d="m5.5 12.5 4.2 4.2 8.8-9.2" />,
    close: <><path d="M6.5 6.5l11 11" /><path d="M17.5 6.5l-11 11" /></>,
    key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 8.5-8.5M16.5 6.5l2.5 2.5M14 9l2 2" /></>,
  };
  return (
    <svg className={'ico ico-' + name} viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>
  );
}
