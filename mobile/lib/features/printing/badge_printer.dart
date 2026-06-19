import 'dart:typed_data';

import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

/// Physical card size. Base is CR80 (85.6 × 54 mm). Cards are landscape only.
enum CardSize { small, medium, large }

double _sizeScale(CardSize s) => switch (s) {
      CardSize.small => 0.82,
      CardSize.medium => 1.0,
      CardSize.large => 1.22,
    };

/// Company details stamped on the cards.
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
    this.logoScale = 1.0,
  });

  final String? name;
  final String? addressLine1;
  final String? addressLine2;
  final String? city;
  final String? state;
  final String? pincode;
  final String? phone;
  final Uint8List? logoBytes;

  /// Print-time zoom for the logo (1 = fit to box).
  final double logoScale;

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
    this.inductionDoneOn,
    this.inductedBy,
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
  final String? inductionDoneOn;
  final String? inductedBy;
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
        inductionDoneOn: inductionDoneOn,
        inductedBy: inductedBy,
        validityTill: validityTill,
        photoUrl: photoUrl,
        photoBytes: bytes,
      );
}

const PdfColor _navy = PdfColor.fromInt(0xff0d1b3e);
const PdfColor _labelBg = PdfColor.fromInt(0xffeef1f5);

// CR80 in PDF points (1mm = 2.83465pt), landscape.
const double _cardWidthPt = 85.6 * 2.83465;
const double _cardHeightPt = 54 * 2.83465;

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

pw.Widget _bar(String text, double u, {bool title = false}) {
  return pw.Container(
    width: double.infinity,
    color: _navy,
    padding: pw.EdgeInsets.symmetric(vertical: title ? 3.4 * u : 2.6 * u),
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
        padding: pw.EdgeInsets.symmetric(horizontal: 3 * u, vertical: 2 * u),
        child: pw.Text(label,
            style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 5.8 * u)),
      ),
      pw.Expanded(
        child: pw.Container(
          padding: pw.EdgeInsets.symmetric(horizontal: 3 * u, vertical: 2 * u),
          child: pw.Text(value, maxLines: 1, overflow: pw.TextOverflow.clip,
              style: pw.TextStyle(fontSize: 6.2 * u)),
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

/// Company logo in a bordered box, with print-time zoom.
pw.Widget _logoBox(OrgInfo? org, double u) {
  if (org?.logoBytes == null) return pw.SizedBox(height: 16 * u);
  return pw.Container(
    height: 16 * u,
    width: double.infinity,
    decoration: pw.BoxDecoration(border: pw.Border.all(color: PdfColors.grey500, width: 0.5)),
    child: pw.ClipRect(
      child: pw.Transform.scale(
        scale: org!.logoScale,
        child: pw.Image(pw.MemoryImage(org.logoBytes!), fit: pw.BoxFit.contain),
      ),
    ),
  );
}

/// 1st / 2nd / 3rd disciplinary-action chips (green → amber → red).
pw.Widget _disciplinary(double u) {
  const items = [
    ('1st', PdfColor.fromInt(0xff2e7d32)),
    ('2nd', PdfColor.fromInt(0xfff9a825)),
    ('3rd', PdfColor.fromInt(0xffc62828)),
  ];
  final d = 16 * u;
  return pw.Row(
    mainAxisAlignment: pw.MainAxisAlignment.center,
    children: [
      for (final (label, color) in items)
        pw.Container(
          margin: pw.EdgeInsets.symmetric(horizontal: 1.2 * u),
          width: d,
          height: d,
          decoration: pw.BoxDecoration(
            color: color,
            shape: pw.BoxShape.circle,
            border: pw.Border.all(color: PdfColors.white, width: 0.8 * u),
          ),
          alignment: pw.Alignment.center,
          child: pw.Container(
            width: d * 0.74,
            height: d * 0.74,
            decoration: const pw.BoxDecoration(color: PdfColors.white, shape: pw.BoxShape.circle),
            alignment: pw.Alignment.center,
            child: pw.Text(label,
                style: pw.TextStyle(
                    color: color, fontWeight: pw.FontWeight.bold, fontSize: 5.6 * u)),
          ),
        ),
    ],
  );
}

/// A job-specific training seal: coloured ring with an abbreviation, name below.
pw.Widget _seal(String abbr, String name, PdfColor color, double u) {
  final d = 18 * u;
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
          width: d * 0.6,
          height: d * 0.6,
          decoration: pw.BoxDecoration(
            color: PdfColors.white,
            shape: pw.BoxShape.circle,
            border: pw.Border.all(color: color, width: 0.6 * u),
          ),
          alignment: pw.Alignment.center,
          child: pw.Text(abbr,
              style: pw.TextStyle(
                  color: color, fontWeight: pw.FontWeight.bold, fontSize: 6 * u)),
        ),
      ),
      pw.SizedBox(height: 1.2 * u),
      pw.SizedBox(
        width: d + 8 * u,
        child: pw.Text(name,
            textAlign: pw.TextAlign.center,
            maxLines: 2,
            style: pw.TextStyle(fontSize: 4.2 * u, color: PdfColors.grey800)),
      ),
    ],
  );
}

const _seals = [
  ('SI', 'Safety Induction', PdfColor.fromInt(0xff1f3a93)),
  ('FP', 'Fire Protection', PdfColor.fromInt(0xffb0185a)),
  ('CS', 'Confined Space', PdfColor.fromInt(0xff1e7d4f)),
  ('ES', 'Electrical Safety', PdfColor.fromInt(0xffc62828)),
  ('ST', 'Safety Trained', PdfColor.fromInt(0xff0277bd)),
  ('HW', 'Hot Work', PdfColor.fromInt(0xfff9a825)),
];

pw.Widget _front(BadgeData b, OrgInfo? org, double u) {
  final emergency = [b.emergencyName, b.emergencyNumber]
      .where((e) => (e ?? '').isNotEmpty)
      .join(' · ');
  return pw.Container(
    width: _cardWidthPt * u,
    height: _cardHeightPt * u,
    decoration: pw.BoxDecoration(
      border: pw.Border.all(color: PdfColors.grey700, width: 0.6),
      color: PdfColors.white,
    ),
    child: pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.stretch,
      children: [
        _bar('IDENTITY CARD', u, title: true),
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
                      _row('Emergency Contact', emergency, u, labelW: 76, grow: true),
                    ],
                  ),
                ),
              ),
              pw.Container(
                width: 76 * u,
                padding: pw.EdgeInsets.all(3 * u),
                child: pw.Column(
                  children: [
                    _logoBox(org, u),
                    pw.SizedBox(height: 2 * u),
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
      ],
    ),
  );
}

pw.Widget _back(BadgeData b, OrgInfo? org, double u) {
  return pw.Container(
    width: _cardWidthPt * u,
    height: _cardHeightPt * u,
    decoration: pw.BoxDecoration(
      border: pw.Border.all(color: PdfColors.grey700, width: 0.6),
      color: PdfColors.white,
    ),
    // Rows must sit inside a bounded height: the pdf Column measures non-flex
    // children with UNBOUNDED height, and a `stretch` Row resolves to infinite
    // height there — which makes the Column drop every later child (the front
    // avoids this because all its rows live inside Expanded). So each row/section
    // below is given an explicit height; the seals section absorbs the slack.
    child: pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.stretch,
      children: [
        _bar('SCREENING & INDUCTION CARD', u, title: true),
        // Company + screening rows | QR
        pw.SizedBox(
          height: 37.5 * u,
          child: pw.Container(
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
                      pw.Expanded(
                          child: _row('Name of the Company', org?.name ?? '', u, labelW: 86)),
                      pw.Expanded(
                          child: _row('Screening Done on', _fmtDate(b.screeningDoneOn), u,
                              labelW: 86)),
                      pw.Expanded(
                          child: _row('Screening Done by', b.screeningDoneBy ?? '', u, labelW: 86)),
                    ],
                  ),
                ),
                pw.Container(
                  width: 46 * u,
                  padding: pw.EdgeInsets.all(2.5 * u),
                  decoration: const pw.BoxDecoration(
                    border: pw.Border(left: pw.BorderSide(color: PdfColors.grey700, width: 0.4)),
                  ),
                  child: pw.Column(
                    mainAxisAlignment: pw.MainAxisAlignment.center,
                    children: [
                      pw.BarcodeWidget(
                        barcode: pw.Barcode.qrCode(),
                        data: 'CLAMS:${b.workerCode}',
                        width: 30 * u,
                        height: 30 * u,
                      ),
                      pw.SizedBox(height: 1 * u),
                      pw.Text(b.workerCode,
                          style: pw.TextStyle(fontSize: 5 * u, fontWeight: pw.FontWeight.bold)),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        // Induction details.
        pw.SizedBox(
          height: 12.5 * u,
          child: pw.Row(children: [
            pw.Expanded(
                child: _row('Induction Done on', _fmtDate(b.inductionDoneOn), u, labelW: 62)),
            pw.Expanded(child: _row('Inducted By', b.inductedBy ?? '', u, labelW: 50)),
          ]),
        ),
        // Computer-generated note (comes right after the induction details).
        pw.Container(
          width: double.infinity,
          padding: pw.EdgeInsets.symmetric(horizontal: 3 * u, vertical: 1.6 * u),
          decoration: const pw.BoxDecoration(
            border: pw.Border(bottom: pw.BorderSide(color: PdfColors.grey700, width: 0.4)),
          ),
          child: pw.Text(
            'This card is computer-generated and does not require a company seal or signature.',
            textAlign: pw.TextAlign.center,
            style: pw.TextStyle(
                fontSize: 4.4 * u, fontStyle: pw.FontStyle.italic, color: PdfColors.grey700),
          ),
        ),
        // Job-specific training seals (fills remaining height).
        pw.Expanded(
          child: pw.Padding(
            padding: pw.EdgeInsets.symmetric(horizontal: 4 * u, vertical: 2 * u),
            child: pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Text('Job Specific Training Attended:',
                    style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 5.4 * u)),
                pw.SizedBox(height: 1.5 * u),
                pw.Expanded(
                  child: pw.Row(
                    mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                    crossAxisAlignment: pw.CrossAxisAlignment.center,
                    children: [
                      for (final (abbr, name, color) in _seals) _seal(abbr, name, color, u),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        pw.SizedBox(
          height: 12.5 * u,
          child: _row('Validity till', _fmtDate(b.validityTill), u, labelW: 60),
        ),
        _bar('If Found, Please Return to Project Office', u),
      ],
    ),
  );
}

/// Builds the printable ID-card document (front + back pairs). Exposed so it
/// can be rendered/tested without the platform print dialog.
pw.Document buildCardsDocument(
  List<BadgeData> badges, {
  OrgInfo? org,
  CardSize size = CardSize.medium,
}) {
  final u = _sizeScale(size);
  final doc = pw.Document();
  doc.addPage(
    pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.all(20),
      build: (_) => [
        pw.Wrap(
          // Generous gaps so the printed cards can be cut apart easily.
          spacing: 28,
          runSpacing: 28,
          children: [
            for (final b in badges)
              pw.Row(
                mainAxisSize: pw.MainAxisSize.min,
                children: [
                  _front(b, org, u),
                  pw.SizedBox(width: 16),
                  _back(b, org, u),
                ],
              ),
          ],
        ),
      ],
    ),
  );
  return doc;
}

/// Opens the system print dialog with two-sided ID cards (front + back kept
/// together as a pair so each can be cut out and laminated double-sided).
Future<void> printCards(
  List<BadgeData> badges, {
  OrgInfo? org,
  CardSize size = CardSize.medium,
}) async {
  final doc = buildCardsDocument(badges, org: org, size: size);
  await Printing.layoutPdf(onLayout: (_) => doc.save(), name: 'clams-id-cards.pdf');
}
