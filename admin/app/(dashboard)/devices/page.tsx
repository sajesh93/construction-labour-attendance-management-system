'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
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
                  <Typography variant="body2">{d.label || d.deviceUid}</Typography>
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
    </>
  );
}
