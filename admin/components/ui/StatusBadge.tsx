'use client';

import * as React from 'react';
import { Chip, ChipProps } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';

export type BadgeTone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

/**
 * Soft status chip: tinted background + strong text of the same hue.
 * Central place for entity-status → tone mapping so colors stay consistent.
 */
export function StatusBadge({
  label,
  tone = 'neutral',
  ...rest
}: { label: string; tone?: BadgeTone } & Omit<ChipProps, 'label' | 'color'>) {
  const theme = useTheme();
  const color =
    tone === 'neutral'
      ? theme.palette.text.secondary
      : theme.palette[tone === 'info' ? 'info' : tone].main;
  return (
    <Chip
      size="small"
      label={label}
      {...rest}
      sx={{
        bgcolor: alpha(color, 0.12),
        color: tone === 'neutral' ? 'text.secondary' : color,
        fontWeight: 650,
        ...rest.sx,
      }}
    />
  );
}

/** Common mappings used across pages. */
export function statusTone(status: string | null | undefined): BadgeTone {
  switch ((status ?? '').toUpperCase()) {
    case 'ACTIVE':
    case 'AUTHORIZED':
    case 'APPROVED':
    case 'CLOSED':
    case 'ONLINE':
    case 'OK':
      return 'success';
    case 'PENDING':
    case 'OPEN':
    case 'WARNING':
    case 'AUTO_CLOSED':
      return 'warning';
    case 'REVOKED':
    case 'REJECTED':
    case 'BLOCKED':
    case 'CRITICAL':
    case 'EXITED':
      return 'error';
    case 'INACTIVE':
    case 'DISABLED':
    default:
      return 'neutral';
  }
}
