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
  Divider,
  Grid,
  IconButton,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { Controller, useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import EditIcon from '@mui/icons-material/Edit';
import { api, BrowserApiError } from '@/lib/api/browser';
import { PageHeader } from '@/components/PageHeader';
import { QrBadge } from '@/components/QrBadge';
import { Paginated, Site, Vendor, Worker } from '@/lib/types';

interface WorkerForm {
  workerCode: string;
  fullName: string;
  fatherName?: string;
  gender?: string;
  dateOfBirth?: string;
  language?: string;
  mobileNumber?: string;
  pincode?: string;
  bloodGroup?: string;
  emergencyContactName?: string;
  emergencyContactNumber?: string;
  nomineeName?: string;
  nomineeRelation?: string;
  vendorId?: string;
  siteId?: string;
  natureOfContractor?: string;
  bankName?: string;
  bankAccountNumber?: string;
  ifscCode?: string;
  pfNumber?: string;
  esiNumber?: string;
  govIdType?: string;
  aadhaar?: string;
  nfcUid?: string;
  qrIdentifier?: string;
  joinDate?: string;
  status?: string;
}

/** Full profile returned by GET /workers/:id (superset of the list row). */
type WorkerDetail = Worker & {
  nfcUid?: string | null;
  qrIdentifier?: string | null;
  joinDate?: string | null;
  assignments?: { siteId: string }[];
};

const EMPTY_FORM: WorkerForm = { workerCode: '', fullName: '' };

function toForm(w: WorkerDetail): WorkerForm {
  return {
    workerCode: w.workerCode,
    fullName: w.fullName,
    fatherName: w.fatherName ?? '',
    gender: w.gender ?? '',
    dateOfBirth: w.dateOfBirth ? w.dateOfBirth.slice(0, 10) : '',
    language: w.language ?? '',
    mobileNumber: w.mobileNumber ?? '',
    pincode: w.pincode ?? '',
    bloodGroup: w.bloodGroup ?? '',
    emergencyContactName: w.emergencyContactName ?? '',
    emergencyContactNumber: w.emergencyContactNumber ?? '',
    nomineeName: w.nomineeName ?? '',
    nomineeRelation: w.nomineeRelation ?? '',
    vendorId: w.vendorId ?? '',
    siteId: w.assignments?.[0]?.siteId ?? '',
    natureOfContractor: w.natureOfContractor ?? '',
    bankName: w.bankName ?? '',
    bankAccountNumber: w.bankAccountNumber ?? '',
    ifscCode: w.ifscCode ?? '',
    pfNumber: w.pfNumber ?? '',
    esiNumber: w.esiNumber ?? '',
    govIdType: w.govIdType ?? '',
    aadhaar: '',
    nfcUid: w.nfcUid ?? '',
    qrIdentifier: w.qrIdentifier ?? '',
    joinDate: w.joinDate ? w.joinDate.slice(0, 10) : '',
    status: w.status,
  };
}

export default function WorkersPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [qrWorker, setQrWorker] = React.useState<Worker | null>(null);
  const [editing, setEditing] = React.useState<WorkerDetail | null>(null);
  const { register, handleSubmit, reset, control } = useForm<WorkerForm>({
    defaultValues: EMPTY_FORM,
  });

  const workers = useQuery({
    queryKey: ['workers', q],
    queryFn: () => api.get<Paginated<Worker>>(`/workers?q=${encodeURIComponent(q)}`),
  });
  const vendors = useQuery({ queryKey: ['vendors'], queryFn: () => api.get<Vendor[]>('/vendors') });
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => api.get<Site[]>('/sites') });

  const closeDialog = () => {
    setOpen(false);
    setEditing(null);
    setError(null);
    reset(EMPTY_FORM);
  };

  const openCreate = () => {
    setEditing(null);
    setError(null);
    reset(EMPTY_FORM);
    setOpen(true);
  };

  const openEdit = async (w: Worker) => {
    try {
      const full = await api.get<WorkerDetail>(`/workers/${w.id}`);
      setEditing(full);
      setError(null);
      reset(toForm(full));
      setOpen(true);
    } catch (e) {
      const err = e as BrowserApiError;
      setError(err.body?.detail ?? err.body?.title ?? 'Failed to load worker');
    }
  };

  const save = useMutation({
    mutationFn: async (v: WorkerForm) => {
      // strip empty strings so optional fields don't fail validation
      const body: Record<string, unknown> = {};
      Object.entries(v).forEach(([k, val]) => {
        if (val !== undefined && val !== '') body[k] = val;
      });

      if (!editing) {
        delete body.status;
        return api.post('/workers', body);
      }

      // Fields handled by dedicated endpoints (or immutable) are not PATCHable.
      const { siteId, nfcUid, qrIdentifier, ...patch } = body;
      delete patch.workerCode;
      delete patch.joinDate;
      const updated = await api.patch(`/workers/${editing.id}`, patch);

      const currentSiteId = editing.assignments?.[0]?.siteId ?? '';
      if (siteId && siteId !== currentSiteId) {
        await api.post(`/workers/${editing.id}/assign-site`, {
          siteId,
          vendorId: patch.vendorId,
          startDate: new Date().toISOString().slice(0, 10),
        });
      }
      if (nfcUid && nfcUid !== (editing.nfcUid ?? '')) {
        await api.post(`/workers/${editing.id}/credentials`, {
          kind: 'NFC_UID',
          value: nfcUid,
          reason: 'updated from admin panel',
        });
      }
      if (qrIdentifier && qrIdentifier !== (editing.qrIdentifier ?? '')) {
        await api.post(`/workers/${editing.id}/credentials`, {
          kind: 'QR',
          value: qrIdentifier,
          reason: 'updated from admin panel',
        });
      }
      return updated;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workers'] });
      closeDialog();
    },
    onError: (e) => {
      const err = e as BrowserApiError;
      const meta = (err.body as { meta?: { message?: string } })?.meta;
      setError(
        meta?.message ??
          err.body?.detail ??
          err.body?.title ??
          (editing ? 'Failed to update worker' : 'Failed to create worker'),
      );
    },
  });

  const field = (name: keyof WorkerForm, label: string, opts: { type?: string; disabled?: boolean } = {}) => (
    <Grid item xs={12} sm={6} md={4}>
      <TextField
        label={label}
        type={opts.type ?? 'text'}
        fullWidth
        size="small"
        disabled={opts.disabled}
        InputLabelProps={{ shrink: true }}
        {...register(name)}
      />
    </Grid>
  );

  const selectField = (
    name: keyof WorkerForm,
    label: string,
    options: { value: string; label: string }[],
  ) => (
    <Grid item xs={12} sm={6} md={4}>
      <Controller
        name={name}
        control={control}
        render={({ field: f }) => (
          <TextField
            select
            label={label}
            fullWidth
            size="small"
            value={f.value ?? ''}
            onChange={f.onChange}
            InputLabelProps={{ shrink: true }}
          >
            <MenuItem value="">—</MenuItem>
            {options.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
        )}
      />
    </Grid>
  );

  return (
    <>
      <PageHeader
        title="Workers"
        subtitle="Worker master — profiles, contractor, bank, statutory & ID details"
        action={
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" onClick={() => router.push('/workers/badges')}>
              Print QR badges
            </Button>
            <Button variant="contained" onClick={openCreate}>
              New worker
            </Button>
          </Stack>
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
      {error && !open && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <Card sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Emp ID</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Father</TableCell>
              <TableCell>Gender</TableCell>
              <TableCell>Mobile</TableCell>
              <TableCell>Contractor / Nature</TableCell>
              <TableCell>PF / ESI</TableCell>
              <TableCell>Gov ID</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {workers.data?.data.map((w) => (
              <TableRow key={w.id} hover>
                <TableCell>{w.workerCode}</TableCell>
                <TableCell>{w.fullName}</TableCell>
                <TableCell>{w.fatherName ?? '—'}</TableCell>
                <TableCell>{w.gender ?? '—'}</TableCell>
                <TableCell>{w.mobileNumber ?? '—'}</TableCell>
                <TableCell>{w.natureOfContractor ?? '—'}</TableCell>
                <TableCell>
                  {(w.pfNumber ?? '—') + ' / ' + (w.esiNumber ?? '—')}
                </TableCell>
                <TableCell>
                  {w.govIdType ? `${w.govIdType} ••${w.aadhaarLast4 ?? ''}` : '—'}
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    color={w.status === 'ACTIVE' ? 'success' : 'default'}
                    label={w.status}
                  />
                </TableCell>
                <TableCell align="right">
                  <IconButton size="small" title="Edit worker" onClick={() => openEdit(w)}>
                    <EditIcon />
                  </IconButton>
                  <IconButton size="small" title="Show QR" onClick={() => setQrWorker(w)}>
                    <QrCode2Icon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onClose={closeDialog} fullWidth maxWidth="md">
        <DialogTitle>{editing ? `Edit worker — ${editing.fullName}` : 'New worker'}</DialogTitle>
        <form onSubmit={handleSubmit((v) => save.mutate(v))}>
          <DialogContent dividers>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            <Typography variant="subtitle2" gutterBottom>
              Identity
            </Typography>
            <Grid container spacing={2}>
              {field('workerCode', 'Emp ID No *', { disabled: !!editing })}
              {field('fullName', 'Worker name *')}
              {field('fatherName', "Father's name")}
              {selectField('gender', 'Gender', [
                { value: 'M', label: 'Male' },
                { value: 'F', label: 'Female' },
                { value: 'OTHER', label: 'Other' },
              ])}
              {field('dateOfBirth', 'Date of birth', { type: 'date' })}
              {field('language', 'Language')}
              {field('mobileNumber', 'Mobile number')}
              {field('pincode', 'Zipcode / pincode')}
              {field('bloodGroup', 'Blood group')}
              {editing &&
                selectField('status', 'Status', [
                  { value: 'ACTIVE', label: 'Active' },
                  { value: 'INACTIVE', label: 'Inactive' },
                  { value: 'SUSPENDED', label: 'Suspended' },
                  { value: 'EXITED', label: 'Exited' },
                ])}
            </Grid>

            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" gutterBottom>
              Contractor & assignment
            </Typography>
            <Grid container spacing={2}>
              {selectField(
                'vendorId',
                'Contractor (vendor)',
                (vendors.data ?? []).map((v) => ({ value: v.id, label: v.name })),
              )}
              {field('natureOfContractor', 'Nature of contractor')}
              {selectField(
                'siteId',
                'Site',
                (sites.data ?? []).map((s) => ({ value: s.id, label: s.name })),
              )}
              {field('joinDate', 'Date of joining', { type: 'date', disabled: !!editing })}
            </Grid>

            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" gutterBottom>
              Nominee & emergency
            </Typography>
            <Grid container spacing={2}>
              {field('nomineeName', 'Nominee name')}
              {field('nomineeRelation', 'Nominee relation')}
              {field('emergencyContactName', 'Emergency contact name')}
              {field('emergencyContactNumber', 'Emergency contact number')}
            </Grid>

            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" gutterBottom>
              Bank & statutory
            </Typography>
            <Grid container spacing={2}>
              {field('bankName', 'Bank name')}
              {field('bankAccountNumber', 'Account number')}
              {field('ifscCode', 'IFSC code')}
              {field('pfNumber', 'PF number')}
              {field('esiNumber', 'ESI number')}
              {field('govIdType', 'Gov ID type (e.g. Aadhaar)')}
              {field('aadhaar', editing ? 'Gov ID number (leave blank to keep)' : 'Gov ID number (encrypted)')}
            </Grid>

            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" gutterBottom>
              Credentials
            </Typography>
            <Grid container spacing={2}>
              {field('nfcUid', 'NFC UID')}
              {field('qrIdentifier', 'QR identifier')}
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={closeDialog}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={save.isPending}>
              {editing ? 'Save changes' : 'Create worker'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog open={!!qrWorker} onClose={() => setQrWorker(null)}>
        <DialogTitle>Worker QR badge</DialogTitle>
        <DialogContent>
          <Stack alignItems="center" sx={{ py: 1 }}>
            {qrWorker && (
              <QrBadge
                fullName={qrWorker.fullName}
                workerCode={qrWorker.workerCode}
                size={180}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setQrWorker(null)}>Close</Button>
          <Button variant="contained" onClick={() => window.print()}>
            Print
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
