'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Box, Button, Card, CardContent, Divider, Grid, Tooltip, Typography } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { api } from '@/lib/api/browser';
import { PageHeader } from '@/components/PageHeader';
import { CorrectionRequest, Site } from '@/lib/types';

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
          …and {bucket.count - shown.length} more — click the card for the full list
        </Typography>
      )}
    </Box>
  );
}

function Kpi({
  label,
  value,
  tooltip,
  href,
}: {
  label: string;
  value: React.ReactNode;
  tooltip?: React.ReactNode;
  href?: string;
}) {
  const router = useRouter();
  const card = (
    <Card
      sx={
        href
          ? { cursor: 'pointer', height: '100%', '&:hover': { boxShadow: 4 } }
          : { height: '100%' }
      }
      onClick={href ? () => router.push(href) : undefined}
    >
      <CardContent>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h4" sx={{ mt: 1 }}>
          {value}
        </Typography>
        {href && (
          <Button
            size="small"
            endIcon={<ArrowForwardIcon />}
            sx={{ mt: 1, px: 0 }}
            onClick={(e) => {
              e.stopPropagation();
              router.push(href);
            }}
          >
            View details
          </Button>
        )}
      </CardContent>
    </Card>
  );
  return tooltip ? (
    <Tooltip title={tooltip} arrow placement="bottom-start">
      {card}
    </Tooltip>
  ) : (
    card
  );
}

export default function DashboardPage() {
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

  const on = stats.data?.onSiteNow;
  const missed = stats.data?.missedLogout;
  const cat = (b?: Record<string, StatBucket>, key?: string) => (key && b ? b[key] : undefined);

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Overview of attendance operations" />

      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        On site right now
      </Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Kpi
            label="Workers logged in"
            value={cat(on?.byCategory, 'WORKER')?.count ?? (stats.data ? 0 : '—')}
            tooltip={<PeopleTooltip title="Workers on site now" bucket={cat(on?.byCategory, 'WORKER')} />}
            href="/attendance"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Kpi
            label="Staff logged in"
            value={cat(on?.byCategory, 'STAFF')?.count ?? (stats.data ? 0 : '—')}
            tooltip={<PeopleTooltip title="Staff on site now" bucket={cat(on?.byCategory, 'STAFF')} />}
            href="/attendance"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Kpi
            label="Visitors logged in"
            value={cat(on?.byCategory, 'VISITOR')?.count ?? (stats.data ? 0 : '—')}
            tooltip={<PeopleTooltip title="Visitors on site now" bucket={cat(on?.byCategory, 'VISITOR')} />}
            href="/attendance"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Kpi
            label="Total on site"
            value={on?.total ?? '—'}
            tooltip="Everyone with an open session right now, across all categories."
            href="/attendance"
          />
        </Grid>
      </Grid>

      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        Missed logout {missed ? `(${missed.date})` : '(yesterday)'}
      </Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Kpi
            label="Workers didn't logout"
            value={cat(missed?.byCategory, 'WORKER')?.count ?? (stats.data ? 0 : '—')}
            tooltip={
              <PeopleTooltip
                title={`Workers who didn't logout (${missed?.date ?? 'yesterday'})`}
                bucket={cat(missed?.byCategory, 'WORKER')}
              />
            }
            href="/attendance?view=missed"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Kpi
            label="Staff didn't logout"
            value={cat(missed?.byCategory, 'STAFF')?.count ?? (stats.data ? 0 : '—')}
            tooltip={
              <PeopleTooltip
                title={`Staff who didn't logout (${missed?.date ?? 'yesterday'})`}
                bucket={cat(missed?.byCategory, 'STAFF')}
              />
            }
            href="/attendance?view=missed"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Kpi
            label="Total missed logouts"
            value={missed?.total ?? '—'}
            tooltip="Sessions auto-closed because no logout tap was ever recorded."
            href="/attendance?view=missed"
          />
        </Grid>
      </Grid>

      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        Operations
      </Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}>
          <Kpi
            label="Active sites"
            value={sites.data?.filter((s) => s.isActive).length ?? '—'}
            tooltip={
              sites.data
                ? sites.data
                    .filter((s) => s.isActive)
                    .map((s) => s.name)
                    .join(', ') || 'No active sites'
                : undefined
            }
            href="/sites"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Kpi
            label="Total sites"
            value={sites.data?.length ?? '—'}
            tooltip="All sites including disabled/finished ones."
            href="/sites"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Kpi
            label="Pending corrections"
            value={pending.data?.length ?? '—'}
            tooltip="Attendance correction requests awaiting review."
            href="/corrections"
          />
        </Grid>
      </Grid>
    </>
  );
}
