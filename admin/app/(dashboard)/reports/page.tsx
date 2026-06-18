'use client';

import * as React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  CardContent,
  FormControlLabel,
  Grid,
  MenuItem,
  Stack,
  Switch,
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
import { Site, Vendor } from '@/lib/types';

const REPORT_TYPES = [
  'DAILY',
  'MONTHLY',
  'WORKER',
  'VENDOR',
  'SITE',
  'OVERTIME',
  'CORRECTION',
  'ATTENDANCE_SHEET',
];
const REPORT_TYPE_LABELS: Record<string, string> = {
  ATTENDANCE_SHEET: 'Attendance sheet',
};
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
  contentBase64?: string;
  contentType?: string;
  filename?: string;
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
  const [vendorId, setVendorId] = React.useState('');
  const [siteId, setSiteId] = React.useState('');
  const [category, setCategory] = React.useState('');
  const [sortByVendor, setSortByVendor] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const vendors = useQuery({ queryKey: ['vendors'], queryFn: () => api.get<Vendor[]>('/vendors') });
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => api.get<Site[]>('/sites') });

  const showAttSheet = reportType === 'ATTENDANCE_SHEET';
  const showMonth = reportType === 'MONTHLY';
  const showDate = reportType === 'DAILY';
  const showRange = !showMonth && !showDate && !showAttSheet && reportType !== 'CORRECTION';
  const showVendorTools = reportType !== 'CORRECTION';

  const buildParams = (): Record<string, unknown> => {
    const params: Record<string, unknown> = {};
    if (showMonth && month) params.month = month.format('YYYY-MM');
    if (showDate && date) params.date = date.format('YYYY-MM-DD');
    if (showRange) {
      if (from) params.from = from.toISOString();
      if (to) params.to = to.toISOString();
    }
    // Attendance sheet: a plain date range (covers a few days or several months).
    if (showAttSheet) {
      if (from) params.from = from.format('YYYY-MM-DD');
      if (to) params.to = to.format('YYYY-MM-DD');
    }
    if (showVendorTools && vendorId) params.vendorId = vendorId;
    if (siteId) params.siteId = siteId;
    if (showVendorTools && category) params.category = category;
    if (showVendorTools && sortByVendor) params.sortBy = 'vendor';
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
      let blob: Blob | null = null;
      if (res.content) {
        blob = new Blob([res.content], { type: res.contentType ?? 'text/csv' });
      } else if (res.contentBase64) {
        const bytes = Uint8Array.from(atob(res.contentBase64), (c) => c.charCodeAt(0));
        blob = new Blob([bytes], { type: res.contentType ?? 'application/octet-stream' });
      }
      if (!blob) {
        setError('Report generated but no content was returned.');
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        res.filename ?? `report-${reportType.toLowerCase()}-${res.jobId}.${format.toLowerCase()}`;
      a.click();
      URL.revokeObjectURL(url);
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
                  const t = e.target.value;
                  setReportType(t);
                  // The muster-roll grid is meant for spreadsheets — default to XLSX.
                  if (t === 'ATTENDANCE_SHEET') setFormat('XLSX');
                  preview.reset();
                }}
              >
                {REPORT_TYPES.map((t) => (
                  <MenuItem key={t} value={t}>
                    {REPORT_TYPE_LABELS[t] ?? t}
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
            {showAttSheet && (
              <>
                <Grid item xs={12} md={3}>
                  <DatePicker
                    label="From date"
                    value={from}
                    onChange={setFrom}
                    slotProps={{ textField: { fullWidth: true } }}
                  />
                </Grid>
                <Grid item xs={12} md={3}>
                  <DatePicker
                    label="To date"
                    value={to}
                    onChange={setTo}
                    slotProps={{ textField: { fullWidth: true } }}
                  />
                </Grid>
              </>
            )}
            <Grid item xs={12} md={3}>
              <TextField
                select
                label="Site (optional)"
                fullWidth
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
              >
                <MenuItem value="">All sites</MenuItem>
                {sites.data?.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.name}
                    {s.isActive ? '' : ' (disabled)'}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            {showVendorTools && (
              <Grid item xs={12} md={3}>
                <TextField
                  select
                  label="Vendor (optional)"
                  fullWidth
                  value={vendorId}
                  onChange={(e) => setVendorId(e.target.value)}
                >
                  <MenuItem value="">All vendors</MenuItem>
                  {vendors.data?.map((v) => (
                    <MenuItem key={v.id} value={v.id}>
                      {v.name}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
            )}
            {showVendorTools && (
              <Grid item xs={12} md={3}>
                <TextField
                  select
                  label="Person type"
                  fullWidth
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <MenuItem value="">All people</MenuItem>
                  <MenuItem value="WORKER">Workers only</MenuItem>
                  <MenuItem value="STAFF">Staff only</MenuItem>
                  <MenuItem value="VISITOR">Visitors only</MenuItem>
                </TextField>
              </Grid>
            )}
            {showVendorTools && (
              <Grid item xs={12} md={2}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={sortByVendor}
                      onChange={(e) => setSortByVendor(e.target.checked)}
                    />
                  }
                  label="Sort by vendor"
                />
              </Grid>
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
            {data.rowCount === 0 ? (
              <Typography color="text.secondary">
                No rows matched the selected period — nothing to download.
              </Typography>
            ) : (
              <Card variant="outlined" sx={{ maxWidth: '100%', overflowX: 'auto' }}>
                <Table size="small" sx={{ minWidth: 'max-content' }}>
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
