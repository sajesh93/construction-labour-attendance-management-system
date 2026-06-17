import 'dart:typed_data';

import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

/// Physical card size. Base is CR80 (85.6 × 54 mm); orientation decides the edge.
enum CardSize { small, medium, large }

enum CardOrientation { portrait, landscape }

double _sizeScale(CardSize s) => switch (s) {
      CardSize.small => 0.82,
      CardSize.medium => 1.0,
      CardSize.large => 1.22,
    };

/// Company details stamped on the front header / back footer of every card.
class OrgInfo {
  const OrgInfo({
    this.name,
    this.addressLine1,
    this.addressLine2,
    this.city,
    this.state,
    this.pincode,
    this.phone,
    this.logoBytes,
  });

  final String? name;
  final String? addressLine1;
  final String? addressLine2;
  final String? city;
  final String? state;
  final String? pincode;
  final String? phone;
  final Uint8List? logoBytes;

  String? get cityLine {
    final parts = [city, state, pincode].where((e) => (e ?? '').isNotEmpty).toList();
    return parts.isEmpty ? null : parts.join(' ');
  }
}

/// Data for one printable ID card. QR payload matches the scanner: "CLAMS:<code>".
class BadgeData {
  const BadgeData({
    required this.fullName,
    required this.workerCode,
    this.designation,
    this.vendor,
    this.siteName,
    this.gender,
    this.dateOfBirth,
    this.bloodGroup,
    this.emergencyName,
    this.emergencyNumber,
    this.screeningDoneOn,
    this.screeningDoneBy,
    this.validityTill,
    this.photoUrl,
    this.photoBytes,
  });

  final String fullName;
  final String workerCode;
  final String? designation;
  final String? vendor;

  /// Project / site name shown on the front of the card.
  final String? siteName;
  final String? gender;

  /// ISO date strings (yyyy-MM-dd) — formatted for print.
  final String? dateOfBirth;
  final String? bloodGroup;
  final String? emergencyName;
  final String? emergencyNumber;
  final String? screeningDoneOn;
  final String? screeningDoneBy;
  final String? validityTill;

  /// Stored photo ref (e.g. "/files/<id>") — resolved to [photoBytes] before print.
  final String? photoUrl;
  final Uint8List? photoBytes;

  BadgeData withPhoto(Uint8List? bytes) => BadgeData(
        fullName: fullName,
        workerCode: workerCode,
        designation: designation,
        vendor: vendor,
        siteName: siteName,
        gender: gender,
        dateOfBirth: dateOfBirth,
        bloodGroup: bloodGroup,
        emergencyName: emergencyName,
        emergencyNumber: emergencyNumber,
        screeningDoneOn: screeningDoneOn,
        screeningDoneBy: screeningDoneBy,
        validityTill: validityTill,
        photoUrl: photoUrl,
        photoBytes: bytes,
      );
}

const PdfColor _navy = PdfColor.fromInt(0xff0d1b3e);
const PdfColor _labelBg = PdfColor.fromInt(0xfff3f5f8);

// CR80 in PDF points (1mm = 2.83465pt).
const double _baseLongPt = 85.6 * 2.83465;
const double _baseShortPt = 54 * 2.83465;

const _months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec' //
];

String _fmtDate(String? iso) {
  if (iso == null || iso.isEmpty) return '';
  final d = DateTime.tryParse(iso);
  if (d == null) return '';
  return '${d.day.toString().padLeft(2, '0')}-${_months[d.month - 1]}-${d.year}';
}

String _age(String? dobIso) {
  if (dobIso == null || dobIso.isEmpty) return '';
  final d = DateTime.tryParse(dobIso);
  if (d == null) return '';
  final now = DateTime.now();
  var a = now.year - d.year;
  if (now.month < d.month || (now.month == d.month && now.day < d.day)) a--;
  return a > 0 ? '$a' : '';
}

String _sex(String? g) => switch (g) {
      'M' => 'Male',
      'F' => 'Female',
      null => '',
      _ => g,
    };

({double w, double h}) _dims(CardSize size, CardOrientation orientation) {
  final s = _sizeScale(size);
  final long = _baseLongPt * s;
  final short = _baseShortPt * s;
  return orientation == CardOrientation.landscape
      ? (w: long, h: short)
      : (w: short, h: long);
}

pw.Widget _bar(String text, double u, {bool title = false}) {
  return pw.Container(
    width: double.infinity,
    color: _navy,
    padding: pw.EdgeInsets.symmetric(vertical: title ? 3.4 * u : 2.6 * u),
    alignment: pw.Alignment.center,
    child: pw.Text(
      text,
      textAlign: pw.TextAlign.center,
      style: pw.TextStyle(
        color: PdfColors.white,
        fontWeight: title ? pw.FontWeight.bold : pw.FontWeight.normal,
        fontSize: title ? 8.5 * u : 6 * u,
        letterSpacing: title ? 0.6 : 0.2,
      ),
    ),
  );
}

/// One label/value table row with thin borders.
pw.Widget _row(String label, String value, double u, {double labelW = 62, bool grow = false}) {
  final cell = pw.Row(
    crossAxisAlignment: pw.CrossAxisAlignment.stretch,
    children: [
      pw.Container(
        width: labelW * u,
        color: _labelBg,
        padding: pw.EdgeInsets.symmetric(horizontal: 3 * u, vertical: 2.4 * u),
        alignment: pw.Alignment.centerLeft,
        child: pw.Text(label,
            style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 6 * u)),
      ),
      pw.Expanded(
        child: pw.Container(
          padding: pw.EdgeInsets.symmetric(horizontal: 3 * u, vertical: 2.4 * u),
          alignment: pw.Alignment.centerLeft,
          child: pw.Text(value, maxLines: 1, overflow: pw.TextOverflow.clip,
              style: pw.TextStyle(fontSize: 6.4 * u)),
        ),
      ),
    ],
  );
  final box = pw.Container(
    decoration: const pw.BoxDecoration(
      border: pw.Border(
        bottom: pw.BorderSide(color: PdfColors.grey700, width: 0.4),
        right: pw.BorderSide(color: PdfColors.grey700, width: 0.4),
      ),
    ),
    child: cell,
  );
  return grow ? pw.Expanded(child: box) : box;
}

/// 1st / 2nd / 3rd disciplinary-action chips (green → amber → red).
pw.Widget _disciplinary(double u) {
  const items = [
    ('1st', PdfColor.fromInt(0xff2e7d32)),
    ('2nd', PdfColor.fromInt(0xfff9a825)),
    ('3rd', PdfColor.fromInt(0xffc62828)),
  ];
  final d = 13 * u;
  return pw.Row(
    mainAxisAlignment: pw.MainAxisAlignment.center,
    children: [
      for (final (label, color) in items)
        pw.Container(
          margin: pw.EdgeInsets.symmetric(horizontal: 1.2 * u),
          width: d,
          height: d,
          decoration: pw.BoxDecoration(color: color, shape: pw.BoxShape.circle),
          alignment: pw.Alignment.center,
          child: pw.Container(
            width: d * 0.74,
            height: d * 0.74,
            decoration: const pw.BoxDecoration(color: PdfColors.white, shape: pw.BoxShape.circle),
            alignment: pw.Alignment.center,
            child: pw.Text(label,
                style: pw.TextStyle(
                    color: color, fontWeight: pw.FontWeight.bold, fontSize: 4.6 * u)),
          ),
        ),
    ],
  );
}

/// A job-specific training seal: coloured circle with an abbreviation, name below.
pw.Widget _seal(String abbr, String name, PdfColor color, double u) {
  final d = 26 * u;
  return pw.Column(
    mainAxisSize: pw.MainAxisSize.min,
    children: [
      pw.Container(
        width: d,
        height: d,
        decoration: pw.BoxDecoration(
          color: color,
          shape: pw.BoxShape.circle,
          border: pw.Border.all(color: PdfColors.white, width: 1 * u),
        ),
        alignment: pw.Alignment.center,
        child: pw.Container(
          width: d * 0.66,
          height: d * 0.66,
          decoration: const pw.BoxDecoration(color: PdfColors.white, shape: pw.BoxShape.circle),
          alignment: pw.Alignment.center,
          child: pw.Text(abbr,
              style: pw.TextStyle(
                  color: color, fontWeight: pw.FontWeight.bold, fontSize: 6.5 * u)),
        ),
      ),
      pw.SizedBox(height: 1.2 * u),
      pw.SizedBox(
        width: d + 6 * u,
        child: pw.Text(name,
            textAlign: pw.TextAlign.center,
            maxLines: 2,
            style: pw.TextStyle(fontSize: 3.6 * u, color: PdfColors.grey800)),
      ),
    ],
  );
}

const _seals = [
  ('SI', 'Safety Induction', PdfColor.fromInt(0xff1565c0)),
  ('FP', 'Fire Protection', PdfColor.fromInt(0xffad1457)),
  ('CS', 'Confined Space', PdfColor.fromInt(0xff2e7d32)),
  ('ES', 'Electrical Safety', PdfColor.fromInt(0xffc62828)),
  ('ST', 'Safety Trained', PdfColor.fromInt(0xff00838f)),
  ('HW', 'Hot Work', PdfColor.fromInt(0xfff9a825)),
];

pw.Widget _front(BadgeData b, OrgInfo? org, double w, double h, double u) {
  final emergency = [b.emergencyName, b.emergencyNumber]
      .where((e) => (e ?? '').isNotEmpty)
      .join(' · ');
  return pw.Container(
    width: w,
    height: h,
    decoration: pw.BoxDecoration(
      border: pw.Border.all(color: PdfColors.grey700, width: 0.6),
      color: PdfColors.white,
    ),
    child: pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.stretch,
      children: [
        // Title bar with logo at the right edge.
        pw.Stack(
          children: [
            _bar('IDENTITY CARD', u, title: true),
            if (org?.logoBytes != null)
              pw.Positioned(
                right: 3 * u,
                top: 2 * u,
                child: pw.Container(
                  height: 11 * u,
                  padding: pw.EdgeInsets.all(0.8 * u),
                  color: PdfColors.white,
                  child: pw.Image(pw.MemoryImage(org!.logoBytes!), fit: pw.BoxFit.contain),
                ),
              ),
          ],
        ),
        // Body: details table | photo + badges
        pw.Expanded(
          child: pw.Row(
            crossAxisAlignment: pw.CrossAxisAlignment.stretch,
            children: [
              pw.Expanded(
                child: pw.Container(
                  decoration: const pw.BoxDecoration(
                    border: pw.Border(right: pw.BorderSide(color: PdfColors.grey700, width: 0.4)),
                  ),
                  child: pw.Column(
                    crossAxisAlignment: pw.CrossAxisAlignment.stretch,
                    children: [
                      _row('Project Name', b.siteName ?? '', u, grow: true),
                      _row('Employee name', b.fullName, u, grow: true),
                      _row('ID No', b.workerCode, u, grow: true),
                      _row('JOB Title', b.designation ?? '', u, grow: true),
                      pw.Expanded(
                        child: pw.Row(children: [
                          pw.Expanded(child: _row('Age', _age(b.dateOfBirth), u, labelW: 26)),
                          pw.Expanded(child: _row('Sex', _sex(b.gender), u, labelW: 26)),
                        ]),
                      ),
                      _row('Blood Group', b.bloodGroup ?? '', u, grow: true),
                      _row('Emergency', emergency, u, grow: true),
                    ],
                  ),
                ),
              ),
              pw.Container(
                width: 76 * u,
                padding: pw.EdgeInsets.all(3 * u),
                child: pw.Column(
                  children: [
                    pw.Expanded(
                      child: pw.Container(
                        width: double.infinity,
                        decoration: pw.BoxDecoration(
                          color: PdfColors.grey200,
                          border: pw.Border.all(color: PdfColors.grey700, width: 0.5),
                        ),
                        child: b.photoBytes != null
                            ? pw.Image(pw.MemoryImage(b.photoBytes!), fit: pw.BoxFit.cover)
                            : pw.Center(
                                child: pw.Text('Photo',
                                    style: pw.TextStyle(fontSize: 6 * u, color: PdfColors.grey500)),
                              ),
                      ),
                    ),
                    pw.SizedBox(height: 2 * u),
                    _disciplinary(u),
                    pw.SizedBox(height: 1 * u),
                    pw.Text('Disciplinary Action on Safety Violation',
                        textAlign: pw.TextAlign.center,
                        maxLines: 2,
                        style: pw.TextStyle(fontSize: 3.6 * u, color: PdfColors.grey800)),
                  ],
                ),
              ),
            ],
          ),
        ),
        _bar('Contact In Case Of Emergency (Name & Number)', u),
      ],
    ),
  );
}

pw.Widget _back(BadgeData b, OrgInfo? org, double w, double h, double u) {
  return pw.Container(
    width: w,
    height: h,
    decoration: pw.BoxDecoration(
      border: pw.Border.all(color: PdfColors.grey700, width: 0.6),
      color: PdfColors.white,
    ),
    child: pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.stretch,
      children: [
        _bar('SCREENING CARD', u, title: true),
        // Company + screening rows | QR
        pw.Container(
          decoration: const pw.BoxDecoration(
            border: pw.Border(bottom: pw.BorderSide(color: PdfColors.grey700, width: 0.4)),
          ),
          child: pw.Row(
            crossAxisAlignment: pw.CrossAxisAlignment.stretch,
            children: [
              pw.Expanded(
                child: pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.stretch,
                  children: [
                    _row('Company', org?.name ?? '', u, labelW: 74),
                    _row('Screening Done on', _fmtDate(b.screeningDoneOn), u, labelW: 74),
                    _row('Screening Done by', b.screeningDoneBy ?? '', u, labelW: 74),
                    _row('Validity till', _fmtDate(b.validityTill), u, labelW: 74),
                  ],
                ),
              ),
              pw.Container(
                width: 66 * u,
                padding: pw.EdgeInsets.all(3 * u),
                decoration: const pw.BoxDecoration(
                  border: pw.Border(left: pw.BorderSide(color: PdfColors.grey700, width: 0.4)),
                ),
                child: pw.Column(
                  mainAxisAlignment: pw.MainAxisAlignment.center,
                  children: [
                    pw.BarcodeWidget(
                      barcode: pw.Barcode.qrCode(),
                      data: 'CLAMS:${b.workerCode}',
                      width: 50 * u,
                      height: 50 * u,
                    ),
                    pw.SizedBox(height: 1 * u),
                    pw.Text(b.workerCode, style: pw.TextStyle(fontSize: 4.4 * u)),
                  ],
                ),
              ),
            ],
          ),
        ),
        // Computer-generated note (replaces seal / signature).
        pw.Container(
          width: double.infinity,
          padding: pw.EdgeInsets.symmetric(horizontal: 3 * u, vertical: 2 * u),
          decoration: const pw.BoxDecoration(
            border: pw.Border(bottom: pw.BorderSide(color: PdfColors.grey700, width: 0.4)),
          ),
          child: pw.Text(
            'This card is computer-generated and does not require a company seal or signature.',
            textAlign: pw.TextAlign.center,
            style: pw.TextStyle(
                fontSize: 4.6 * u, fontStyle: pw.FontStyle.italic, color: PdfColors.grey700),
          ),
        ),
        // Job-specific training seals.
        pw.Expanded(
          child: pw.Padding(
            padding: pw.EdgeInsets.symmetric(horizontal: 4 * u, vertical: 2.5 * u),
            child: pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Text('Job Specific Training Attended:',
                    style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 5.6 * u)),
                pw.SizedBox(height: 2 * u),
                pw.Expanded(
                  child: pw.Row(
                    mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                    crossAxisAlignment: pw.CrossAxisAlignment.start,
                    children: [
                      for (final (abbr, name, color) in _seals) _seal(abbr, name, color, u),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        _bar('If Found, Please Return to Project Office', u),
      ],
    ),
  );
}

/// Opens the system print dialog with two-sided ID cards (front + back kept
/// together as a pair so each can be cut out and laminated double-sided).
Future<void> printCards(
  List<BadgeData> badges, {
  OrgInfo? org,
  CardSize size = CardSize.medium,
  CardOrientation orientation = CardOrientation.landscape,
}) async {
  final dim = _dims(size, orientation);
  final u = _sizeScale(size);
  final doc = pw.Document();
  doc.addPage(
    pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.all(20),
      build: (_) => [
        pw.Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            for (final b in badges)
              pw.Row(
                mainAxisSize: pw.MainAxisSize.min,
                children: [
                  _front(b, org, dim.w, dim.h, u),
                  pw.SizedBox(width: 4),
                  _back(b, org, dim.w, dim.h, u),
                ],
              ),
          ],
        ),
      ],
    ),
  );
  await Printing.layoutPdf(onLayout: (_) => doc.save(), name: 'clams-id-cards.pdf');
}
