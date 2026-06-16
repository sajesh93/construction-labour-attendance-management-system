'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import { api } from '@/lib/api/browser';
import { PageHeader } from '@/components/PageHeader';
import { Device } from '@/lib/types';

const STATUS_COLOR: Record<string, 'warning' | 'success' | 'error'> = {
  PENDING: 'warning',
  AUTHORIZED: 'success',
  REVOKED: 'error',
};

export default function DevicesPage() {
  const qc = useQueryClient();
  const devices = useQuery({
    queryKey: ['devices'],
    queryFn: () => api.get<Device[]>('/devices'),
    refetchInterval: 10000,
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'AUTHORIZED' | 'REVOKED' }) =>
      api.patch(`/devices/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['devices'] }),
  });

  const [editing, setEditing] = React.useState<Device | null>(null);
  const [name, setName] = React.useState('');

  const rename = useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) =>
      api.patch(`/devices/${id}`, { label }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices'] });
      setEditing(null);
    },
  });

  const openRename = (d: Device) => {
    setEditing(d);
    setName(d.label ?? '');
  };

  return (
    <>
      <PageHeader
        title="Devices"
        subtitle="Authorize the tablets/phones allowed to mark attendance"
      />
      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Device</TableCell>
              <TableCell>Platform</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Last seen</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {devices.data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Typography color="text.secondary" sx={{ py: 2 }}>
                    No devices yet. Open the mobile app and sign in — it registers itself here,
                    then authorize it.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {devices.data?.map((d) => (
              <TableRow key={d.id} hover>
                <TableCell>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Typography variant="body2">{d.label || d.deviceUid}</Typography>
                    <Tooltip title="Rename device">
                      <IconButton size="small" onClick={() => openRename(d)}>
                        <EditIcon fontSize="inherit" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {d.deviceUid}
                  </Typography>
                </TableCell>
                <TableCell>{d.platform ?? '—'}</TableCell>
                <TableCell>
                  <Chip size="small" color={STATUS_COLOR[d.status]} label={d.status} />
                </TableCell>
                <TableCell>{d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : '—'}</TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    {d.status !== 'AUTHORIZED' && (
                      <Button
                        size="small"
                        variant="contained"
                        color="success"
                        disabled={setStatus.isPending}
                        onClick={() => setStatus.mutate({ id: d.id, status: 'AUTHORIZED' })}
                      >
                        Authorize
                      </Button>
                    )}
                    {d.status === 'AUTHORIZED' && (
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        disabled={setStatus.isPending}
                        onClick={() => setStatus.mutate({ id: d.id, status: 'REVOKED' })}
                      >
                        Revoke
                      </Button>
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

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
        <DialogActions>
          <Button onClick={() => setEditing(null)}>Cancel</Button>
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
