'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, Grid, Typography } from '@mui/material';
import { api } from '@/lib/api/browser';
import { PageHeader } from '@/components/PageHeader';
import { CorrectionRequest, Site } from '@/lib/types';

function Kpi({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h4" sx={{ mt: 1 }}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => api.get<Site[]>('/sites') });
  const pending = useQuery({
    queryKey: ['corrections', 'PENDING'],
    queryFn: () => api.get<CorrectionRequest[]>('/corrections?status=PENDING'),
  });

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Overview of attendance operations" />
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}>
          <Kpi label="Active sites" value={sites.data?.filter((s) => s.isActive).length ?? '—'} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Kpi label="Total sites" value={sites.data?.length ?? '—'} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Kpi label="Pending corrections" value={pending.data?.length ?? '—'} />
        </Grid>
      </Grid>
    </>
  );
}
