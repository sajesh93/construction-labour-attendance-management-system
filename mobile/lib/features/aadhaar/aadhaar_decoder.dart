import 'dart:convert';

import 'package:archive/archive.dart';

/// Decoded fields from an Aadhaar QR code.
///
/// Supports:
///  • UIDAI **Secure QR** (the current encrypted-signature format): a huge
///    base-10 number → byte array → GZIP inflate → 255-delimited ISO-8859-1
///    fields. Newer V2/V3/V4 payloads (post-2022) put a version token first.
///    This mirrors the open-source reference implementations of the UIDAI
///    Secure QR spec. The embedded photo + RSA signature are not parsed —
///    this is for on-site cross-verification of the printed details.
///  • Legacy **XML QR** on older printed cards (plain attributes).
class AadhaarData {
  const AadhaarData({
    this.referenceId,
    this.name,
    this.dob,
    this.yob,
    this.gender,
    this.careOf,
    this.house,
    this.street,
    this.landmark,
    this.location,
    this.vtc,
    this.subDistrict,
    this.district,
    this.state,
    this.postOffice,
    this.pincode,
    this.mobileLast4,
    required this.secure,
  });

  /// First 4 digits = last 4 digits of the Aadhaar number, rest is timestamp.
  final String? referenceId;
  final String? name;
  final String? dob; // DD-MM-YYYY or DD/MM/YYYY
  final String? yob; // legacy XML only
  final String? gender; // M / F / T
  final String? careOf;
  final String? house;
  final String? street;
  final String? landmark;
  final String? location;
  final String? vtc;
  final String? subDistrict;
  final String? district;
  final String? state;
  final String? postOffice;
  final String? pincode;
  final String? mobileLast4;

  /// true = Secure QR (tamper-resistant format), false = legacy XML QR.
  final bool secure;

  String? get aadhaarLast4 =>
      referenceId != null && referenceId!.length >= 4 ? referenceId!.substring(0, 4) : null;

  /// dob "31-12-1990" → ISO "1990-12-31" (for date form fields).
  String? get dobIso {
    final d = dob;
    if (d == null) return null;
    final m = RegExp(r'^(\d{2})[-/](\d{2})[-/](\d{4})$').firstMatch(d.trim());
    if (m == null) return null;
    return '${m.group(3)}-${m.group(2)}-${m.group(1)}';
  }

  String get fullAddress => [
        careOf,
        house,
        street,
        landmark,
        location,
        vtc,
        subDistrict,
        district,
        state,
        postOffice,
        pincode,
      ].where((p) => p != null && p.trim().isNotEmpty).join(', ');
}

/// Returns null when the payload is not an Aadhaar QR.
AadhaarData? decodeAadhaarQr(String raw) {
  final s = raw.trim();
  if (RegExp(r'^[0-9]{50,}$').hasMatch(s)) return _decodeSecure(s);
  if (s.contains('<?xml') || s.startsWith('<PrintLetterBarcodeData')) return _decodeLegacyXml(s);
  return null;
}

AadhaarData? _decodeSecure(String digits) {
  try {
    var n = BigInt.parse(digits);
    final bytes = <int>[];
    final mask = BigInt.from(0xff);
    while (n > BigInt.zero) {
      bytes.insert(0, (n & mask).toInt());
      n = n >> 8;
    }

    List<int> inflated;
    try {
      inflated = GZipDecoder().decodeBytes(bytes);
    } catch (_) {
      inflated = const ZLibDecoder().decodeBytes(bytes);
    }

    // Split on 0xFF delimiters; the photo/signature follow the text fields,
    // so stop once we have more fields than we need.
    final fields = <String>[];
    var cur = <int>[];
    for (final b in inflated) {
      if (b == 0xff) {
        fields.add(latin1.decode(cur));
        cur = [];
        if (fields.length > 20) break;
      } else {
        cur.add(b);
      }
    }

    if (fields.length < 16) return null;

    // V2/V3/V4 payloads carry a leading version token.
    var i = 0;
    if (RegExp(r'^V\d$').hasMatch(fields[0])) i = 1;

    String? f(int k) {
      final idx = i + k;
      if (idx >= fields.length) return null;
      final v = fields[idx].trim();
      return v.isEmpty ? null : v;
    }

    // Field order per the UIDAI Secure QR spec:
    // [emailMobileFlag, referenceId, name, dob, gender, careOf, district,
    //  landmark, house, location, pincode, postOffice, state, street,
    //  subDistrict, vtc, (V2+: mobile last-4)]
    final data = AadhaarData(
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
      mobileLast4: i == 1 ? f(16) : null,
      secure: true,
    );
    // Sanity: a real payload always has a name and a numeric reference id.
    if (data.name == null || data.referenceId == null) return null;
    return data;
  } catch (_) {
    return null;
  }
}

AadhaarData? _decodeLegacyXml(String xml) {
  String? attr(String name) {
    final m = RegExp('$name="([^"]*)"').firstMatch(xml);
    final v = m?.group(1)?.trim();
    return v == null || v.isEmpty ? null : v;
  }

  final name = attr('name');
  if (name == null) return null;
  return AadhaarData(
    referenceId: attr('uid'),
    name: name,
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
  );
}
