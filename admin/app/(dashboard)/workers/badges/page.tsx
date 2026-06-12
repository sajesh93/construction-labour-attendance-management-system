'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Box, Button, Checkbox, MenuItem, Stack, TextField, Typography } from '@mui/material';
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
  const [q, setQ] = React.useState('');
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => api.get<Site[]>('/sites') });
  const workers = useQuery({
    queryKey: ['workers', 'all-badges', category, siteId, q],
    queryFn: () =>
      api.get<Paginated<Worker>>(
        `/workers?limit=200&category=${category}${siteId ? `&siteId=${siteId}` : ''}${
          q ? `&q=${encodeURIComponent(q)}` : ''
        }`,
      ),
  });

  const siteName = sites.data?.find((s) => s.id === siteId)?.name;
  const list = React.useMemo(() => workers.data?.data ?? [], [workers.data]);

  // Everyone in the current filter starts selected; untick to leave them out.
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  React.useEffect(() => {
    setSelected(new Set(list.map((w) => w.id)));
  }, [list]);
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectedCount = list.filter((w) => selected.has(w.id)).length;

  return (
    <Box>
      {/* Controls hidden when printing */}
      <Stack
        direction="row"
        spacing={2}
        alignItems="center"
        flexWrap="wrap"
        useFlexGap
        sx={{ mb: 3, '@media print': { display: 'none' } }}
      >
        <Typography variant="h5" sx={{ flexGrow: 1 }}>
          {CATEGORY_TITLES[category]}
        </Typography>
        <TextField
          size="small"
          placeholder="Search name / code / mobile"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          sx={{ width: 240 }}
        />
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
        <Button size="small" onClick={() => setSelected(new Set(list.map((w) => w.id)))}>
          Select all
        </Button>
        <Button size="small" onClick={() => setSelected(new Set())}>
          Clear
        </Button>
        <Button variant="contained" onClick={() => window.print()} disabled={selectedCount === 0}>
          Print selected ({selectedCount})
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
        {list.map((w) => {
          const isSelected = selected.has(w.id);
          return (
            <Box
              key={w.id}
              onClick={() => toggle(w.id)}
              sx={{
                position: 'relative',
                cursor: 'pointer',
                borderRadius: 1,
                outline: isSelected ? '2px solid' : '2px dashed',
                outlineColor: isSelected ? 'primary.main' : 'divider',
                opacity: isSelected ? 1 : 0.45,
                // Unselected badges vanish from the printout entirely.
                '@media print': isSelected
                  ? { outline: 'none', opacity: 1 }
                  : { display: 'none' },
              }}
            >
              <Checkbox
                checked={isSelected}
                onClick={(e) => e.stopPropagation()}
                onChange={() => toggle(w.id)}
                size="small"
                sx={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  zIndex: 1,
                  '@media print': { display: 'none' },
                }}
              />
              <QrBadge fullName={w.fullName} workerCode={w.workerCode} siteName={siteName} />
            </Box>
          );
        })}
        {list.length === 0 && (
          <Typography color="text.secondary">Nothing to print for this selection.</Typography>
        )}
      </Box>
    </Box>
  );
}
