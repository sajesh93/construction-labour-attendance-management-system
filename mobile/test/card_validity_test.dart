import 'package:flutter_test/flutter_test.dart';

import 'package:clams_mobile/features/attendance/domain/card_validity.dart';

void main() {
  group('isCardExpired', () {
    // The gate taps at 08:00 on 9 Jul 2026, local time.
    final tap = DateTime(2026, 7, 9, 8, 0);

    test('a card with no validity date never expires', () {
      expect(isCardExpired(null, tap), isFalse);
    });

    test('is valid on the validity date itself', () {
      expect(isCardExpired(DateTime(2026, 7, 9), tap), isFalse);
    });

    test('is valid at one minute to midnight on that day', () {
      expect(isCardExpired(DateTime(2026, 7, 9), DateTime(2026, 7, 9, 23, 59)), isFalse);
    });

    test('expires from the first minute of the next day', () {
      expect(isCardExpired(DateTime(2026, 7, 9), DateTime(2026, 7, 10, 0, 1)), isTrue);
    });

    test('expires a long-lapsed card', () {
      expect(isCardExpired(DateTime(2025, 1, 31), tap), isTrue);
    });

    test('a future validity date is not expired', () {
      expect(isCardExpired(DateTime(2027, 1, 1), tap), isFalse);
    });

    test('ignores the time of day carried on the validity date', () {
      // The server sends a date-only string, but a parsed value may carry a
      // midnight component; only the calendar day may matter.
      expect(isCardExpired(DateTime(2026, 7, 9, 23, 59), tap), isFalse);
      expect(isCardExpired(DateTime(2026, 7, 8, 23, 59), tap), isTrue);
    });
  });
}
