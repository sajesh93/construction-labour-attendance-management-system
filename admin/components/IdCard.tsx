'use client';

import * as React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Organization, Worker } from '@/lib/types';
import { qrPayload } from '@/components/QrBadge';
import { photoSrc } from '@/components/PeopleDirectory';
import { DisciplinaryBadges, SafetySeal, TRAINING_SEALS } from '@/components/SafetySeals';

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

const NAVY = '#0d1b3e';
const BORDER = '#3a3f47';
const LABEL_BG = '#f3f5f8';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(s?: string | null): string {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

function ageFrom(dob?: string | null): string {
  if (!dob) return '';
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return '';
  const t = new Date();
  let a = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) a--;
  return a > 0 ? String(a) : '';
}

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

  const shell: React.CSSProperties = {
    width: `${w}mm`,
    height: `${h}mm`,
    boxSizing: 'border-box',
    border: `1px solid ${BORDER}`,
    background: '#fff',
    overflow: 'hidden',
    breakInside: 'avoid',
    fontFamily: 'Roboto, system-ui, Arial, sans-serif',
    color: '#111',
    display: 'flex',
    flexDirection: 'column',
  };

  // Dark title / footer bars used on both faces.
  const titleBar = (text: string) => (
    <div
      style={{
        background: NAVY,
        color: '#fff',
        textAlign: 'center',
        fontWeight: 700,
        letterSpacing: 0.6,
        fontSize: `${2.9 * u}mm`,
        padding: `${1.2 * u}mm`,
      }}
    >
      {text}
    </div>
  );

  const footerBar = (text: string) => (
    <div
      style={{
        background: NAVY,
        color: '#fff',
        textAlign: 'center',
        fontWeight: 600,
        fontSize: `${2.1 * u}mm`,
        padding: `${0.9 * u}mm`,
      }}
    >
      {text}
    </div>
  );

  // A label/value table row. `flex` lets a row stretch to fill the body.
  const Row = ({
    cells,
    grow,
  }: {
    cells: { label: string; value?: React.ReactNode; labelW?: number; valueFlex?: number }[];
    grow?: number;
  }) => (
    <div style={{ display: 'flex', borderBottom: `0.5px solid ${BORDER}`, flex: grow ?? 'none', minHeight: 0 }}>
      {cells.map((c, i) => (
        <React.Fragment key={i}>
          <div
            style={{
              width: `${(c.labelW ?? 22) * u}mm`,
              flexShrink: 0,
              background: LABEL_BG,
              borderRight: `0.5px solid ${BORDER}`,
              padding: `${0.9 * u}mm ${1.2 * u}mm`,
              fontWeight: 700,
              fontSize: `${2.2 * u}mm`,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {c.label}
          </div>
          <div
            style={{
              flex: c.valueFlex ?? 1,
              borderRight: i < cells.length - 1 ? `0.5px solid ${BORDER}` : undefined,
              padding: `${0.9 * u}mm ${1.2 * u}mm`,
              fontSize: `${2.4 * u}mm`,
              display: 'flex',
              alignItems: 'center',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
            }}
          >
            {c.value}
          </div>
        </React.Fragment>
      ))}
    </div>
  );

  if (side === 'front') {
    const project = worker.assignments?.[0]?.site?.name ?? '';
    const designation = worker.designation?.name ?? '';
    const sex =
      worker.gender === 'M' ? 'Male' : worker.gender === 'F' ? 'Female' : worker.gender ?? '';
    const emergency = [worker.emergencyContactName, worker.emergencyContactNumber]
      .filter(Boolean)
      .join(' · ');

    return (
      <div style={shell}>
        {/* Title bar with company logo at the right edge */}
        <div style={{ position: 'relative' }}>
          {titleBar('IDENTITY CARD')}
          {org?.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoSrc(org.logoUrl)}
              alt=""
              style={{
                position: 'absolute',
                right: `${1.2 * u}mm`,
                top: '50%',
                transform: 'translateY(-50%)',
                height: `${4.4 * u}mm`,
                width: 'auto',
                maxWidth: `${16 * u}mm`,
                objectFit: 'contain',
                background: '#fff',
                borderRadius: `${0.6 * u}mm`,
                padding: `${0.3 * u}mm`,
              }}
            />
          )}
        </div>

        {/* Body: details table on the left, photo + badges on the right */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              borderRight: `0.5px solid ${BORDER}`,
              minWidth: 0,
            }}
          >
            <Row cells={[{ label: 'Project Name', value: project }]} grow={1} />
            <Row cells={[{ label: 'Employee name', value: worker.fullName }]} grow={1} />
            <Row cells={[{ label: 'ID No', value: worker.workerCode }]} grow={1} />
            <Row cells={[{ label: 'JOB Title', value: designation }]} grow={1} />
            <Row
              cells={[
                { label: 'Age', value: ageFrom(worker.dateOfBirth), labelW: 10, valueFlex: 1 },
                { label: 'Sex', value: sex, labelW: 10, valueFlex: 1 },
              ]}
              grow={1}
            />
            <Row cells={[{ label: 'Blood Group', value: worker.bloodGroup ?? '' }]} grow={1} />
            <Row cells={[{ label: 'Emergency', value: emergency }]} grow={1} />
          </div>

          {/* Right column: photo on top, disciplinary badges beneath */}
          <div
            style={{
              width: `${27 * u}mm`,
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              padding: `${1.2 * u}mm`,
              gap: `${1 * u}mm`,
            }}
          >
            <div
              style={{
                flex: 1,
                minHeight: 0,
                borderRadius: `${1 * u}mm`,
                background: '#eef1f4',
                border: `0.5px solid ${BORDER}`,
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
                <span style={{ fontSize: `${2 * u}mm`, color: '#9aa3ab' }}>Photo</span>
              )}
            </div>
            <div>
              <DisciplinaryBadges px={Math.round(6 * u * 3.78)} />
              <div
                style={{
                  textAlign: 'center',
                  fontSize: `${1.5 * u}mm`,
                  color: '#444',
                  marginTop: `${0.4 * u}mm`,
                  lineHeight: 1.1,
                }}
              >
                Disciplinary Action on Safety Violation
              </div>
            </div>
          </div>
        </div>

        {footerBar('Contact In Case Of Emergency (Name & Number)')}
      </div>
    );
  }

  // ---- Back face: company + screening details, QR, training seals ----
  const qrPx = Math.round(20 * u * 3.78);
  const sealPx = Math.round(10.5 * u * 3.78);

  return (
    <div style={shell}>
      {titleBar('SCREENING CARD')}

      {/* Company + screening rows on the left, QR on the right */}
      <div style={{ display: 'flex', borderBottom: `0.5px solid ${BORDER}` }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Row cells={[{ label: 'Company', value: org?.name ?? '', labelW: 26 }]} />
          <Row cells={[{ label: 'Screening Done on', value: fmtDate(worker.screeningDoneOn), labelW: 26 }]} />
          <Row cells={[{ label: 'Screening Done by', value: worker.screeningDoneBy ?? '', labelW: 26 }]} />
          <Row cells={[{ label: 'Validity till', value: fmtDate(worker.validityTill), labelW: 26 }]} />
        </div>
        <div
          style={{
            width: `${24 * u}mm`,
            flexShrink: 0,
            borderLeft: `0.5px solid ${BORDER}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: `${1 * u}mm`,
          }}
        >
          <QRCodeSVG value={qrPayload(worker.workerCode)} size={qrPx} includeMargin={false} />
          <div style={{ fontSize: `${1.6 * u}mm`, color: '#444', marginTop: `${0.5 * u}mm` }}>
            {worker.workerCode}
          </div>
        </div>
      </div>

      {/* Computer-generated note (replaces the seal/signature requirement) */}
      <div
        style={{
          fontSize: `${1.8 * u}mm`,
          fontStyle: 'italic',
          color: '#555',
          textAlign: 'center',
          padding: `${0.8 * u}mm ${1.2 * u}mm`,
          borderBottom: `0.5px solid ${BORDER}`,
        }}
      >
        This card is computer-generated and does not require a company seal or signature.
      </div>

      {/* Job-specific training seals */}
      <div style={{ flex: 1, minHeight: 0, padding: `${1 * u}mm ${1.4 * u}mm`, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontWeight: 700, fontSize: `${2.1 * u}mm`, marginBottom: `${0.8 * u}mm` }}>
          Job Specific Training Attended:
        </div>
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: `${0.6 * u}mm`,
          }}
        >
          {TRAINING_SEALS.map((s) => (
            <SafetySeal key={s.key} seal={s} px={sealPx} />
          ))}
        </div>
      </div>

      {footerBar('If Found, Please Return to Project Office')}
    </div>
  );
}
