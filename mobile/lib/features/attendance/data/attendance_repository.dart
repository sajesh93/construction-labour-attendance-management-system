import 'package:dio/dio.dart';
import 'package:uuid/uuid.dart';

import '../../../core/geo/location_service.dart';
import '../../../core/network/api_client.dart';
import '../../../core/storage/local_db.dart';
import '../domain/models.dart';
import '../domain/card_validity.dart';
import '../domain/tap_decision.dart';

/// Outcome surfaced to the UI after a tap. The event is ALWAYS persisted to the
/// outbox first (durable) before this returns success — so attendance is never
/// lost on crash, restart or network loss.
class TapOutcome {
  const TapOutcome({
    required this.action,
    this.worker,
    this.cooldownRemainingSeconds = 0,
    this.requiresConfirm = false,
    this.message,
  });
  final TapAction action;
  final WorkerCard? worker;
  final int cooldownRemainingSeconds;
  final bool requiresConfirm;
  final String? message;
}

class AttendanceRepository {
  AttendanceRepository(this._db, this._api, this._location);
  final LocalDb _db;
  final ApiClient _api;
  final LocationService _location;
  final _uuid = const Uuid();

  /// Resolve a worker from cached data for the given identifier/source.
  /// QR badges encode the EMP-ID (worker code); fall back to the opaque
  /// qr identifier for legacy codes. On a local cache miss we ask the server
  /// (best-effort) — this covers workers not assigned to the active site or a
  /// cache that hasn't refreshed yet, so a valid badge isn't reported as unknown.
  Future<WorkerCard?> resolve(TapSource source, String identifier) async {
    final local = await _resolveLocal(source, identifier);
    if (local != null) return local;
    return _resolveRemote(source, identifier);
  }

  Future<WorkerCard?> _resolveLocal(TapSource source, String identifier) async {
    switch (source) {
      case TapSource.nfcUid:
        return _db.findByUid(identifier);
      case TapSource.qr:
        return (await _db.findByCode(identifier)) ?? (await _db.findByQr(identifier));
      default:
        return _db.findByCode(identifier);
    }
  }

  /// Server lookup used only when the offline cache misses. Caches the result so
  /// the next scan resolves locally. Returns null when offline or not found —
  /// the tap is still recorded by identifier and resolves on sync.
  Future<WorkerCard?> _resolveRemote(TapSource source, String identifier) async {
    final attempts = switch (source) {
      TapSource.nfcUid => [
          {'uid': identifier},
        ],
      TapSource.qr => [
          {'code': identifier},
          {'qr': identifier},
        ],
      _ => [
          {'code': identifier},
        ],
    };
    for (final params in attempts) {
      try {
        final res = await _api.dio.get('/workers/lookup', queryParameters: params);
        final data = res.data;
        if (data is Map<String, dynamic>) {
          final card = WorkerCard.fromMap(data);
          await _db.cacheWorkers([card]);
          return card;
        }
      } on DioException catch (e) {
        // No response means offline — stop trying. A 404 just means "not this
        // identifier"; move on to the next attempt.
        if (e.response == null) break;
      }
    }
    return null;
  }

  /// Work out what a scan would do — who the worker is, and whether the tap is
  /// a LOGIN, a LOGOUT, a DUPLICATE or a refused EXPIRED card. Writes nothing.
  ///
  /// [preview] and [tap] both go through this, so the action the operator
  /// confirms on screen is the action that gets recorded.
  Future<TapOutcome> _evaluate({
    required String siteId,
    required TapSource source,
    required String identifier,
    required int cooldownSeconds,
    required DateTime now,
  }) async {
    final worker = await resolve(source, identifier);

    // Decide locally using the last tap recorded for this worker.
    final lastTapIso = worker == null ? null : await _db.getMeta('lasttap:${worker.id}');
    final openSessionId = worker == null ? null : await _db.getMeta('opensession:${worker.id}');
    final decision = decideTap(
      tapTime: now,
      cooldownSeconds: cooldownSeconds,
      openSession: openSessionId == null || openSessionId.isEmpty
          ? null
          : OpenSession(id: openSessionId, loginAt: now, siteId: siteId),
      lastTapTime: lastTapIso == null ? null : DateTime.tryParse(lastTapIso),
    );

    if (decision.action == TapAction.duplicate) {
      return TapOutcome(
        action: TapAction.duplicate,
        worker: worker,
        cooldownRemainingSeconds: decision.cooldownRemainingSeconds,
      );
    }

    // An expired ID card may not start a shift. Refused before the durable
    // write, so nothing is queued and nothing is ever synced — the server
    // enforces the same rule for taps that reach it another way.
    // A logout is always allowed: never trap a worker inside the gate.
    if (decision.action == TapAction.login &&
        worker != null &&
        isCardExpired(worker.validityTill, now.toLocal())) {
      final on = worker.validityTill!.toIso8601String().substring(0, 10);
      return TapOutcome(
        action: TapAction.expired,
        worker: worker,
        message: "${worker.fullName}'s ID card expired on $on. Renew the card before logging in.",
      );
    }

    return TapOutcome(
      action: decision.action,
      worker: worker,
      message: worker == null ? 'Unknown card — will resolve on sync' : null,
    );
  }

  /// Dry run of [tap] for the confirmation prompt: says what the scan would
  /// record without recording it. Nothing is queued, no session is opened or
  /// closed — call [tap] once the operator presses OK.
  Future<TapOutcome> preview({
    required String siteId,
    required TapSource source,
    required String identifier,
    required int cooldownSeconds,
  }) {
    return _evaluate(
      siteId: siteId,
      source: source,
      identifier: identifier,
      cooldownSeconds: cooldownSeconds,
      now: DateTime.now().toUtc(),
    );
  }

  /// Core offline-first tap: resolve locally → decide → persist to outbox →
  /// (best-effort) push to server. Cooldown + duplicate handled locally too.
  Future<TapOutcome> tap({
    required String siteId,
    required String deviceId,
    required TapSource source,
    required String identifier,
    required int cooldownSeconds,
    bool manualBackup = false,
    String? manualReason,
  }) async {
    final now = DateTime.now().toUtc();
    final outcome = await _evaluate(
      siteId: siteId,
      source: source,
      identifier: identifier,
      cooldownSeconds: cooldownSeconds,
      now: now,
    );
    // Refusals (duplicate tap, expired card) never reach the outbox.
    if (outcome.action == TapAction.duplicate || outcome.action == TapAction.expired) {
      return outcome;
    }
    final worker = outcome.worker;

    GeoFix? geo;
    try {
      geo = await _location.current();
    } catch (_) {
      geo = null;
    }

    final event = OutboxEvent(
      eventId: _uuid.v4(),
      siteId: siteId,
      deviceId: deviceId,
      source: source,
      identifier: identifier,
      clientEventTime: now,
      lat: geo?.lat,
      lng: geo?.lng,
      accuracyM: geo?.accuracyM,
      isManualBackup: manualBackup,
      manualReason: manualReason,
    );

    // 1) DURABLE write FIRST — this is what guarantees "no attendance loss".
    await _db.enqueue(event);
    if (worker != null) {
      await _db.setMeta('lasttap:${worker.id}', now.toIso8601String());
      if (outcome.action == TapAction.login) {
        await _db.setMeta('opensession:${worker.id}', event.eventId);
      } else {
        await _db.setMeta('opensession:${worker.id}', '');
      }
    }

    // 2) Best-effort immediate push; failures are fine — the sync engine retries.
    try {
      final res = await _api.dio.post('/attendance/tap', data: event.toJson());
      // MANUAL verification sites defer the session until the device confirms.
      // Scanning the badge IS the verification here, so confirm right away —
      // otherwise the login never becomes a session on the server.
      final data = res.data;
      if (data is Map && data['result'] == 'LOGIN_PENDING_CONFIRM') {
        await _api.dio.post('/attendance/confirm', data: {'eventId': event.eventId});
      }
      await _db.markSynced(event.eventId);
    } on DioException catch (e) {
      // Stays pending — the sync engine retries and the server auto-confirms
      // offline-ingested logins.
      await _db.recordFailure(event.eventId, e.message ?? 'network');
    }

    return outcome;
  }

  /// Manual-backup search. Hits the server (finds any worker in the org, not
  /// just the site cache) and falls back to the offline cache when there's no
  /// network — so a name/code always resolves when online.
  Future<List<WorkerCard>> search(String q) async {
    try {
      final res = await _api.dio.get('/workers/search', queryParameters: {'q': q});
      final data = res.data;
      if (data is List) {
        return data.cast<Map<String, dynamic>>().map(WorkerCard.fromMap).toList();
      }
    } catch (_) {
      // Offline or error — use the cached site list.
    }
    return _db.search(q);
  }

  Future<int> pendingCount() => _db.pendingCount();
}
