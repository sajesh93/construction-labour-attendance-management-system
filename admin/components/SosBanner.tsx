'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, AlertTitle, Button, Stack } from '@mui/material';
import { api } from '@/lib/api/browser';
import { AppNotification } from '@/lib/types';

const POLL_MS = 20_000;
const WINDOW_HOURS = 24;

/**
 * Polls the notification feed and shows unacknowledged SOS alerts (last 24h)
 * as a red banner across every admin page. FORGOT_LOGOUT alerts show as a
 * softer warning banner.
 */
export function SosBanner() {
  const qc = useQueryClient();
  const since = React.useMemo(
    () => new Date(Date.now() - WINDOW_HOURS * 3600_000).toISOString(),
    [],
  );

  const feed = useQuery({
    queryKey: ['notifications', since],
    queryFn: () => api.get<AppNotification[]>(`/notifications?since=${encodeURIComponent(since)}`),
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
  });

  const ack = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unread = (feed.data ?? []).filter((n) => !n.readAt);
  const sos = unread.filter((n) => n.type === 'SOS');
  const forgot = unread.filter((n) => n.type === 'FORGOT_LOGOUT');

  if (sos.length === 0 && forgot.length === 0) return null;

  return (
    <Stack spacing={1} sx={{ mb: 2 }}>
      {sos.map((n) => (
        <Alert
          key={n.id}
          severity="error"
          variant="filled"
          action={
            <Button color="inherit" size="small" onClick={() => ack.mutate(n.id)}>
              Acknowledge
            </Button>
          }
        >
          <AlertTitle>{n.title}</AlertTitle>
          {n.body.split('\n').map((line, i) =>
            line.startsWith('http') ? (
              <a key={i} href={line} target="_blank" rel="noreferrer" style={{ color: '#fff' }}>
                {line}
              </a>
            ) : (
              <div key={i}>{line}</div>
            ),
          )}
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
            {new Date(n.createdAt).toLocaleString()}
          </div>
        </Alert>
      ))}
      {forgot.slice(0, 3).map((n) => (
        <Alert
          key={n.id}
          severity="warning"
          action={
            <Button color="inherit" size="small" onClick={() => ack.mutate(n.id)}>
              Dismiss
            </Button>
          }
        >
          <AlertTitle>{n.title}</AlertTitle>
          {n.body}
        </Alert>
      ))}
    </Stack>
  );
}
