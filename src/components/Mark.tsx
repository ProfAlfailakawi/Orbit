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
