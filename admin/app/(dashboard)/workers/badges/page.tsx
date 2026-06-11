'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { api } from '@/lib/api/browser';
import { Paginated, PersonCategory, Site, Worker } from '@/lib/types';
import { QrBadge } from '@/components/QrBadge';

const CATEGORY_TITLES: Record<PersonCategory, string> = {
  WORKER: 'Worker QR badges',
  STAFF: 'Staff QR badges',
  VISITOR: 'Visitor QR passes',
};

export default function BadgesPage() {
  const params = useSearchParams();
  const initial = (params.get('category') ?? 'WORKER').toUpperCase() as PersonCategory;
  const [category, setCategory] = React.useState<PersonCategory>(
    ['WORKER', 'STAFF', 'VISITOR'].includes(initial) ? initial : 'WORKER',
  );
  const [siteId, setSiteId] = React.useState('');
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => api.get<Site[]>('/sites') });
  const workers = useQuery({
    queryKey: ['workers', 'all-badges', category, siteId],
    queryFn: () =>
      api.get<Paginated<Worker>>(
        `/workers?limit=200&category=${category}${siteId ? `&siteId=${siteId}` : ''}`,
      ),
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
          {CATEGORY_TITLES[category]}
        </Typography>
        <TextField
          select
          size="small"
          label="Type"
          value={category}
          onChange={(e) => setCategory(e.target.value as PersonCategory)}
          sx={{ width: 160 }}
        >
          <MenuItem value="WORKER">Workers</MenuItem>
          <MenuItem value="STAFF">Staff</MenuItem>
          <MenuItem value="VISITOR">Visitors</MenuItem>
        </TextField>
        <TextField
          select
          size="small"
          label="Site"
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          sx={{ width: 240 }}
        >
          <MenuItem value="">All sites</MenuItem>
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
        className="print-area"
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 2,
          '@media print': { gap: '6px' },
        }}
      >
        {list.map((w) => (
          <QrBadge key={w.id} fullName={w.fullName} workerCode={w.workerCode} siteName={siteName} />
        ))}
        {list.length === 0 && (
          <Typography color="text.secondary">Nothing to print for this selection.</Typography>
        )}
      </Box>
    </Box>
  );
}
