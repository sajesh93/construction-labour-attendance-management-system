'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box,
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
  Tooltip,
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

// Friendly labels for the CorrectionReason enum the site officer picks on mobile.
const REASON_LABEL: Record<string, string> = {
  FORGOT_CARD: 'Forgot card',
  DEVICE_ISSUE: 'Device issue',
  NETWORK_ISSUE: 'Network issue',
  WRONG_SITE: 'Wrong site',
  SUPERVISOR_MISTAKE: 'Officer mistake',
  OTHER: 'Other',
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
              <TableCell>Worker</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Reason</TableCell>
              <TableCell>Requested by</TableCell>
              <TableCell>Proposed changes</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {list.data?.map((c) => (
              <TableRow key={c.id} hover>
                <TableCell>{c.workDate?.slice(0, 10)}</TableCell>
                <TableCell>
                  {c.worker ? (
                    <>
                      <Typography variant="body2">{c.worker.fullName}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {c.worker.workerCode}
                      </Typography>
                    </>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell>{c.type}</TableCell>
                <TableCell>
                  <Tooltip
                    arrow
                    title={
                      c.notes
                        ? `Reason given: ${c.notes}`
                        : 'No additional reason was typed in'
                    }
                  >
                    <Box
                      component="span"
                      sx={{
                        cursor: c.notes ? 'help' : 'default',
                        textDecoration: c.notes ? 'underline dotted' : 'none',
                      }}
                    >
                      {REASON_LABEL[c.reason] ?? c.reason}
                    </Box>
                  </Tooltip>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{c.requestedByName ?? '—'}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {c.createdAt ? new Date(c.createdAt).toLocaleString() : ''}
                  </Typography>
                </TableCell>
                <TableCell>
                  {c.items?.map((i) => (
                    <Typography key={i.id} variant="caption" display="block">
                      {i.field} → {String(i.proposedValue)}
                    </Typography>
                  ))}
                </TableCell>
                <TableCell>
                  <Chip size="small" color={STATUS_COLOR[c.status]} label={c.status} />
                  {c.reviewedByName && (
                    <Tooltip arrow title={c.reviewNotes ? `Note: ${c.reviewNotes}` : ''}>
                      <Typography variant="caption" display="block" color="text.secondary">
                        by {c.reviewedByName}
                      </Typography>
                    </Tooltip>
                  )}
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
