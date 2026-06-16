'use client';

import * as React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Organization, Worker } from '@/lib/types';
import { qrPayload } from '@/components/QrBadge';
import { photoSrc } from '@/components/PeopleDirectory';

export type CardSize = 'S' | 'M' | 'L';
export type CardOrientation = 'portrait' | 'landscape';

// Base ID card = CR80 (85.6 × 54 mm). Size scales the whole card; orientation
// decides which edge is the width.
const SIZE_SCALE: Record<CardSize, number> = { S: 0.82, M: 1, L: 1.22 };
const BASE_LONG = 85.6;
const BASE_SHORT = 54;

export function cardDimsMm(size: CardSize, orientation: CardOrientation) {
  const s = SIZE_SCALE[size];
  const long = BASE_LONG * s;
  const short = BASE_SHORT * s;
  return orientation === 'landscape'
    ? { w: long, h: short }
    : { w: short, h: long };
}

const ACCENT = '#1565c0';

/** One physical face of a two-sided worker ID card. */
export function IdCard({
  worker,
  org,
  size,
  orientation,
  side,
}: {
  worker: Worker;
  org?: Organization | null;
  size: CardSize;
  orientation: CardOrientation;
  side: 'front' | 'back';
}) {
  const { w, h } = cardDimsMm(size, orientation);
  // A unit scale so text/QR grow with the card. 1 == Medium.
  const u = SIZE_SCALE[size];

  const orgLines = [
    [org?.addressLine1, org?.addressLine2].filter(Boolean).join(', '),
    [org?.city, org?.state, org?.pincode].filter(Boolean).join(' '),
  ].filter(Boolean);

  const shell: React.CSSProperties = {
    width: `${w}mm`,
    height: `${h}mm`,
    boxSizing: 'border-box',
    border: '1px solid #b9c0c8',
    borderRadius: `${2.5 * u}mm`,
    background: '#fff',
    overflow: 'hidden',
    breakInside: 'avoid',
    fontFamily: 'Roboto, system-ui, Arial, sans-serif',
    color: '#1a1a1a',
    display: 'flex',
    flexDirection: 'column',
  };

  if (side === 'front') {
    return (
      <div style={shell}>
        {/* Company header */}
        <div
          style={{
            background: ACCENT,
            color: '#fff',
            padding: `${1.4 * u}mm ${2 * u}mm`,
            display: 'flex',
            alignItems: 'center',
            gap: `${1.6 * u}mm`,
            minHeight: `${8 * u}mm`,
          }}
        >
          {org?.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoSrc(org.logoUrl)}
              alt=""
              style={{ height: `${6 * u}mm`, width: 'auto', objectFit: 'contain' }}
            />
          )}
          <div style={{ lineHeight: 1.05, overflow: 'hidden' }}>
            <div
              style={{
                fontWeight: 700,
                fontSize: `${3 * u}mm`,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {org?.name ?? 'CLAMS'}
            </div>
            {orgLines[1] && (
              <div style={{ fontSize: `${1.7 * u}mm`, opacity: 0.9 }}>{orgLines[1]}</div>
            )}
          </div>
        </div>

        {/* Worker identity — fills the body, evenly spaced */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            gap: `${3.5 * u}mm`,
            padding: `${3.5 * u}mm`,
            alignItems: 'stretch',
            minHeight: 0,
          }}
        >
          <div
            style={{
              width: `${24 * u}mm`,
              flexShrink: 0,
              borderRadius: `${2 * u}mm`,
              background: '#eef1f4',
              border: '1px solid #d4dae0',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {worker.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoSrc(worker.photoUrl)}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span style={{ fontSize: `${2.2 * u}mm`, color: '#9aa3ab' }}>No photo</span>
            )}
          </div>

          {/* Top group (name/role/vendor) and bottom code chip pushed apart */}
          <div
            style={{
              minWidth: 0,
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              lineHeight: 1.25,
              paddingTop: `${1 * u}mm`,
              paddingBottom: `${1 * u}mm`,
            }}
          >
            <div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: `${4 * u}mm`,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {worker.fullName}
              </div>
              {worker.designation?.name && (
                <div style={{ fontSize: `${2.8 * u}mm`, color: '#37424c', marginTop: `${1.4 * u}mm` }}>
                  {worker.designation.name}
                </div>
              )}
              {worker.vendor?.name && (
                <div style={{ fontSize: `${2.4 * u}mm`, color: '#6b7480', marginTop: `${0.8 * u}mm` }}>
                  {worker.vendor.name}
                </div>
              )}
            </div>
            <div
              style={{
                alignSelf: 'flex-start',
                marginTop: `${2 * u}mm`,
                padding: `${0.8 * u}mm ${2 * u}mm`,
                borderRadius: `${4 * u}mm`,
                background: '#e8f0fb',
                fontSize: `${2.8 * u}mm`,
                fontWeight: 700,
                color: ACCENT,
                letterSpacing: 0.4,
              }}
            >
              {worker.workerCode}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Back face: QR + blood group + emergency contact ----
  const qrPx = Math.round(24 * u * 3.78); // ~mm → px at 96dpi for crisp SVG
  const emergency = [worker.emergencyContactName, worker.emergencyContactNumber]
    .filter(Boolean)
    .join(' · ');
  return (
    <div
      style={{
        ...shell,
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: `${3 * u}mm ${2.5 * u}mm`,
      }}
    >
      <div style={{ background: '#fff', padding: `${1 * u}mm` }}>
        <QRCodeSVG value={qrPayload(worker.workerCode)} size={qrPx} includeMargin={false} />
      </div>

      {/* Blood group and emergency contact both shown, with breathing room */}
      <div
        style={{
          textAlign: 'center',
          lineHeight: 1.3,
          display: 'flex',
          flexDirection: 'column',
          gap: `${1.6 * u}mm`,
        }}
      >
        {worker.bloodGroup && (
          <div style={{ fontSize: `${2.8 * u}mm` }}>
            <strong>Blood group:</strong> {worker.bloodGroup}
          </div>
        )}
        {emergency && (
          <div style={{ fontSize: `${2.4 * u}mm` }}>
            <span style={{ color: '#b71c1c', fontWeight: 700 }}>Emergency contact</span>
            <div style={{ marginTop: `${0.6 * u}mm` }}>{emergency}</div>
          </div>
        )}
      </div>

      <div style={{ fontSize: `${1.9 * u}mm`, color: '#6b7480', textAlign: 'center' }}>
        {org?.name ?? 'CLAMS'}
        {org?.phone ? ` · ${org.phone}` : ''}
      </div>
    </div>
  );
}
