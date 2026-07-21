'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  Divider,
  Grid,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { LineChart, BarChart, PieChart } from '@mui/x-charts';
import EngineeringOutlinedIcon from '@mui/icons-material/EngineeringOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import RuleOutlinedIcon from '@mui/icons-material/RuleOutlined';
import LocationCityOutlinedIcon from '@mui/icons-material/LocationCityOutlined';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import HandymanOutlinedIcon from '@mui/icons-material/HandymanOutlined';
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import AddLocationAltOutlinedIcon from '@mui/icons-material/AddLocationAltOutlined';
import PlaylistAddCheckOutlinedIcon from '@mui/icons-material/PlaylistAddCheckOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import DevicesOutlinedIcon from '@mui/icons-material/DevicesOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import CircleIcon from '@mui/icons-material/Circle';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { api } from '@/lib/api/browser';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { ChartCard } from '@/components/ui/ChartCard';
import { VendorTrendTooltip, VendorTrendData } from '@/components/VendorTrendTooltip';
import { CorrectionRequest, Paginated, Site } from '@/lib/types';

interface StatPerson {
  fullName: string;
  workerCode: string;
  siteName: string | null;
  loginAt: string;
}
interface StatBucket {
  count: number;
  people: StatPerson[];
}
interface DashboardStats {
  onSiteNow: { total: number; byCategory: Record<string, StatBucket> };
  missedLogout: { date: string; total: number; byCategory: Record<string, StatBucket> };
}
interface Manpower {
  /** ISO days across the picked window, oldest first. */
  days: string[];
  trend: number[];
  /** Echo of the window the server used (it clamps over-long spans). */
  from: string;
  to: string;
  totalManDays: number;
  totalToday: number;
  manHoursToday: number;
  activeTrades: number;
  byTrade: { trade: string; count: number }[];
  byVendor: { vendor: string; count: number }[];
}
interface DashboardCharts {
  vendorTrend: VendorTrendData;
  manpower: Manpower;
  siteWise: { site: string; onSite: number }[];
  distribution: { category: string; onSite: number }[];
  correctionsBySite: { site: string; pending: number }[];
  vendorToday: { vendor: string; count: number }[];
}
interface StorageUsageLite {
  level: 'OK' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';
  usedPercent: number | null;
}
interface AuditRow {
  id: string;
  action: string;
  actorName: string | null;
  entityName: string | null;
  createdAt: string;
}

const ACTIVITY_LABELS: Record<string, string> = {
  AUTH_LOGIN: 'signed in',
  WORKER_CREATE: 'added a person',
  WORKER_UPDATE: 'updated a person',
  WORKER_ASSIGN_SITE: 'assigned a site',
  CORRECTION_REQUEST: 'requested a correction',
  CORRECTION_APPROVE: 'approved a correction',
  CORRECTION_REJECT: 'rejected a correction',
  SITE_CREATE: 'created a site',
  SITE_UPDATE: 'updated a site',
  DEVICE_UPDATE: 'updated a device',
  USER_CREATE: 'created a user account',
  USER_UPDATE: 'updated a user account',
  USER_DELETE: 'deleted a user account',
  AUTH_PASSWORD_RESET: 'reset their password',
};

function PeopleTooltip({ title, bucket }: { title: string; bucket?: StatBucket }) {
  if (!bucket || bucket.count === 0) {
    return <Typography variant="body2">No one in this list right now.</Typography>;
  }
  const shown = bucket.people.slice(0, 8);
  return (
    <Box sx={{ py: 0.5 }}>
      <Typography variant="caption" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      <Divider sx={{ my: 0.5, borderColor: 'rgba(255,255,255,0.3)' }} />
      {shown.map((p) => (
        <Typography key={p.workerCode} variant="caption" display="block">
          {p.fullName} ({p.workerCode}) — {p.siteName ?? 'Unknown site'},{' '}
          {new Date(p.loginAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Typography>
      ))}
      {bucket.count > shown.length && (
        <Typography variant="caption" display="block" sx={{ fontStyle: 'italic' }}>
          …and {bucket.count - shown.length} more
        </Typography>
      )}
    </Box>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  WORKER: 'Workers',
  STAFF: 'Staff',
  VISITOR: 'Visitors',
};

/** Local-calendar YYYY-MM-DD — toISOString() would shift the day west of UTC. */
function isoDay(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function shiftDays(iso: string, delta: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return isoDay(d);
}

/** The manpower panel's default window: the seven days ending today. */
function thisWeek() {
  const today = isoDay(new Date());
  return { from: shiftDays(today, -6), to: today };
}

export default function DashboardPage() {
  const router = useRouter();
  const theme = useTheme();
  const [missedDismissed, setMissedDismissed] = React.useState(false);
  const [range, setRange] = React.useState(thisWeek);

  // Whole-window nudges: the common case is "show me last week", not picking
  // two dates by hand. The span is preserved, so a custom window steps by its
  // own length rather than snapping back to seven days.
  const spanDays =
    Math.round(
      (new Date(`${range.to}T00:00:00`).getTime() - new Date(`${range.from}T00:00:00`).getTime()) /
        86_400_000,
    ) + 1;
  const shiftWindow = (dir: -1 | 1) =>
    setRange((r) => ({
      from: shiftDays(r.from, dir * spanDays),
      to: shiftDays(r.to, dir * spanDays),
    }));
  const atToday = range.to >= isoDay(new Date());

  const sites = useQuery({ queryKey: ['sites'], queryFn: () => api.get<Site[]>('/sites') });
  const pending = useQuery({
    queryKey: ['corrections', 'PENDING'],
    queryFn: () => api.get<CorrectionRequest[]>('/corrections?status=PENDING'),
  });
  const stats = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get<DashboardStats>('/attendance/dashboard-stats'),
    refetchInterval: 30000,
  });
  const charts = useQuery({
    queryKey: ['dashboard-charts', range.from, range.to],
    queryFn: () =>
      api.get<DashboardCharts>(
        `/attendance/dashboard-charts?from=${range.from}&to=${range.to}`,
      ),
    // Hold the previous window on screen while the next loads, so stepping
    // through weeks does not flash empty cards.
    placeholderData: (prev) => prev,
    refetchInterval: 60000,
  });
  const storage = useQuery({
    queryKey: ['storage-usage'],
    queryFn: () => api.get<StorageUsageLite>('/storage/usage'),
    refetchInterval: 120000,
  });
  const activity = useQuery({
    queryKey: ['recent-activity'],
    // Scans are audited too, but there are hundreds a day — they would bury
    // every other action in this eight-row summary. The Audit page shows them.
    queryFn: () =>
      api.get<Paginated<AuditRow>>(
        '/audit?limit=8&excludeActions=ATTENDANCE_LOGIN,ATTENDANCE_LOGOUT',
      ),
    refetchInterval: 60000,
  });

  const on = stats.data?.onSiteNow;
  const missed = stats.data?.missedLogout;
  const cat = (b?: Record<string, StatBucket>, key?: string) => (key && b ? b[key] : undefined);
  const storageLevel = storage.data?.level;
  const storagePct =
    storage.data?.usedPercent != null ? Math.round(storage.data.usedPercent * 100) : null;

  const vendorTrend = charts.data?.vendorTrend;
  const vendorDays = vendorTrend?.days ?? [];
  const vendorSeries = vendorTrend?.series ?? [];
  // Categorical hues for vendor identity, ordered so neighbouring slots
  // alternate warm/cool — validated for colour-vision separation on white.
  const vendorPalette = [
    '#3E5BA9',
    '#B7791F',
    '#0091AD',
    '#A8452B',
    '#7C4DBE',
    '#1E7F4F',
    '#9B2C6F',
    '#2B6CB0',
  ];
  const pieColors = [
    theme.palette.primary.main,
    theme.palette.info.main,
    theme.palette.warning.main,
  ];

  const manpower = charts.data?.manpower;
  // "Mon 14" reads well for a week; past a fortnight the weekday is noise and
  // the ticks collide, so fall back to "14 Jul".
  const dayLabelOpts: Intl.DateTimeFormatOptions =
    (manpower?.days.length ?? 0) > 14
      ? { day: 'numeric', month: 'short' }
      : { weekday: 'short', day: 'numeric' };
  const manpowerDayLabels = (manpower?.days ?? []).map((d) =>
    new Date(`${d}T00:00:00`).toLocaleDateString(undefined, dayLabelOpts),
  );
  const fmtDay = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  const manpowerPeriod = manpower
    ? `${fmtDay(manpower.from)} – ${fmtDay(manpower.to)} · ${manpower.totalManDays} man-days`
    : 'Labour per day, by trade and by vendor';
  // Trades and vendors are ranked, so alternating the palette keeps adjacent
  // bars/slices distinct without implying an order in the colour itself.
  const tradeColors = vendorPalette;

  const quickActions = [
    { label: 'Add worker', icon: <PersonAddAltOutlinedIcon />, href: '/workers' },
    { label: 'Add site', icon: <AddLocationAltOutlinedIcon />, href: '/sites' },
    { label: 'Corrections', icon: <PlaylistAddCheckOutlinedIcon />, href: '/corrections' },
    { label: 'Reports', icon: <AssessmentOutlinedIcon />, href: '/reports' },
    { label: 'Devices', icon: <DevicesOutlinedIcon />, href: '/devices' },
    { label: 'Export attendance', icon: <FileDownloadOutlinedIcon />, href: '/reports' },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Live overview of everyone on your sites"
        action={
          <Stack direction="row" spacing={1}>
            {quickActions.slice(0, 3).map((a) => (
              <Button
                key={a.label}
                size="small"
                variant="outlined"
                startIcon={a.icon}
                onClick={() => router.push(a.href)}
                sx={{ display: { xs: 'none', md: 'inline-flex' } }}
              >
                {a.label}
              </Button>
            ))}
          </Stack>
        }
      />

      {/* ---- Alerts ---- */}
      {(storageLevel === 'WARNING' || storageLevel === 'CRITICAL') && (
        <Alert
          severity={storageLevel === 'CRITICAL' ? 'error' : 'warning'}
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => router.push('/storage')}>
              Manage storage
            </Button>
          }
        >
          Server storage is {storageLevel === 'CRITICAL' ? 'critically low' : 'running low'} (
          {storagePct}% used). Back up and clear the oldest data to free space.
        </Alert>
      )}
      {!missedDismissed && (missed?.total ?? 0) > 0 && (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={
            <Stack direction="row" spacing={1}>
              <Button
                color="inherit"
                size="small"
                onClick={() => router.push('/attendance?view=missed')}
              >
                View details
              </Button>
              <Button color="inherit" size="small" onClick={() => setMissedDismissed(true)}>
                Dismiss
              </Button>
            </Stack>
          }
        >
          <Tooltip title="Sessions with no logout tap are no longer closed automatically — log the person out or approve a correction to fix the hours.">
            <span>
              {missed?.total} missed logout{(missed?.total ?? 0) === 1 ? '' : 's'} need attention —
              these sessions are still open.
            </span>
          </Tooltip>
        </Alert>
      )}

      {/* ---- Summary cards ---- */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={6} sm={4} md={3}>
          <StatCard
            label="Workers on site"
            value={cat(on?.byCategory, 'WORKER')?.count ?? (stats.data ? 0 : '—')}
            icon={<EngineeringOutlinedIcon />}
            hint="Logged in right now"
            loading={stats.isLoading}
            tooltip={<PeopleTooltip title="Workers on site now" bucket={cat(on?.byCategory, 'WORKER')} />}
            href="/attendance?category=WORKER"
          />
        </Grid>
        <Grid item xs={6} sm={4} md={3}>
          <StatCard
            label="Staff on site"
            value={cat(on?.byCategory, 'STAFF')?.count ?? (stats.data ? 0 : '—')}
            icon={<BadgeOutlinedIcon />}
            hint="Logged in right now"
            loading={stats.isLoading}
            tooltip={<PeopleTooltip title="Staff on site now" bucket={cat(on?.byCategory, 'STAFF')} />}
            href="/attendance?category=STAFF"
          />
        </Grid>
        <Grid item xs={6} sm={4} md={3}>
          <StatCard
            label="Visitors on site"
            value={cat(on?.byCategory, 'VISITOR')?.count ?? (stats.data ? 0 : '—')}
            icon={<GroupsOutlinedIcon />}
            hint="Checked in today"
            loading={stats.isLoading}
            tooltip={<PeopleTooltip title="Visitors on site now" bucket={cat(on?.byCategory, 'VISITOR')} />}
            href="/attendance?category=VISITOR"
          />
        </Grid>
        <Grid item xs={6} sm={4} md={3}>
          <StatCard
            label="Total on site"
            value={on?.total ?? '—'}
            icon={<PeopleAltOutlinedIcon />}
            hint="All categories"
            tone="info"
            loading={stats.isLoading}
            href="/attendance"
          />
        </Grid>
        <Grid item xs={6} sm={4} md={3}>
          <StatCard
            label="Missed logouts"
            value={missed?.total ?? '—'}
            icon={<ReportProblemOutlinedIcon />}
            hint="Open sessions to review"
            tone="warning"
            loading={stats.isLoading}
            href="/attendance?view=missed"
          />
        </Grid>
        <Grid item xs={6} sm={4} md={3}>
          <StatCard
            label="Pending corrections"
            value={pending.data?.length ?? '—'}
            icon={<RuleOutlinedIcon />}
            hint="Awaiting review"
            tone={pending.data?.length ? 'warning' : 'primary'}
            loading={pending.isLoading}
            href="/corrections"
          />
        </Grid>
        <Grid item xs={6} sm={4} md={3}>
          <StatCard
            label="Active sites"
            value={sites.data?.filter((s) => s.isActive).length ?? '—'}
            icon={<LocationCityOutlinedIcon />}
            hint="Currently running"
            tone="success"
            loading={sites.isLoading}
            href="/sites"
          />
        </Grid>
        <Grid item xs={6} sm={4} md={3}>
          <StatCard
            label="Total sites"
            value={sites.data?.length ?? '—'}
            icon={<MapOutlinedIcon />}
            hint="Including completed"
            loading={sites.isLoading}
            href="/sites"
          />
        </Grid>
        <Grid item xs={6} sm={4} md={3}>
          <StatCard
            label="Logged man-hours"
            value={manpower ? manpower.manHoursToday : '—'}
            icon={<AccessTimeOutlinedIcon />}
            hint="Labour hours today"
            tone="info"
            loading={charts.isLoading}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={3}>
          <StatCard
            label="Active trades"
            value={manpower?.activeTrades ?? '—'}
            icon={<HandymanOutlinedIcon />}
            hint="Designations on site today"
            tone="success"
            loading={charts.isLoading}
          />
        </Grid>
      </Grid>

      {/* ---- Manpower: one box, three views of the same window ---- */}
      <Box sx={{ mb: 2 }}>
        <ChartCard
          title="Manpower"
          subtitle={manpowerPeriod}
          loading={charts.isLoading}
          empty={!charts.isLoading && (manpower?.trend ?? []).every((n) => n === 0)}
          emptyText="No labour attendance in this period"
          height={300}
          action={
            <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
              <Tooltip title="Previous period">
                <IconButton size="small" onClick={() => shiftWindow(-1)}>
                  <ChevronLeftIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <TextField
                size="small"
                type="date"
                label="From"
                value={range.from}
                onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                sx={{ width: 150 }}
              />
              <TextField
                size="small"
                type="date"
                label="To"
                value={range.to}
                onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                sx={{ width: 150 }}
              />
              <Tooltip title={atToday ? 'Already at the latest period' : 'Next period'}>
                {/* span: a disabled button fires no events for Tooltip to hear. */}
                <span>
                  <IconButton size="small" onClick={() => shiftWindow(1)} disabled={atToday}>
                    <ChevronRightIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Button size="small" onClick={() => setRange(thisWeek())} disabled={atToday}>
                This week
              </Button>
            </Stack>
          }
        >
          <Grid container spacing={1}>
            <Grid item xs={12} md={5}>
              <Typography variant="caption" color="text.secondary" sx={{ pl: 1.5 }}>
                Total manpower trend
              </Typography>
              <LineChart
                height={260}
                series={[
                  {
                    id: 'manpower',
                    data: manpower?.trend ?? [],
                    label: 'Labour',
                    color: theme.palette.primary.main,
                    curve: 'monotoneX',
                    area: true,
                  },
                ]}
                sx={{
                  '& .MuiAreaElement-series-manpower': {
                    fill: alpha(theme.palette.primary.main, 0.14),
                  },
                }}
                xAxis={[{ scaleType: 'point', data: manpowerDayLabels }]}
                margin={{ left: 40, right: 16, top: 16, bottom: 24 }}
                slotProps={{ legend: { hidden: true } }}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <Typography variant="caption" color="text.secondary" sx={{ pl: 1.5 }}>
                Manpower by trade
              </Typography>
              <BarChart
                height={260}
                series={[
                  {
                    data: (manpower?.byTrade ?? []).map((t) => t.count),
                    label: 'Labour',
                  },
                ]}
                xAxis={[
                  {
                    scaleType: 'band',
                    data: (manpower?.byTrade ?? []).map((t) => t.trade),
                    // Trade names are long; angle them so they stay readable.
                    tickLabelStyle: { angle: -35, textAnchor: 'end', fontSize: 10 },
                    colorMap: {
                      type: 'ordinal',
                      colors: tradeColors,
                    },
                  },
                ]}
                margin={{ left: 40, right: 16, top: 16, bottom: 64 }}
                slotProps={{ legend: { hidden: true } }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <Typography variant="caption" color="text.secondary" sx={{ pl: 1.5 }}>
                Manpower by vendor
              </Typography>
              <PieChart
                height={260}
                series={[
                  {
                    data: (manpower?.byVendor ?? []).map((v, i) => ({
                      id: v.vendor,
                      value: v.count,
                      label: v.vendor,
                      color: vendorPalette[i % vendorPalette.length],
                    })),
                    innerRadius: 52,
                    paddingAngle: 2,
                    cornerRadius: 3,
                    // Share of the window's labour, matching the donut labels.
                    valueFormatter: (v) => {
                      const total = (manpower?.byVendor ?? []).reduce((a, b) => a + b.count, 0);
                      const pct = total ? Math.round((v.value / total) * 100) : 0;
                      return `${v.value} (${pct}%)`;
                    },
                  },
                ]}
                margin={{ left: 12, right: 100 }}
              />
            </Grid>
          </Grid>
        </ChartCard>
      </Box>

      {/* ---- Charts row 1 ---- */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={8}>
          <ChartCard
            title="Vendor-wise attendance — last 30 days"
            subtitle="Man-days per day, by vendor"
            loading={charts.isLoading}
            empty={!charts.isLoading && vendorSeries.length === 0}
            emptyText="No attendance recorded in the last 30 days"
          >
            <LineChart
              height={260}
              series={vendorSeries.map((s, i) => ({
                id: `vendor-${i}`,
                data: s.data,
                label: s.vendor,
                color: vendorPalette[i % vendorPalette.length],
                curve: 'monotoneX',
                area: true,
              }))}
              // One tinted fill per vendor. A single .MuiAreaElement-root rule
              // would paint every series the same colour, so target each by id.
              sx={Object.fromEntries(
                vendorSeries.map((_, i) => [
                  `& .MuiAreaElement-series-vendor-${i}`,
                  { fill: alpha(vendorPalette[i % vendorPalette.length], 0.12) },
                ]),
              )}
              xAxis={[
                {
                  scaleType: 'point',
                  data: vendorDays.map((d) =>
                    new Date(d).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                    }),
                  ),
                  // 30 ticks will not fit — label roughly every fifth day.
                  tickInterval: (_, i) => i % 5 === 0,
                },
              ]}
              // Taller top margin than the other cards: vendor names make for a
              // wide legend that would otherwise sit on top of the peaks.
              margin={{ left: 40, right: 16, top: 44, bottom: 24 }}
              // Axis trigger so the tooltip opens anywhere over a day, not only
              // on a mark; the custom content adds the all-vendor total and the
              // designation split for the vendor under the pointer.
              tooltip={{ trigger: 'axis' }}
              slots={{ axisContent: VendorTrendTooltip }}
              slotProps={{
                legend: { hidden: false },
                axisContent: { trend: vendorTrend, palette: vendorPalette } as never,
              }}
            />
          </ChartCard>
        </Grid>
        <Grid item xs={12} md={4}>
          <ChartCard
            title="Who's on site"
            subtitle="Workers vs staff vs visitors"
            loading={charts.isLoading}
            empty={!charts.isLoading && (charts.data?.distribution.length ?? 0) === 0}
            emptyText="No one is on site right now"
          >
            <PieChart
              height={260}
              series={[
                {
                  data: (charts.data?.distribution ?? []).map((d, i) => ({
                    id: d.category,
                    value: d.onSite,
                    label: CATEGORY_LABELS[d.category] ?? d.category,
                    color: pieColors[i % pieColors.length],
                  })),
                  innerRadius: 55,
                  paddingAngle: 2,
                  cornerRadius: 3,
                },
              ]}
              margin={{ left: 12, right: 100 }}
            />
          </ChartCard>
        </Grid>
      </Grid>

      {/* ---- Charts row 2 ---- */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={4}>
          <ChartCard
            title="People by site"
            subtitle="On site right now"
            loading={charts.isLoading}
            empty={!charts.isLoading && (charts.data?.siteWise.length ?? 0) === 0}
            emptyText="No open sessions"
          >
            <BarChart
              height={240}
              layout="horizontal"
              series={[
                {
                  data: (charts.data?.siteWise ?? []).map((s) => s.onSite),
                  label: 'On site',
                  color: theme.palette.primary.main,
                },
              ]}
              yAxis={[
                {
                  scaleType: 'band',
                  data: (charts.data?.siteWise ?? []).map((s) => s.site),
                },
              ]}
              margin={{ left: 110, right: 16, top: 8, bottom: 24 }}
              slotProps={{ legend: { hidden: true } }}
            />
          </ChartCard>
        </Grid>
        <Grid item xs={12} md={4}>
          <ChartCard
            title="Pending corrections by site"
            loading={charts.isLoading}
            empty={!charts.isLoading && (charts.data?.correctionsBySite.length ?? 0) === 0}
            emptyText="No pending corrections"
          >
            <BarChart
              height={240}
              layout="horizontal"
              series={[
                {
                  data: (charts.data?.correctionsBySite ?? []).map((s) => s.pending),
                  label: 'Pending',
                  color: theme.palette.warning.main,
                },
              ]}
              yAxis={[
                {
                  scaleType: 'band',
                  data: (charts.data?.correctionsBySite ?? []).map((s) => s.site),
                },
              ]}
              margin={{ left: 110, right: 16, top: 8, bottom: 24 }}
              slotProps={{ legend: { hidden: true } }}
            />
          </ChartCard>
        </Grid>
        <Grid item xs={12} md={4}>
          <ChartCard
            title="Vendor-wise attendance"
            subtitle="Sessions today"
            loading={charts.isLoading}
            empty={!charts.isLoading && (charts.data?.vendorToday.length ?? 0) === 0}
            emptyText="No attendance today yet"
          >
            <BarChart
              height={240}
              layout="horizontal"
              series={[
                {
                  data: (charts.data?.vendorToday ?? []).map((v) => v.count),
                  label: 'Sessions',
                  color: theme.palette.info.main,
                },
              ]}
              yAxis={[
                {
                  scaleType: 'band',
                  data: (charts.data?.vendorToday ?? []).map((v) => v.vendor),
                },
              ]}
              margin={{ left: 110, right: 16, top: 8, bottom: 24 }}
              slotProps={{ legend: { hidden: true } }}
            />
          </ChartCard>
        </Grid>
      </Grid>

      {/* ---- Recent activity + quick actions ---- */}
      <Grid container spacing={2}>
        <Grid item xs={12} md={8}>
          <Card>
            <Box sx={{ px: 2.25, pt: 2, pb: 1, display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="subtitle1">Recent activity</Typography>
              <Button size="small" onClick={() => router.push('/audit')}>
                View all
              </Button>
            </Box>
            <Divider />
            {activity.isLoading ? (
              <Box sx={{ p: 2 }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} height={32} />
                ))}
              </Box>
            ) : (activity.data?.data?.length ?? 0) === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
                No recent activity.
              </Typography>
            ) : (
              <List dense disablePadding>
                {activity.data?.data?.map((row) => (
                  <ListItem key={row.id} divider sx={{ px: 2.25 }}>
                    <ListItemIcon sx={{ minWidth: 26 }}>
                      <CircleIcon sx={{ fontSize: 8, color: 'primary.main' }} />
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Typography variant="body2">
                          <b>{row.actorName ?? 'System'}</b>{' '}
                          {ACTIVITY_LABELS[row.action] ??
                            row.action.replace(/_/g, ' ').toLowerCase()}
                          {row.entityName ? (
                            <>
                              {' — '}
                              <Typography component="span" variant="body2" color="text.secondary">
                                {row.entityName}
                              </Typography>
                            </>
                          ) : null}
                        </Typography>
                      }
                      secondary={new Date(row.createdAt).toLocaleString(undefined, {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <Box sx={{ px: 2.25, pt: 2, pb: 1 }}>
              <Typography variant="subtitle1">Quick actions</Typography>
            </Box>
            <Divider />
            <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25 }}>
              {quickActions.map((a) => (
                <Button
                  key={a.label}
                  variant="outlined"
                  color="inherit"
                  startIcon={a.icon}
                  onClick={() => router.push(a.href)}
                  sx={{
                    justifyContent: 'flex-start',
                    borderColor: 'divider',
                    color: 'text.primary',
                    py: 1.1,
                    '&:hover': { borderColor: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.04) },
                  }}
                >
                  {a.label}
                </Button>
              ))}
            </Box>
          </Card>
        </Grid>
      </Grid>
    </>
  );
}
