'use client';

import * as React from 'react';
import { QRCodeSVG } from 'qrcode.react';

/** QR payload format the mobile app expects: "CLAMS:<EMP-ID>". */
export function qrPayload(workerCode: string) {
  return `CLAMS:${workerCode}`;
}

/** A printable worker ID badge: name, EMP-ID and the scannable QR. */
export function QrBadge({
  fullName,
  workerCode,
  siteName,
  size = 128,
}: {
  fullName: string;
  workerCode: string;
  siteName?: string;
  size?: number;
}) {
  return (
    <div
      style={{
        border: '1px solid #cfd4da',
        borderRadius: 10,
        padding: 14,
        width: 230,
        textAlign: 'center',
        background: '#fff',
        breakInside: 'avoid',
        fontFamily: 'Roboto, system-ui, Arial, sans-serif',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{fullName}</div>
      <div style={{ fontSize: 12, color: '#555', marginBottom: 10 }}>{workerCode}</div>
      <QRCodeSVG value={qrPayload(workerCode)} size={size} includeMargin />
      <div style={{ fontSize: 10, color: '#888', marginTop: 8 }}>
        {siteName ? `${siteName} · ` : ''}CLAMS attendance
      </div>
    </div>
  );
}
