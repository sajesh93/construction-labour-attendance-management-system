import { describe, expect, it } from 'vitest';
import { gzipSync } from 'fflate';
import { aadhaarLast4, decodeAadhaarQr, dobIso, fullAddress, guardianName } from './decoder';

/**
 * Build a Secure-QR payload the way UIDAI does: 0xFF-delimited ISO-8859-1
 * fields → GZIP → big-endian byte array → one huge base-10 integer.
 */
function makeSecureQr(fields: string[]): string {
  const bytes: number[] = [];
  for (const f of fields) {
    for (const ch of f) bytes.push(ch.charCodeAt(0));
    bytes.push(0xff);
  }
  const gz = gzipSync(new Uint8Array(bytes));
  let n = BigInt(0);
  for (const b of gz) n = (n << BigInt(8)) | BigInt(b);
  return n.toString();
}

// [emailMobileFlag, referenceId, name, dob, gender, careOf, district, landmark,
//  house, location, pincode, postOffice, state, street, subDistrict, vtc]
const V2_FIELDS = [
  'V2',
  '2',
  '482919700123456',
  'Ganesh Moorthy',
  '31-12-1990',
  'M',
  'S/O: Moorthy Raman',
  'Bengaluru Urban',
  'Near Ulsoor Lake',
  '12/4',
  'Ulsoor',
  '560008',
  'Ulsoor PO',
  'Karnataka',
  '2nd Cross',
  'Bengaluru East',
  'Bengaluru',
  '4321', // V2+ mobile last-4
];

describe('decodeAadhaarQr — Secure QR', () => {
  const decoded = decodeAadhaarQr(makeSecureQr(V2_FIELDS));

  it('decodes the identity fields', () => {
    expect(decoded).not.toBeNull();
    expect(decoded!.secure).toBe(true);
    expect(decoded!.name).toBe('Ganesh Moorthy');
    expect(decoded!.dob).toBe('31-12-1990');
    expect(decoded!.gender).toBe('M');
    expect(decoded!.pincode).toBe('560008');
    expect(decoded!.mobileLast4).toBe('4321');
  });

  it('exposes only the last 4 Aadhaar digits, never the full number', () => {
    // referenceId is "<last4><timestamp>"; the 12-digit number is not in the QR
    // at all, so no decoded field may ever carry one.
    expect(aadhaarLast4(decoded!)).toBe('4829');
    expect(decoded!.referenceId!.slice(0, 4)).toBe('4829');
    const values = Object.values(decoded!).filter((v) => typeof v === 'string');
    for (const v of values) expect(v).not.toMatch(/\b\d{12}\b/);
  });

  it('converts the DOB to an ISO date for form fields', () => {
    expect(dobIso(decoded!)).toBe('1990-12-31');
  });

  it('joins the address parts in postal order', () => {
    expect(fullAddress(decoded!)).toBe(
      'S/O: Moorthy Raman, 12/4, 2nd Cross, Near Ulsoor Lake, Ulsoor, Bengaluru, ' +
        'Bengaluru East, Bengaluru Urban, Karnataka, Ulsoor PO, 560008',
    );
  });

  it('strips the S/O prefix off the guardian name', () => {
    expect(guardianName(decoded!)).toBe('Moorthy Raman');
  });

  it('handles a payload with no version token (V1)', () => {
    const v1 = decodeAadhaarQr(makeSecureQr(V2_FIELDS.slice(1, 17)));
    expect(v1!.name).toBe('Ganesh Moorthy');
    expect(v1!.mobileLast4).toBeUndefined();
  });

  it('rejects a truncated payload rather than returning junk', () => {
    expect(decodeAadhaarQr(makeSecureQr(['V2', '2', '4829', 'Ganesh']))).toBeNull();
  });
});

describe('decodeAadhaarQr — legacy XML QR', () => {
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?><PrintLetterBarcodeData uid="123456789012" ' +
    'name="Ilango M" gender="M" yob="1998" co="S/O Manickam" ' +
    'street="2nd Cross" vtc="Ulsoor" dist="Bengaluru Urban" state="Karnataka" pc="560008"/>';

  it('decodes the plain attributes', () => {
    const d = decodeAadhaarQr(xml)!;
    expect(d.secure).toBe(false);
    expect(d.name).toBe('Ilango M');
    expect(d.yob).toBe('1998');
    expect(d.pincode).toBe('560008');
    expect(guardianName(d)).toBe('Manickam');
  });

  it('has no DOB to convert when only a year of birth is printed', () => {
    expect(dobIso(decodeAadhaarQr(xml)!)).toBeUndefined();
  });
});

describe('decodeAadhaarQr — non-Aadhaar payloads', () => {
  it.each([
    ['a CLAMS worker badge', 'CLAMS:W-1028'],
    ['a URL', 'https://example.com'],
    ['a short number', '12345'],
    ['empty', ''],
  ])('returns null for %s', (_label, payload) => {
    expect(decodeAadhaarQr(payload)).toBeNull();
  });

  it('returns null for a long number that is not a valid payload', () => {
    expect(decodeAadhaarQr('9'.repeat(80))).toBeNull();
  });
});
