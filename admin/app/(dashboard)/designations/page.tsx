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
import { api, BrowserApiError } from '@/lib/api/browser';
import { PageHeader } from '@/components/PageHeader';
import { Designation } from '@/lib/types';

export default function DesignationsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Designation | null>(null);
  const [name, setName] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const designations = useQuery({
    queryKey: ['designations'],
    queryFn: () => api.get<Designation[]>('/designations?all=true'),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['designations'] });
  const fail = (e: unknown, fallback: string) => {
    const err = e as BrowserApiError;
    setError(err.body?.detail ?? err.body?.title ?? fallback);
  };

  const save = useMutation({
    mutationFn: () =>
      editing
        ? api.patch(`/designations/${editing.id}`, { name })
        : api.post('/designations', { name }),
    onSuccess: () => {
      refresh();
      setOpen(false);
      setError(null);
    },
    onError: (e) => fail(e, 'Failed to save designation'),
  });

  const toggleActive = useMutation({
    mutationFn: (d: Designation) => api.patch(`/designations/${d.id}`, { isActive: !d.isActive }),
    onSuccess: refresh,
    onError: (e) => fail(e, 'Failed to update designation'),
  });

  const remove = useMutation({
    mutationFn: (d: Designation) =>
      api.del<{ deleted: boolean; deactivated?: boolean }>(`/designations/${d.id}`),
    onSuccess: (res) => {
      refresh();
      if (res && !res.deleted) {
        setError('Designation is still assigned to workers — it was deactivated instead.');
      }
    },
    onError: (e) => fail(e, 'Failed to delete designation'),
  });

  const openCreate = () => {
    setEditing(null);
    setName('');
    setError(null);
    setOpen(true);
  };
  const openEdit = (d: Designation) => {
    setEditing(d);
    setName(d.name);
    setError(null);
    setOpen(true);
  };

  return (
    <>
      <PageHeader
        title="Designations"
        subtitle="Job designations used in worker & staff profiles"
        action={
          <Button variant="contained" onClick={openCreate}>
            New designation
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
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {designations.data?.map((d) => (
              <TableRow key={d.id} hover>
                <TableCell>{d.name}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    color={d.isActive ? 'success' : 'default'}
                    label={d.isActive ? 'Active' : 'Inactive'}
                    onClick={() => toggleActive.mutate(d)}
                  />
                </TableCell>
                <TableCell align="right">
                  <IconButton size="small" title="Edit" onClick={() => openEdit(d)}>
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    size="small"
                    title="Delete"
                    onClick={() => {
                      if (confirm(`Delete designation "${d.name}"?`)) remove.mutate(d);
                    }}
                  >
                    <DeleteIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {(designations.data?.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={3}>No designations yet — add Mason, Electrician, …</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{editing ? 'Edit designation' : 'New designation'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="Name"
              fullWidth
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
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
