'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Box, Card, CardActionArea, Skeleton, Tooltip, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';

/** Dashboard KPI card: icon chip, big number, label and helper line. */
export function StatCard({
  label,
  value,
  icon,
  hint,
  tone = 'primary',
  href,
  tooltip,
  loading = false,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  hint?: string;
  tone?: 'primary' | 'success' | 'warning' | 'error' | 'info';
  href?: string;
  tooltip?: React.ReactNode;
  loading?: boolean;
}) {
  const router = useRouter();
  const theme = useTheme();
  const color = theme.palette[tone].main;

  const body = (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 2.25 }}>
      {icon && (
        <Box
          sx={{
            width: 38,
            height: 38,
            borderRadius: 2,
            display: 'grid',
            placeItems: 'center',
            bgcolor: alpha(color, 0.12),
            color,
            flexShrink: 0,
            '& svg': { fontSize: 20 },
          }}
        >
          {icon}
        </Box>
      )}
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        <Typography variant="h5" sx={{ lineHeight: 1.2, my: 0.25 }}>
          {loading ? <Skeleton width={48} /> : value}
        </Typography>
        {hint && (
          <Typography variant="caption" color="text.secondary" noWrap display="block">
            {hint}
          </Typography>
        )}
      </Box>
    </Box>
  );

  const card = (
    <Card sx={{ height: '100%' }}>
      {href ? <CardActionArea onClick={() => router.push(href)}>{body}</CardActionArea> : body}
    </Card>
  );
  return tooltip ? (
    <Tooltip title={tooltip} arrow placement="bottom-start">
      {card}
    </Tooltip>
  ) : (
    card
  );
}
