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
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Skeleton,
  Stack,
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
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import AddLocationAltOutlinedIcon from '@mui/icons-material/AddLocationAltOutlined';
import PlaylistAddCheckOutlinedIcon from '@mui/icons-material/PlaylistAddCheckOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import DevicesOutlinedIcon from '@mui/icons-material/DevicesOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import CircleIcon from '@mui/icons-material/Circle';
import { api } from '@/lib/api/browser';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { ChartCard } from '@/components/ui/ChartCard';
import { VendorMonthlyChart } from '@/components/charts/VendorMonthlyChart';
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
interface DashboardCharts {
  trend: { date: string; sessions: number; missed: number }[];
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

export default function DashboardPage() {
  const router = useRouter();
  const theme = useTheme();
  const [missedDismissed, setMissedDismissed] = React.useState(false);

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
    queryKey: ['dashboard-charts'],
    queryFn: () => api.get<DashboardCharts>('/attendance/dashboard-charts'),
    refetchInterval: 60000,
  });
  const storage = useQuery({
    queryKey: ['storage-usage'],
    queryFn: () => api.get<StorageUsageLite>('/storage/usage'),
    refetchInterval: 120000,
  });
  const activity = useQuery({
    queryKey: ['recent-activity'],
    queryFn: () => api.get<Paginated<AuditRow>>('/audit?limit=8'),
    refetchInterval: 60000,
  });

  const on = stats.data?.onSiteNow;
  const missed = stats.data?.missedLogout;
  const cat = (b?: Record<string, StatBucket>, key?: string) => (key && b ? b[key] : undefined);
  const storageLevel = storage.data?.level;
  const storagePct =
    storage.data?.usedPercent != null ? Math.round(storage.data.usedPercent * 100) : null;

  const trend = charts.data?.trend ?? [];
  const chartPalette = [theme.palette.primary.main, theme.palette.warning.main];
  const pieColors = [
    theme.palette.primary.main,
    theme.palette.info.main,
    theme.palette.warning.main,
  ];

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
      </Grid>

      {/* ---- Vendor-wise month ---- */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12}>
          <VendorMonthlyChart />
        </Grid>
      </Grid>

      {/* ---- Charts row 1 ---- */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={8}>
          <ChartCard
            title="Attendance — last 7 days"
            subtitle="Sessions per day, with missed logouts"
            loading={charts.isLoading}
            empty={!charts.isLoading && trend.every((t) => t.sessions === 0 && t.missed === 0)}
            emptyText="No attendance recorded in the last 7 days"
          >
            <LineChart
              height={260}
              series={[
                {
                  data: trend.map((t) => t.sessions),
                  label: 'Sessions',
                  color: chartPalette[0],
                  curve: 'monotoneX',
                  area: true,
                },
                {
                  data: trend.map((t) => t.missed),
                  label: 'Missed logouts',
                  color: chartPalette[1],
                  curve: 'monotoneX',
                },
              ]}
              xAxis={[
                {
                  scaleType: 'point',
                  data: trend.map((t) =>
                    new Date(t.date).toLocaleDateString(undefined, {
                      weekday: 'short',
                      day: 'numeric',
                    }),
                  ),
                },
              ]}
              sx={{
                '& .MuiAreaElement-root': { fill: alpha(chartPalette[0], 0.12) },
              }}
              margin={{ left: 40, right: 16, top: 24, bottom: 24 }}
              slotProps={{ legend: { hidden: false } }}
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
