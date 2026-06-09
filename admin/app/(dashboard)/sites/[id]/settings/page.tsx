'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  CardContent,
  FormControlLabel,
  Grid,
  MenuItem,
  Stack,
  Switch,
  TextField,
} from '@mui/material';
import { useForm, Controller } from 'react-hook-form';
import { api } from '@/lib/api/browser';
import { PageHeader } from '@/components/PageHeader';
import { SiteSettings } from '@/lib/types';

export default function SiteSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [saved, setSaved] = React.useState(false);

  const settings = useQuery({
    queryKey: ['site-settings', id],
    queryFn: () => api.get<SiteSettings>(`/sites/${id}/settings`),
  });

  const { register, handleSubmit, control, reset } = useForm<SiteSettings>();

  React.useEffect(() => {
    if (settings.data) reset(settings.data);
  }, [settings.data, reset]);

  const save = useMutation({
    mutationFn: (v: SiteSettings) =>
      api.put(`/sites/${id}/settings`, {
        verificationMode: v.verificationMode,
        autoLoginCountdownSeconds: Number(v.autoLoginCountdownSeconds),
        duplicateTapCooldownSeconds: Number(v.duplicateTapCooldownSeconds),
        geoEnforcement: v.geoEnforcement,
        geoRadiusMeters: Number(v.geoRadiusMeters),
        photoVerificationMode: v.photoVerificationMode,
        photoVerificationRandomPct: Number(v.photoVerificationRandomPct),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['site-settings', id] });
      setSaved(true);
    },
  });

  if (!settings.data) return null;

  return (
    <>
      <PageHeader title="Site settings" subtitle="Verification, cooldown, geo and photo policy" />
      <Card>
        <CardContent>
          {saved && (
            <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSaved(false)}>
              Settings saved
            </Alert>
          )}
          <form onSubmit={handleSubmit((v) => save.mutate(v))}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Controller
                  name="verificationMode"
                  control={control}
                  render={({ field }) => (
                    <TextField select label="Verification mode" fullWidth {...field}>
                      <MenuItem value="MANUAL">Manual (watchman confirms)</MenuItem>
                      <MenuItem value="AUTO">Auto (countdown)</MenuItem>
                    </TextField>
                  )}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Auto-login countdown (s)"
                  type="number"
                  fullWidth
                  {...register('autoLoginCountdownSeconds')}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Duplicate-tap cooldown (s)"
                  type="number"
                  fullWidth
                  {...register('duplicateTapCooldownSeconds')}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Controller
                  name="geoEnforcement"
                  control={control}
                  render={({ field }) => (
                    <FormControlLabel
                      control={<Switch checked={!!field.value} onChange={field.onChange} />}
                      label="Enforce geofence"
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Geofence radius (m)"
                  type="number"
                  fullWidth
                  {...register('geoRadiusMeters')}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Controller
                  name="photoVerificationMode"
                  control={control}
                  render={({ field }) => (
                    <TextField select label="Photo verification" fullWidth {...field}>
                      <MenuItem value="ALWAYS">Always</MenuItem>
                      <MenuItem value="NEVER">Never</MenuItem>
                      <MenuItem value="RANDOM">Random</MenuItem>
                    </TextField>
                  )}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Random photo verification (%)"
                  type="number"
                  fullWidth
                  {...register('photoVerificationRandomPct')}
                />
              </Grid>
              <Grid item xs={12}>
                <Stack direction="row" justifyContent="flex-end">
                  <Button type="submit" variant="contained" disabled={save.isPending}>
                    Save settings
                  </Button>
                </Stack>
              </Grid>
            </Grid>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
