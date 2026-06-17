'use client';

import * as React from 'react';

/**
 * Vector safety-training seals and disciplinary-action badges printed on the ID
 * card. Built as SVG so they stay crisp at any print size and print their
 * colours (print-color-adjust: exact). Swap in official artwork later by
 * replacing the icon groups / colours below — the layout stays the same.
 */

type SealIcon = 'helmet' | 'extinguisher' | 'confined' | 'electrical' | 'cross' | 'flame';

export interface SealDef {
  key: string;
  /** Curved text around the top of the seal. */
  top: string;
  color: string;
  icon: SealIcon;
}

/** The six "Job Specific Training Attended" seals, in reference order. */
export const TRAINING_SEALS: SealDef[] = [
  { key: 'induction', top: 'SAFETY INDUCTION', color: '#1f3a93', icon: 'helmet' },
  { key: 'fire', top: 'FIRE PROTECTION', color: '#b0185a', icon: 'extinguisher' },
  { key: 'confined', top: 'CONFINED SPACE', color: '#1e7d4f', icon: 'confined' },
  { key: 'electrical', top: 'ELECTRICAL SAFETY', color: '#c62828', icon: 'electrical' },
  { key: 'safety', top: 'SAFETY', color: '#0277bd', icon: 'cross' },
  { key: 'hotwork', top: 'HOT WORK', color: '#f9a825', icon: 'flame' },
];

// Each icon is drawn inside a 40×40 box, translated to the seal centre. Filled
// in the seal colour on the white inner disc.
function IconGroup({ icon, color }: { icon: SealIcon; color: string }) {
  const body = (() => {
    switch (icon) {
      case 'helmet':
        return (
          <>
            <path d="M6 26a14 14 0 0 1 28 0z" fill={color} />
            <rect x="2" y="26" width="36" height="4.5" rx="1.5" fill={color} />
            <rect x="18" y="12" width="4" height="5" rx="1" fill={color} />
          </>
        );
      case 'extinguisher':
        return (
          <>
            <rect x="14" y="13" width="13" height="22" rx="3" fill={color} />
            <rect x="18.5" y="7" width="4" height="7" fill={color} />
            <rect x="12" y="8" width="11" height="3" rx="1.5" fill={color} />
            <path d="M11 10c-3 0-5 2-5 5v3" stroke={color} strokeWidth="2.2" fill="none" />
          </>
        );
      case 'confined':
        return (
          <>
            <rect x="6" y="7" width="28" height="28" rx="5" fill="none" stroke={color} strokeWidth="3" />
            <circle cx="20" cy="17" r="3.6" fill={color} />
            <path d="M13 33c0-5 3.5-8 7-8s7 3 7 8z" fill={color} />
          </>
        );
      case 'electrical':
        return (
          <>
            <path d="M20 5 37 35H3z" fill={color} />
            <path d="M22 14l-7 11h4.5l-2 8 9-13h-5z" fill="#fff" />
          </>
        );
      case 'cross':
        return <path d="M16 5h8v11h11v8H24v11h-8V24H5v-8h11z" fill={color} />;
      case 'flame':
        return (
          <path
            d="M21 4c4 7 9 9 9 17a9 9 0 0 1-18 0c0-4 2-6.5 4.5-8.5 0 3 2 4.5 4 4.5 0-5.5-3.5-8-3.5-13z"
            fill={color}
          />
        );
    }
  })();
  return <g transform="translate(30 30)">{body}</g>;
}

/** A single circular training seal, sized in CSS px. */
export function SafetySeal({ seal, px }: { seal: SealDef; px: number }) {
  const uid = React.useId().replace(/:/g, '');
  const topId = `top-${uid}`;
  const botId = `bot-${uid}`;
  // Larger, length-aware text so the seal stays readable at print size.
  const topSize = seal.top.length > 14 ? 9 : seal.top.length > 10 ? 10 : 12;
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 100 100"
      style={{ display: 'block', flexShrink: 0, printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
      aria-label={`${seal.top} trained`}
    >
      <defs>
        {/* Upper semicircle (left→top→right) and lower semicircle (right→bottom→left). */}
        <path id={topId} d="M 50,50 m -40,0 a 40,40 0 1 1 80,0" fill="none" />
        <path id={botId} d="M 50,50 m 40,0 a 40,40 0 1 1 -80,0" fill="none" />
      </defs>
      <circle cx="50" cy="50" r="49" fill={seal.color} />
      <circle cx="50" cy="50" r="48" fill="none" stroke="#fff" strokeWidth="1" opacity="0.5" />
      {/* Smaller white centre widens the coloured band so the text reads larger. */}
      <circle cx="50" cy="50" r="29" fill="#fff" />
      <circle cx="50" cy="50" r="29" fill="none" stroke={seal.color} strokeWidth="1.6" />
      <g fill="#fff" fontFamily="Arial, sans-serif" fontWeight={700}>
        <text fontSize={topSize} letterSpacing="0.2">
          <textPath href={`#${topId}`} startOffset="50%" textAnchor="middle">
            {seal.top}
          </textPath>
        </text>
        <text fontSize="11" letterSpacing="1.2">
          <textPath href={`#${botId}`} startOffset="50%" textAnchor="middle">
            TRAINED
          </textPath>
        </text>
      </g>
      <IconGroup icon={seal.icon} color={seal.color} />
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
    <div style={{ display: 'flex', gap: px * 0.18, justifyContent: 'center' }}>
      {steps.map((s) => (
        <svg
          key={s.label}
          width={px}
          height={px}
          viewBox="0 0 100 100"
          style={{ display: 'block', printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
        >
          <circle cx="50" cy="50" r="49" fill={s.color} />
          <circle cx="50" cy="50" r="48" fill="none" stroke="#fff" strokeWidth="1.4" opacity="0.55" />
          {/* White hard-hat worker figure (smaller, up top) */}
          <g fill="#fff" transform="translate(34 8) scale(1.35)">
            <path d="M4 9a8 8 0 0 1 16 0z" />
            <rect x="2" y="9" width="20" height="2.4" rx="1" />
            <rect x="10.6" y="3.4" width="2.8" height="3" rx="1" />
            <circle cx="12" cy="16" r="3.4" />
            <path d="M6.5 25c0-3.4 2.5-6 5.5-6s5.5 2.6 5.5 6z" />
          </g>
          {/* Ordinal pill — large so it's readable at print size */}
          <rect x="16" y="60" width="68" height="32" rx="16" fill="#fff" />
          <text
            x="50"
            y="84"
            textAnchor="middle"
            fontFamily="Arial, sans-serif"
            fontWeight={800}
            fontSize="26"
            fill={s.color}
          >
            {s.label}
          </text>
        </svg>
      ))}
    </div>
  );
}
