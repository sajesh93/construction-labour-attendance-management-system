'use client';

import * as React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import { api, BrowserApiError } from '@/lib/api/browser';
import { PageHeader } from '@/components/PageHeader';

interface SiteUsage {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  createdAt: string;
  isOldest: boolean;
  imageBytes: number;
  attendanceBytesEstimate: number;
  freeableBytesEstimate: number;
  sessionCount: number;
  tapCount: number;
}
interface Usage {
  usedBytes: number;
  limitBytes: number | null;
  usedPercent: number | null;
  level: 'OK' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';
  oldestSiteId: string | null;
  sites: SiteUsage[];
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

export default function StoragePage() {
  const [error, setError] = React.useState<string | null>(null);
  const [backedUp, setBackedUp] = React.useState<Record<string, boolean>>({});
  const [confirmSite, setConfirmSite] = React.useState<SiteUsage | null>(null);

  const usage = useQuery({
    queryKey: ['storage-usage'],
    queryFn: () => api.get<Usage>('/storage/usage'),
    refetchInterval: 60_000,
  });

  const backup = useMutation({
    mutationFn: (siteId: string) =>
      api.get<{ filename: string; contentBase64: string; contentType: string }>(
        `/storage/sites/${siteId}/backup`,
      ),
    onSuccess: (res, siteId) => {
      setError(null);
      const bytes = Uint8Array.from(atob(res.contentBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: res.contentType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
      setBackedUp((m) => ({ ...m, [siteId]: true }));
    },
    onError: (e) => {
      const err = e as BrowserApiError;
      setError(err.body?.detail ?? err.body?.title ?? 'Backup failed');
    },
  });

  const purge = useMutation({
    mutationFn: (siteId: string) =>
      api.post<{ deletedSessions: number; deletedImages: number }>(
        `/storage/sites/${siteId}/purge`,
        {},
      ),
    onSuccess: () => {
      setConfirmSite(null);
      setError(null);
      usage.refetch();
    },
    onError: (e) => {
      const err = e as BrowserApiError;
      setError(err.body?.detail ?? err.body?.title ?? 'Failed to clear site data');
    },
  });

  const data = usage.data;
  const pct = data?.usedPercent != null ? Math.round(data.usedPercent * 100) : null;
  const barColor =
    data?.level === 'CRITICAL' ? 'error' : data?.level === 'WARNING' ? 'warning' : 'primary';

  return (
    <>
      <PageHeader title="Storage" subtitle="Database usage and per-site cleanup" />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          {!data ? (
            <Typography color="text.secondary">Loading usage…</Typography>
          ) : (
            <>
              {data.level !== 'OK' && data.level !== 'UNKNOWN' && (
                <Alert severity={data.level === 'CRITICAL' ? 'error' : 'warning'} sx={{ mb: 2 }}>
                  Storage is {data.level === 'CRITICAL' ? 'critically low' : 'running low'} ({pct}%
                  used). Download a backup of the oldest site and clear it to free space.
                </Alert>
              )}
              <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                <Typography variant="h6">
                  {fmtBytes(data.usedBytes)}
                  {data.limitBytes ? ` of ${fmtBytes(data.limitBytes)}` : ''} used
                </Typography>
                {pct != null && <Typography variant="h6">{pct}%</Typography>}
              </Stack>
              {pct != null ? (
                <LinearProgress
                  variant="determinate"
                  value={Math.min(100, pct)}
                  color={barColor}
                  sx={{ height: 10, borderRadius: 1 }}
                />
              ) : (
                <Alert severity="info">
                  No storage limit configured. Set the <code>DB_STORAGE_LIMIT_BYTES</code> env var on
                  the API to enable usage alerts.
                </Alert>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Sites — oldest first
          </Typography>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Site</TableCell>
                  <TableCell>Added</TableCell>
                  <TableCell align="right">Images</TableCell>
                  <TableCell align="right">Attendance (est.)</TableCell>
                  <TableCell align="right">Freeable (est.)</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data?.sites.map((s) => (
                  <TableRow key={s.id} hover>
                    <TableCell>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <span>{s.name}</span>
                        {s.isOldest && <Chip size="small" color="primary" label="Oldest" />}
                        {!s.isActive && <Chip size="small" label="disabled" />}
                      </Stack>
                    </TableCell>
                    <TableCell>{new Date(s.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell align="right">{fmtBytes(s.imageBytes)}</TableCell>
                    <TableCell align="right">{fmtBytes(s.attendanceBytesEstimate)}</TableCell>
                    <TableCell align="right">{fmtBytes(s.freeableBytesEstimate)}</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button
                          size="small"
                          startIcon={<DownloadIcon />}
                          disabled={backup.isPending}
                          onClick={() => backup.mutate(s.id)}
                        >
                          Backup
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          startIcon={<DeleteSweepIcon />}
                          disabled={!backedUp[s.id]}
                          onClick={() => setConfirmSite(s)}
                        >
                          Clear
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Clearing removes a site&apos;s attendance records and the photos of workers assigned only
            to it. Worker master records and shared-worker photos are kept. Download the backup first
            — the Clear button stays disabled until you do.
          </Typography>
        </CardContent>
      </Card>

      <Dialog open={!!confirmSite} onClose={() => setConfirmSite(null)}>
        <DialogTitle>Clear data for “{confirmSite?.name}”?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This permanently deletes {confirmSite?.sessionCount} attendance session(s) and the
            exclusive images for this site (≈{fmtBytes(confirmSite?.freeableBytesEstimate ?? 0)}).
            Worker records are kept. This cannot be undone — make sure you downloaded the backup.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmSite(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            disabled={purge.isPending}
            onClick={() => confirmSite && purge.mutate(confirmSite.id)}
          >
            Clear &amp; free space
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
