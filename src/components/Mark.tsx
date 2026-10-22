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
