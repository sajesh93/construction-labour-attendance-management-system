'use client';

import * as React from 'react';
import { Box, Divider, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { ChartsAxisContentProps } from '@mui/x-charts/ChartsTooltip';
import { useSvgRef, useYScale } from '@mui/x-charts/hooks';

export interface VendorTrendSeries {
  vendor: string;
  total: number;
  data: number[];
  /** Designation -> count for each day, aligned with `days`. */
  splits: Record<string, number>[];
}

export interface VendorTrendData {
  days: string[];
  series: VendorTrendSeries[];
  /** Every vendor, including any beyond the eight drawn as lines. */
  totals: number[];
  totalSplits: Record<string, number>[];
  otherTotals: number[];
  hiddenVendorCount: number;
}

/**
 * Follows the pointer inside the chart's SVG and reports its y position, so the
 * tooltip can tell which vendor line the cursor is nearest. The axis tooltip
 * only knows the hovered day, not the hovered series.
 */
function usePointerY(): number | null {
  const svgRef = useSvgRef();
  const [y, setY] = React.useState<number | null>(null);

  React.useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const onMove = (e: PointerEvent) => {
      const rect = svg.getBoundingClientRect();
      setY(e.clientY - rect.top);
    };
    const onLeave = () => setY(null);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerleave', onLeave);
    return () => {
      svg.removeEventListener('pointermove', onMove);
      svg.removeEventListener('pointerleave', onLeave);
    };
  }, [svgRef]);

  return y;
}

function Row({
  label,
  value,
  colour,
  bold,
  dim,
}: {
  label: string;
  value: number;
  colour?: string;
  bold?: boolean;
  dim?: boolean;
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 190 }}>
      {colour && (
        <Box
          sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: colour, flexShrink: 0 }}
        />
      )}
      <Typography
        variant="caption"
        sx={{ flex: 1, fontWeight: bold ? 700 : 400, opacity: dim ? 0.75 : 1 }}
        noWrap
      >
        {label}
      </Typography>
      <Typography variant="caption" sx={{ fontWeight: bold ? 700 : 500, opacity: dim ? 0.75 : 1 }}>
        {value}
      </Typography>
    </Box>
  );
}

/** Indented designation lines under a total. */
function Designations({ split, indent }: { split: Record<string, number>; indent: number }) {
  const entries = Object.entries(split);
  if (entries.length === 0) return null;
  return (
    <Box sx={{ pl: indent }}>
      {entries.map(([designation, count]) => (
        <Row key={designation} label={designation} value={count} dim />
      ))}
    </Box>
  );
}

/**
 * Axis tooltip for the 30-day vendor chart: the day's grand total with its
 * designation split, then every vendor line, with the vendor nearest the
 * pointer expanded into its own designation split.
 */
export function VendorTrendTooltip({
  axisValue,
  dataIndex,
  trend,
  palette,
}: ChartsAxisContentProps & {
  // Injected through slotProps, so MUI's own prop type cannot promise them.
  trend?: VendorTrendData;
  palette?: string[];
}) {
  const pointerY = usePointerY();
  const yScale = useYScale();

  if (!trend || !palette) return null;
  if (dataIndex == null || !trend.days[dataIndex]) return null;
  const i = dataIndex;

  // The nearest line by vertical distance, in pixels rather than counts so the
  // pick matches what the eye sees.
  let nearest = -1;
  if (pointerY != null) {
    let best = Infinity;
    trend.series.forEach((s, idx) => {
      const py = (yScale as (v: number) => number)(s.data[i]);
      const d = Math.abs(py - pointerY);
      if (d < best) {
        best = d;
        nearest = idx;
      }
    });
  }

  const label =
    typeof axisValue === 'string' || typeof axisValue === 'number'
      ? String(axisValue)
      : trend.days[i];

  return (
    <Box
      sx={(theme) => ({
        p: 1.25,
        borderRadius: 1.5,
        bgcolor: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: theme.shadows[3],
        maxHeight: 420,
        overflowY: 'auto',
      })}
    >
      <Typography variant="caption" sx={{ fontWeight: 700 }}>
        {label}
      </Typography>
      <Divider sx={{ my: 0.75 }} />

      <Row label="All vendors" value={trend.totals[i] ?? 0} bold />
      <Designations split={trend.totalSplits[i] ?? {}} indent={1} />

      <Divider sx={{ my: 0.75 }} />

      {trend.series.map((s, idx) => (
        <Box
          key={s.vendor}
          sx={(theme) => ({
            borderRadius: 1,
            px: 0.5,
            mx: -0.5,
            bgcolor:
              idx === nearest ? alpha(palette[idx % palette.length], 0.12) : 'transparent',
            ...(idx === nearest ? { boxShadow: `inset 2px 0 0 ${palette[idx % palette.length]}` } : {}),
            transition: theme.transitions.create('background-color', { duration: 120 }),
          })}
        >
          <Row
            label={s.vendor}
            value={s.data[i] ?? 0}
            colour={palette[idx % palette.length]}
            bold={idx === nearest}
          />
          {idx === nearest && <Designations split={s.splits[i] ?? {}} indent={2} />}
        </Box>
      ))}

      {(trend.otherTotals[i] ?? 0) > 0 && (
        <Row
          label={`Other vendors (${trend.hiddenVendorCount})`}
          value={trend.otherTotals[i]}
          dim
        />
      )}
    </Box>
  );
}
