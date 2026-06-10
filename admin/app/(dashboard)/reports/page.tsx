'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  CardContent,
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
import DownloadIcon from '@mui/icons-material/Download';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import dayjs, { Dayjs } from 'dayjs';
import { api, BrowserApiError } from '@/lib/api/browser';
import { PageHeader } from '@/components/PageHeader';

const REPORT_TYPES = ['DAILY', 'MONTHLY', 'WORKER', 'VENDOR', 'SITE', 'OVERTIME', 'CORRECTION'];
const PREVIEW_LIMIT = 500;

interface PreviewResult {
  headers: string[];
  rows: (string | number | null)[][];
  rowCount: number;
}

interface ReportResult {
  jobId: string;
  status: string;
  content?: string;
  rowCount?: number;
}

/** Render ISO timestamps from the API as readable local date-times. */
function cell(header: string, value: string | number | null): string {
  if (value == null || value === '') return '—';
  if ((header === 'Login' || header === 'Logout' || header === 'Reviewed At') && typeof value === 'string') {
    const d = dayjs(value);
    if (d.isValid()) return d.format('DD MMM YYYY, hh:mm A');
  }
  return String(value);
}

export default function ReportsPage() {
  const [reportType, setReportType] = React.useState('MONTHLY');
  const [format, setFormat] = React.useState('CSV');
  const [month, setMonth] = React.useState<Dayjs | null>(dayjs());
  const [date, setDate] = React.useState<Dayjs | null>(dayjs());
  const [from, setFrom] = React.useState<Dayjs | null>(dayjs().startOf('month'));
  const [to, setTo] = React.useState<Dayjs | null>(dayjs().endOf('day'));
  const [error, setError] = React.useState<string | null>(null);

  const showMonth = reportType === 'MONTHLY';
  const showDate = reportType === 'DAILY';
  const showRange = !showMonth && !showDate && reportType !== 'CORRECTION';

  const buildParams = (): Record<string, unknown> => {
    const params: Record<string, unknown> = {};
    if (showMonth && month) params.month = month.format('YYYY-MM');
    if (showDate && date) params.date = date.format('YYYY-MM-DD');
    if (showRange) {
      if (from) params.from = from.toISOString();
      if (to) params.to = to.toISOString();
    }
    return params;
  };

  const preview = useMutation({
    mutationFn: () =>
      api.post<PreviewResult>('/reports/preview', { reportType, params: buildParams() }),
    onSuccess: () => setError(null),
    onError: (e) => {
      const err = e as BrowserApiError;
      setError(err.body?.detail ?? err.body?.title ?? 'Failed to run report');
    },
  });

  const download = useMutation({
    mutationFn: () =>
      api.post<ReportResult>('/reports', { reportType, format, params: buildParams() }),
    onSuccess: (res) => {
      setError(null);
      if (res.content) {
        const blob = new Blob([res.content], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `report-${reportType.toLowerCase()}-${res.jobId}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    },
    onError: (e) => {
      const err = e as BrowserApiError;
      setError(err.body?.detail ?? err.body?.title ?? 'Failed to generate report');
    },
  });

  const data = preview.data;

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <PageHeader title="Reports" subtitle="Generate attendance, overtime and correction reports" />
      <Card>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={3}>
              <TextField
                select
                label="Report type"
                fullWidth
                value={reportType}
                onChange={(e) => {
                  setReportType(e.target.value);
                  preview.reset();
                }}
              >
                {REPORT_TYPES.map((t) => (
                  <MenuItem key={t} value={t}>
                    {t}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            {showMonth && (
              <Grid item xs={12} md={3}>
                <DatePicker
                  label="Month"
                  views={['year', 'month']}
                  value={month}
                  onChange={setMonth}
                  slotProps={{ textField: { fullWidth: true } }}
                />
              </Grid>
            )}
            {showDate && (
              <Grid item xs={12} md={3}>
                <DatePicker
                  label="Date"
                  value={date}
                  onChange={setDate}
                  slotProps={{ textField: { fullWidth: true } }}
                />
              </Grid>
            )}
            {showRange && (
              <>
                <Grid item xs={12} md={3}>
                  <DateTimePicker
                    label="Start date & time"
                    value={from}
                    onChange={setFrom}
                    slotProps={{ textField: { fullWidth: true } }}
                  />
                </Grid>
                <Grid item xs={12} md={3}>
                  <DateTimePicker
                    label="End date & time"
                    value={to}
                    onChange={setTo}
                    slotProps={{ textField: { fullWidth: true } }}
                  />
                </Grid>
              </>
            )}
            <Grid item xs={12} md={2}>
              <Button
                variant="contained"
                startIcon={<PlayArrowIcon />}
                disabled={preview.isPending}
                onClick={() => preview.mutate()}
              >
                Run report
              </Button>
            </Grid>
          </Grid>
          {error && (
            <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
        </CardContent>
      </Card>

      {data && (
        <Card sx={{ mt: 3 }}>
          <CardContent>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              justifyContent="space-between"
              alignItems={{ sm: 'center' }}
              spacing={2}
              sx={{ mb: 2 }}
            >
              <Typography variant="h6">
                Preview — {data.rowCount} row{data.rowCount === 1 ? '' : 's'}
                {data.rowCount > PREVIEW_LIMIT ? ` (showing first ${PREVIEW_LIMIT})` : ''}
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <TextField
                  select
                  size="small"
                  label="Format"
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  sx={{ width: 120 }}
                >
                  {['CSV', 'XLSX', 'PDF'].map((f) => (
                    <MenuItem key={f} value={f}>
                      {f}
                    </MenuItem>
                  ))}
                </TextField>
                <Button
                  variant="contained"
                  startIcon={<DownloadIcon />}
                  disabled={download.isPending || data.rowCount === 0}
                  onClick={() => download.mutate()}
                >
                  Download
                </Button>
              </Stack>
            </Stack>
            {download.data && !download.data.content && (
              <Alert severity="info" sx={{ mb: 2 }}>
                {download.data.status === 'QUEUED'
                  ? `${format} report queued (job ${download.data.jobId}) — it will be available shortly.`
                  : `Job ${download.data.jobId} — ${download.data.status}`}
              </Alert>
            )}
            {data.rowCount === 0 ? (
              <Typography color="text.secondary">
                No rows matched the selected period — nothing to download.
              </Typography>
            ) : (
              <Card variant="outlined" sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      {data.headers.map((h) => (
                        <TableCell key={h} sx={{ fontWeight: 600 }}>
                          {h}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.rows.slice(0, PREVIEW_LIMIT).map((row, i) => (
                      <TableRow key={i} hover>
                        {row.map((v, j) => (
                          <TableCell key={j}>{cell(data.headers[j], v)}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </CardContent>
        </Card>
      )}
    </LocalizationProvider>
  );
}
