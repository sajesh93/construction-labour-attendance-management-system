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
import { api, BrowserApiError } from '@/lib/api/browser';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { Designation } from '@/lib/types';

type PendingAction = { kind: 'delete' | 'deactivate'; designation: Designation } | null;

export default function DesignationsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Designation | null>(null);
  const [name, setName] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<PendingAction>(null);

  const designations = useQuery({
    queryKey: ['designations'],
    queryFn: () => api.get<Designation[]>('/designations?all=true'),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['designations'] });
  const errMessage = (e: unknown, fallback: string) => {
    const err = e as BrowserApiError;
    return err.body?.detail ?? err.body?.title ?? fallback;
  };

  const save = useMutation({
    mutationFn: () =>
      editing
        ? api.patch(`/designations/${editing.id}`, { name })
        : api.post('/designations', { name }),
    onSuccess: () => {
      refresh();
      setOpen(false);
      setFormError(null);
      toast.success(editing ? 'Designation updated' : 'Designation created');
    },
    onError: (e) => setFormError(errMessage(e, 'Failed to save designation')),
  });

  const toggleActive = useMutation({
    mutationFn: (d: Designation) => api.patch(`/designations/${d.id}`, { isActive: !d.isActive }),
    onSuccess: (_res, d) => {
      refresh();
      setPending(null);
      toast.success(d.isActive ? `"${d.name}" deactivated` : `"${d.name}" activated`);
    },
    onError: (e) => toast.error(errMessage(e, 'Failed to update designation')),
  });

  const remove = useMutation({
    mutationFn: (d: Designation) =>
      api.del<{ deleted: boolean; deactivated?: boolean }>(`/designations/${d.id}`),
    onSuccess: (res, d) => {
      refresh();
      setPending(null);
      if (res && !res.deleted) {
        toast.show(
          'Designation is still assigned to workers — it was deactivated instead.',
          'warning',
        );
      } else {
        toast.success(`Designation "${d.name}" deleted`);
      }
    },
    onError: (e) => toast.error(errMessage(e, 'Failed to delete designation')),
  });

  const openCreate = () => {
    setEditing(null);
    setName('');
    setFormError(null);
    setOpen(true);
  };
  const openEdit = (d: Designation) => {
    setEditing(d);
    setName(d.name);
    setFormError(null);
    setOpen(true);
  };

  const columns: Column<Designation>[] = [
    { key: 'name', label: 'Name', render: (d) => <Typography variant="body2" fontWeight={600}>{d.name}</Typography> },
    {
      key: 'status',
      label: 'Status',
      render: (d) => (
        <Tooltip title={d.isActive ? 'Click to deactivate' : 'Click to activate'}>
          <StatusBadge
            label={d.isActive ? 'Active' : 'Inactive'}
            tone={d.isActive ? 'success' : 'neutral'}
            onClick={() =>
              d.isActive ? setPending({ kind: 'deactivate', designation: d }) : toggleActive.mutate(d)
            }
          />
        </Tooltip>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (d) => (
        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
          <Tooltip title="Edit designation">
            <IconButton size="small" onClick={() => openEdit(d)}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete designation">
            <IconButton size="small" onClick={() => setPending({ kind: 'delete', designation: d })}>
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
        title="Designations"
        subtitle="Job designations used in worker & staff profiles"
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            New designation
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={designations.data}
        loading={designations.isLoading}
        rowKey={(d) => d.id}
        emptyTitle="No designations yet"
        emptyDescription="Add the roles you use on site — Mason, Electrician, Supervisor, …"
        emptyAction={
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            New designation
          </Button>
        }
      />

      <ConfirmDialog
        open={!!pending}
        title={pending?.kind === 'delete' ? 'Delete designation?' : 'Deactivate designation?'}
        message={
          pending?.kind === 'delete'
            ? `Delete designation "${pending?.designation.name}"? If it is still assigned to workers, it will be deactivated instead.`
            : `Deactivate designation "${pending?.designation.name}"? It will no longer be selectable in profiles.`
        }
        confirmLabel={pending?.kind === 'delete' ? 'Delete' : 'Deactivate'}
        danger
        busy={remove.isPending || toggleActive.isPending}
        onConfirm={() => {
          if (!pending) return;
          if (pending.kind === 'delete') remove.mutate(pending.designation);
          else toggleActive.mutate(pending.designation);
        }}
        onClose={() => setPending(null)}
      />

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{editing ? 'Edit designation' : 'New designation'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {formError && <Alert severity="error">{formError}</Alert>}
            <TextField
              label="Name"
              fullWidth
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={save.isPending || name.trim().length < 2}
            onClick={() => save.mutate()}
          >
            {editing ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
