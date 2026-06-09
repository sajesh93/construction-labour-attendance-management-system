import 'package:flutter_test/flutter_test.dart';
import 'package:clams_mobile/features/attendance/domain/tap_decision.dart';

void main() {
  DateTime t(String s) => DateTime.parse(s);

  group('decideTap', () {
    test('LOGIN when no open session and no recent tap', () {
      final d = decideTap(tapTime: t('2026-06-09T08:00:00Z'), cooldownSeconds: 30);
      expect(d.action, TapAction.login);
    });

    test('LOGOUT when an open session exists', () {
      final d = decideTap(
        tapTime: t('2026-06-09T17:00:00Z'),
        cooldownSeconds: 30,
        openSession: OpenSession(id: 's1', loginAt: t('2026-06-09T08:00:00Z'), siteId: 'a'),
        lastTapTime: t('2026-06-09T08:00:00Z'),
      );
      expect(d.action, TapAction.logout);
      expect(d.sessionId, 's1');
    });

    test('DUPLICATE inside the cooldown window with remaining seconds', () {
      final d = decideTap(
        tapTime: t('2026-06-09T08:00:10Z'),
        cooldownSeconds: 30,
        lastTapTime: t('2026-06-09T08:00:00Z'),
      );
      expect(d.action, TapAction.duplicate);
      expect(d.cooldownRemainingSeconds, 20);
    });

    test('allows a tap exactly at the cooldown boundary', () {
      final d = decideTap(
        tapTime: t('2026-06-09T08:00:30Z'),
        cooldownSeconds: 30,
        lastTapTime: t('2026-06-09T08:00:00Z'),
      );
      expect(d.action, TapAction.login);
    });
  });
}
