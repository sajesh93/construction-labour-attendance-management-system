'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Avatar,
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
import DeleteIcon from '@mui/icons-material/Delete';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import { api, BrowserApiError } from '@/lib/api/browser';
import { PageHeader } from '@/components/PageHeader';
import { QrBadge } from '@/components/QrBadge';
import { Designation, Paginated, PersonCategory, Site, Vendor, Worker } from '@/lib/types';

interface PersonForm {
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
  screeningDoneOn?: string;
  screeningDoneBy?: string;
  inductionDoneOn?: string;
  inductedBy?: string;
  validityTill?: string;
  nomineeName?: string;
  nomineeRelation?: string;
  vendorId?: string;
  designationId?: string;
  siteId?: string;
  natureOfContractor?: string;
  bankName?: string;
  bankAccountNumber?: string;
  ifscCode?: string;
  pfNumber?: string;
  esiNumber?: string;
  govIdType?: string;
  aadhaar?: string;
  pan?: string;
  nfcUid?: string;
  qrIdentifier?: string;
  joinDate?: string;
  status?: string;
  photoUrl?: string;
}

type WorkerDetail = Worker & {
  nfcUid?: string | null;
  qrIdentifier?: string | null;
  joinDate?: string | null;
  assignments?: { siteId: string }[];
};

const EMPTY_FORM: PersonForm = { workerCode: '', fullName: '' };

const LABELS: Record<PersonCategory, { plural: string; singular: string; subtitle: string }> = {
  WORKER: {
    plural: 'Workers',
    singular: 'worker',
    subtitle: 'Worker master — profiles, contractor, bank, statutory & ID details',
  },
  STAFF: {
    plural: 'Staff',
    singular: 'staff member',
    subtitle: 'Staff master — QR badges work for attendance punches like workers',
  },
  VISITOR: {
    plural: 'Visitors',
    singular: 'visitor',
    subtitle: 'Visitor register — issue a QR pass; punches are recorded on scan',
  },
};

function toForm(w: WorkerDetail): PersonForm {
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
    screeningDoneOn: w.screeningDoneOn ? w.screeningDoneOn.slice(0, 10) : '',
    screeningDoneBy: w.screeningDoneBy ?? '',
    inductionDoneOn: w.inductionDoneOn ? w.inductionDoneOn.slice(0, 10) : '',
    inductedBy: w.inductedBy ?? '',
    validityTill: w.validityTill ? w.validityTill.slice(0, 10) : '',
    nomineeName: w.nomineeName ?? '',
    nomineeRelation: w.nomineeRelation ?? '',
    vendorId: w.vendorId ?? '',
    designationId: w.designationId ?? '',
    siteId: w.assignments?.[0]?.siteId ?? '',
    natureOfContractor: w.natureOfContractor ?? '',
    bankName: w.bankName ?? '',
    bankAccountNumber: w.bankAccountNumber ?? '',
    ifscCode: w.ifscCode ?? '',
    pfNumber: w.pfNumber ?? '',
    esiNumber: w.esiNumber ?? '',
    govIdType: w.govIdType ?? '',
    aadhaar: '',
    pan: '',
    nfcUid: w.nfcUid ?? '',
    qrIdentifier: w.qrIdentifier ?? '',
    joinDate: w.joinDate ? w.joinDate.slice(0, 10) : '',
    status: w.status,
    photoUrl: w.photoUrl ?? '',
  };
}

/** Resolve a stored photoUrl (e.g. "/files/<id>") to a browser-loadable src. */
export function photoSrc(photoUrl?: string | null): string | undefined {
  if (!photoUrl) return undefined;
  return photoUrl.startsWith('/files/')
    ? `/api/photo/${photoUrl.slice('/files/'.length)}`
    : photoUrl;
}

/** Downscale to ≤800px JPEG and upload to /files; returns the stored url. */
async function uploadPhoto(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  const maxDim = 800;
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const jpeg = canvas.toDataURL('image/jpeg', 0.85);
  const base64 = jpeg.split(',')[1];
  const res = await api.post<{ url: string }>('/files', {
    dataBase64: base64,
    mimeType: 'image/jpeg',
  });
  return res.url;
}

export function PeopleDirectory({ category }: { category: PersonCategory }) {
  const qc = useQueryClient();
  const router = useRouter();
  const labels = LABELS[category];
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [qrWorker, setQrWorker] = React.useState<Worker | null>(null);
  const [editing, setEditing] = React.useState<WorkerDetail | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const { register, handleSubmit, reset, control, setValue, watch } = useForm<PersonForm>({
    defaultValues: EMPTY_FORM,
  });
  const photoUrl = watch('photoUrl');

  const [sortBy, setSortBy] = React.useState('');
  const listUrl = `/workers?category=${category}&q=${encodeURIComponent(q)}&limit=200${
    sortBy ? `&sortBy=${sortBy}` : ''
  }`;
  const queryKey = ['workers', category, q, sortBy];
  const workers = useQuery({
    queryKey,
    queryFn: () => api.get<Paginated<Worker>>(listUrl),
  });

  // Cursor pagination beyond the first 200 rows.
  const [extraRows, setExtraRows] = React.useState<Worker[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [loadingMore, setLoadingMore] = React.useState(false);
  React.useEffect(() => {
    setExtraRows([]);
    setNextCursor(workers.data?.nextCursor ?? null);
  }, [workers.data]);
  const allRows = [...(workers.data?.data ?? []), ...extraRows];
  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await api.get<Paginated<Worker>>(`${listUrl}&cursor=${nextCursor}`);
      setExtraRows((prev) => [...prev, ...page.data]);
      setNextCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  };
  const vendors = useQuery({ queryKey: ['vendors'], queryFn: () => api.get<Vendor[]>('/vendors') });
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => api.get<Site[]>('/sites') });
  const designations = useQuery({
    queryKey: ['designations'],
    queryFn: () => api.get<Designation[]>('/designations'),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['workers'] });

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
      setError(err.body?.detail ?? err.body?.title ?? `Failed to load ${labels.singular}`);
    }
  };

  const save = useMutation({
    mutationFn: async (v: PersonForm) => {
      const body: Record<string, unknown> = {};
      Object.entries(v).forEach(([k, val]) => {
        if (k === 'photoUrl') return; // handled below — '' must clear, not skip
        if (val !== undefined && val !== '') body[k] = val;
      });
      if (editing) {
        body.photoUrl = v.photoUrl ? v.photoUrl : null;
      } else if (v.photoUrl) {
        body.photoUrl = v.photoUrl;
      }

      if (!editing) {
        delete body.status;
        body.category = category;
        // workerCode is auto-generated server-side when left blank.
        return api.post('/workers', body);
      }

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
      refresh();
      closeDialog();
    },
    onError: (e) => {
      const err = e as BrowserApiError;
      const meta = (err.body as { meta?: { message?: string } })?.meta;
      setError(
        meta?.message ??
          err.body?.detail ??
          err.body?.title ??
          `Failed to save ${labels.singular}`,
      );
    },
  });

  const remove = useMutation({
    mutationFn: (w: Worker) => api.del(`/workers/${w.id}`),
    onSuccess: refresh,
    onError: (e) => {
      const err = e as BrowserApiError;
      setError(err.body?.detail ?? err.body?.title ?? `Failed to delete ${labels.singular}`);
    },
  });

  const onPickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadPhoto(file);
      setValue('photoUrl', url, { shouldDirty: true });
    } catch {
      setError('Photo upload failed');
    } finally {
      setUploading(false);
    }
  };

  const field = (
    name: keyof PersonForm,
    label: string,
    opts: { type?: string; disabled?: boolean } = {},
  ) => (
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
    name: keyof PersonForm,
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

  const showBankSections = category !== 'VISITOR';

  return (
    <>
      <PageHeader
        title={labels.plural}
        subtitle={labels.subtitle}
        action={
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              onClick={() => router.push(`/workers/badges?category=${category}`)}
            >
              Print QR badges
            </Button>
            <Button variant="contained" onClick={openCreate}>
              New {labels.singular}
            </Button>
          </Stack>
        }
      />
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <TextField
          size="small"
          placeholder="Search name / code / mobile"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          sx={{ width: 320 }}
        />
        <TextField
          select
          size="small"
          label="Sort by"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          sx={{ width: 200 }}
        >
          <MenuItem value="">Newest first</MenuItem>
          <MenuItem value="name">Name (A–Z)</MenuItem>
          <MenuItem value="designation">Designation</MenuItem>
          <MenuItem value="vendor">Vendor / contractor</MenuItem>
        </TextField>
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
              <TableCell />
              <TableCell>ID</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Designation</TableCell>
              <TableCell>Vendor</TableCell>
              <TableCell>Mobile</TableCell>
              {category === 'WORKER' && <TableCell>PF / ESI</TableCell>}
              <TableCell>Gov ID</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {allRows.map((w) => (
              <TableRow key={w.id} hover>
                <TableCell sx={{ width: 48 }}>
                  <Avatar src={photoSrc(w.photoUrl)} sx={{ width: 32, height: 32 }}>
                    {w.fullName.charAt(0)}
                  </Avatar>
                </TableCell>
                <TableCell>{w.workerCode}</TableCell>
                <TableCell>{w.fullName}</TableCell>
                <TableCell>{w.designation?.name ?? '—'}</TableCell>
                <TableCell>{w.vendor?.name ?? '—'}</TableCell>
                <TableCell>{w.mobileNumber ?? '—'}</TableCell>
                {category === 'WORKER' && (
                  <TableCell>{(w.pfNumber ?? '—') + ' / ' + (w.esiNumber ?? '—')}</TableCell>
                )}
                <TableCell>
                  {[
                    w.govIdType ? `${w.govIdType} ••${w.aadhaarLast4 ?? ''}` : null,
                    w.panLast4 ? `PAN ••${w.panLast4}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    color={w.status === 'ACTIVE' ? 'success' : 'default'}
                    label={w.status}
                  />
                </TableCell>
                <TableCell align="right">
                  <IconButton size="small" title="Edit" onClick={() => openEdit(w)}>
                    <EditIcon />
                  </IconButton>
                  <IconButton size="small" title="Show QR" onClick={() => setQrWorker(w)}>
                    <QrCode2Icon />
                  </IconButton>
                  <IconButton
                    size="small"
                    title="Delete"
                    onClick={() => {
                      if (
                        confirm(
                          `Delete ${labels.singular} "${w.fullName}" (${w.workerCode})? Attendance history is kept.`,
                        )
                      )
                        remove.mutate(w);
                    }}
                  >
                    <DeleteIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {nextCursor && (
          <Stack alignItems="center" sx={{ p: 1.5 }}>
            <Button size="small" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </Button>
          </Stack>
        )}
      </Card>

      <Dialog open={open} onClose={closeDialog} fullWidth maxWidth="md">
        <DialogTitle>
          {editing ? `Edit ${labels.singular} — ${editing.fullName}` : `New ${labels.singular}`}
        </DialogTitle>
        <form onSubmit={handleSubmit((v) => save.mutate(v))}>
          <DialogContent dividers>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
              <Avatar src={photoSrc(photoUrl)} sx={{ width: 64, height: 64 }} />
              <Button
                component="label"
                variant="outlined"
                size="small"
                startIcon={<PhotoCameraIcon />}
                disabled={uploading}
              >
                {uploading ? 'Uploading…' : photoUrl ? 'Change photo' : 'Upload photo'}
                <input type="file" accept="image/*" hidden onChange={onPickPhoto} />
              </Button>
              {photoUrl && (
                <Button size="small" onClick={() => setValue('photoUrl', '')}>
                  Remove
                </Button>
              )}
              <Typography variant="caption" color="text.secondary">
                Optional
              </Typography>
            </Stack>

            <Typography variant="subtitle2" gutterBottom>
              Identity
            </Typography>
            <Grid container spacing={2}>
              {/* IDs are always auto-generated (W-/S-/V-####) and immutable. */}
              {editing && field('workerCode', 'ID (auto-generated)', { disabled: true })}
              {field('fullName', 'Full name *')}
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
              {category === 'VISITOR' ? 'Visit details' : 'Designation & assignment'}
            </Typography>
            <Grid container spacing={2}>
              {selectField(
                'designationId',
                'Designation',
                (designations.data ?? []).map((d) => ({ value: d.id, label: d.name })),
              )}
              {selectField(
                'vendorId',
                category === 'VISITOR' ? 'Company (vendor)' : 'Contractor (vendor)',
                (vendors.data ?? []).map((v) => ({ value: v.id, label: v.name })),
              )}
              {category === 'WORKER' && field('natureOfContractor', 'Nature of contractor')}
              {selectField(
                'siteId',
                'Site',
                (sites.data ?? []).map((s) => ({ value: s.id, label: s.name })),
              )}
              {field('joinDate', category === 'VISITOR' ? 'Visit date' : 'Date of joining', {
                type: 'date',
                disabled: !!editing,
              })}
            </Grid>

            {showBankSections && (
              <>
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
                  {field(
                    'aadhaar',
                    editing ? 'Gov ID number (leave blank to keep)' : 'Gov ID number (encrypted)',
                  )}
                  {field(
                    'pan',
                    editing ? 'PAN (leave blank to keep)' : 'PAN card number (encrypted)',
                  )}
                </Grid>
              </>
            )}
            {!showBankSections && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" gutterBottom>
                  ID proof
                </Typography>
                <Grid container spacing={2}>
                  {field('govIdType', 'Gov ID type (e.g. Aadhaar)')}
                  {field(
                    'aadhaar',
                    editing ? 'Gov ID number (leave blank to keep)' : 'Gov ID number (encrypted)',
                  )}
                  {field(
                    'pan',
                    editing ? 'PAN (leave blank to keep)' : 'PAN card number (encrypted)',
                  )}
                </Grid>
              </>
            )}

            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" gutterBottom>
              Screening & ID card
            </Typography>
            <Grid container spacing={2}>
              {field('screeningDoneOn', 'Screening done on', { type: 'date' })}
              {field('screeningDoneBy', 'Screening done by')}
              {field('inductionDoneOn', 'Induction done on', { type: 'date' })}
              {field('inductedBy', 'Inducted by')}
              {field('validityTill', 'Validity till', { type: 'date' })}
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
            <Button type="submit" variant="contained" disabled={save.isPending || uploading}>
              {editing ? 'Save changes' : `Create ${labels.singular}`}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog open={!!qrWorker} onClose={() => setQrWorker(null)}>
        <DialogTitle>QR badge</DialogTitle>
        <DialogContent>
          <Stack alignItems="center" sx={{ py: 1 }} className="print-area">
            {qrWorker && (
              <QrBadge fullName={qrWorker.fullName} workerCode={qrWorker.workerCode} size={140} />
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
