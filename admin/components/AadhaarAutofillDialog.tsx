'use client';

import * as React from 'react';
import {
  Alert,
  Button,
  Checkbox,
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
  Typography,
} from '@mui/material';
import { AadhaarData, aadhaarLast4, dobIso, fullAddress, guardianName } from '@/lib/aadhaar/decoder';

/** A form field the Aadhaar QR can populate. */
export interface AadhaarFill {
  name: 'fullName' | 'fatherName' | 'gender' | 'dateOfBirth' | 'pincode';
  label: string;
  /** Value read off the card, already in the shape the form field expects. */
  value: string;
  /** What the form holds right now — non-empty means applying overwrites it. */
  current: string;
}

/** Aadhaar prints M / F / T; the form's third option is OTHER. */
function toFormGender(g?: string): string | undefined {
  const v = g?.trim().toUpperCase();
  if (v === 'M' || v === 'F') return v;
  return v ? 'OTHER' : undefined;
}

/** The subset of the decoded card that maps onto form fields, ignoring blanks. */
export function fillsFor(
  d: AadhaarData,
  current: Partial<Record<AadhaarFill['name'], string | undefined>>,
): AadhaarFill[] {
  const candidates: { name: AadhaarFill['name']; label: string; value?: string }[] = [
    { name: 'fullName', label: 'Full name', value: d.name },
    { name: 'fatherName', label: "Father's name", value: guardianName(d) },
    { name: 'gender', label: 'Gender', value: toFormGender(d.gender) },
    { name: 'dateOfBirth', label: 'Date of birth', value: dobIso(d) },
    { name: 'pincode', label: 'Pincode', value: d.pincode },
  ];
  return candidates
    .filter((c): c is { name: AadhaarFill['name']; label: string; value: string } => !!c.value)
    .map((c) => ({ ...c, current: current[c.name]?.trim() ?? '' }));
}

export function AadhaarAutofillDialog({
  data,
  fills,
  onApply,
  onClose,
}: {
  data: AadhaarData | null;
  fills: AadhaarFill[];
  onApply: (chosen: AadhaarFill[]) => void;
  onClose: () => void;
}) {
  // Default to filling blanks only, so a card scan never quietly clobbers a
  // value the admin typed by hand. Overwrites are opt-in, per field.
  const [checked, setChecked] = React.useState<Record<string, boolean>>({});
  React.useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const f of fills) next[f.name] = f.current === '' || f.current === f.value;
    setChecked(next);
  }, [fills]);

  if (!data) return null;

  const chosen = fills.filter((f) => checked[f.name] && f.current !== f.value);
  const overwrites = chosen.filter((f) => f.current !== '');
  const last4 = aadhaarLast4(data);
  const address = fullAddress(data);

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Autofill from Aadhaar card</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Read from the QR code printed on the card
            {last4 ? ` ending ${last4}` : ''}
            {data.secure ? '' : ' (older card — details are not tamper-resistant)'}. The card image
            was read on this computer; the Aadhaar number itself is not in the QR code.
          </Typography>

          {fills.length === 0 ? (
            <Alert severity="info">The QR code carries no fields this form can use.</Alert>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox" />
                  <TableCell>Field</TableCell>
                  <TableCell>Current</TableCell>
                  <TableCell>From card</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {fills.map((f) => {
                  const same = f.current === f.value;
                  return (
                    <TableRow key={f.name} hover>
                      <TableCell padding="checkbox">
                        <Checkbox
                          size="small"
                          disabled={same}
                          checked={!!checked[f.name] && !same}
                          onChange={(e) =>
                            setChecked((p) => ({ ...p, [f.name]: e.target.checked }))
                          }
                        />
                      </TableCell>
                      <TableCell>{f.label}</TableCell>
                      <TableCell
                        sx={{ color: f.current ? 'text.primary' : 'text.disabled' }}
                      >
                        {f.current || '—'}
                      </TableCell>
                      <TableCell sx={{ fontWeight: same ? 400 : 600 }}>
                        {f.value}
                        {same && (
                          <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                            matches
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {overwrites.length > 0 && (
            <Alert severity="warning">
              This will replace what you already entered for{' '}
              {overwrites.map((f) => f.label.toLowerCase()).join(', ')}.
            </Alert>
          )}

          {address && (
            <Typography variant="caption" color="text.secondary">
              Address on card: {address}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">
          Skip
        </Button>
        <Button variant="contained" disabled={chosen.length === 0} onClick={() => onApply(chosen)}>
          Autofill {chosen.length > 0 ? `${chosen.length} field${chosen.length === 1 ? '' : 's'}` : ''}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
