'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import { api, BrowserApiError } from '@/lib/api/browser';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { StatusBadge, statusTone } from '@/components/ui/StatusBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { roleLabel } from '@/lib/rbac';
import { Device, Site } from '@/lib/types';

/** "3m ago"-style relative timestamp for the last-seen column. */
function relativeTime(iso?: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'just now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const STATUS_ORDER: Record<Device['status'], number> = {
  PENDING: 0,
  AUTHORIZED: 1,
  REVOKED: 2,
};

export default function DevicesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const devices = useQuery({
    queryKey: ['devices'],
    queryFn: () => api.get<Device[]>('/devices'),
    refetchInterval: 10000,
  });
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => api.get<Site[]>('/sites') });
  const siteName = (id?: string | null) =>
    id ? sites.data?.find((s) => s.id === id)?.name ?? '—' : '—';

  // Authorize/revoke confirmation target.
  const [confirming, setConfirming] = React.useState<{
    device: Device;
    status: 'AUTHORIZED' | 'REVOKED';
  } | null>(null);

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'AUTHORIZED' | 'REVOKED' }) =>
      api.patch(`/devices/${id}`, { status }),
    onSuccess: (_data, vars) => {
      toast.success(vars.status === 'AUTHORIZED' ? 'Device authorized' : 'Device access revoked');
      setConfirming(null);
      qc.invalidateQueries({ queryKey: ['devices'] });
    },
    // e.g. approving an Admin-owned browser requires a Super Admin — show why.
    onError: (e) => {
      const err = e as BrowserApiError;
      const meta = (err.body as { meta?: { message?: string } } | undefined)?.meta;
      setConfirming(null);
      toast.error(
        meta?.message ?? err.body?.detail ?? err.body?.title ?? 'Failed to update device status',
      );
    },
  });

  const [editing, setEditing] = React.useState<Device | null>(null);
  const [name, setName] = React.useState('');

  const rename = useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) =>
      api.patch(`/devices/${id}`, { label }),
    onSuccess: () => {
      toast.success('Device renamed');
      qc.invalidateQueries({ queryKey: ['devices'] });
      setEditing(null);
    },
    onError: (e) => {
      const err = e as BrowserApiError;
      toast.error(err.body?.detail ?? err.body?.title ?? 'Failed to rename device');
    },
  });

  const openRename = (d: Device) => {
    setEditing(d);
    setName(d.label ?? '');
  };

  // Pending devices first so approvals are never buried.
  const rows = [...(devices.data ?? [])].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
  );
  const pendingCount = rows.filter((d) => d.status === 'PENDING').length;

  const columns: Column<Device>[] = [
    {
      key: 'device',
      label: 'Device',
      render: (d) => (
        <Box>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {d.label || d.deviceUid}
            </Typography>
            <Tooltip title="Rename device">
              <IconButton size="small" onClick={() => openRename(d)}>
                <EditIcon fontSize="inherit" />
              </IconButton>
            </Tooltip>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {d.deviceUid}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'platform',
      label: 'Platform',
      render: (d) =>
        d.platform ? (
          <Chip
            size="small"
            label={d.platform === 'web' ? 'Web browser' : 'Android'}
            color={d.platform === 'web' ? 'info' : 'default'}
            variant="outlined"
          />
        ) : (
          '—'
        ),
    },
    {
      key: 'owner',
      label: 'Owner',
      render: (d) =>
        d.user ? (
          <Box>
            <Typography variant="body2">{d.user.fullName}</Typography>
            <Typography variant="caption" color="text.secondary">
              {roleLabel(d.user.role)}
            </Typography>
          </Box>
        ) : (
          '—'
        ),
    },
    {
      key: 'site',
      label: 'Site',
      render: (d) => siteName(d.siteId),
    },
    {
      key: 'lastSeen',
      label: 'Last seen',
      render: (d) => (
        <Tooltip title={d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : 'Never seen'}>
          <span>{relativeTime(d.lastSeenAt)}</span>
        </Tooltip>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (d) => <StatusBadge label={d.status} tone={statusTone(d.status)} />,
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (d) => (
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          {d.status !== 'AUTHORIZED' && (
            <Button
              size="small"
              variant="contained"
              color="success"
              disabled={setStatus.isPending}
              onClick={() => setConfirming({ device: d, status: 'AUTHORIZED' })}
            >
              Authorize
            </Button>
          )}
          {d.status !== 'REVOKED' && (
            <Button
              size="small"
              variant="outlined"
              color="error"
              disabled={setStatus.isPending}
              onClick={() => setConfirming({ device: d, status: 'REVOKED' })}
            >
              {d.status === 'PENDING' ? 'Reject' : 'Revoke'}
            </Button>
          )}
        </Stack>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Devices"
        subtitle="Authorize the tablets/phones allowed to mark attendance"
        action={
          pendingCount > 0 ? (
            <StatusBadge
              label={`${pendingCount} pending authorization`}
              tone="warning"
            />
          ) : undefined
        }
      />

      <DataTable<Device>
        columns={columns}
        rows={rows}
        loading={devices.isLoading}
        rowKey={(d) => d.id}
        emptyTitle="No devices yet"
        emptyDescription="Open the mobile app and sign in — it registers itself here, then authorize it."
      />

      <ConfirmDialog
        open={!!confirming}
        title={confirming?.status === 'AUTHORIZED' ? 'Authorize device?' : 'Revoke device access?'}
        message={
          confirming ? (
            confirming.status === 'AUTHORIZED' ? (
              <>
                <b>{confirming.device.label || confirming.device.deviceUid}</b> will be able to mark
                attendance and sign in.
              </>
            ) : (
              <>
                <b>{confirming.device.label || confirming.device.deviceUid}</b> will no longer be
                able to mark attendance. You can re-authorize it later.
              </>
            )
          ) : (
            ''
          )
        }
        confirmLabel={confirming?.status === 'AUTHORIZED' ? 'Authorize' : 'Revoke'}
        danger={confirming?.status === 'REVOKED'}
        busy={setStatus.isPending}
        onConfirm={() =>
          confirming && setStatus.mutate({ id: confirming.device.id, status: confirming.status })
        }
        onClose={() => setConfirming(null)}
      />

      <Dialog open={!!editing} onClose={() => setEditing(null)} fullWidth maxWidth="xs">
        <DialogTitle>Rename device</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Device name"
            placeholder="e.g. Gate 1 tablet"
            helperText="Leave blank to fall back to the device ID"
            value={name}
            onChange={(e) => setName(e.target.value)}
            sx={{ mt: 1 }}
            inputProps={{ maxLength: 80 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && editing) rename.mutate({ id: editing.id, label: name });
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditing(null)} color="inherit">
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={rename.isPending}
            onClick={() => editing && rename.mutate({ id: editing.id, label: name })}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
