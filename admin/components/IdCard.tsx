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

        {/* Worker identity */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            gap: `${2 * u}mm`,
            padding: `${2 * u}mm`,
            alignItems: 'center',
            minHeight: 0,
          }}
        >
          <div
            style={{
              width: `${16 * u}mm`,
              height: `${20 * u}mm`,
              flexShrink: 0,
              borderRadius: `${1.5 * u}mm`,
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
              <span style={{ fontSize: `${2 * u}mm`, color: '#9aa3ab' }}>No photo</span>
            )}
          </div>

          <div style={{ minWidth: 0, lineHeight: 1.2 }}>
            <div
              style={{
                fontWeight: 700,
                fontSize: `${3.4 * u}mm`,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {worker.fullName}
            </div>
            {worker.designation?.name && (
              <div style={{ fontSize: `${2.4 * u}mm`, color: '#37424c' }}>
                {worker.designation.name}
              </div>
            )}
            {worker.vendor?.name && (
              <div style={{ fontSize: `${2.1 * u}mm`, color: '#6b7480' }}>
                {worker.vendor.name}
              </div>
            )}
            <div
              style={{
                marginTop: `${1.2 * u}mm`,
                fontSize: `${2.4 * u}mm`,
                fontWeight: 600,
                color: ACCENT,
                letterSpacing: 0.3,
              }}
            >
              {worker.workerCode}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Back face: QR + emergency info ----
  const qrPx = Math.round(26 * u * 3.78); // ~mm → px at 96dpi for crisp SVG
  return (
    <div style={{ ...shell, alignItems: 'center', justifyContent: 'center', padding: `${2 * u}mm` }}>
      <div style={{ background: '#fff', padding: `${1 * u}mm` }}>
        <QRCodeSVG value={qrPayload(worker.workerCode)} size={qrPx} includeMargin={false} />
      </div>

      <div style={{ marginTop: `${1.6 * u}mm`, textAlign: 'center', lineHeight: 1.25 }}>
        {worker.bloodGroup ? (
          <div style={{ fontSize: `${2.6 * u}mm` }}>
            <strong>Blood group:</strong> {worker.bloodGroup}
          </div>
        ) : worker.emergencyContactName || worker.emergencyContactNumber ? (
          <div style={{ fontSize: `${2.3 * u}mm`, color: '#b71c1c' }}>
            <strong>In emergency, call</strong>
            <div style={{ color: '#1a1a1a' }}>
              {[worker.emergencyContactName, worker.emergencyContactNumber]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
        ) : null}
      </div>

      <div
        style={{
          marginTop: `${1.6 * u}mm`,
          fontSize: `${1.8 * u}mm`,
          color: '#6b7480',
          textAlign: 'center',
        }}
      >
        {org?.name ?? 'CLAMS'}
        {org?.phone ? ` · ${org.phone}` : ''}
      </div>
    </div>
  );
}
