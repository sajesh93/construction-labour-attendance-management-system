'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
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
import { Site } from '@/lib/types';

export default function SitesPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const { register, handleSubmit, reset } = useForm<{ name: string; code: string; timezone: string }>();

  const sites = useQuery({ queryKey: ['sites'], queryFn: () => api.get<Site[]>('/sites') });

  const create = useMutation({
    mutationFn: (v: { name: string; code: string; timezone: string }) => api.post('/sites', v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sites'] });
      setOpen(false);
      reset();
    },
  });

  return (
    <>
      <PageHeader
        title="Sites"
        subtitle="Manage sites, attendance settings and shifts"
        action={
          <Button variant="contained" onClick={() => setOpen(true)}>
            New site
          </Button>
        }
      />
      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Code</TableCell>
              <TableCell>Timezone</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sites.data?.map((s) => (
              <TableRow key={s.id} hover>
                <TableCell>{s.name}</TableCell>
                <TableCell>{s.code}</TableCell>
                <TableCell>{s.timezone}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    color={s.isActive ? 'success' : 'default'}
                    label={s.isActive ? 'Active' : 'Inactive'}
                  />
                </TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => router.push(`/sites/${s.id}/settings`)}>
                    Settings
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>New site</DialogTitle>
        <form onSubmit={handleSubmit((v) => create.mutate(v))}>
          <DialogContent>
            <Stack spacing={2}>
              <TextField label="Name" fullWidth {...register('name')} />
              <TextField label="Code" fullWidth {...register('code')} />
              <TextField label="Timezone" defaultValue="Asia/Kolkata" fullWidth {...register('timezone')} />
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
