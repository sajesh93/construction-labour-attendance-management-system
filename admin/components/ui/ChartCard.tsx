'use client';

import * as React from 'react';
import { Box, Card, CircularProgress, Typography } from '@mui/material';
import { EmptyState } from './EmptyState';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';

/** Card wrapper for charts with title, loading and no-data states. */
export function ChartCard({
  title,
  subtitle,
  action,
  loading = false,
  empty = false,
  emptyText = 'No data yet',
  height = 260,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  loading?: boolean;
  empty?: boolean;
  emptyText?: string;
  height?: number;
  children: React.ReactNode;
}) {
  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box
        sx={{
          px: 2.25,
          pt: 2,
          pb: 1,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 1,
        }}
      >
        <Box>
          <Typography variant="subtitle1">{title}</Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>
        {action}
      </Box>
      <Box sx={{ flexGrow: 1, px: 1, pb: 1.5, minHeight: height, position: 'relative' }}>
        {loading ? (
          <Box sx={{ height, display: 'grid', placeItems: 'center' }}>
            <CircularProgress size={24} />
          </Box>
        ) : empty ? (
          <EmptyState compact icon={<BarChartOutlinedIcon />} title={emptyText} />
        ) : (
          children
        )}
      </Box>
    </Card>
  );
}
