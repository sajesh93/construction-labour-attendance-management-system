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
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import QrCode2Icon from '@mui/icons-material/QrCode2';
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
}

export default function WorkersPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [qrWorker, setQrWorker] = React.useState<Worker | null>(null);
  const { register, handleSubmit, reset } = useForm<WorkerForm>();

  const workers = useQuery({
    queryKey: ['workers', q],
    queryFn: () => api.get<Paginated<Worker>>(`/workers?q=${encodeURIComponent(q)}`),
  });
  const vendors = useQuery({ queryKey: ['vendors'], queryFn: () => api.get<Vendor[]>('/vendors') });
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => api.get<Site[]>('/sites') });

  const create = useMutation({
    mutationFn: (v: WorkerForm) => {
      // strip empty strings so optional fields don't fail validation
      const body: Record<string, unknown> = {};
      Object.entries(v).forEach(([k, val]) => {
        if (val !== undefined && val !== '') body[k] = val;
      });
      return api.post('/workers', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workers'] });
      setOpen(false);
      setError(null);
      reset();
    },
    onError: (e) => {
      const err = e as BrowserApiError;
      const meta = (err.body as { meta?: { message?: string } })?.meta;
      setError(meta?.message ?? err.body?.detail ?? err.body?.title ?? 'Failed to create worker');
    },
  });

  const field = (name: keyof WorkerForm, label: string, opts: { type?: string } = {}) => (
    <Grid item xs={12} sm={6} md={4}>
      <TextField label={label} type={opts.type ?? 'text'} fullWidth size="small" {...register(name)} />
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
            <Button variant="contained" onClick={() => setOpen(true)}>
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
              <TableCell align="right">QR</TableCell>
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
                  <IconButton size="small" title="Show QR" onClick={() => setQrWorker(w)}>
                    <QrCode2Icon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>New worker</DialogTitle>
        <form onSubmit={handleSubmit((v) => create.mutate(v))}>
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
              {field('workerCode', 'Emp ID No *')}
              {field('fullName', 'Worker name *')}
              {field('fatherName', "Father's name")}
              <Grid item xs={12} sm={6} md={4}>
                <TextField select label="Gender" defaultValue="" fullWidth size="small" {...register('gender')}>
                  <MenuItem value="">—</MenuItem>
                  <MenuItem value="M">Male</MenuItem>
                  <MenuItem value="F">Female</MenuItem>
                  <MenuItem value="OTHER">Other</MenuItem>
                </TextField>
              </Grid>
              {field('dateOfBirth', 'Date of birth', { type: 'date' })}
              {field('language', 'Language')}
              {field('mobileNumber', 'Mobile number')}
              {field('pincode', 'Zipcode / pincode')}
              {field('bloodGroup', 'Blood group')}
            </Grid>

            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" gutterBottom>
              Contractor & assignment
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={4}>
                <TextField select label="Contractor (vendor)" defaultValue="" fullWidth size="small" {...register('vendorId')}>
                  <MenuItem value="">—</MenuItem>
                  {vendors.data?.map((v) => (
                    <MenuItem key={v.id} value={v.id}>
                      {v.name}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              {field('natureOfContractor', 'Nature of contractor')}
              <Grid item xs={12} sm={6} md={4}>
                <TextField select label="Site" defaultValue="" fullWidth size="small" {...register('siteId')}>
                  <MenuItem value="">—</MenuItem>
                  {sites.data?.map((s) => (
                    <MenuItem key={s.id} value={s.id}>
                      {s.name}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              {field('joinDate', 'Date of joining', { type: 'date' })}
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
              {field('aadhaar', 'Gov ID number (encrypted)')}
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
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={create.isPending}>
              Create worker
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
