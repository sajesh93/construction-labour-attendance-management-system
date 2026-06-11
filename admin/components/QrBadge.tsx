'use client';

import * as React from 'react';
import { QRCodeSVG } from 'qrcode.react';

/** QR payload format the mobile app expects: "CLAMS:<EMP-ID>". */
export function qrPayload(workerCode: string) {
  return `CLAMS:${workerCode}`;
}

/** A compact printable ID badge: name, ID and the scannable QR. */
export function QrBadge({
  fullName,
  workerCode,
  siteName,
  size = 96,
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
        borderRadius: 8,
        padding: 8,
        width: size + 54,
        textAlign: 'center',
        background: '#fff',
        breakInside: 'avoid',
        fontFamily: 'Roboto, system-ui, Arial, sans-serif',
      }}
    >
      <div
        style={{
          fontWeight: 700,
          fontSize: 12,
          lineHeight: 1.2,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {fullName}
      </div>
      <div style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>{workerCode}</div>
      <QRCodeSVG value={qrPayload(workerCode)} size={size} includeMargin={false} />
      <div style={{ fontSize: 7, color: '#999', marginTop: 4 }}>
        {siteName ? `${siteName} · ` : ''}CLAMS
      </div>
    </div>
  );
}
