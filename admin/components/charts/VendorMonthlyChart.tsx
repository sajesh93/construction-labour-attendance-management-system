'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Box, Chip, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import { api } from '@/lib/api/browser';
import { ChartCard } from '@/components/ui/ChartCard';

/**
 * Categorical hues for vendor identity. Ordered so neighbouring slots alternate
 * warm/cool — validated for colour-vision separation against a white surface.
 * Slots are assigned by vendor name, never by rank, so a vendor keeps its colour
 * as months change and the bar order shuffles.
 */
const VENDOR_HUES = [
  '#3E5BA9',
  '#B7791F',
  '#0091AD',
  '#A8452B',
  '#7C4DBE',
  '#1E7F4F',
  '#9B2C6F',
  '#2B6CB0',
];

interface VendorRow {
  vendor: string;
  manDays: number;
  workers: number;
  hours: number;
}
interface VendorMonthly {
  month: string;
  totals: { manDays: number; hours: number; workers: number; vendors: number };
  vendors: VendorRow[];
}

const MONTH_FMT = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

function shiftMonth(m: string, by: number): string {
  const [y, mo] = m.split('-').map((n) => parseInt(n, 10));
  const d = new Date(Date.UTC(y, mo - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function thisMonth(): string {
  const n = new Date();
  return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Stable colour per vendor, independent of how the bars end up sorted. */
function hueFor(vendor: string, order: string[]): string {
  const i = order.indexOf(vendor);
  return VENDOR_HUES[(i < 0 ? 0 : i) % VENDOR_HUES.length];
}

function Kpi({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
      <Box
        sx={{
          width: 30,
          height: 30,
          borderRadius: 1.5,
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
          color: 'text.secondary',
          bgcolor: alpha(theme.palette.text.primary, 0.05),
          '& svg': { fontSize: 17 },
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h6" sx={{ lineHeight: 1.15, fontWeight: 700 }}>
          {value}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap>
          {label}
        </Typography>
      </Box>
    </Stack>
  );
}

export function VendorMonthlyChart() {
  const theme = useTheme();
  const [month, setMonth] = React.useState(thisMonth());
  // Bars grow from zero once the rows for a month have landed.
  const [grown, setGrown] = React.useState(false);

  const q = useQuery({
    queryKey: ['vendor-monthly', month],
    queryFn: () => api.get<VendorMonthly>(`/attendance/vendor-monthly?month=${month}`),
  });

  const rows = React.useMemo(() => q.data?.vendors ?? [], [q.data]);
  // Alphabetical order fixes the colour slots; the bars themselves stay sorted
  // by man-days, so colour never tracks rank.
  const colourOrder = React.useMemo(
    () => [...rows].map((r) => r.vendor).sort((a, b) => a.localeCompare(b)),
    [rows],
  );
  const max = Math.max(1, ...rows.map((r) => r.manDays));

  React.useEffect(() => {
    setGrown(false);
    if (!rows.length) return;
    const t = window.setTimeout(() => setGrown(true), 40);
    return () => window.clearTimeout(t);
  }, [rows, month]);

  const atCurrentMonth = month >= thisMonth();
  const totals = q.data?.totals;

  return (
    <ChartCard
      title="Vendor-wise attendance"
      subtitle={`Man-days across ${MONTH_FMT(month)}`}
      loading={q.isLoading}
      empty={!q.isLoading && rows.length === 0}
      emptyText={`No attendance recorded in ${MONTH_FMT(month)}`}
      height={300}
      action={
        <Stack direction="row" spacing={0.25} alignItems="center">
          <Tooltip title="Previous month">
            <IconButton size="small" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
              <ChevronLeftIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Chip
            label={MONTH_FMT(month)}
            size="small"
            variant="outlined"
            onClick={() => setMonth(thisMonth())}
            sx={{ fontWeight: 600, minWidth: 118 }}
          />
          <Tooltip title={atCurrentMonth ? 'Already at the current month' : 'Next month'}>
            <span>
              <IconButton
                size="small"
                disabled={atCurrentMonth}
                onClick={() => setMonth((m) => shiftMonth(m, 1))}
              >
                <ChevronRightIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      }
    >
      <Box sx={{ px: 1.25, pb: 0.5 }}>
        {/* ---- Headline numbers for the month ---- */}
        <Stack
          direction="row"
          spacing={2}
          sx={{
            flexWrap: 'wrap',
            rowGap: 1.5,
            pb: 1.75,
            mb: 1.75,
            borderBottom: `1px solid ${theme.palette.divider}`,
          }}
        >
          <Kpi
            icon={<EventAvailableOutlinedIcon />}
            label="Man-days"
            value={totals?.manDays ?? '—'}
          />
          <Kpi
            icon={<ScheduleOutlinedIcon />}
            label="Hours worked"
            value={totals ? totals.hours.toLocaleString() : '—'}
          />
          <Kpi icon={<GroupsOutlinedIcon />} label="People" value={totals?.workers ?? '—'} />
          <Kpi icon={<StorefrontOutlinedIcon />} label="Vendors" value={totals?.vendors ?? '—'} />
        </Stack>

        {/* ---- One bar per vendor, sorted by man-days ---- */}
        <Stack spacing={1.75}>
          {rows.map((r, i) => {
            const hue = hueFor(r.vendor, colourOrder);
            const pct = (r.manDays / max) * 100;
            return (
              <Box key={r.vendor}>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="baseline"
                  sx={{ mb: 0.5, gap: 1 }}
                >
                  <Stack direction="row" spacing={0.9} alignItems="center" sx={{ minWidth: 0 }}>
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        bgcolor: hue,
                        flexShrink: 0,
                      }}
                    />
                    <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                      {r.vendor}
                    </Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
                      {r.manDays}
                    </Box>{' '}
                    man-days · {r.hours.toLocaleString()} h · {r.workers}{' '}
                    {r.workers === 1 ? 'person' : 'people'}
                  </Typography>
                </Stack>
                <Tooltip
                  placement="top"
                  title={
                    <Box sx={{ py: 0.25 }}>
                      <Typography variant="caption" sx={{ fontWeight: 700 }} display="block">
                        {r.vendor}
                      </Typography>
                      <Typography variant="caption" display="block">
                        {r.manDays} man-days in {MONTH_FMT(month)}
                      </Typography>
                      <Typography variant="caption" display="block">
                        {r.hours.toLocaleString()} hours · {r.workers}{' '}
                        {r.workers === 1 ? 'person' : 'people'}
                      </Typography>
                      <Typography variant="caption" display="block">
                        {Math.round((r.manDays / (totals?.manDays || 1)) * 100)}% of the month
                      </Typography>
                    </Box>
                  }
                >
                  <Box
                    sx={{
                      height: 12,
                      borderRadius: 999,
                      bgcolor: alpha(theme.palette.text.primary, 0.055),
                      overflow: 'hidden',
                      cursor: 'default',
                      '&:hover .bar': { filter: 'saturate(1.18)' },
                    }}
                  >
                    <Box
                      className="bar"
                      sx={{
                        height: '100%',
                        width: grown ? `${pct}%` : 0,
                        borderRadius: 999,
                        background: `linear-gradient(90deg, ${alpha(hue, 0.82)} 0%, ${hue} 100%)`,
                        boxShadow: `0 1px 6px ${alpha(hue, 0.35)}`,
                        transition: theme.transitions.create(['width', 'filter'], {
                          duration: 780,
                          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                        }),
                        // Stagger so the bars cascade rather than snap together.
                        transitionDelay: `${i * 85}ms`,
                        '@media (prefers-reduced-motion: reduce)': {
                          transition: 'none',
                          transitionDelay: '0ms',
                        },
                      }}
                    />
                  </Box>
                </Tooltip>
              </Box>
            );
          })}
        </Stack>
      </Box>
    </ChartCard>
  );
}
