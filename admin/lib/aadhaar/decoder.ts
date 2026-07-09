import { gunzipSync, unzlibSync } from 'fflate';

/**
 * Decoded fields from an Aadhaar QR code. TypeScript port of the mobile
 * decoder (mobile/lib/features/aadhaar/aadhaar_decoder.dart) — keep the two in
 * step when the UIDAI payload changes.
 *
 * Supports:
 *  • UIDAI **Secure QR** (the current encrypted-signature format): a huge
 *    base-10 number → byte array → GZIP inflate → 255-delimited ISO-8859-1
 *    fields. Newer V2/V3/V4 payloads (post-2022) put a version token first.
 *    The embedded photo + RSA signature are not parsed — this is for
 *    cross-verifying the printed details, not for authenticating the card.
 *  • Legacy **XML QR** on older printed cards (plain attributes).
 *
 * The QR never carries the full 12-digit Aadhaar number: only the last four
 * digits, at the head of the reference id. Nothing here can populate the
 * `aadhaar` field, and nothing here should try.
 */
export interface AadhaarData {
  /** First 4 digits = last 4 digits of the Aadhaar number, rest is a timestamp. */
  referenceId?: string;
  name?: string;
  /** DD-MM-YYYY or DD/MM/YYYY. */
  dob?: string;
  /** Legacy XML only. */
  yob?: string;
  /** M / F / T. */
  gender?: string;
  careOf?: string;
  house?: string;
  street?: string;
  landmark?: string;
  location?: string;
  vtc?: string;
  subDistrict?: string;
  district?: string;
  state?: string;
  postOffice?: string;
  pincode?: string;
  mobileLast4?: string;
  /** true = Secure QR (tamper-resistant format), false = legacy XML QR. */
  secure: boolean;
}

export function aadhaarLast4(d: AadhaarData): string | undefined {
  return d.referenceId && d.referenceId.length >= 4 ? d.referenceId.slice(0, 4) : undefined;
}

/** dob "31-12-1990" → ISO "1990-12-31" (for date form fields). */
export function dobIso(d: AadhaarData): string | undefined {
  if (!d.dob) return undefined;
  const m = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(d.dob.trim());
  if (!m) return undefined;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function fullAddress(d: AadhaarData): string {
  return [
    d.careOf,
    d.house,
    d.street,
    d.landmark,
    d.location,
    d.vtc,
    d.subDistrict,
    d.district,
    d.state,
    d.postOffice,
    d.pincode,
  ]
    .filter((p): p is string => !!p && p.trim().length > 0)
    .join(', ');
}

/**
 * Aadhaar prints the guardian as "S/O: Ram Kumar" (also W/O, D/O, C/O). Pull
 * the bare name out so it can seed the father's-name field; returns undefined
 * when the prefix is absent, since then we cannot tell who the person is.
 */
export function guardianName(d: AadhaarData): string | undefined {
  if (!d.careOf) return undefined;
  const m = /^\s*[SDWC]\s*\/\s*O\s*[:.]?\s*(.+)$/i.exec(d.careOf);
  const name = m?.[1]?.trim();
  return name && name.length > 0 ? name : undefined;
}

/** Returns null when the payload is not an Aadhaar QR. */
export function decodeAadhaarQr(raw: string): AadhaarData | null {
  const s = raw.trim();
  if (/^[0-9]{50,}$/.test(s)) return decodeSecure(s);
  if (s.includes('<?xml') || s.startsWith('<PrintLetterBarcodeData')) return decodeLegacyXml(s);
  return null;
}

function decodeSecure(digits: string): AadhaarData | null {
  try {
    let n = BigInt(digits);
    const bytes: number[] = [];
    const mask = BigInt(0xff);
    const eight = BigInt(8);
    while (n > BigInt(0)) {
      bytes.unshift(Number(n & mask));
      n >>= eight;
    }
    const raw = new Uint8Array(bytes);

    let inflated: Uint8Array;
    try {
      inflated = gunzipSync(raw);
    } catch {
      inflated = unzlibSync(raw);
    }

    // Split on 0xFF delimiters; the photo/signature follow the text fields, so
    // stop once we have more fields than we need.
    const fields: string[] = [];
    let cur: number[] = [];
    for (const b of inflated) {
      if (b === 0xff) {
        fields.push(latin1(cur));
        cur = [];
        if (fields.length > 20) break;
      } else {
        cur.push(b);
      }
    }

    if (fields.length < 16) return null;

    // V2/V3/V4 payloads carry a leading version token.
    const i = /^V\d$/.test(fields[0]) ? 1 : 0;

    const f = (k: number): string | undefined => {
      const idx = i + k;
      if (idx >= fields.length) return undefined;
      const v = fields[idx].trim();
      return v.length === 0 ? undefined : v;
    };

    // Field order per the UIDAI Secure QR spec:
    // [emailMobileFlag, referenceId, name, dob, gender, careOf, district,
    //  landmark, house, location, pincode, postOffice, state, street,
    //  subDistrict, vtc, (V2+: mobile last-4)]
    const data: AadhaarData = {
      referenceId: f(1),
      name: f(2),
      dob: f(3),
      gender: f(4),
      careOf: f(5),
      district: f(6),
      landmark: f(7),
      house: f(8),
      location: f(9),
      pincode: f(10),
      postOffice: f(11),
      state: f(12),
      street: f(13),
      subDistrict: f(14),
      vtc: f(15),
      mobileLast4: i === 1 ? f(16) : undefined,
      secure: true,
    };
    // Sanity: a real payload always has a name and a numeric reference id.
    if (!data.name || !data.referenceId) return null;
    return data;
  } catch {
    return null;
  }
}

function latin1(bytes: number[]): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return s;
}

function decodeLegacyXml(xml: string): AadhaarData | null {
  const attr = (name: string): string | undefined => {
    const m = new RegExp(`${name}="([^"]*)"`).exec(xml);
    const v = m?.[1]?.trim();
    return !v || v.length === 0 ? undefined : v;
  };

  const name = attr('name');
  if (!name) return null;
  return {
    referenceId: attr('uid'),
    name,
    dob: attr('dob'),
    yob: attr('yob'),
    gender: attr('gender'),
    careOf: attr('co'),
    house: attr('house'),
    street: attr('street'),
    landmark: attr('lm'),
    location: attr('loc'),
    vtc: attr('vtc'),
    subDistrict: attr('subdist'),
    district: attr('dist'),
    state: attr('state'),
    postOffice: attr('po'),
    pincode: attr('pc'),
    secure: false,
  };
}
