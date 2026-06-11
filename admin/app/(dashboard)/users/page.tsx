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
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import { useForm } from 'react-hook-form';
import { api, BrowserApiError } from '@/lib/api/browser';
import { PageHeader } from '@/components/PageHeader';
import { roleLabel } from '@/lib/rbac';
import { UserRole } from '@/lib/types';

interface UserRow {
  id: string;
  fullName: string;
  email: string | null;
  role: UserRole;
  isActive: boolean;
}

interface UserForm {
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
}

const ROLES: UserRole[] = ['SUPER_ADMIN', 'SITE_ADMIN', 'WATCHMAN', 'SUPERVISOR'];

export default function UsersPage() {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<UserRow | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const { register, handleSubmit, reset } = useForm<UserForm>({
    defaultValues: { role: 'WATCHMAN' },
  });

  const users = useQuery({ queryKey: ['users'], queryFn: () => api.get<UserRow[]>('/users') });

  const refresh = () => qc.invalidateQueries({ queryKey: ['users'] });
  const fail = (e: unknown, fallback: string) => {
    const err = e as BrowserApiError;
    setError(err.body?.detail ?? err.body?.title ?? fallback);
  };

  const save = useMutation({
    mutationFn: (v: UserForm) => {
      if (!editing) return api.post('/users', v);
      const body: Record<string, unknown> = {
        fullName: v.fullName,
        role: v.role,
        ...(v.email ? { email: v.email } : {}),
        // Blank password = keep the existing one.
        ...(v.password ? { password: v.password } : {}),
      };
      return api.patch(`/users/${editing.id}`, body);
    },
    onSuccess: () => {
      refresh();
      setOpen(false);
      setError(null);
      reset({ fullName: '', email: '', password: '', role: 'WATCHMAN' });
    },
    onError: (e) => fail(e, 'Failed to save user'),
  });

  const toggleActive = useMutation({
    mutationFn: (u: UserRow) => api.patch(`/users/${u.id}`, { isActive: !u.isActive }),
    onSuccess: refresh,
    onError: (e) => fail(e, 'Failed to update user'),
  });

  const openCreate = () => {
    setEditing(null);
    setError(null);
    reset({ fullName: '', email: '', password: '', role: 'WATCHMAN' });
    setOpen(true);
  };
  const openEdit = (u: UserRow) => {
    setEditing(u);
    setError(null);
    reset({ fullName: u.fullName, email: u.email ?? '', password: '', role: u.role });
    setOpen(true);
  };

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Admins, safety officers and watchmen"
        action={
          <Button variant="contained" onClick={openCreate}>
            New user
          </Button>
        }
      />
      {error && !open && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.data?.map((u) => (
              <TableRow key={u.id} hover>
                <TableCell>{u.fullName}</TableCell>
                <TableCell>{u.email ?? '—'}</TableCell>
                <TableCell>
                  <Chip size="small" label={roleLabel(u.role)} />
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    color={u.isActive ? 'success' : 'default'}
                    label={u.isActive ? 'Active' : 'Inactive'}
                    onClick={() => {
                      if (
                        confirm(
                          u.isActive
                            ? `Deactivate ${u.fullName}? They will no longer be able to sign in.`
                            : `Re-activate ${u.fullName}?`,
                        )
                      )
                        toggleActive.mutate(u);
                    }}
                  />
                </TableCell>
                <TableCell align="right">
                  <IconButton size="small" title="Edit user" onClick={() => openEdit(u)}>
                    <EditIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? `Edit user — ${editing.fullName}` : 'New user'}</DialogTitle>
        <form onSubmit={handleSubmit((v) => save.mutate(v))}>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              {error && <Alert severity="error">{error}</Alert>}
              <TextField
                label="Full name"
                fullWidth
                InputLabelProps={{ shrink: true }}
                {...register('fullName')}
              />
              <TextField
                label="Email"
                type="email"
                fullWidth
                InputLabelProps={{ shrink: true }}
                {...register('email')}
              />
              <TextField
                label={editing ? 'New password (blank = keep current)' : 'Password'}
                type="password"
                fullWidth
                InputLabelProps={{ shrink: true }}
                {...register('password')}
              />
              <TextField
                select
                label="Role"
                defaultValue={editing?.role ?? 'WATCHMAN'}
                fullWidth
                {...register('role')}
              >
                {ROLES.map((r) => (
                  <MenuItem key={r} value={r}>
                    {roleLabel(r)}
                  </MenuItem>
                ))}
              </TextField>
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
