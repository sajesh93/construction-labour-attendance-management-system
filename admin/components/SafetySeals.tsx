'use client';

import * as React from 'react';

/**
 * Vector safety-training seals and disciplinary-action badges printed on the
 * ID card. These are crisp at any print size. Swap in official artwork later by
 * replacing the icon paths / colours below — the layout stays the same.
 */

type SealIcon = 'helmet' | 'flame' | 'cube' | 'bolt' | 'cross';

export interface SealDef {
  key: string;
  /** Curved text around the top of the seal. */
  top: string;
  color: string;
  icon: SealIcon;
}

/** The six "Job Specific Training Attended" seals, in reference order. */
export const TRAINING_SEALS: SealDef[] = [
  { key: 'induction', top: 'SAFETY INDUCTION', color: '#1565c0', icon: 'helmet' },
  { key: 'fire', top: 'FIRE PROTECTION', color: '#ad1457', icon: 'flame' },
  { key: 'confined', top: 'CONFINED SPACE', color: '#2e7d32', icon: 'cube' },
  { key: 'electrical', top: 'ELECTRICAL SAFETY', color: '#c62828', icon: 'bolt' },
  { key: 'safety', top: 'SAFETY', color: '#00838f', icon: 'cross' },
  { key: 'hotwork', top: 'HOT WORK', color: '#f9a825', icon: 'flame' },
];

// Minimal 24×24 monochrome glyphs, drawn in the seal colour.
const ICON_PATHS: Record<SealIcon, string> = {
  helmet: 'M4 15a8 8 0 0 1 16 0H4zm-2 0h20v2.2H2V15z',
  flame: 'M12 2c1.8 3.4 4.4 4.6 4.4 8.2A4.4 4.4 0 0 1 7.6 10.2c0-1.6.8-2.6 1.7-3.4.1 1.2.9 2 1.9 2 0-2.6-1.1-4.4-1.1-6.8z',
  cube: 'M12 2.2 20.5 7v10L12 21.8 3.5 17V7L12 2.2zm0 2.3L6 7.8v8.4L12 19.5l6-3.3V7.8L12 4.5z',
  bolt: 'M13 2 4 14h6l-2 8 10-13h-6l1-7z',
  cross: 'M10 3h4v5h5v4h-5v5h-4v-5H5V8h5V3z',
};

function SealIconGlyph({ icon, color }: { icon: SealIcon; color: string }) {
  // Center the 24×24 glyph inside the 100×100 seal viewBox.
  return (
    <g transform="translate(32 32) scale(1.45)">
      <path d={ICON_PATHS[icon]} fill={color} />
    </g>
  );
}

/** A single circular training seal, sized in CSS px. */
export function SafetySeal({ seal, px }: { seal: SealDef; px: number }) {
  const uid = React.useId().replace(/:/g, '');
  const topId = `top-${uid}`;
  const botId = `bot-${uid}`;
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 100 100"
      style={{ display: 'block', flexShrink: 0 }}
      aria-label={`${seal.top} trained`}
    >
      <defs>
        {/* Upper semicircle (left→top→right) and lower semicircle (right→bottom→left). */}
        <path id={topId} d="M 50,50 m -40,0 a 40,40 0 1 1 80,0" fill="none" />
        <path id={botId} d="M 50,50 m 40,0 a 40,40 0 1 1 -80,0" fill="none" />
      </defs>
      <circle cx="50" cy="50" r="49" fill={seal.color} />
      <circle cx="50" cy="50" r="40" fill="#fff" />
      <circle cx="50" cy="50" r="29" fill="none" stroke={seal.color} strokeWidth="1.4" />
      <g fill="#fff" fontFamily="Arial, sans-serif" fontWeight={700} letterSpacing="0.4">
        <text fontSize="9.5">
          <textPath href={`#${topId}`} startOffset="50%" textAnchor="middle">
            {seal.top}
          </textPath>
        </text>
        <text fontSize="9.5">
          <textPath href={`#${botId}`} startOffset="50%" textAnchor="middle">
            TRAINED
          </textPath>
        </text>
      </g>
      <SealIconGlyph icon={seal.icon} color={seal.color} />
    </svg>
  );
}

/** The 1st / 2nd / 3rd disciplinary-action badges (green → amber → red). */
export function DisciplinaryBadges({ px }: { px: number }) {
  const steps: { label: string; color: string }[] = [
    { label: '1st', color: '#2e7d32' },
    { label: '2nd', color: '#f9a825' },
    { label: '3rd', color: '#c62828' },
  ];
  return (
    <div style={{ display: 'flex', gap: px * 0.22, justifyContent: 'center' }}>
      {steps.map((s) => (
        <svg key={s.label} width={px} height={px} viewBox="0 0 100 100" style={{ display: 'block' }}>
          <circle cx="50" cy="50" r="48" fill={s.color} />
          <circle cx="50" cy="50" r="40" fill="#fff" />
          {/* Hard-hat worker glyph */}
          <g transform="translate(30 22) scale(1.6)" fill={s.color}>
            <circle cx="12" cy="9" r="4" />
            <path d="M4 13a8 8 0 0 1 16 0H4z" />
            <path d="M2 13h20v1.6H2z" />
          </g>
          <text
            x="50"
            y="84"
            textAnchor="middle"
            fontFamily="Arial, sans-serif"
            fontWeight={800}
            fontSize="24"
            fill={s.color}
          >
            {s.label}
          </text>
        </svg>
      ))}
    </div>
  );
}
