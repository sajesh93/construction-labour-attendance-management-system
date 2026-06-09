'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
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
import { api } from '@/lib/api/browser';
import { PageHeader } from '@/components/PageHeader';
import { Site } from '@/lib/types';

interface ActiveSession {
  id: string;
  loginAt: string;
  worker: { id: string; fullName: string; workerCode: string };
}

export default function AttendancePage() {
  const [siteId, setSiteId] = React.useState('');
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => api.get<Site[]>('/sites') });

  const active = useQuery({
    queryKey: ['active', siteId],
    queryFn: () => api.get<ActiveSession[]>(`/attendance/active?siteId=${siteId}`),
    enabled: !!siteId,
    refetchInterval: 15000,
  });

  return (
    <>
      <PageHeader title="Attendance" subtitle="Live open sessions per site" />
      <Stack direction="row" sx={{ mb: 2 }}>
        <TextField
          select
          size="small"
          label="Site"
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          sx={{ width: 280 }}
        >
          {sites.data?.map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {s.name}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <Card>
        {!siteId ? (
          <Typography sx={{ p: 3 }} color="text.secondary">
            Select a site to view active sessions.
          </Typography>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Worker</TableCell>
                <TableCell>Code</TableCell>
                <TableCell>Logged in at</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {active.data?.map((s) => (
                <TableRow key={s.id} hover>
                  <TableCell>{s.worker.fullName}</TableCell>
                  <TableCell>{s.worker.workerCode}</TableCell>
                  <TableCell>{new Date(s.loginAt).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}
