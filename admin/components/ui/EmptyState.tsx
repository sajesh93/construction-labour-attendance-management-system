'use client';

import * as React from 'react';
import { Box, Typography } from '@mui/material';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';

/** Friendly empty state for tables/lists. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <Box sx={{ textAlign: 'center', py: compact ? 4 : 8, px: 2 }}>
      <Box sx={{ color: 'text.disabled', mb: 1, '& svg': { fontSize: 40 } }}>
        {icon ?? <InboxOutlinedIcon />}
      </Box>
      <Typography variant="subtitle1" sx={{ mb: 0.5 }}>
        {title}
      </Typography>
      {description && (
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420, mx: 'auto' }}>
          {description}
        </Typography>
      )}
      {action && <Box sx={{ mt: 2 }}>{action}</Box>}
    </Box>
  );
}
