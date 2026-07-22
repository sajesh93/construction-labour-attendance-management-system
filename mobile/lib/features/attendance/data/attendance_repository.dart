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

  /// How long a scan will wait on the server before falling back to local
  /// state. Short on purpose — the queue at the gate doesn't wait.
  static const _stateTimeout = Duration(seconds: 5);

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

  /// Pull one worker's live login state from the server into the local meta, so
  /// the in/out decision below reflects taps made on other devices.
  ///
  /// Best-effort and time-boxed: offline, or a server too slow to wait on at the
  /// gate, just leaves the local meta alone. Skipped entirely while the outbox
  /// still holds unsynced taps — the server hasn't seen those yet, so its answer
  /// would be staler than what this device already knows.
  Future<void> _refreshWorkerState(String workerId) async {
    try {
      if (await _db.pendingCount() > 0) return;
      final res = await _api.dio
          .get('/attendance/worker-state', queryParameters: {'workerId': workerId})
          .timeout(_stateTimeout);
      final data = res.data;
      if (data is! Map) return;
      await _db.setMeta('opensession:$workerId', (data['openSessionId'] as String?) ?? '');
      await _mergeLastTap(workerId, data['lastTapAt'] as String?);
    } catch (_) {
      // Offline/slow/unauthorised — keep the local view and decide from it.
    }
  }

  /// Keep whichever last-tap is later. Devices' clocks differ slightly, and the
  /// cooldown is there to swallow a double scan — erring later never loses a
  /// punch, it only asks the operator to wait a moment longer.
  Future<void> _mergeLastTap(String workerId, String? serverIso) async {
    if (serverIso == null || serverIso.isEmpty) return;
    final server = DateTime.tryParse(serverIso)?.toUtc();
    if (server == null) return;
    final localIso = await _db.getMeta('lasttap:$workerId');
    final local = localIso == null ? null : DateTime.tryParse(localIso)?.toUtc();
    if (local != null && local.isAfter(server)) return;
    await _db.setMeta('lasttap:$workerId', server.toIso8601String());
  }

  /// Replace the cached login state for every worker in one shot. Called when
  /// the device warms its worker cache, so a handset that then goes offline can
  /// still scan out people logged in by other devices.
  Future<void> refreshOpenSessions() async {
    try {
      if (await _db.pendingCount() > 0) return;
      final res = await _api.dio.get('/attendance/open-sessions');
      final rows = (res.data['data'] as List).cast<Map<String, dynamic>>();
      await _db.replaceOpenSessions({
        for (final r in rows)
          if (r['workerId'] is String && r['sessionId'] is String)
            r['workerId'] as String: r['sessionId'] as String,
      });
    } catch (_) {
      // Offline — the per-scan refresh picks this up once there's a network.
    }
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

    // Whoever scanned them IN may have been a different device, whose login
    // this one never saw. Refresh from the server first so the local meta is
    // the org-wide truth, not just this handset's history — otherwise a worker
    // logged in at gate A gets offered another LOGIN at gate B.
    if (worker != null) await _refreshWorkerState(worker.id);

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
    var recorded = outcome;
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
      // The server decides in/out from every device's taps, not just this one.
      // If it disagrees with the local guess, it wins — both in the local meta
      // and in what the operator is told was recorded.
      if (data is Map && worker != null) {
        recorded = await _reconcile(outcome, worker, data);
      }
    } on DioException catch (e) {
      // Stays pending — the sync engine retries and the server auto-confirms
      // offline-ingested logins.
      await _db.recordFailure(event.eventId, e.message ?? 'network');
    }

    return recorded;
  }

  /// Align the local view with what the server actually recorded for this tap.
  /// Returns the outcome to show the operator — corrected when the server made
  /// the opposite call (a login this device never saw makes the scan a LOGOUT).
  Future<TapOutcome> _reconcile(
    TapOutcome local,
    WorkerCard worker,
    Map<dynamic, dynamic> data,
  ) async {
    final result = data['result'];
    final sessionId = data['sessionId'];
    if (result == 'LOGOUT_RECORDED') {
      await _db.setMeta('opensession:${worker.id}', '');
      if (local.action == TapAction.logout) return local;
      return TapOutcome(action: TapAction.logout, worker: worker);
    }
    if (result == 'LOGIN_RECORDED' || result == 'LOGIN_PENDING_CONFIRM') {
      if (sessionId is String) await _db.setMeta('opensession:${worker.id}', sessionId);
      if (local.action == TapAction.login) return local;
      return TapOutcome(action: TapAction.login, worker: worker);
    }
    return local;
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
