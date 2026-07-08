'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Box, Button, Stack, Tab, Tabs, Tooltip, Typography } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { api } from '@/lib/api/browser';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { StatusBadge, statusTone } from '@/components/ui/StatusBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { CorrectionRequest } from '@/lib/types';

// Friendly labels for the CorrectionReason enum the site officer picks on mobile.
const REASON_LABEL: Record<string, string> = {
  FORGOT_CARD: 'Forgot card',
  DEVICE_ISSUE: 'Device issue',
  NETWORK_ISSUE: 'Network issue',
  WRONG_SITE: 'Wrong site',
  SUPERVISOR_MISTAKE: 'Officer mistake',
  OTHER: 'Other',
};

const EMPTY_COPY: Record<string, { title: string; description: string }> = {
  PENDING: {
    title: 'No pending corrections',
    description: 'New correction requests from site officers will appear here for review.',
  },
  APPROVED: {
    title: 'No approved corrections',
    description: 'Corrections you approve will be listed here.',
  },
  REJECTED: {
    title: 'No rejected corrections',
    description: 'Corrections you reject will be listed here.',
  },
};

type PendingDecision = { id: string; action: 'approve' | 'reject'; who: string; date: string };

export default function CorrectionsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = React.useState('PENDING');
  const [decision, setDecision] = React.useState<PendingDecision | null>(null);

  const list = useQuery({
    queryKey: ['corrections', status],
    queryFn: () => api.get<CorrectionRequest[]>(`/corrections?status=${status}`),
  });

  const decide = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      api.post(`/corrections/${id}/${action}`, { reviewNotes: '' }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['corrections'] });
      toast.success(vars.action === 'approve' ? 'Correction approved' : 'Correction rejected');
      setDecision(null);
    },
    onError: (_, vars) => {
      toast.error(
        vars.action === 'approve' ? 'Failed to approve correction' : 'Failed to reject correction',
      );
    },
  });

  const columns: Column<CorrectionRequest>[] = [
    {
      key: 'workDate',
      label: 'Work date',
      render: (c) => (
        <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
          {c.workDate?.slice(0, 10)}
        </Typography>
      ),
    },
    {
      key: 'worker',
      label: 'Worker',
      render: (c) =>
        c.worker ? (
          <>
            <Typography variant="body2">{c.worker.fullName}</Typography>
            <Typography variant="caption" color="text.secondary">
              {c.worker.workerCode}
            </Typography>
          </>
        ) : (
          '—'
        ),
    },
    { key: 'type', label: 'Type', render: (c) => c.type },
    {
      key: 'reason',
      label: 'Reason',
      render: (c) => (
        <Tooltip
          arrow
          title={c.notes ? `Reason given: ${c.notes}` : 'No additional reason was typed in'}
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
      ),
    },
    {
      key: 'requestedBy',
      label: 'Requested by',
      render: (c) => (
        <>
          <Typography variant="body2">{c.requestedByName ?? '—'}</Typography>
          <Typography variant="caption" color="text.secondary">
            {c.createdAt ? new Date(c.createdAt).toLocaleString() : ''}
          </Typography>
        </>
      ),
    },
    {
      key: 'changes',
      label: 'Proposed changes',
      render: (c) => (
        <>
          {c.items?.map((i) => (
            <Typography key={i.id} variant="caption" display="block">
              {i.field} → {String(i.proposedValue)}
            </Typography>
          ))}
        </>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (c) => (
        <>
          <StatusBadge label={c.status} tone={statusTone(c.status)} />
          {c.reviewedByName && (
            <Tooltip arrow title={c.reviewNotes ? `Note: ${c.reviewNotes}` : ''}>
              <Typography variant="caption" display="block" color="text.secondary">
                by {c.reviewedByName}
              </Typography>
            </Tooltip>
          )}
        </>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (c) =>
        c.status === 'PENDING' ? (
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button
              size="small"
              color="success"
              variant="contained"
              startIcon={<CheckIcon />}
              disabled={decide.isPending}
              onClick={() =>
                setDecision({
                  id: c.id,
                  action: 'approve',
                  who: c.worker?.fullName ?? 'this worker',
                  date: c.workDate?.slice(0, 10) ?? '',
                })
              }
            >
              Approve
            </Button>
            <Button
              size="small"
              color="error"
              variant="outlined"
              startIcon={<CloseIcon />}
              disabled={decide.isPending}
              onClick={() =>
                setDecision({
                  id: c.id,
                  action: 'reject',
                  who: c.worker?.fullName ?? 'this worker',
                  date: c.workDate?.slice(0, 10) ?? '',
                })
              }
            >
              Reject
            </Button>
          </Stack>
        ) : null,
    },
  ];

  const emptyCopy = EMPTY_COPY[status] ?? EMPTY_COPY.PENDING;

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
      <DataTable
        columns={columns}
        rows={list.data}
        loading={list.isLoading}
        rowKey={(c) => c.id}
        emptyTitle={emptyCopy.title}
        emptyDescription={emptyCopy.description}
      />
      <ConfirmDialog
        open={!!decision}
        title={decision?.action === 'approve' ? 'Approve correction?' : 'Reject correction?'}
        message={
          decision
            ? `This will ${decision.action} the attendance correction for ${decision.who}${
                decision.date ? ` on ${decision.date}` : ''
              }.${decision.action === 'approve' ? ' The proposed changes will be applied.' : ''}`
            : ''
        }
        confirmLabel={decision?.action === 'approve' ? 'Approve' : 'Reject'}
        danger={decision?.action === 'reject'}
        busy={decide.isPending}
        onConfirm={() => decision && decide.mutate({ id: decision.id, action: decision.action })}
        onClose={() => setDecision(null)}
      />
    </>
  );
}
