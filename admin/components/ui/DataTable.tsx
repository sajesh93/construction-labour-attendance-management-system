'use client';

import * as React from 'react';
import {
  Box,
  Card,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@mui/material';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  key: string;
  label: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: number | string;
  render: (row: T) => React.ReactNode;
}

/**
 * Standard list table: card wrapper, horizontal scroll on narrow screens,
 * skeleton loading rows and a built-in empty state.
 */
export function DataTable<T>({
  columns,
  rows,
  loading = false,
  rowKey,
  onRowClick,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  emptyAction,
  footer,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  loading?: boolean;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const showEmpty = !loading && (rows?.length ?? 0) === 0;
  return (
    <Card>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="medium" sx={{ minWidth: 640 }}>
          <TableHead>
            <TableRow>
              {columns.map((c) => (
                <TableCell key={c.key} align={c.align} sx={{ width: c.width }}>
                  {c.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  {columns.map((c) => (
                    <TableCell key={c.key}>
                      <Skeleton width={c.key === columns[0].key ? '60%' : '40%'} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {!loading &&
              rows?.map((row) => (
                <TableRow
                  key={rowKey(row)}
                  hover={!!onRowClick}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  sx={onRowClick ? { cursor: 'pointer' } : undefined}
                >
                  {columns.map((c) => (
                    <TableCell key={c.key} align={c.align}>
                      {c.render(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Box>
      {showEmpty && (
        <EmptyState compact title={emptyTitle} description={emptyDescription} action={emptyAction} />
      )}
      {footer}
    </Card>
  );
}
