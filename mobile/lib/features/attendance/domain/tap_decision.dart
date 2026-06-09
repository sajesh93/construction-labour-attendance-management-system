/// Pure offline tap-decision logic, mirroring the backend engine so the device
/// can decide LOGIN/LOGOUT/DUPLICATE instantly without a network round-trip.
enum TapAction { login, logout, duplicate }

class OpenSession {
  const OpenSession({required this.id, required this.loginAt, required this.siteId});
  final String id;
  final DateTime loginAt;
  final String siteId;
}

class TapDecision {
  const TapDecision(this.action, {this.sessionId, this.cooldownRemainingSeconds = 0});
  final TapAction action;
  final String? sessionId;
  final int cooldownRemainingSeconds;
}

/// Decide whether a tap is a LOGIN, LOGOUT, or a DUPLICATE to ignore.
///
/// Rules (docs/06-edge-cases.md #1, #4):
///  - within cooldown of the last tap -> DUPLICATE
///  - else if an open session exists  -> LOGOUT
///  - else                            -> LOGIN
TapDecision decideTap({
  required DateTime tapTime,
  required int cooldownSeconds,
  OpenSession? openSession,
  DateTime? lastTapTime,
}) {
  if (lastTapTime != null) {
    final elapsedMs = tapTime.difference(lastTapTime).inMilliseconds;
    final cooldownMs = cooldownSeconds * 1000;
    if (elapsedMs >= 0 && elapsedMs < cooldownMs) {
      final remaining = ((cooldownMs - elapsedMs) / 1000).ceil();
      return TapDecision(TapAction.duplicate, cooldownRemainingSeconds: remaining);
    }
  }
  if (openSession != null) {
    return TapDecision(TapAction.logout, sessionId: openSession.id);
  }
  return const TapDecision(TapAction.login);
}
