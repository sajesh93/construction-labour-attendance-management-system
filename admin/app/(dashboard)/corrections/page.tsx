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
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { api } from '@/lib/api/browser';
import { PageHeader } from '@/components/PageHeader';
import { CorrectionRequest } from '@/lib/types';

const STATUS_COLOR: Record<string, 'warning' | 'success' | 'error' | 'default'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'error',
  CANCELLED: 'default',
};

export default function CorrectionsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = React.useState('PENDING');

  const list = useQuery({
    queryKey: ['corrections', status],
    queryFn: () => api.get<CorrectionRequest[]>(`/corrections?status=${status}`),
  });

  const decide = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      api.post(`/corrections/${id}/${action}`, { reviewNotes: '' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['corrections'] }),
  });

  return (
    <>
      <PageHeader
        title="Corrections"
        subtitle="Attendance changes apply only after approval"
      />
      <Tabs value={status} onChange={(_, v) => setStatus(v)} sx={{ mb: 2 }}>
        <Tab label="Pending" value="PENDING" />
        <Tab label="Approved" value="APPROVED" />
        <Tab label="Rejected" value="REJECTED" />
      </Tabs>
      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Work date</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Reason</TableCell>
              <TableCell>Proposed changes</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {list.data?.map((c) => (
              <TableRow key={c.id} hover>
                <TableCell>{c.workDate?.slice(0, 10)}</TableCell>
                <TableCell>{c.type}</TableCell>
                <TableCell>{c.reason}</TableCell>
                <TableCell>
                  {c.items?.map((i) => (
                    <Typography key={i.id} variant="caption" display="block">
                      {i.field} → {String(i.proposedValue)}
                    </Typography>
                  ))}
                </TableCell>
                <TableCell>
                  <Chip size="small" color={STATUS_COLOR[c.status]} label={c.status} />
                </TableCell>
                <TableCell align="right">
                  {c.status === 'PENDING' && (
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      <Button
                        size="small"
                        color="success"
                        variant="contained"
                        disabled={decide.isPending}
                        onClick={() => decide.mutate({ id: c.id, action: 'approve' })}
                      >
                        Approve
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        variant="outlined"
                        disabled={decide.isPending}
                        onClick={() => decide.mutate({ id: c.id, action: 'reject' })}
                      >
                        Reject
                      </Button>
                    </Stack>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
