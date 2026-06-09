'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
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
import { Paginated } from '@/lib/types';

interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorRole: string | null;
  oldValue: unknown;
  newValue: unknown;
  createdAt: string;
}

export default function AuditPage() {
  const [entityType, setEntityType] = React.useState('');

  const audit = useQuery({
    queryKey: ['audit', entityType],
    queryFn: () =>
      api.get<Paginated<AuditRow>>(`/audit${entityType ? `?entityType=${entityType}` : ''}`),
  });

  return (
    <>
      <PageHeader title="Audit trail" subtitle="Immutable record of every action" />
      <Stack direction="row" sx={{ mb: 2 }}>
        <TextField
          size="small"
          label="Filter entity type"
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          placeholder="Worker, AttendanceSession…"
          sx={{ width: 280 }}
        />
      </Stack>
      <Card>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Time</TableCell>
              <TableCell>Action</TableCell>
              <TableCell>Entity</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Old → New</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {audit.data?.data.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{new Date(r.createdAt).toLocaleString()}</TableCell>
                <TableCell>{r.action}</TableCell>
                <TableCell>
                  {r.entityType}
                  {r.entityId ? `:${r.entityId.slice(0, 8)}` : ''}
                </TableCell>
                <TableCell>{r.actorRole ?? '—'}</TableCell>
                <TableCell>
                  <Typography variant="caption" component="div" sx={{ maxWidth: 360, overflow: 'hidden' }}>
                    {r.oldValue ? JSON.stringify(r.oldValue) : '∅'} → {r.newValue ? JSON.stringify(r.newValue) : '∅'}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
