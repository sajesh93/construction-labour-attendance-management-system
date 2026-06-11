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

  // Siren loop while an unacknowledged SOS is on screen; stops on Acknowledge.
  const sosActive = sos.length > 0;
  React.useEffect(() => {
    if (!sosActive) return;
    type AudioCtor = typeof AudioContext;
    const Ctor: AudioCtor | undefined =
      window.AudioContext ?? (window as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    let stopped = false;
    const beep = () => {
      if (stopped) return;
      try {
        void ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(620, ctx.currentTime + 0.22);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.44);
        osc.start();
        osc.stop(ctx.currentTime + 0.66);
      } catch {
        // Audio blocked until the user interacts with the page — banner still shows.
      }
    };
    beep();
    const interval = setInterval(beep, 1600);
    return () => {
      stopped = true;
      clearInterval(interval);
      void ctx.close();
    };
  }, [sosActive]);

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
