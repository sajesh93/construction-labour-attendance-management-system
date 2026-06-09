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
import { Vendor } from '@/lib/types';

export default function VendorsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const { register, handleSubmit, reset } = useForm<{ name: string; code: string }>();

  const vendors = useQuery({ queryKey: ['vendors'], queryFn: () => api.get<Vendor[]>('/vendors') });
  const create = useMutation({
    mutationFn: (v: { name: string; code: string }) => api.post('/vendors', v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendors'] });
      setOpen(false);
      reset();
    },
  });

  return (
    <>
      <PageHeader
        title="Vendors"
        action={
          <Button variant="contained" onClick={() => setOpen(true)}>
            New vendor
          </Button>
        }
      />
      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Code</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {vendors.data?.map((v) => (
              <TableRow key={v.id} hover>
                <TableCell>{v.name}</TableCell>
                <TableCell>{v.code}</TableCell>
                <TableCell>
                  <Chip size="small" color={v.isActive ? 'success' : 'default'} label={v.isActive ? 'Active' : 'Inactive'} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>New vendor</DialogTitle>
        <form onSubmit={handleSubmit((v) => create.mutate(v))}>
          <DialogContent>
            <Stack spacing={2}>
              <TextField label="Name" fullWidth {...register('name')} />
              <TextField label="Code" fullWidth {...register('code')} />
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
