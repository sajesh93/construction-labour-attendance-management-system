'use client';

import * as React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  LinearProgress,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import { api, BrowserApiError } from '@/lib/api/browser';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { StatusBadge, statusTone } from '@/components/ui/StatusBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';

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

const LEVEL_LABELS: Record<Usage['level'], string> = {
  OK: 'Healthy',
  WARNING: 'Running low',
  CRITICAL: 'Critical',
  UNKNOWN: 'No limit set',
};

export default function StoragePage() {
  const toast = useToast();
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
      const bytes = Uint8Array.from(atob(res.contentBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: res.contentType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
      setBackedUp((m) => ({ ...m, [siteId]: true }));
      toast.success(`Backup downloaded — ${res.filename}`);
    },
    onError: (e) => {
      const err = e as BrowserApiError;
      toast.error(err.body?.detail ?? err.body?.title ?? 'Backup failed');
    },
  });

  const purge = useMutation({
    mutationFn: (siteId: string) =>
      api.post<{ deletedSessions: number; deletedImages: number }>(
        `/storage/sites/${siteId}/purge`,
        {},
      ),
    onSuccess: (res) => {
      setConfirmSite(null);
      toast.success(
        `Cleared ${res.deletedSessions} session(s) and ${res.deletedImages} image(s)`,
      );
      usage.refetch();
    },
    onError: (e) => {
      setConfirmSite(null);
      const err = e as BrowserApiError;
      toast.error(err.body?.detail ?? err.body?.title ?? 'Failed to clear site data');
    },
  });

  const data = usage.data;
  const pct = data?.usedPercent != null ? Math.round(data.usedPercent * 100) : null;
  const barColor =
    data?.level === 'CRITICAL' ? 'error' : data?.level === 'WARNING' ? 'warning' : 'primary';
  const totalSessions = data?.sites.reduce((sum, s) => sum + s.sessionCount, 0) ?? 0;
  const totalTaps = data?.sites.reduce((sum, s) => sum + s.tapCount, 0) ?? 0;

  const columns: Column<SiteUsage>[] = [
    {
      key: 'site',
      label: 'Site',
      render: (s) => (
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {s.name}
          </Typography>
          {s.isOldest && <StatusBadge label="Oldest" tone="info" />}
          {!s.isActive && <StatusBadge label="Disabled" tone="neutral" />}
        </Stack>
      ),
    },
    {
      key: 'added',
      label: 'Added',
      render: (s) => (
        <Typography variant="body2" color="text.secondary">
          {new Date(s.createdAt).toLocaleDateString()}
        </Typography>
      ),
    },
    {
      key: 'sessions',
      label: 'Sessions',
      align: 'right',
      render: (s) => s.sessionCount.toLocaleString(),
    },
    {
      key: 'images',
      label: 'Images',
      align: 'right',
      render: (s) => fmtBytes(s.imageBytes),
    },
    {
      key: 'attendance',
      label: 'Attendance (est.)',
      align: 'right',
      render: (s) => fmtBytes(s.attendanceBytesEstimate),
    },
    {
      key: 'freeable',
      label: 'Freeable (est.)',
      align: 'right',
      render: (s) => (
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {fmtBytes(s.freeableBytesEstimate)}
        </Typography>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      width: 210,
      render: (s) => (
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
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Storage" subtitle="Database usage and per-site cleanup" />

      {data && data.level !== 'OK' && data.level !== 'UNKNOWN' && (
        <Alert severity={data.level === 'CRITICAL' ? 'error' : 'warning'} sx={{ mb: 2 }}>
          Storage is {data.level === 'CRITICAL' ? 'critically low' : 'running low'} ({pct}% used).
          Download a backup of the oldest site and clear it to free space.
        </Alert>
      )}

      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ px: 2.5 }}>
          {!data ? (
            <>
              <Skeleton width="40%" height={32} />
              <Skeleton variant="rounded" height={10} sx={{ mt: 1.5, borderRadius: 1 }} />
            </>
          ) : (
            <>
              <Stack
                direction="row"
                alignItems="baseline"
                justifyContent="space-between"
                flexWrap="wrap"
                sx={{ mb: 1.5, gap: 1 }}
              >
                <Stack direction="row" alignItems="center" spacing={1.5}>
                  <Typography variant="overline" color="text.secondary">
                    Database usage
                  </Typography>
                  <StatusBadge
                    label={LEVEL_LABELS[data.level]}
                    tone={statusTone(data.level)}
                  />
                </Stack>
                {pct != null && (
                  <Typography variant="h5" component="span" color={`${barColor}.main`}>
                    {pct}%
                  </Typography>
                )}
              </Stack>
              <Typography variant="h6" sx={{ mb: 1 }}>
                {fmtBytes(data.usedBytes)}
                {data.limitBytes ? (
                  <Typography component="span" variant="body2" color="text.secondary">
                    {' '}
                    of {fmtBytes(data.limitBytes)}
                  </Typography>
                ) : (
                  ''
                )}
              </Typography>
              {pct != null ? (
                <LinearProgress
                  variant="determinate"
                  value={Math.min(100, pct)}
                  color={barColor}
                  sx={{ height: 10, borderRadius: 1 }}
                />
              ) : (
                <Alert severity="info">
                  No storage limit configured. Set the <code>DB_STORAGE_LIMIT_BYTES</code> env var
                  on the API to enable usage alerts.
                </Alert>
              )}
              <Stack
                direction="row"
                spacing={3}
                divider={<Divider orientation="vertical" flexItem />}
                sx={{ mt: 2 }}
              >
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Sites
                  </Typography>
                  <Typography variant="subtitle1">{data.sites.length}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Attendance sessions
                  </Typography>
                  <Typography variant="subtitle1">{totalSessions.toLocaleString()}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Attendance taps
                  </Typography>
                  <Typography variant="subtitle1">{totalTaps.toLocaleString()}</Typography>
                </Box>
              </Stack>
            </>
          )}
        </CardContent>
      </Card>

      <Typography variant="subtitle1" sx={{ mb: 1.5 }}>
        Sites — oldest first
      </Typography>
      <DataTable
        columns={columns}
        rows={data?.sites}
        loading={usage.isLoading}
        rowKey={(s) => s.id}
        emptyTitle="No sites yet"
        emptyDescription="Per-site storage breakdown will appear here once sites are added."
        footer={
          <>
            <Divider />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ px: 2.5, py: 1.5, display: 'block' }}
            >
              Clearing removes a site&apos;s attendance records and the photos of workers assigned
              only to it. Worker master records and shared-worker photos are kept. Download the
              backup first — the Clear button stays disabled until you do.
            </Typography>
          </>
        }
      />

      <ConfirmDialog
        open={!!confirmSite}
        title={`Clear data for “${confirmSite?.name ?? ''}”?`}
        message={
          confirmSite
            ? `This permanently deletes ${confirmSite.sessionCount} attendance session(s) and the exclusive images for this site (≈${fmtBytes(confirmSite.freeableBytesEstimate)}). Worker records are kept. This cannot be undone — make sure you downloaded the backup.`
            : ''
        }
        confirmLabel="Clear & free space"
        danger
        busy={purge.isPending}
        onConfirm={() => confirmSite && purge.mutate(confirmSite.id)}
        onClose={() => setConfirmSite(null)}
      />
    </>
  );
}
