'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
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

  const all = devices.data ?? [];
  const pending = all.filter((d) => d.status === 'PENDING');
  const authorized = all.filter((d) => d.status === 'AUTHORIZED');
  const rejected = all.filter((d) => d.status === 'REVOKED');

  const section = (title: string, list: Device[], emptyText: string, actions: (d: Device) => React.ReactNode) => (
    <Card sx={{ mb: 3 }}>
      <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        <Chip size="small" label={list.length} />
      </Box>
      <Divider />
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Device</TableCell>
            <TableCell>Platform</TableCell>
            <TableCell>Last seen</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {list.length === 0 && (
            <TableRow>
              <TableCell colSpan={4}>
                <Typography color="text.secondary" sx={{ py: 1.5 }}>
                  {emptyText}
                </Typography>
              </TableCell>
            </TableRow>
          )}
          {list.map((d) => (
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
              <TableCell>{d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : '—'}</TableCell>
              <TableCell align="right">
                <Stack direction="row" spacing={1} justifyContent="flex-end">
                  {actions(d)}
                </Stack>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );

  const authorizeBtn = (d: Device) => (
    <Button
      size="small"
      variant="contained"
      color="success"
      disabled={setStatus.isPending}
      onClick={() => setStatus.mutate({ id: d.id, status: 'AUTHORIZED' })}
    >
      Authorize
    </Button>
  );
  const rejectBtn = (d: Device, label = 'Reject') => (
    <Button
      size="small"
      variant="outlined"
      color="error"
      disabled={setStatus.isPending}
      onClick={() => setStatus.mutate({ id: d.id, status: 'REVOKED' })}
    >
      {label}
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Devices"
        subtitle="Authorize the tablets/phones allowed to mark attendance"
      />
      {all.length === 0 && (
        <Card sx={{ p: 3 }}>
          <Typography color="text.secondary">
            No devices yet. Open the mobile app and sign in — it registers itself here, then
            authorize it.
          </Typography>
        </Card>
      )}

      {section(
        'Pending authorization',
        pending,
        'No devices waiting for authorization.',
        (d) => (
          <>
            {authorizeBtn(d)}
            {rejectBtn(d)}
          </>
        ),
      )}

      {section('Authorized', authorized, 'No authorized devices yet.', (d) => rejectBtn(d, 'Revoke'))}

      {section('Rejected', rejected, 'No rejected devices.', (d) => authorizeBtn(d))}

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
