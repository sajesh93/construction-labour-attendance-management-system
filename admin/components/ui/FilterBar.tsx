'use client';

import * as React from 'react';
import { Box } from '@mui/material';

/** Horizontal filter row above tables; wraps on narrow screens. */
export function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 1.5,
        alignItems: 'center',
        mb: 2,
        '& .MuiTextField-root': { minWidth: 160 },
      }}
    >
      {children}
    </Box>
  );
}
