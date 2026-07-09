'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  InputAdornment,
  MenuItem,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Controller, useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import { api, BrowserApiError } from '@/lib/api/browser';
import { PageHeader } from '@/components/PageHeader';
import { QrBadge } from '@/components/QrBadge';
import { CameraCaptureDialog } from '@/components/CameraCaptureDialog';
import { FilterBar } from '@/components/ui/FilterBar';
import { StatusBadge, statusTone, BadgeTone } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import {
  AadhaarAutofillDialog,
  AadhaarFill,
  fillsFor,
} from '@/components/AadhaarAutofillDialog';
import { AadhaarData } from '@/lib/aadhaar/decoder';
import { decodeAadhaarFromImage, decodeAadhaarFromPhotoId } from '@/lib/aadhaar/scan-image';
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
  aadhaarFrontPhotoId?: string;
  aadhaarBackPhotoId?: string;
  escortName?: string;
  visitorCompany?: string;
  idProofPhotoId?: string;
}

type WorkerDetail = Worker & {
  nfcUid?: string | null;
  qrIdentifier?: string | null;
  joinDate?: string | null;
  assignments?: { siteId: string }[];
  aadhaarFrontPhotoId?: string | null;
  aadhaarBackPhotoId?: string | null;
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
    aadhaarFrontPhotoId: w.aadhaarFrontPhotoId ?? '',
    aadhaarBackPhotoId: w.aadhaarBackPhotoId ?? '',
    escortName: w.escortName ?? '',
    visitorCompany: w.visitorCompany ?? '',
    idProofPhotoId: w.idProofPhotoId ?? '',
  };
}

/** Resolve a stored photoUrl (e.g. "/files/<id>") to a browser-loadable src. */
export function photoSrc(photoUrl?: string | null): string | undefined {
  if (!photoUrl) return undefined;
  return photoUrl.startsWith('/files/')
    ? `/api/photo/${photoUrl.slice('/files/'.length)}`
    : photoUrl;
}

type PhotoKind = 'PROFILE' | 'AADHAAR_FRONT' | 'AADHAAR_BACK' | 'ID_PROOF';

/**
 * Downscale + JPEG-compress client-side, then upload to /files. The server
 * re-compresses (and encrypts Aadhaar kinds) as the authoritative step; this
 * just saves bandwidth. Returns the stored { url, id }.
 */
async function uploadImage(
  file: File,
  kind: PhotoKind = 'PROFILE',
): Promise<{ url: string; id: string }> {
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
  // Aadhaar cards keep more pixels so the text stays legible and the Secure QR
  // survives to be machine-read. The server re-compresses to its own ceiling.
  const maxDim = kind === 'PROFILE' ? 800 : 1800;
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const jpeg = canvas.toDataURL('image/jpeg', kind === 'PROFILE' ? 0.85 : 0.88);
  const base64 = jpeg.split(',')[1];
  return api.post<{ url: string; id: string }>('/files', {
    dataBase64: base64,
    mimeType: 'image/jpeg',
    kind,
  });
}

/** Person status → badge tone (SUSPENDED reads as a warning, not neutral). */
function personTone(status: string): BadgeTone {
  return status === 'SUSPENDED' ? 'warning' : statusTone(status);
}

/** Uppercase section label inside the profile/edit dialog. */
function SectionHeading({ children, first = false }: { children: React.ReactNode; first?: boolean }) {
  return (
    <>
      {!first && <Divider sx={{ mt: 3, mb: 2.5 }} />}
      <Typography
        variant="overline"
        component="div"
        sx={{ color: 'text.secondary', lineHeight: 1.4, mb: 1.5 }}
      >
        {children}
      </Typography>
    </>
  );
}

export function PeopleDirectory({ category }: { category: PersonCategory }) {
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const labels = LABELS[category];
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [qrWorker, setQrWorker] = React.useState<Worker | null>(null);
  const [editing, setEditing] = React.useState<WorkerDetail | null>(null);
  const [deleting, setDeleting] = React.useState<Worker | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    watch,
    getValues,
    formState: { errors },
  } = useForm<PersonForm>({
    defaultValues: EMPTY_FORM,
  });
  const photoUrl = watch('photoUrl');
  const aadhaarFrontPhotoId = watch('aadhaarFrontPhotoId');
  const aadhaarBackPhotoId = watch('aadhaarBackPhotoId');
  const idProofPhotoId = watch('idProofPhotoId');
  const isVisitor = category === 'VISITOR';

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

  // Presentation-only filters over the already-loaded rows.
  const [siteFilter, setSiteFilter] = React.useState('');
  const [vendorFilter, setVendorFilter] = React.useState('');
  const [designationFilter, setDesignationFilter] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');
  const filtersActive = !!(siteFilter || vendorFilter || designationFilter || statusFilter);
  const visibleRows = allRows.filter((w) => {
    if (statusFilter && w.status !== statusFilter) return false;
    if (vendorFilter && (w.vendorId ?? '') !== vendorFilter) return false;
    if (designationFilter && (w.designationId ?? '') !== designationFilter) return false;
    if (siteFilter && (w.assignments?.[0]?.site?.name ?? '') !== siteFilter) return false;
    return true;
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['workers'] });

  const closeDialog = () => {
    setOpen(false);
    setEditing(null);
    setError(null);
    reset(EMPTY_FORM);
    setAadhaarBackFile(null);
    clearLocalPreviews();
  };

  const openCreate = () => {
    setEditing(null);
    setError(null);
    reset(EMPTY_FORM);
    setAadhaarBackFile(null);
    clearLocalPreviews();
    setOpen(true);
  };

  const openEdit = async (w: Worker) => {
    try {
      const full = await api.get<WorkerDetail>(`/workers/${w.id}`);
      setEditing(full);
      setError(null);
      reset(toForm(full));
      setAadhaarBackFile(null);
      clearLocalPreviews();
      setOpen(true);
    } catch (e) {
      const err = e as BrowserApiError;
      toast.error(err.body?.detail ?? err.body?.title ?? `Failed to load ${labels.singular}`);
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
      // Optional visitor fields: on edit, '' must clear the stored value.
      if (isVisitor && editing) {
        body.visitorCompany = v.visitorCompany ? v.visitorCompany : null;
        body.idProofPhotoId = v.idProofPhotoId ? v.idProofPhotoId : null;
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
      toast.success(
        editing
          ? `Saved changes to ${labels.singular}`
          : `New ${labels.singular} created`,
      );
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
    onSuccess: () => {
      toast.success(`Deleted ${labels.singular}`);
      setDeleting(null);
      refresh();
    },
    onError: (e) => {
      const err = e as BrowserApiError;
      setDeleting(null);
      toast.error(err.body?.detail ?? err.body?.title ?? `Failed to delete ${labels.singular}`);
    },
  });

  // Which image slot, if any, is currently being captured from the camera.
  const [capture, setCapture] = React.useState<PhotoKind | null>(null);

  // Details read off the Aadhaar QR, awaiting the admin's confirmation.
  const [aadhaarScan, setAadhaarScan] = React.useState<AadhaarData | null>(null);
  const [scanning, setScanning] = React.useState(false);
  // The back image exactly as the admin picked it. The uploaded copy is
  // downscaled and JPEG-compressed, which can destroy a dense Secure QR, so we
  // always prefer scanning the original when it is still in memory.
  const [aadhaarBackFile, setAadhaarBackFile] = React.useState<File | null>(null);

  // Object URLs for the images just picked, so a thumbnail appears at once
  // instead of waiting on the upload + photo-proxy round trip (and still shows
  // if that round trip fails). Revoked when the dialog closes.
  const [localPreviews, setLocalPreviews] = React.useState<Partial<Record<PhotoKind, string>>>({});
  const setLocalPreview = (kind: PhotoKind, file: File) =>
    setLocalPreviews((prev) => {
      if (prev[kind]) URL.revokeObjectURL(prev[kind]!);
      return { ...prev, [kind]: URL.createObjectURL(file) };
    });
  const clearLocalPreview = (kind: PhotoKind) =>
    setLocalPreviews((prev) => {
      if (prev[kind]) URL.revokeObjectURL(prev[kind]!);
      const next = { ...prev };
      delete next[kind];
      return next;
    });
  const clearLocalPreviews = React.useCallback(() => {
    setLocalPreviews((prev) => {
      for (const url of Object.values(prev)) URL.revokeObjectURL(url);
      return {};
    });
  }, []);
  React.useEffect(() => clearLocalPreviews, [clearLocalPreviews]);

  /** Explain a failed scan in terms the admin can act on. */
  const reportScanFailure = () =>
    toast.error(
      'No Aadhaar QR code found on the back of the card. Make sure the whole QR is in frame, in focus and not glared out.',
    );

  /**
   * Read the Aadhaar QR out of the back of the card. Runs in the browser, so
   * the payload never reaches the API. A card with no readable QR is the normal
   * case, not an error — the admin simply types the details in.
   *
   * `announce` is on for the button (the admin asked, so tell them what
   * happened) and off for the automatic attempt after an upload, where a
   * failure toast would be noise.
   */
  const scanAadhaar = async (file: Blob, announce: boolean) => {
    setScanning(true);
    try {
      const scan = await decodeAadhaarFromImage(file);
      if (scan.data) setAadhaarScan(scan.data);
      else if (announce) reportScanFailure();
    } catch {
      // A QR we cannot read must never block an upload that already succeeded.
      if (announce) toast.error('Could not read that image.');
    } finally {
      setScanning(false);
    }
  };

  /**
   * The Secure QR lives on the back of the card, so that is the only face worth
   * scanning. Prefer the original picked file; fall back to the stored image so
   * autofill still works when re-opening a worker saved earlier.
   */
  const autofillFromAadhaar = async () => {
    if (aadhaarBackFile) return scanAadhaar(aadhaarBackFile, true);
    if (!aadhaarBackPhotoId) return;

    setScanning(true);
    try {
      const scan = await decodeAadhaarFromPhotoId(aadhaarBackPhotoId);
      if (scan.data) setAadhaarScan(scan.data);
      else reportScanFailure();
    } catch {
      toast.error('Could not read the uploaded card image.');
    } finally {
      setScanning(false);
    }
  };

  // Shared upload path for both file-input picks and camera captures.
  const handleImageFile = async (file: File, kind: PhotoKind) => {
    setUploading(true);
    // Show what was picked straight away; the upload can take a moment.
    setLocalPreview(kind, file);
    try {
      const { url, id } = await uploadImage(file, kind);
      if (kind === 'PROFILE') {
        setValue('photoUrl', url, { shouldDirty: true });
      } else if (kind === 'ID_PROOF') {
        setValue('idProofPhotoId', id, { shouldDirty: true });
      } else {
        setValue(kind === 'AADHAAR_FRONT' ? 'aadhaarFrontPhotoId' : 'aadhaarBackPhotoId', id, {
          shouldDirty: true,
        });
        // Only the back carries the Secure QR. Keep the original around: it is
        // a better scan target than the compressed copy we just uploaded.
        if (kind === 'AADHAAR_BACK') {
          setAadhaarBackFile(file);
          await scanAadhaar(file, false);
        }
      }
    } catch {
      // Nothing was stored, so the thumbnail must not imply otherwise.
      clearLocalPreview(kind);
      setError(
        kind === 'PROFILE'
          ? 'Photo upload failed'
          : kind === 'ID_PROOF'
            ? 'ID proof image upload failed'
            : 'Aadhaar image upload failed',
      );
    } finally {
      setUploading(false);
    }
  };

  const onPickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await handleImageFile(file, 'PROFILE');
  };

  const onPickIdProof = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await handleImageFile(file, 'ID_PROOF');
  };

  const onPickAadhaar =
    (side: 'AADHAAR_FRONT' | 'AADHAAR_BACK') => async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (file) await handleImageFile(file, side);
    };

  const field = (
    name: keyof PersonForm,
    label: string,
    opts: { type?: string; disabled?: boolean; required?: string } = {},
  ) => (
    <Grid item xs={12} sm={6} md={4}>
      <TextField
        label={label}
        type={opts.type ?? 'text'}
        fullWidth
        size="small"
        disabled={opts.disabled}
        error={!!errors[name]}
        helperText={errors[name]?.message}
        InputLabelProps={{ shrink: true }}
        {...register(name, opts.required ? { required: opts.required } : undefined)}
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
  const loading = workers.isLoading;
  const columnCount = 6 + (isVisitor ? 0 : 1) + (category === 'WORKER' ? 1 : 0) - 1;

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
      <FilterBar>
        <TextField
          size="small"
          placeholder="Search name / code / mobile"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          sx={{ width: { xs: '100%', sm: 260 } }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" color="disabled" />
              </InputAdornment>
            ),
          }}
        />
        <TextField
          select
          size="small"
          label="Site"
          value={siteFilter}
          onChange={(e) => setSiteFilter(e.target.value)}
          sx={{ width: 160 }}
          InputLabelProps={{ shrink: true }}
          SelectProps={{ displayEmpty: true }}
        >
          <MenuItem value="">All sites</MenuItem>
          {(sites.data ?? []).map((s) => (
            <MenuItem key={s.id} value={s.name}>
              {s.name}
            </MenuItem>
          ))}
        </TextField>
        {!isVisitor && (
          <TextField
            select
            size="small"
            label="Vendor"
            value={vendorFilter}
            onChange={(e) => setVendorFilter(e.target.value)}
            sx={{ width: 160 }}
            InputLabelProps={{ shrink: true }}
            SelectProps={{ displayEmpty: true }}
          >
            <MenuItem value="">All vendors</MenuItem>
            {(vendors.data ?? []).map((v) => (
              <MenuItem key={v.id} value={v.id}>
                {v.name}
              </MenuItem>
            ))}
          </TextField>
        )}
        {!isVisitor && (
          <TextField
            select
            size="small"
            label="Designation"
            value={designationFilter}
            onChange={(e) => setDesignationFilter(e.target.value)}
            sx={{ width: 170 }}
            InputLabelProps={{ shrink: true }}
            SelectProps={{ displayEmpty: true }}
          >
            <MenuItem value="">All designations</MenuItem>
            {(designations.data ?? []).map((d) => (
              <MenuItem key={d.id} value={d.id}>
                {d.name}
              </MenuItem>
            ))}
          </TextField>
        )}
        <TextField
          select
          size="small"
          label="Status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          sx={{ width: 140 }}
          InputLabelProps={{ shrink: true }}
          SelectProps={{ displayEmpty: true }}
        >
          <MenuItem value="">All statuses</MenuItem>
          <MenuItem value="ACTIVE">Active</MenuItem>
          <MenuItem value="INACTIVE">Inactive</MenuItem>
          <MenuItem value="SUSPENDED">Suspended</MenuItem>
          <MenuItem value="EXITED">Exited</MenuItem>
        </TextField>
        <TextField
          select
          size="small"
          label="Sort by"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          sx={{ width: 170 }}
          InputLabelProps={{ shrink: true }}
        >
          <MenuItem value="">Newest first</MenuItem>
          <MenuItem value="name">Name (A–Z)</MenuItem>
          <MenuItem value="designation">Designation</MenuItem>
          <MenuItem value="vendor">Vendor / contractor</MenuItem>
        </TextField>
      </FilterBar>
      {error && !open && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <Card>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 720 }}>
            <TableHead>
              <TableRow>
                <TableCell>{isVisitor ? 'Visitor' : 'Person'}</TableCell>
                {isVisitor ? (
                  <>
                    <TableCell>Escort</TableCell>
                    <TableCell>Company</TableCell>
                  </>
                ) : (
                  <>
                    <TableCell>Designation</TableCell>
                    <TableCell>Vendor</TableCell>
                  </>
                )}
                <TableCell>Mobile</TableCell>
                {category === 'WORKER' && <TableCell>PF / ESI</TableCell>}
                {!isVisitor && <TableCell>Gov ID</TableCell>}
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={`skeleton-${i}`}>
                    <TableCell>
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <Skeleton variant="circular" width={36} height={36} />
                        <Box sx={{ flex: 1 }}>
                          <Skeleton width="55%" />
                          <Skeleton width="30%" height={14} />
                        </Box>
                      </Stack>
                    </TableCell>
                    {Array.from({ length: columnCount }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton width="50%" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              {!loading &&
                visibleRows.map((w) => (
                  <TableRow key={w.id} hover>
                    <TableCell>
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <Avatar src={photoSrc(w.photoUrl)} sx={{ width: 36, height: 36 }}>
                          {w.fullName.charAt(0)}
                        </Avatar>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                            {w.fullName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {w.workerCode}
                          </Typography>
                        </Box>
                      </Stack>
                    </TableCell>
                    {isVisitor ? (
                      <>
                        <TableCell>{w.escortName ?? '—'}</TableCell>
                        <TableCell>{w.visitorCompany ?? '—'}</TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell>{w.designation?.name ?? '—'}</TableCell>
                        <TableCell>{w.vendor?.name ?? '—'}</TableCell>
                      </>
                    )}
                    <TableCell>{w.mobileNumber ?? '—'}</TableCell>
                    {category === 'WORKER' && (
                      <TableCell>{(w.pfNumber ?? '—') + ' / ' + (w.esiNumber ?? '—')}</TableCell>
                    )}
                    {!isVisitor && (
                      <TableCell>
                        {[
                          w.govIdType ? `${w.govIdType} ••${w.aadhaarLast4 ?? ''}` : null,
                          w.panLast4 ? `PAN ••${w.panLast4}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </TableCell>
                    )}
                    <TableCell>
                      <StatusBadge label={w.status} tone={personTone(w.status)} />
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => openEdit(w)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Show QR">
                        <IconButton size="small" onClick={() => setQrWorker(w)}>
                          <QrCode2Icon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" onClick={() => setDeleting(w)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </Box>
        {!loading && visibleRows.length === 0 && (
          <EmptyState
            compact
            icon={<PeopleAltOutlinedIcon />}
            title={
              filtersActive || q
                ? `No ${labels.plural.toLowerCase()} match the current filters`
                : `No ${labels.plural.toLowerCase()} yet`
            }
            description={
              filtersActive || q
                ? 'Try clearing the search or filters above.'
                : `Add your first ${labels.singular} to get started.`
            }
            action={
              !(filtersActive || q) ? (
                <Button variant="contained" onClick={openCreate}>
                  New {labels.singular}
                </Button>
              ) : undefined
            }
          />
        )}
        {nextCursor && (
          <Stack alignItems="center" sx={{ p: 1.5, borderTop: 1, borderColor: 'divider' }}>
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
        <Box
          component="form"
          onSubmit={handleSubmit((v) => save.mutate(v))}
          sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}
        >
          <DialogContent dividers>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            {!isVisitor && (
              <>
                <SectionHeading first>Photo</SectionHeading>
                <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
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
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<CameraAltIcon />}
                    disabled={uploading}
                    onClick={() => setCapture('PROFILE')}
                  >
                    Capture
                  </Button>
                  {photoUrl && (
                    <Button size="small" color="inherit" onClick={() => setValue('photoUrl', '')}>
                      Remove
                    </Button>
                  )}
                  <Typography variant="caption" color="text.secondary">
                    Optional
                  </Typography>
                </Stack>
              </>
            )}

            {category === 'WORKER' && (
              <>
                <SectionHeading>Aadhaar card images</SectionHeading>
                <Grid container spacing={2} sx={{ mb: 1 }}>
                  {(
                    [
                      ['AADHAAR_FRONT', 'Front *', aadhaarFrontPhotoId, 'aadhaarFrontPhotoId'],
                      ['AADHAAR_BACK', 'Back', aadhaarBackPhotoId, 'aadhaarBackPhotoId'],
                    ] as const
                  ).map(([side, label, id, field]) => (
                    <Grid item xs={12} sm={6} key={side}>
                      <Stack direction="row" spacing={2} alignItems="center">
                        <Avatar
                          variant="rounded"
                          // The just-picked file wins: it renders instantly and
                          // does not depend on the upload having landed.
                          src={localPreviews[side] ?? (id ? photoSrc(`/files/${id}`) : undefined)}
                          sx={{ width: 88, height: 56 }}
                        >
                          <CreditCardIcon fontSize="small" />
                        </Avatar>
                        <Stack spacing={0.5}>
                          <Typography variant="caption" color="text.secondary">
                            Aadhaar {label}
                          </Typography>
                          <Stack direction="row" spacing={1}>
                            <Button
                              component="label"
                              variant="outlined"
                              size="small"
                              disabled={uploading}
                            >
                              {id ? 'Replace' : 'Upload'}
                              <input
                                type="file"
                                accept="image/*"
                                hidden
                                onChange={onPickAadhaar(side)}
                              />
                            </Button>
                            <Button
                              variant="outlined"
                              size="small"
                              startIcon={<CameraAltIcon />}
                              disabled={uploading}
                              onClick={() => setCapture(side)}
                            >
                              Capture
                            </Button>
                            {id && (
                              <Button
                                size="small"
                                color="inherit"
                                onClick={() => {
                                  setValue(field, '');
                                  clearLocalPreview(side);
                                  // Drop the cached original too, or Autofill
                                  // would scan a card that is no longer attached.
                                  if (side === 'AADHAAR_BACK') setAadhaarBackFile(null);
                                }}
                              >
                                Remove
                              </Button>
                            )}
                          </Stack>
                        </Stack>
                      </Stack>
                    </Grid>
                  ))}
                </Grid>
                <Stack
                  direction="row"
                  spacing={1.5}
                  alignItems="center"
                  flexWrap="wrap"
                  useFlexGap
                  sx={{ mb: 1 }}
                >
                  {/* The Secure QR is printed on the back, so there is nothing
                      to read until that side is attached. */}
                  <Tooltip
                    title={
                      aadhaarBackPhotoId
                        ? ''
                        : 'Upload the back of the Aadhaar card — the QR code is printed there'
                    }
                  >
                    <span>
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={
                          scanning ? (
                            <CircularProgress size={16} color="inherit" />
                          ) : (
                            <AutoFixHighIcon />
                          )
                        }
                        disabled={scanning || uploading || !aadhaarBackPhotoId}
                        onClick={autofillFromAadhaar}
                      >
                        {scanning ? 'Reading card…' : 'Autofill from Aadhaar'}
                      </Button>
                    </span>
                  </Tooltip>
                  <Typography variant="caption" color="text.secondary">
                    Reads the QR code on the <strong>back</strong> of the card to fill name,
                    father&apos;s name, gender, date of birth and pincode. Nothing is sent to the
                    server.
                  </Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  Encrypted and compressed at rest. Front is required; back is optional and can be
                  added later.
                </Typography>
              </>
            )}

            <SectionHeading first={isVisitor}>Identity</SectionHeading>
            <Grid container spacing={2}>
              {/* IDs are always auto-generated (W-/S-/V-####) and immutable. */}
              {editing && field('workerCode', 'ID (auto-generated)', { disabled: true })}
              {field('fullName', 'Full name *', { required: 'Full name is required' })}
              {!isVisitor && field('fatherName', "Father's name")}
              {selectField('gender', 'Gender', [
                { value: 'M', label: 'Male' },
                { value: 'F', label: 'Female' },
                { value: 'OTHER', label: 'Other' },
              ])}
              {!isVisitor && field('dateOfBirth', 'Date of birth', { type: 'date' })}
              {!isVisitor && field('language', 'Language')}
              {field('mobileNumber', 'Mobile number')}
              {!isVisitor && field('pincode', 'Zipcode / pincode')}
              {field('bloodGroup', 'Blood group')}
              {isVisitor && field('escortName', 'Escort name *', { required: 'Escort name is required' })}
              {editing &&
                selectField('status', 'Status', [
                  { value: 'ACTIVE', label: 'Active' },
                  { value: 'INACTIVE', label: 'Inactive' },
                  { value: 'SUSPENDED', label: 'Suspended' },
                  { value: 'EXITED', label: 'Exited' },
                ])}
            </Grid>

            <SectionHeading>
              {category === 'VISITOR' ? 'Visit details' : 'Designation & assignment'}
            </SectionHeading>
            <Grid container spacing={2}>
              {!isVisitor &&
                selectField(
                  'designationId',
                  'Designation',
                  (designations.data ?? []).map((d) => ({ value: d.id, label: d.name })),
                )}
              {isVisitor
                ? field('visitorCompany', 'Visitor company')
                : selectField(
                    'vendorId',
                    'Contractor (vendor)',
                    (vendors.data ?? []).map((v) => ({ value: v.id, label: v.name })),
                  )}
              {category === 'WORKER' && field('natureOfContractor', 'Nature of contractor')}
              {selectField(
                'siteId',
                'Site',
                (sites.data ?? []).map((s) => ({ value: s.id, label: s.name })),
              )}
              {field('joinDate', isVisitor ? 'Visit date' : 'Date of joining', {
                type: 'date',
                disabled: !!editing,
              })}
            </Grid>

            {showBankSections && (
              <>
                <SectionHeading>Nominee & emergency</SectionHeading>
                <Grid container spacing={2}>
                  {field('nomineeName', 'Nominee name')}
                  {field('nomineeRelation', 'Nominee relation')}
                  {field('emergencyContactName', 'Emergency contact name')}
                  {field('emergencyContactNumber', 'Emergency contact number')}
                </Grid>

                <SectionHeading>Bank & statutory</SectionHeading>
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
            {isVisitor && (
              <>
                <SectionHeading>ID proof photo (optional)</SectionHeading>
                <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Avatar
                    variant="rounded"
                    src={idProofPhotoId ? photoSrc(`/files/${idProofPhotoId}`) : undefined}
                    sx={{ width: 88, height: 56 }}
                  >
                    <CreditCardIcon fontSize="small" />
                  </Avatar>
                  <Button component="label" variant="outlined" size="small" disabled={uploading}>
                    {idProofPhotoId ? 'Replace' : 'Upload'}
                    <input type="file" accept="image/*" hidden onChange={onPickIdProof} />
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<CameraAltIcon />}
                    disabled={uploading}
                    onClick={() => setCapture('ID_PROOF')}
                  >
                    Capture
                  </Button>
                  {idProofPhotoId && (
                    <Button size="small" color="inherit" onClick={() => setValue('idProofPhotoId', '')}>
                      Remove
                    </Button>
                  )}
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  Any government ID (Aadhaar, driving licence…). Encrypted and compressed at rest.
                </Typography>
              </>
            )}

            {!isVisitor && (
              <>
                <SectionHeading>Screening & ID card</SectionHeading>
                <Grid container spacing={2}>
                  {field('screeningDoneOn', 'Screening done on', { type: 'date' })}
                  {field('screeningDoneBy', 'Screening done by')}
                  {field('inductionDoneOn', 'Induction done on', { type: 'date' })}
                  {field('inductedBy', 'Inducted by')}
                  {field('validityTill', 'Validity till', { type: 'date' })}
                </Grid>

                <SectionHeading>Credentials</SectionHeading>
                <Grid container spacing={2}>
                  {field('nfcUid', 'NFC UID')}
                  {field('qrIdentifier', 'QR identifier')}
                </Grid>
              </>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={closeDialog} color="inherit">
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={save.isPending || uploading}>
              {save.isPending
                ? 'Saving…'
                : editing
                  ? 'Save changes'
                  : `Create ${labels.singular}`}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        title={`Delete ${labels.singular}?`}
        message={
          deleting
            ? `Delete ${labels.singular} "${deleting.fullName}" (${deleting.workerCode})? Attendance history is kept.`
            : ''
        }
        confirmLabel="Delete"
        danger
        busy={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onClose={() => setDeleting(null)}
      />

      <CameraCaptureDialog
        open={capture !== null}
        title={
          capture === 'AADHAAR_FRONT'
            ? 'Capture Aadhaar front'
            : capture === 'AADHAAR_BACK'
              ? 'Capture Aadhaar back'
              : capture === 'ID_PROOF'
                ? 'Capture ID proof'
                : 'Capture photo'
        }
        onClose={() => setCapture(null)}
        onCapture={(file) => {
          const kind = capture;
          setCapture(null);
          if (kind) void handleImageFile(file, kind);
        }}
      />

      <AadhaarAutofillDialog
        data={aadhaarScan}
        fills={
          aadhaarScan
            ? fillsFor(aadhaarScan, {
                fullName: getValues('fullName'),
                fatherName: getValues('fatherName'),
                gender: getValues('gender'),
                dateOfBirth: getValues('dateOfBirth'),
                pincode: getValues('pincode'),
              })
            : []
        }
        onClose={() => setAadhaarScan(null)}
        onApply={(chosen: AadhaarFill[]) => {
          for (const f of chosen) setValue(f.name, f.value, { shouldDirty: true });
          setAadhaarScan(null);
          toast.success(
            `Autofilled ${chosen.length} field${chosen.length === 1 ? '' : 's'} from the Aadhaar card`,
          );
        }}
      />

      <Dialog open={!!qrWorker} onClose={() => setQrWorker(null)}>
        <DialogTitle>QR badge</DialogTitle>
        <DialogContent>
          <Stack alignItems="center" sx={{ py: 1 }} className="print-area">
            {qrWorker && (
              <QrBadge fullName={qrWorker.fullName} workerCode={qrWorker.workerCode} size={140} />
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setQrWorker(null)} color="inherit">
            Close
          </Button>
          <Button variant="contained" onClick={() => window.print()}>
            Print
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
