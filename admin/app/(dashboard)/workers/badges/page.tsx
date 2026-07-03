'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Box, Button, Checkbox, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { api } from '@/lib/api/browser';
import { Organization, Paginated, PersonCategory, Site, Worker } from '@/lib/types';
import { cardDimsMm, CardOrientation, CardSize, IdCard, PVC_SIZES } from '@/components/IdCard';

const CATEGORY_TITLES: Record<PersonCategory, string> = {
  WORKER: 'Worker ID cards',
  STAFF: 'Staff ID cards',
  VISITOR: 'Visitor passes',
};

// Remembered as the default for next time (per-browser).
const SIZE_KEY = 'clams.badge.size';

// ID cards are landscape only (CR80 in the long orientation).
const ORIENTATION: CardOrientation = 'landscape';

export default function BadgesPage() {
  const params = useSearchParams();
  const initial = (params.get('category') ?? 'WORKER').toUpperCase() as PersonCategory;
  const [category, setCategory] = React.useState<PersonCategory>(
    ['WORKER', 'STAFF', 'VISITOR'].includes(initial) ? initial : 'WORKER',
  );
  const [siteId, setSiteId] = React.useState('');
  const [q, setQ] = React.useState('');

  // PVC card stock, restored from localStorage after mount (avoids SSR hydration
  // mismatch), and written back whenever the admin changes it.
  const [size, setSize] = React.useState<CardSize>('CR80');
  React.useEffect(() => {
    const s = localStorage.getItem(SIZE_KEY) as CardSize | null;
    if (s && s in PVC_SIZES) setSize(s);
  }, []);
  const chooseSize = (s: CardSize) => {
    setSize(s);
    localStorage.setItem(SIZE_KEY, s);
  };
  const orientation = ORIENTATION;
  const isVisitor = category === 'VISITOR';

  // Sized to the selected PVC stock so the print dialog targets one card per
  // page (no A4 sheet of badges). margin:0 lets the card print edge-to-edge.
  const { w: pageW, h: pageH } = cardDimsMm(size, orientation);

  const org = useQuery({
    queryKey: ['org-current'],
    queryFn: () => api.get<Organization>('/organizations/current'),
  });
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

  // The last selected card's final face must NOT force a page break, otherwise
  // the printer ejects a blank trailing card. Mark its wrapper so print.css can
  // single it out.
  const lastSelectedId = React.useMemo(() => {
    for (let i = list.length - 1; i >= 0; i--) {
      if (selected.has(list[i].id)) return list[i].id;
    }
    return null;
  }, [list, selected]);

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
          sx={{ width: 220 }}
        />
        <TextField
          select
          size="small"
          label="Type"
          value={category}
          onChange={(e) => setCategory(e.target.value as PersonCategory)}
          sx={{ width: 130 }}
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
          sx={{ width: 180 }}
        >
          <MenuItem value="">All sites</MenuItem>
          {sites.data?.map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {s.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="PVC card size"
          value={size}
          onChange={(e) => chooseSize(e.target.value as CardSize)}
          sx={{ width: 230 }}
        >
          {(Object.keys(PVC_SIZES) as CardSize[]).map((key) => (
            <MenuItem key={key} value={key}>
              {PVC_SIZES[key].label}
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

      {!org.isLoading && !org.data?.name && (
        <Typography variant="body2" color="warning.main" sx={{ mb: 2, '@media print': { display: 'none' } }}>
          Tip: set your company name and address on the Company page so they appear on every card.
        </Typography>
      )}

      {/* Drives the print dialog's paper size to the exact PVC card so each face
          prints alone, edge-to-edge — no A4 sheet of badges to cut out. */}
      <style>{`@media print { @page { size: ${pageW}mm ${pageH}mm; margin: 0; } }`}</style>

      <Box
        className="print-area"
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 2,
          // On screen only — a roomy gap between the on-screen preview cards.
          // In print each face is its own page (see print.css .pvc-face).
        }}
      >
        {list.map((w) => {
          const isSelected = selected.has(w.id);
          return (
            <Box
              key={w.id}
              onClick={() => toggle(w.id)}
              className={w.id === lastSelectedId ? 'pvc-last' : undefined}
              sx={{
                position: 'relative',
                cursor: 'pointer',
                borderRadius: 1,
                p: 0.5,
                outline: isSelected ? '2px solid' : '2px dashed',
                outlineColor: isSelected ? 'primary.main' : 'divider',
                opacity: isSelected ? 1 : 0.45,
                // Unselected cards vanish from the printout entirely.
                '@media print': isSelected
                  ? { outline: 'none', opacity: 1, p: 0 }
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
              {/* Visitor passes are single-sided (name + number only); worker/
                  staff cards keep their front + back faces. Each face is wrapped
                  in .pvc-face so it prints on its own card-sized page. */}
              <Stack direction="row" spacing={0.5}>
                <div className="pvc-face">
                  <IdCard worker={w} org={org.data} size={size} orientation={orientation} side="front" />
                </div>
                {!isVisitor && (
                  <div className="pvc-face">
                    <IdCard worker={w} org={org.data} size={size} orientation={orientation} side="back" />
                  </div>
                )}
              </Stack>
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
