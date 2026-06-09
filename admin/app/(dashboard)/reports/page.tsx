'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Button,
  Card,
  CardContent,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useForm } from 'react-hook-form';
import { api } from '@/lib/api/browser';
import { PageHeader } from '@/components/PageHeader';

interface ReportForm {
  reportType: string;
  format: string;
  month?: string;
  date?: string;
}

interface ReportResult {
  jobId: string;
  status: string;
  content?: string;
  rowCount?: number;
}

export default function ReportsPage() {
  const { register, handleSubmit } = useForm<ReportForm>({
    defaultValues: { reportType: 'MONTHLY', format: 'CSV' },
  });

  const run = useMutation({
    mutationFn: (v: ReportForm) =>
      api.post<ReportResult>('/reports', {
        reportType: v.reportType,
        format: v.format,
        params: { month: v.month, date: v.date },
      }),
    onSuccess: (res) => {
      if (res.content) {
        const blob = new Blob([res.content], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `report-${res.jobId}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    },
  });

  return (
    <>
      <PageHeader title="Reports" subtitle="Generate attendance, overtime and correction reports" />
      <Card>
        <CardContent>
          <form onSubmit={handleSubmit((v) => run.mutate(v))}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={3}>
                <TextField select label="Report type" fullWidth defaultValue="MONTHLY" {...register('reportType')}>
                  {['DAILY', 'MONTHLY', 'WORKER', 'VENDOR', 'SITE', 'OVERTIME', 'CORRECTION'].map((t) => (
                    <MenuItem key={t} value={t}>
                      {t}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} md={2}>
                <TextField select label="Format" fullWidth defaultValue="CSV" {...register('format')}>
                  {['CSV', 'XLSX', 'PDF'].map((f) => (
                    <MenuItem key={f} value={f}>
                      {f}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField label="Month (YYYY-MM)" fullWidth {...register('month')} />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField label="Date (YYYY-MM-DD)" fullWidth {...register('date')} />
              </Grid>
              <Grid item xs={12} md={1}>
                <Button type="submit" variant="contained" disabled={run.isPending}>
                  Run
                </Button>
              </Grid>
            </Grid>
          </form>
          {run.data && (
            <Typography variant="body2" sx={{ mt: 2 }} color="text.secondary">
              Job {run.data.jobId} — {run.data.status}
              {run.data.rowCount != null ? ` (${run.data.rowCount} rows, downloaded)` : ''}
            </Typography>
          )}
        </CardContent>
      </Card>
    </>
  );
}
