import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

/// Data for one printable ID badge. QR payload matches what the scanner
/// expects: "CLAMS:<code>".
class BadgeData {
  const BadgeData({
    required this.fullName,
    required this.workerCode,
    this.designation,
    this.vendor,
    this.siteName,
  });

  final String fullName;
  final String workerCode;
  final String? designation;
  final String? vendor;
  final String? siteName;
}

pw.Widget _badge(BadgeData b) {
  return pw.Container(
    width: 170,
    padding: const pw.EdgeInsets.all(10),
    decoration: pw.BoxDecoration(
      border: pw.Border.all(color: PdfColors.grey600, width: 0.8),
      borderRadius: pw.BorderRadius.circular(8),
    ),
    child: pw.Column(
      mainAxisSize: pw.MainAxisSize.min,
      children: [
        pw.Text(
          b.fullName,
          style: pw.TextStyle(fontSize: 12, fontWeight: pw.FontWeight.bold),
          textAlign: pw.TextAlign.center,
        ),
        pw.SizedBox(height: 2),
        pw.Text(b.workerCode, style: const pw.TextStyle(fontSize: 10, color: PdfColors.grey700)),
        if (b.designation != null || b.vendor != null) ...[
          pw.SizedBox(height: 2),
          pw.Text(
            [b.designation, b.vendor].whereType<String>().join(' · '),
            style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey700),
            textAlign: pw.TextAlign.center,
          ),
        ],
        pw.SizedBox(height: 6),
        pw.BarcodeWidget(
          barcode: pw.Barcode.qrCode(),
          data: 'CLAMS:${b.workerCode}',
          width: 110,
          height: 110,
        ),
        pw.SizedBox(height: 6),
        pw.Text(
          '${b.siteName != null ? '${b.siteName} · ' : ''}CLAMS attendance',
          style: const pw.TextStyle(fontSize: 7, color: PdfColors.grey600),
          textAlign: pw.TextAlign.center,
        ),
      ],
    ),
  );
}

/// Opens the system print dialog (print or save as PDF) with the badges laid
/// out on A4, multiple per page.
Future<void> printBadges(List<BadgeData> badges) async {
  final doc = pw.Document();
  doc.addPage(
    pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.all(24),
      build: (_) => [
        pw.Wrap(spacing: 12, runSpacing: 12, children: badges.map(_badge).toList()),
      ],
    ),
  );
  await Printing.layoutPdf(onLayout: (_) => doc.save(), name: 'clams-badges.pdf');
}
