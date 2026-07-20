'use client';

import * as React from 'react';
import { Card, Grid, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { BarChart, LineChart, PieChart } from '@mui/x-charts';
import { ChartCard } from '@/components/ui/ChartCard';

export interface ManpowerReport {
  reportType: string;
  periodLabel: string;
  days: string[];
  trend: number[];
  periodFrom: string;
  totalManDays: number;
  uniqueWorkers: number;
  manHours: number;
  activeTrades: number;
  avgPerDay: number;
  peak: number;
  byTrade: { name: string; count: number }[];
  byVendor: { name: string; count: number }[];
}

/** Same hues as the dashboard and the PDF, so all three read as one report. */
const PALETTE = [
  '#3E5BA9',
  '#B7791F',
  '#0091AD',
  '#A8452B',
  '#7C4DBE',
  '#1E7F4F',
  '#9B2C6F',
  '#2B6CB0',
];

function Tile({ label, value }: { label: string; value: number | string }) {
  return (
    <Card variant="outlined" sx={{ p: 2 }}>
      <Typography variant="caption" color="text.secondary" noWrap>
        {label}
      </Typography>
      <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 700 }}>
        {value}
      </Typography>
    </Card>
  );
}

/**
 * On-screen twin of the manpower PDF: trend, by-trade bars, vendor donut and
 * the headline tiles. Labour only — staff and visitors are excluded upstream.
 */
export function ManpowerReportView({ data }: { data: ManpowerReport }) {
  const dayLabels = data.days.map((d) =>
    new Date(`${d}T00:00:00.000Z`).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }),
  );
  const vendorTotal = data.byVendor.reduce((a, b) => a + b.count, 0);
  // A month of ticks will not fit; thin them out past a fortnight.
  const tickEvery = data.days.length > 14 ? Math.ceil(data.days.length / 10) : 1;

  const tiles: [string, number | string][] = [
    ['Total man-days', data.totalManDays],
    ['Unique workers', data.uniqueWorkers],
    ['Logged man-hours', data.manHours],
    ['Active trades', data.activeTrades],
    ['Avg / day', data.avgPerDay],
    ['Peak day', data.peak],
  ];

  return (
    <Stack spacing={2}>
      <Grid container spacing={2}>
        <Grid item xs={12} md={5}>
          <ChartCard
            title={`Total manpower trend (${data.days.length} days)`}
            subtitle="Labour per day"
            empty={data.trend.every((n) => n === 0)}
            emptyText="No labour attendance in this period"
          >
            <LineChart
              height={260}
              series={[
                {
                  id: 'manpower',
                  data: data.trend,
                  label: 'Labour',
                  color: PALETTE[0],
                  curve: 'monotoneX',
                  area: true,
                },
              ]}
              sx={{ '& .MuiAreaElement-series-manpower': { fill: alpha(PALETTE[0], 0.14) } }}
              xAxis={[
                {
                  scaleType: 'point',
                  data: dayLabels,
                  tickInterval: (_, i) => i % tickEvery === 0,
                },
              ]}
              margin={{ left: 40, right: 16, top: 16, bottom: 24 }}
              slotProps={{ legend: { hidden: true } }}
            />
          </ChartCard>
        </Grid>
        <Grid item xs={12} md={4}>
          <ChartCard
            title="Manpower by trade"
            subtitle="Man-days in this period"
            empty={data.byTrade.length === 0}
            emptyText="No labour attendance in this period"
          >
            <BarChart
              height={260}
              series={[{ data: data.byTrade.slice(0, 8).map((t) => t.count), label: 'Man-days' }]}
              xAxis={[
                {
                  scaleType: 'band',
                  data: data.byTrade.slice(0, 8).map((t) => t.name),
                  tickLabelStyle: { angle: -35, textAnchor: 'end', fontSize: 10 },
                  colorMap: { type: 'ordinal', colors: PALETTE },
                },
              ]}
              margin={{ left: 40, right: 16, top: 16, bottom: 64 }}
              slotProps={{ legend: { hidden: true } }}
            />
          </ChartCard>
        </Grid>
        <Grid item xs={12} md={3}>
          <ChartCard
            title="Manpower by vendor"
            subtitle="Share of man-days"
            empty={data.byVendor.length === 0}
            emptyText="No labour attendance in this period"
          >
            <PieChart
              height={260}
              series={[
                {
                  data: data.byVendor.slice(0, 8).map((v, i) => ({
                    id: v.name,
                    value: v.count,
                    label: v.name,
                    color: PALETTE[i % PALETTE.length],
                  })),
                  innerRadius: 52,
                  paddingAngle: 2,
                  cornerRadius: 3,
                  valueFormatter: (v) =>
                    `${v.value} (${vendorTotal ? Math.round((v.value / vendorTotal) * 100) : 0}%)`,
                },
              ]}
              margin={{ left: 12, right: 100 }}
            />
          </ChartCard>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        {tiles.map(([label, value]) => (
          <Grid item xs={6} sm={4} md={2} key={label}>
            <Tile label={label} value={value} />
          </Grid>
        ))}
      </Grid>

      <Typography variant="caption" color="text.secondary">
        Labour only — staff and visitors are excluded. Man-days count attendance
        sessions; unique workers counts people.
      </Typography>
    </Stack>
  );
}
