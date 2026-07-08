'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  LinearProgress,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import { api } from '@/lib/api/browser';
import { PageHeader } from '@/components/PageHeader';
import { FilterBar } from '@/components/ui/FilterBar';
import { DataTable, Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DaySummary, Site } from '@/lib/types';

interface ActiveSession {
  id: string;
  loginAt: string;
  worker: {
    id: string;
    fullName: string;
    workerCode: string;
    category?: string;
    designation?: { name: string } | null;
    vendor?: { name: string } | null;
  };
  site?: { id: string; name: string } | null;
}

interface StatPerson {
  fullName: string;
  workerCode: string;
  siteName: string | null;
  loginAt: string;
}

interface DashboardStats {
  onSiteNow: { total: number; byCategory: Record<string, { count: number; people: StatPerson[] }> };
  missedLogout: {
    date: string;
    total: number;
    byCategory: Record<string, { count: number; people: StatPerson[] }>;
  };
}

const CATEGORIES = [
  { value: 'all', label: 'Everyone' },
  { value: 'WORKER', label: 'Workers' },
  { value: 'STAFF', label: 'Staff' },
  { value: 'VISITOR', label: 'Visitors' },
];

const CATEGORY_LABEL: Record<string, string> = {
  WORKER: 'Workers',
  STAFF: 'Staff',
  VISITOR: 'Visitors',
};

/** "8 Jul, 07:42 AM" — compact, unambiguous login/logout time. */
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Kpi({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h4" sx={{ mt: 0.5, color }}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}

/** Small "Group | total | on site" breakdown table used for designation & vendor. */
function Breakdown({
  title,
  groupHeader,
  rows,
}: {
  title: string;
  groupHeader: string;
  rows: { name: string; count: number; active: number }[];
}) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="subtitle2" gutterBottom>
          {title}
        </Typography>
        {rows.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No logins recorded today.
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{groupHeader}</TableCell>
                <TableCell align="right">Logged in</TableCell>
                <TableCell align="right">On site now</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.name} hover>
                  <TableCell>{r.name}</TableCell>
                  <TableCell align="right">{r.count}</TableCell>
                  <TableCell align="right">
                    <StatusBadge label={String(r.active)} tone={r.active > 0 ? 'success' : 'neutral'} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

type MissedRow = StatPerson & { category: string };

export default function AttendancePage() {
  const [siteId, setSiteId] = React.useState('all');
  const [category, setCategory] = React.useState('all');
  const [missedView, setMissedView] = React.useState(false);

  // Pick up ?view=missed and ?category=… handed over from the dashboard cards.
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setMissedView(params.get('view') === 'missed');
    const cat = params.get('category');
    if (cat && ['WORKER', 'STAFF', 'VISITOR'].includes(cat)) setCategory(cat);
  }, []);

  const sites = useQuery({ queryKey: ['sites'], queryFn: () => api.get<Site[]>('/sites') });

  const stats = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get<DashboardStats>('/attendance/dashboard-stats'),
    enabled: missedView,
  });

  const qs = (extra = '') =>
    `?siteId=${siteId}${category !== 'all' ? `&category=${category}` : ''}${extra}`;

  const active = useQuery({
    queryKey: ['active', siteId, category],
    queryFn: () => api.get<ActiveSession[]>(`/attendance/active${qs()}`),
    refetchInterval: 15000,
  });

  const summary = useQuery({
    queryKey: ['day-summary', siteId, category],
    queryFn: () => api.get<DaySummary>(`/attendance/day-summary${qs()}`),
    refetchInterval: 30000,
  });

  const siteLabel =
    siteId === 'all' ? 'All sites' : (sites.data?.find((s) => s.id === siteId)?.name ?? 'Selected site');
  const catLabel = category === 'all' ? 'people' : CATEGORY_LABEL[category].toLowerCase();
  const total = summary.data?.total ?? 0;
  const activeNow = summary.data?.activeNow ?? 0;
  const onSitePct = total > 0 ? Math.round((activeNow / total) * 100) : 0;

  // Missed-logout rows, honouring the category filter (dashboard-stats is grouped by category).
  const missedRows = React.useMemo<MissedRow[]>(() => {
    const byCat = stats.data?.missedLogout.byCategory ?? {};
    return Object.entries(byCat)
      .filter(([cat]) => category === 'all' || cat === category)
      .flatMap(([cat, bucket]) => bucket.people.map((p) => ({ ...p, category: cat })));
  }, [stats.data, category]);

  const isLoading = active.isLoading || summary.isLoading;

  const missedColumns: Column<MissedRow>[] = [
    { key: 'name', label: 'Name', render: (p) => p.fullName },
    { key: 'code', label: 'Code', render: (p) => p.workerCode },
    {
      key: 'category',
      label: 'Category',
      render: (p) => CATEGORY_LABEL[p.category] ?? p.category,
    },
    { key: 'site', label: 'Site', render: (p) => p.siteName ?? '—' },
    {
      key: 'loginAt',
      label: 'Logged in at',
      render: (p) => (
        <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
          {fmtTime(p.loginAt)}
        </Typography>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: () => <StatusBadge label="Missed logout" tone="warning" />,
    },
  ];

  const activeColumns: Column<ActiveSession>[] = [
    { key: 'name', label: 'Name', render: (s) => s.worker.fullName },
    { key: 'code', label: 'Code', render: (s) => s.worker.workerCode },
    {
      key: 'category',
      label: 'Category',
      render: (s) => CATEGORY_LABEL[s.worker.category ?? ''] ?? s.worker.category ?? '—',
    },
    { key: 'designation', label: 'Designation', render: (s) => s.worker.designation?.name ?? '—' },
    { key: 'vendor', label: 'Vendor', render: (s) => s.worker.vendor?.name ?? '—' },
    ...(siteId === 'all'
      ? [{ key: 'site', label: 'Site', render: (s: ActiveSession) => s.site?.name ?? '—' } as Column<ActiveSession>]
      : []),
    {
      key: 'loginAt',
      label: 'Logged in at',
      render: (s) => (
        <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
          {fmtTime(s.loginAt)}
        </Typography>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: () => <StatusBadge label="On site" tone="success" />,
    },
  ];

  return (
    <>
      <PageHeader title="Attendance" subtitle="Today's headcount, breakdowns and live open sessions" />

      <FilterBar>
        <TextField
          select
          size="small"
          label="Site"
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          sx={{ width: 240 }}
        >
          <MenuItem value="all">All sites</MenuItem>
          {sites.data?.map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {s.name}
              {s.isActive ? '' : ' (disabled)'}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          sx={{ width: 200 }}
        >
          {CATEGORIES.map((c) => (
            <MenuItem key={c.value} value={c.value}>
              {c.label}
            </MenuItem>
          ))}
        </TextField>
        <Button
          variant="outlined"
          startIcon={<PrintIcon />}
          onClick={() => window.print()}
          sx={{ ml: 'auto' }}
        >
          Print
        </Button>
      </FilterBar>

      {isLoading && <LinearProgress sx={{ mb: 2 }} />}

      <Box className="print-area">
        {/* Print-only header — hidden on screen, shown on the printout. */}
        <Box sx={{ display: 'none', '@media print': { display: 'block', mb: 2 } }}>
          <Typography variant="h6">Attendance — {siteLabel}</Typography>
          <Typography variant="caption" color="text.secondary">
            {category === 'all' ? 'Everyone' : CATEGORY_LABEL[category]}
            {missedView ? ' · Missed logouts' : ''} · Printed {new Date().toLocaleString()}
          </Typography>
        </Box>

      {/* Headline numbers */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={6} md={3}>
          <Kpi label={`Logged in today (${catLabel})`} value={summary.data ? total : '—'} />
        </Grid>
        <Grid item xs={6} md={3}>
          <Kpi
            label="On site right now"
            value={summary.data ? activeNow : '—'}
            color="success.main"
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                By category (logged in today)
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                {summary.data?.byCategory.map((c) => (
                  <Chip
                    key={c.category}
                    color="primary"
                    variant="outlined"
                    label={`${CATEGORY_LABEL[c.category] ?? c.category}: ${c.count} (${c.active} on site)`}
                  />
                ))}
                {summary.data && summary.data.byCategory.length === 0 && (
                  <Typography variant="body2" color="text.secondary">
                    No logins recorded today.
                  </Typography>
                )}
              </Stack>
              {total > 0 && (
                <>
                  <Divider sx={{ my: 1.5 }} />
                  <Typography variant="caption" color="text.secondary">
                    {activeNow} of {total} still on site ({onSitePct}%)
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={onSitePct}
                    color="success"
                    sx={{ mt: 0.5, height: 8, borderRadius: 1 }}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Breakdowns: by designation + by vendor */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={6}>
          <Breakdown
            title="By designation (today)"
            groupHeader="Designation"
            rows={(summary.data?.byDesignation ?? []).map((d) => ({
              name: d.designation,
              count: d.count,
              active: d.active,
            }))}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <Breakdown
            title="By vendor / contractor (today)"
            groupHeader="Vendor"
            rows={(summary.data?.byVendor ?? []).map((v) => ({
              name: v.vendor,
              count: v.count,
              active: v.active,
            }))}
          />
        </Grid>
      </Grid>

      {missedView && (
        <Box sx={{ mb: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.25 }}>
            <ReportProblemOutlinedIcon fontSize="small" color="warning" />
            <Typography variant="subtitle1">
              Missed logouts — {stats.data?.missedLogout.date ?? 'yesterday'}
              {category !== 'all' ? ` (${CATEGORY_LABEL[category]})` : ''}
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            These people logged in but never logged out; their sessions were auto-closed.
          </Typography>
          <DataTable
            columns={missedColumns}
            rows={missedRows}
            loading={stats.isLoading}
            rowKey={(p) => `${p.category}-${p.workerCode}`}
            emptyTitle="Everyone logged out properly"
            emptyDescription="No missed logouts for this day."
          />
        </Box>
      )}

      {/* Live open sessions */}
      <Box>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.25 }}>
          <GroupsOutlinedIcon fontSize="small" color="primary" />
          <Typography variant="subtitle1">On site now ({active.data?.length ?? 0})</Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
          Open sessions, refreshing every 15s
        </Typography>
        <DataTable
          columns={activeColumns}
          rows={active.data}
          loading={active.isLoading}
          rowKey={(s) => s.id}
          emptyTitle="No open sessions"
          emptyDescription="No one is logged in on the selected site right now."
        />
      </Box>
      </Box>
    </>
  );
}
