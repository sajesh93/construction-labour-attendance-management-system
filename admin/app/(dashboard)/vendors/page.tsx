'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { useForm } from 'react-hook-form';
import { api, BrowserApiError } from '@/lib/api/browser';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { Vendor } from '@/lib/types';

interface VendorForm {
  name: string;
  code: string;
  contactPerson?: string;
  contactNumber?: string;
}

type PendingAction = { kind: 'delete' | 'deactivate'; vendor: Vendor } | null;

export default function VendorsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Vendor | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<PendingAction>(null);
  const { register, handleSubmit, reset } = useForm<VendorForm>();

  const vendors = useQuery({ queryKey: ['vendors'], queryFn: () => api.get<Vendor[]>('/vendors') });

  const refresh = () => qc.invalidateQueries({ queryKey: ['vendors'] });
  const errMessage = (e: unknown, fallback: string) => {
    const err = e as BrowserApiError;
    return err.body?.detail ?? err.body?.title ?? fallback;
  };

  const save = useMutation({
    mutationFn: (v: VendorForm) => {
      const body = Object.fromEntries(Object.entries(v).filter(([, val]) => val !== ''));
      return editing ? api.patch(`/vendors/${editing.id}`, body) : api.post('/vendors', body);
    },
    onSuccess: () => {
      refresh();
      setOpen(false);
      setFormError(null);
      reset();
      toast.success(editing ? 'Vendor updated' : 'Vendor created');
    },
    onError: (e) => setFormError(errMessage(e, 'Failed to save vendor')),
  });

  const toggleActive = useMutation({
    mutationFn: (v: Vendor) => api.patch(`/vendors/${v.id}`, { isActive: !v.isActive }),
    onSuccess: (_res, v) => {
      refresh();
      setPending(null);
      toast.success(v.isActive ? `Vendor "${v.name}" deactivated` : `Vendor "${v.name}" activated`);
    },
    onError: (e) => toast.error(errMessage(e, 'Failed to update vendor')),
  });

  const remove = useMutation({
    mutationFn: (v: Vendor) =>
      api.del<{ deleted: boolean; deactivated?: boolean; workersAssigned?: number }>(
        `/vendors/${v.id}`,
      ),
    onSuccess: (res, v) => {
      refresh();
      setPending(null);
      if (res && !res.deleted) {
        toast.show(
          `Vendor still has ${res.workersAssigned ?? 'some'} worker(s) — it was deactivated instead of deleted.`,
          'warning',
        );
      } else {
        toast.success(`Vendor "${v.name}" deleted`);
      }
    },
    onError: (e) => toast.error(errMessage(e, 'Failed to delete vendor')),
  });

  const openCreate = () => {
    setEditing(null);
    setFormError(null);
    reset({ name: '', code: '', contactPerson: '', contactNumber: '' });
    setOpen(true);
  };
  const openEdit = (v: Vendor) => {
    setEditing(v);
    setFormError(null);
    reset({
      name: v.name,
      code: v.code,
      contactPerson: v.contactPerson ?? '',
      contactNumber: v.contactNumber ?? '',
    });
    setOpen(true);
  };

  const columns: Column<Vendor>[] = [
    { key: 'name', label: 'Name', render: (v) => <Typography variant="body2" fontWeight={600}>{v.name}</Typography> },
    { key: 'code', label: 'Code', render: (v) => v.code },
    {
      key: 'contact',
      label: 'Contact',
      render: (v) => (
        <>
          {v.contactPerson || '—'}
          {v.contactNumber ? ` · ${v.contactNumber}` : ''}
        </>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (v) => (
        <Tooltip title={v.isActive ? 'Click to deactivate' : 'Click to activate'}>
          <StatusBadge
            label={v.isActive ? 'Active' : 'Inactive'}
            tone={v.isActive ? 'success' : 'neutral'}
            onClick={() =>
              v.isActive ? setPending({ kind: 'deactivate', vendor: v }) : toggleActive.mutate(v)
            }
          />
        </Tooltip>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (v) => (
        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
          <Tooltip title="Edit vendor">
            <IconButton size="small" onClick={() => openEdit(v)}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete vendor">
            <IconButton size="small" onClick={() => setPending({ kind: 'delete', vendor: v })}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Vendors"
        subtitle="Labour contractors and their contact details"
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            New vendor
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={vendors.data}
        loading={vendors.isLoading}
        rowKey={(v) => v.id}
        emptyTitle="No vendors yet"
        emptyDescription="Add the labour contractors you work with to assign workers to them."
        emptyAction={
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            New vendor
          </Button>
        }
      />

      <ConfirmDialog
        open={!!pending}
        title={pending?.kind === 'delete' ? 'Delete vendor?' : 'Deactivate vendor?'}
        message={
          pending?.kind === 'delete'
            ? `Delete vendor "${pending?.vendor.name}"? If workers are still assigned, it will be deactivated instead.`
            : `Deactivate vendor "${pending?.vendor.name}"? It will no longer be selectable for new workers.`
        }
        confirmLabel={pending?.kind === 'delete' ? 'Delete' : 'Deactivate'}
        danger
        busy={remove.isPending || toggleActive.isPending}
        onConfirm={() => {
          if (!pending) return;
          if (pending.kind === 'delete') remove.mutate(pending.vendor);
          else toggleActive.mutate(pending.vendor);
        }}
        onClose={() => setPending(null)}
      />

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? `Edit vendor — ${editing.name}` : 'New vendor'}</DialogTitle>
        <form onSubmit={handleSubmit((v) => save.mutate(v))}>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              {formError && <Alert severity="error">{formError}</Alert>}
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
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button color="inherit" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={save.isPending}>
              {editing ? 'Save changes' : 'Create'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
