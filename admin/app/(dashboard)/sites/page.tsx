'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import AddIcon from '@mui/icons-material/Add';
import { useForm } from 'react-hook-form';
import { api } from '@/lib/api/browser';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { Site } from '@/lib/types';

export default function SitesPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [confirmSite, setConfirmSite] = React.useState<Site | null>(null);
  const { register, handleSubmit, reset } = useForm<{ name: string; code: string; timezone: string }>();

  const sites = useQuery({ queryKey: ['sites'], queryFn: () => api.get<Site[]>('/sites') });

  const create = useMutation({
    mutationFn: (v: { name: string; code: string; timezone: string }) => api.post('/sites', v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sites'] });
      setOpen(false);
      reset();
      toast.success('Site created');
    },
    onError: () => toast.error('Failed to create site'),
  });

  const toggleActive = useMutation({
    mutationFn: (s: Site) => api.patch(`/sites/${s.id}`, { isActive: !s.isActive }),
    onSuccess: (_res, s) => {
      qc.invalidateQueries({ queryKey: ['sites'] });
      setConfirmSite(null);
      toast.success(s.isActive ? `Site "${s.name}" disabled` : `Site "${s.name}" enabled`);
    },
    onError: () => toast.error('Failed to update site'),
  });

  const columns: Column<Site>[] = [
    { key: 'name', label: 'Name', render: (s) => <Typography variant="body2" fontWeight={600}>{s.name}</Typography> },
    { key: 'code', label: 'Code', render: (s) => s.code },
    { key: 'timezone', label: 'Timezone', render: (s) => s.timezone },
    {
      key: 'status',
      label: 'Status',
      render: (s) => (
        <StatusBadge label={s.isActive ? 'Active' : 'Inactive'} tone={s.isActive ? 'success' : 'neutral'} />
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (s) => (
        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
          <Button
            size="small"
            startIcon={<SettingsOutlinedIcon />}
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/sites/${s.id}/settings`);
            }}
          >
            Settings
          </Button>
          <Button
            size="small"
            color={s.isActive ? 'warning' : 'success'}
            disabled={toggleActive.isPending}
            onClick={(e) => {
              e.stopPropagation();
              setConfirmSite(s);
            }}
          >
            {s.isActive ? 'Disable' : 'Enable'}
          </Button>
        </Stack>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Sites"
        subtitle="Manage sites, attendance settings and shifts"
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>
            New site
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={sites.data}
        loading={sites.isLoading}
        rowKey={(s) => s.id}
        emptyTitle="No sites yet"
        emptyDescription="Create your first site to start recording attendance."
        emptyAction={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>
            New site
          </Button>
        }
      />

      <ConfirmDialog
        open={!!confirmSite}
        title={confirmSite?.isActive ? 'Disable site?' : 'Enable site?'}
        message={
          confirmSite?.isActive
            ? `Disable site "${confirmSite?.name}"? It will no longer appear in the app for attendance, but all its records are kept.`
            : `Enable site "${confirmSite?.name}"? It will appear in the app again.`
        }
        confirmLabel={confirmSite?.isActive ? 'Disable' : 'Enable'}
        danger={!!confirmSite?.isActive}
        busy={toggleActive.isPending}
        onConfirm={() => confirmSite && toggleActive.mutate(confirmSite)}
        onClose={() => setConfirmSite(null)}
      />

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>New site</DialogTitle>
        <form onSubmit={handleSubmit((v) => create.mutate(v))}>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 0.5 }}>
              <TextField label="Name" fullWidth {...register('name')} />
              <TextField label="Code" fullWidth {...register('code')} />
              <TextField label="Timezone" defaultValue="Asia/Kolkata" fullWidth {...register('timezone')} />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button color="inherit" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={create.isPending}>
              Create
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
