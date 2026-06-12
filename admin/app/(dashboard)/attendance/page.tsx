'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  Chip,
  Grid,
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
import { api } from '@/lib/api/browser';
import { PageHeader } from '@/components/PageHeader';
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

export default function AttendancePage() {
  const [siteId, setSiteId] = React.useState('all');
  const [missedView, setMissedView] = React.useState(false);
  React.useEffect(() => {
    setMissedView(new URLSearchParams(window.location.search).get('view') === 'missed');
  }, []);
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => api.get<Site[]>('/sites') });

  const stats = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get<DashboardStats>('/attendance/dashboard-stats'),
    enabled: missedView,
  });

  const active = useQuery({
    queryKey: ['active', siteId],
    queryFn: () => api.get<ActiveSession[]>(`/attendance/active?siteId=${siteId}`),
    refetchInterval: 15000,
  });

  const summary = useQuery({
    queryKey: ['day-summary', siteId],
    queryFn: () => api.get<DaySummary>(`/attendance/day-summary?siteId=${siteId}`),
    refetchInterval: 30000,
  });

  return (
    <>
      <PageHeader title="Attendance" subtitle="Today's headcount and live open sessions" />
      <Stack direction="row" sx={{ mb: 2 }}>
        <TextField
          select
          size="small"
          label="Site"
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          sx={{ width: 280 }}
        >
          <MenuItem value="all">All sites</MenuItem>
          {sites.data?.map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {s.name}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {/* Today's logins by designation */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={6} sm={4} md={2}>
          <Card>
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                Logged in today
              </Typography>
              <Typography variant="h4">{summary.data?.total ?? '—'}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <Card>
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                On site now
              </Typography>
              <Typography variant="h4">{summary.data?.activeNow ?? '—'}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={8}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary" gutterBottom>
                By designation (today{siteId === 'all' ? ', all sites' : ''})
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                {summary.data?.byDesignation.map((d) => (
                  <Chip
                    key={d.designation}
                    label={`${d.designation}: ${d.count} (${d.active} on site)`}
                    size="small"
                  />
                ))}
                {summary.data && summary.data.byDesignation.length === 0 && (
                  <Typography variant="body2" color="text.secondary">
                    No logins recorded today.
                  </Typography>
                )}
              </Stack>
              {summary.data && summary.data.byCategory.length > 1 && (
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                  {summary.data.byCategory.map((c) => (
                    <Chip
                      key={c.category}
                      color="primary"
                      variant="outlined"
                      label={`${c.category}: ${c.count}`}
                      size="small"
                    />
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {missedView && (
        <Card sx={{ mb: 2, borderLeft: '4px solid', borderColor: 'warning.main' }}>
          <CardContent>
            <Typography variant="subtitle1" gutterBottom>
              Missed logouts — {stats.data?.missedLogout.date ?? 'yesterday'}
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              These people logged in but never logged out; their sessions were auto-closed.
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Code</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Site</TableCell>
                  <TableCell>Logged in at</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {Object.entries(stats.data?.missedLogout.byCategory ?? {}).flatMap(
                  ([category, bucket]) =>
                    bucket.people.map((p) => (
                      <TableRow key={`${category}-${p.workerCode}`} hover>
                        <TableCell>{p.fullName}</TableCell>
                        <TableCell>{p.workerCode}</TableCell>
                        <TableCell>{category}</TableCell>
                        <TableCell>{p.siteName ?? '—'}</TableCell>
                        <TableCell>{new Date(p.loginAt).toLocaleString()}</TableCell>
                      </TableRow>
                    )),
                )}
                {stats.data && stats.data.missedLogout.total === 0 && (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Typography color="text.secondary">
                        Everyone logged out properly. 🎉
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Code</TableCell>
              <TableCell>Designation</TableCell>
              <TableCell>Vendor</TableCell>
              {siteId === 'all' && <TableCell>Site</TableCell>}
              <TableCell>Logged in at</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {active.data?.map((s) => (
              <TableRow key={s.id} hover>
                <TableCell>{s.worker.fullName}</TableCell>
                <TableCell>{s.worker.workerCode}</TableCell>
                <TableCell>{s.worker.designation?.name ?? '—'}</TableCell>
                <TableCell>{s.worker.vendor?.name ?? '—'}</TableCell>
                {siteId === 'all' && <TableCell>{s.site?.name ?? '—'}</TableCell>}
                <TableCell>{new Date(s.loginAt).toLocaleString()}</TableCell>
              </TableRow>
            ))}
            {active.data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={siteId === 'all' ? 6 : 5}>
                  <Typography color="text.secondary">No open sessions.</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
