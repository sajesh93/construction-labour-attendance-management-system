import 'package:flutter_test/flutter_test.dart';
import 'package:clams_mobile/features/printing/badge_printer.dart';

void main() {
  // Regression guard for the blank-back-card bug: the back card's rows used
  // `stretch` outside any bounded-height region, which resolves to infinite
  // height in the pdf Column's non-flex pass. In debug that throws; in release
  // it silently dropped every row after the title. Building the document must
  // not throw, and the rendered bytes must contain the full back-card content.
  test('buildCardsDocument renders front and back without overflow crash',
      () async {
    final doc = buildCardsDocument(
      const [
        BadgeData(
          fullName: 'Durai Murugan Chokkalingam',
          workerCode: 'W-0337',
          designation: 'Electrician',
          siteName: 'IndraNagar 01 Site',
          gender: 'M',
          dateOfBirth: '2000-01-01',
          bloodGroup: 'AB+',
          emergencyName: 'Viji',
          emergencyNumber: '12345',
          screeningDoneOn: '2026-06-01',
          screeningDoneBy: 'Safety Officer',
          inductionDoneOn: '2026-06-02',
          inductedBy: 'Site Engineer',
          validityTill: '2027-06-01',
        ),
      ],
      org: const OrgInfo(name: 'Optumace Pvt Ltd'),
    );

    final bytes = await doc.save();
    // A front-only (truncated back) document was ~4.7KB; a full two-card
    // document is ~9KB. Guard well above the truncated size.
    expect(bytes.length, greaterThan(7000));
  });

  test('buildCardsDocument tolerates missing/empty fields', () async {
    final doc = buildCardsDocument(
      const [BadgeData(fullName: 'No Details', workerCode: 'W-0001')],
    );
    final bytes = await doc.save();
    expect(bytes.length, greaterThan(3000));
  });
}
