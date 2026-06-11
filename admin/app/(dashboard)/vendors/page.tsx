'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
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
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { useForm } from 'react-hook-form';
import { api, BrowserApiError } from '@/lib/api/browser';
import { PageHeader } from '@/components/PageHeader';
import { Vendor } from '@/lib/types';

interface VendorForm {
  name: string;
  code: string;
  contactPerson?: string;
  contactNumber?: string;
}

export default function VendorsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Vendor | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const { register, handleSubmit, reset } = useForm<VendorForm>();

  const vendors = useQuery({ queryKey: ['vendors'], queryFn: () => api.get<Vendor[]>('/vendors') });

  const refresh = () => qc.invalidateQueries({ queryKey: ['vendors'] });
  const fail = (e: unknown, fallback: string) => {
    const err = e as BrowserApiError;
    setError(err.body?.detail ?? err.body?.title ?? fallback);
  };

  const save = useMutation({
    mutationFn: (v: VendorForm) => {
      const body = Object.fromEntries(Object.entries(v).filter(([, val]) => val !== ''));
      return editing ? api.patch(`/vendors/${editing.id}`, body) : api.post('/vendors', body);
    },
    onSuccess: () => {
      refresh();
      setOpen(false);
      setError(null);
      reset();
    },
    onError: (e) => fail(e, 'Failed to save vendor'),
  });

  const toggleActive = useMutation({
    mutationFn: (v: Vendor) => api.patch(`/vendors/${v.id}`, { isActive: !v.isActive }),
    onSuccess: refresh,
    onError: (e) => fail(e, 'Failed to update vendor'),
  });

  const remove = useMutation({
    mutationFn: (v: Vendor) =>
      api.del<{ deleted: boolean; deactivated?: boolean; workersAssigned?: number }>(
        `/vendors/${v.id}`,
      ),
    onSuccess: (res) => {
      refresh();
      if (res && !res.deleted) {
        setError(
          `Vendor still has ${res.workersAssigned ?? 'some'} worker(s) — it was deactivated instead of deleted.`,
        );
      }
    },
    onError: (e) => fail(e, 'Failed to delete vendor'),
  });

  const openCreate = () => {
    setEditing(null);
    setError(null);
    reset({ name: '', code: '', contactPerson: '', contactNumber: '' });
    setOpen(true);
  };
  const openEdit = (v: Vendor) => {
    setEditing(v);
    setError(null);
    reset({
      name: v.name,
      code: v.code,
      contactPerson: v.contactPerson ?? '',
      contactNumber: v.contactNumber ?? '',
    });
    setOpen(true);
  };

  return (
    <>
      <PageHeader
        title="Vendors"
        action={
          <Button variant="contained" onClick={openCreate}>
            New vendor
          </Button>
        }
      />
      {error && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Code</TableCell>
              <TableCell>Contact</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {vendors.data?.map((v) => (
              <TableRow key={v.id} hover>
                <TableCell>{v.name}</TableCell>
                <TableCell>{v.code}</TableCell>
                <TableCell>
                  {v.contactPerson || '—'}
                  {v.contactNumber ? ` · ${v.contactNumber}` : ''}
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    color={v.isActive ? 'success' : 'default'}
                    label={v.isActive ? 'Active' : 'Inactive'}
                    onClick={() => toggleActive.mutate(v)}
                  />
                </TableCell>
                <TableCell align="right">
                  <IconButton size="small" title="Edit vendor" onClick={() => openEdit(v)}>
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    size="small"
                    title="Delete vendor"
                    onClick={() => {
                      if (confirm(`Delete vendor "${v.name}"?`)) remove.mutate(v);
                    }}
                  >
                    <DeleteIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? `Edit vendor — ${editing.name}` : 'New vendor'}</DialogTitle>
        <form onSubmit={handleSubmit((v) => save.mutate(v))}>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              {error && <Alert severity="error">{error}</Alert>}
              <TextField label="Name" fullWidth InputLabelProps={{ shrink: true }} {...register('name')} />
              <TextField
                label="Code"
                fullWidth
                disabled={!!editing}
                InputLabelProps={{ shrink: true }}
                {...register('code')}
              />
              <TextField
                label="Contact person"
                fullWidth
                InputLabelProps={{ shrink: true }}
                {...register('contactPerson')}
              />
              <TextField
                label="Contact number"
                fullWidth
                InputLabelProps={{ shrink: true }}
                {...register('contactNumber')}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={save.isPending}>
              {editing ? 'Save changes' : 'Create'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
