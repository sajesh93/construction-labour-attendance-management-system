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
  MenuItem,
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

export default function UsersPage() {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const { register, handleSubmit, reset } = useForm<UserForm>({ defaultValues: { role: 'WATCHMAN' } });

  const users = useQuery({ queryKey: ['users'], queryFn: () => api.get<UserRow[]>('/users') });
  const create = useMutation({
    mutationFn: (v: UserForm) => api.post('/users', v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setOpen(false);
      reset();
    },
  });

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Admins, safety officers and watchmen"
        action={
          <Button variant="contained" onClick={() => setOpen(true)}>
            New user
          </Button>
        }
      />
      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Status</TableCell>
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
                  <Chip size="small" color={u.isActive ? 'success' : 'default'} label={u.isActive ? 'Active' : 'Inactive'} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>New user</DialogTitle>
        <form onSubmit={handleSubmit((v) => create.mutate(v))}>
          <DialogContent>
            <Stack spacing={2}>
              <TextField label="Full name" fullWidth {...register('fullName')} />
              <TextField label="Email" type="email" fullWidth {...register('email')} />
              <TextField label="Password" type="password" fullWidth {...register('password')} />
              <TextField select label="Role" defaultValue="WATCHMAN" fullWidth {...register('role')}>
                {(['SUPER_ADMIN', 'SITE_ADMIN', 'WATCHMAN', 'SUPERVISOR'] as UserRole[]).map((r) => (
                  <MenuItem key={r} value={r}>
                    {roleLabel(r)}
                  </MenuItem>
                ))}
              </TextField>
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
