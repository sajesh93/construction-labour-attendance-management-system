'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { api } from '@/lib/api/browser';
import { Paginated, Site, Worker } from '@/lib/types';
import { QrBadge } from '@/components/QrBadge';

export default function BadgesPage() {
  const [siteId, setSiteId] = React.useState('');
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => api.get<Site[]>('/sites') });
  const workers = useQuery({
    queryKey: ['workers', 'all-badges', siteId],
    queryFn: () =>
      api.get<Paginated<Worker>>(`/workers?limit=200${siteId ? `&siteId=${siteId}` : ''}`),
  });

  const siteName = sites.data?.find((s) => s.id === siteId)?.name;
  const list = workers.data?.data ?? [];

  return (
    <Box>
      {/* Controls hidden when printing */}
      <Stack
        direction="row"
        spacing={2}
        alignItems="center"
        sx={{ mb: 3, '@media print': { display: 'none' } }}
      >
        <Typography variant="h5" sx={{ flexGrow: 1 }}>
          QR badges
        </Typography>
        <TextField
          select
          size="small"
          label="Site"
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          sx={{ width: 240 }}
        >
          <MenuItem value="">All workers</MenuItem>
          {sites.data?.map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {s.name}
            </MenuItem>
          ))}
        </TextField>
        <Button variant="contained" onClick={() => window.print()} disabled={list.length === 0}>
          Print ({list.length})
        </Button>
      </Stack>

      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 2,
          '@media print': { gap: '10px' },
        }}
      >
        {list.map((w) => (
          <QrBadge key={w.id} fullName={w.fullName} workerCode={w.workerCode} siteName={siteName} />
        ))}
        {list.length === 0 && (
          <Typography color="text.secondary">No workers to print for this selection.</Typography>
        )}
      </Box>
    </Box>
  );
}
