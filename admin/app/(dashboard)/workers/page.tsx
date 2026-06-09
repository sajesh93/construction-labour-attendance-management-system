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
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material';
import { useForm } from 'react-hook-form';
import { api } from '@/lib/api/browser';
import { PageHeader } from '@/components/PageHeader';
import { Paginated, Worker } from '@/lib/types';

interface WorkerForm {
  workerCode: string;
  fullName: string;
  mobileNumber?: string;
  bloodGroup?: string;
  nfcUid?: string;
  qrIdentifier?: string;
}

export default function WorkersPage() {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const { register, handleSubmit, reset } = useForm<WorkerForm>();

  const workers = useQuery({
    queryKey: ['workers', q],
    queryFn: () => api.get<Paginated<Worker>>(`/workers?q=${encodeURIComponent(q)}`),
  });

  const create = useMutation({
    mutationFn: (v: WorkerForm) => api.post('/workers', v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workers'] });
      setOpen(false);
      reset();
    },
  });

  return (
    <>
      <PageHeader
        title="Workers"
        subtitle="Worker profiles, credentials and assignments"
        action={
          <Button variant="contained" onClick={() => setOpen(true)}>
            New worker
          </Button>
        }
      />
      <Stack direction="row" sx={{ mb: 2 }}>
        <TextField
          size="small"
          placeholder="Search name / code / mobile"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          sx={{ width: 320 }}
        />
      </Stack>
      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Code</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Mobile</TableCell>
              <TableCell>Blood</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {workers.data?.data.map((w) => (
              <TableRow key={w.id} hover>
                <TableCell>{w.workerCode}</TableCell>
                <TableCell>{w.fullName}</TableCell>
                <TableCell>{w.mobileNumber ?? '—'}</TableCell>
                <TableCell>{w.bloodGroup ?? '—'}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    color={w.status === 'ACTIVE' ? 'success' : 'default'}
                    label={w.status}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>New worker</DialogTitle>
        <form onSubmit={handleSubmit((v) => create.mutate(v))}>
          <DialogContent>
            <Stack spacing={2}>
              <TextField label="Worker code" fullWidth {...register('workerCode')} />
              <TextField label="Full name" fullWidth {...register('fullName')} />
              <TextField label="Mobile number" fullWidth {...register('mobileNumber')} />
              <TextField label="Blood group" fullWidth {...register('bloodGroup')} />
              <TextField label="NFC UID (optional)" fullWidth {...register('nfcUid')} />
              <TextField label="QR identifier (optional)" fullWidth {...register('qrIdentifier')} />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={create.isPending}>
              Create
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
