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
    this.bloodGroup,
    this.emergencyName,
    this.emergencyNumber,
    this.photoUrl,
    this.photoBytes,
  });

  final String fullName;
  final String workerCode;
  final String? designation;
  final String? vendor;
  final String? siteName;
  final String? bloodGroup;
  final String? emergencyName;
  final String? emergencyNumber;

  /// Stored photo ref (e.g. "/files/<id>") — resolved to [photoBytes] before print.
  final String? photoUrl;
  final Uint8List? photoBytes;

  BadgeData withPhoto(Uint8List? bytes) => BadgeData(
        fullName: fullName,
        workerCode: workerCode,
        designation: designation,
        vendor: vendor,
        siteName: siteName,
        bloodGroup: bloodGroup,
        emergencyName: emergencyName,
        emergencyNumber: emergencyNumber,
        photoUrl: photoUrl,
        photoBytes: bytes,
      );
}

const PdfColor _accent = PdfColor.fromInt(0xff1565c0);

// CR80 in PDF points (1mm = 2.83465pt).
const double _baseLongPt = 85.6 * 2.83465;
const double _baseShortPt = 54 * 2.83465;

({double w, double h}) _dims(CardSize size, CardOrientation orientation) {
  final s = _sizeScale(size);
  final long = _baseLongPt * s;
  final short = _baseShortPt * s;
  return orientation == CardOrientation.landscape
      ? (w: long, h: short)
      : (w: short, h: long);
}

pw.Widget _front(BadgeData b, OrgInfo? org, double w, double h, double u) {
  return pw.Container(
    width: w,
    height: h,
    decoration: pw.BoxDecoration(
      border: pw.Border.all(color: PdfColors.grey400, width: 0.6),
      borderRadius: pw.BorderRadius.circular(7 * u),
      color: PdfColors.white,
    ),
    child: pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.stretch,
      children: [
        // Company header
        pw.Container(
          padding: pw.EdgeInsets.symmetric(horizontal: 6 * u, vertical: 4 * u),
          decoration: const pw.BoxDecoration(color: _accent),
          child: pw.Row(
            children: [
              if (org?.logoBytes != null) ...[
                pw.SizedBox(
                  height: 16 * u,
                  width: 16 * u,
                  child: pw.Image(pw.MemoryImage(org!.logoBytes!), fit: pw.BoxFit.contain),
                ),
                pw.SizedBox(width: 5 * u),
              ],
              pw.Expanded(
                child: pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.start,
                  mainAxisSize: pw.MainAxisSize.min,
                  children: [
                    pw.Text(
                      org?.name ?? 'CLAMS',
                      maxLines: 1,
                      overflow: pw.TextOverflow.clip,
                      style: pw.TextStyle(
                        color: PdfColors.white,
                        fontWeight: pw.FontWeight.bold,
                        fontSize: 9 * u,
                      ),
                    ),
                    if (org?.cityLine != null)
                      pw.Text(
                        org!.cityLine!,
                        maxLines: 1,
                        style: pw.TextStyle(color: PdfColors.white, fontSize: 5.5 * u),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
        // Identity
        pw.Expanded(
          child: pw.Padding(
            padding: pw.EdgeInsets.all(6 * u),
            child: pw.Row(
              crossAxisAlignment: pw.CrossAxisAlignment.center,
              children: [
                pw.Container(
                  width: 46 * u,
                  height: 56 * u,
                  decoration: pw.BoxDecoration(
                    color: PdfColors.grey200,
                    border: pw.Border.all(color: PdfColors.grey400, width: 0.5),
                    borderRadius: pw.BorderRadius.circular(4 * u),
                  ),
                  child: b.photoBytes != null
                      ? pw.ClipRRect(
                          horizontalRadius: 4 * u,
                          verticalRadius: 4 * u,
                          child: pw.Image(pw.MemoryImage(b.photoBytes!), fit: pw.BoxFit.cover),
                        )
                      : pw.Center(
                          child: pw.Text('No photo',
                              style: pw.TextStyle(fontSize: 6 * u, color: PdfColors.grey500)),
                        ),
                ),
                pw.SizedBox(width: 6 * u),
                pw.Expanded(
                  child: pw.Column(
                    crossAxisAlignment: pw.CrossAxisAlignment.start,
                    mainAxisSize: pw.MainAxisSize.min,
                    children: [
                      pw.Text(
                        b.fullName,
                        maxLines: 2,
                        style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 9.5 * u),
                      ),
                      if (b.designation != null)
                        pw.Text(b.designation!,
                            maxLines: 1, style: pw.TextStyle(fontSize: 7 * u, color: PdfColors.grey800)),
                      if (b.vendor != null)
                        pw.Text(b.vendor!,
                            maxLines: 1, style: pw.TextStyle(fontSize: 6.5 * u, color: PdfColors.grey600)),
                      pw.SizedBox(height: 3 * u),
                      pw.Text(b.workerCode,
                          style: pw.TextStyle(
                              fontSize: 7 * u, fontWeight: pw.FontWeight.bold, color: _accent)),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    ),
  );
}

pw.Widget _back(BadgeData b, OrgInfo? org, double w, double h, double u) {
  final emergency = [b.emergencyName, b.emergencyNumber]
      .where((e) => (e ?? '').isNotEmpty)
      .join(' · ');
  return pw.Container(
    width: w,
    height: h,
    padding: pw.EdgeInsets.all(6 * u),
    decoration: pw.BoxDecoration(
      border: pw.Border.all(color: PdfColors.grey400, width: 0.6),
      borderRadius: pw.BorderRadius.circular(7 * u),
      color: PdfColors.white,
    ),
    child: pw.Column(
      mainAxisAlignment: pw.MainAxisAlignment.center,
      crossAxisAlignment: pw.CrossAxisAlignment.center,
      children: [
        pw.BarcodeWidget(
          barcode: pw.Barcode.qrCode(),
          data: 'CLAMS:${b.workerCode}',
          width: 70 * u,
          height: 70 * u,
        ),
        pw.SizedBox(height: 5 * u),
        if ((b.bloodGroup ?? '').isNotEmpty)
          pw.RichText(
            text: pw.TextSpan(
              children: [
                pw.TextSpan(
                    text: 'Blood group: ',
                    style: pw.TextStyle(fontSize: 7.5 * u, fontWeight: pw.FontWeight.bold)),
                pw.TextSpan(text: b.bloodGroup, style: pw.TextStyle(fontSize: 7.5 * u)),
              ],
            ),
          )
        else if (emergency.isNotEmpty) ...[
          pw.Text('In emergency, call',
              style: pw.TextStyle(
                  fontSize: 7 * u,
                  fontWeight: pw.FontWeight.bold,
                  color: PdfColors.red800)),
          pw.Text(emergency,
              textAlign: pw.TextAlign.center, style: pw.TextStyle(fontSize: 7 * u)),
        ],
        pw.SizedBox(height: 5 * u),
        pw.Text(
          [org?.name ?? 'CLAMS', if ((org?.phone ?? '').isNotEmpty) org!.phone].join(' · '),
          textAlign: pw.TextAlign.center,
          style: pw.TextStyle(fontSize: 5.5 * u, color: PdfColors.grey600),
        ),
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
