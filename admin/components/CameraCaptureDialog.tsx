'use client';

import * as React from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import CameraAltIcon from '@mui/icons-material/CameraAlt';

/**
 * Live-camera capture dialog. Opens the device camera via getUserMedia, shows a
 * preview, and on capture draws the current frame to a canvas and returns it as
 * a JPEG File — the same shape a file <input> produces, so callers can reuse
 * their existing upload path. Works on desktops (webcam) and tablets/phones
 * (rear camera preferred). Streams are always stopped on close/unmount.
 */
export function CameraCaptureDialog({
  open,
  title = 'Capture photo',
  onClose,
  onCapture,
}: {
  open: boolean;
  title?: string;
  onClose: () => void;
  onCapture: (file: File) => void;
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [starting, setStarting] = React.useState(false);
  const [devices, setDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = React.useState<string>('');

  const stop = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const start = React.useCallback(async (preferredId?: string) => {
    setError(null);
    setStarting(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera not supported in this browser.');
      }
      // Stop any prior stream before opening a new one (e.g. switching camera).
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: preferredId
          ? { deviceId: { exact: preferredId } }
          : { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      // Labels are only populated after permission is granted.
      const all = await navigator.mediaDevices.enumerateDevices();
      const cams = all.filter((d) => d.kind === 'videoinput');
      setDevices(cams);
      const activeId = stream.getVideoTracks()[0]?.getSettings().deviceId ?? '';
      setDeviceId(preferredId ?? activeId);
    } catch (e) {
      const err = e as DOMException;
      setError(
        err?.name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow access and try again.'
          : err?.name === 'NotFoundError'
            ? 'No camera was found on this device.'
            : (e as Error)?.message || 'Could not start the camera.',
      );
    } finally {
      setStarting(false);
    }
  }, []);

  React.useEffect(() => {
    if (open) {
      void start();
    } else {
      stop();
    }
    return stop;
  }, [open, start, stop]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setError('The camera is not ready yet.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError('Failed to capture the image.');
          return;
        }
        onCapture(new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' }));
        onClose();
      },
      'image/jpeg',
      0.92,
    );
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Box
          sx={{
            position: 'relative',
            width: '100%',
            aspectRatio: '4 / 3',
            bgcolor: '#0B0F16',
            borderRadius: 2,
            border: 1,
            borderColor: 'divider',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
          {starting && <CircularProgress sx={{ position: 'absolute', color: 'white' }} />}
        </Box>
        {devices.length > 1 && (
          <Stack sx={{ mt: 2 }}>
            <TextField
              select
              size="small"
              label="Camera"
              value={deviceId}
              onChange={(e) => {
                setDeviceId(e.target.value);
                void start(e.target.value);
              }}
            >
              {devices.map((d, i) => (
                <MenuItem key={d.deviceId} value={d.deviceId}>
                  {d.label || `Camera ${i + 1}`}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button
          variant="contained"
          startIcon={<CameraAltIcon />}
          onClick={capture}
          disabled={starting || !!error}
        >
          Capture
        </Button>
      </DialogActions>
    </Dialog>
  );
}
