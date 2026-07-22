import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/theme.dart';
import '../../../core/providers.dart';
import '../../../core/time/clock_guard.dart';
import '../../../core/widgets/section_header.dart';
import '../attendance_providers.dart';
import '../../auth/auth_controller.dart';
import '../../device/device_service.dart';
import '../domain/models.dart';
import '../domain/tap_decision.dart';
import '../../sos/notification_watcher.dart';
import '../../sos/sos_button.dart';
import 'worker_card_sheet.dart';
import 'manual_search_sheet.dart';
import 'confirm_tap_dialog.dart';
import 'qr_scan_screen.dart';

class AttendanceHomeScreen extends ConsumerStatefulWidget {
  const AttendanceHomeScreen({super.key});

  @override
  ConsumerState<AttendanceHomeScreen> createState() => _AttendanceHomeScreenState();
}

class _AttendanceHomeScreenState extends ConsumerState<AttendanceHomeScreen> {
  String? _siteId;
  String _siteName = '';
  bool _busy = false;
  String _status = 'Scan a worker QR badge to begin';

  // Site cooldown — refreshed from cached settings; default 30s.
  final int _cooldownSeconds = 30;

  DeviceState? _deviceState;
  String? _deviceId;
  Timer? _syncTimer;
  DateTime _lastCacheRefresh = DateTime.fromMillisecondsSinceEpoch(0);

  static const _cacheRefreshEvery = Duration(hours: 4);

  @override
  void initState() {
    super.initState();
    Future.microtask(_init);
    // Drain the outbox in the background so punches reach the server even if
    // the immediate push failed (network blip, server briefly down).
    _syncTimer = Timer.periodic(const Duration(seconds: 60), (_) => _backgroundSync());
  }

  @override
  void dispose() {
    _syncTimer?.cancel();
    super.dispose();
  }

  Future<void> _backgroundSync() async {
    await ref.read(syncEngineProvider).syncNow();
    if (mounted) ref.invalidate(pendingCountProvider);
    // Periodic worker-cache refresh so deleted/edited workers don't go stale.
    if (DateTime.now().difference(_lastCacheRefresh) > _cacheRefreshEvery) {
      await _refreshWorkerCache();
    }
  }

  /// Re-pulls the site's worker list and replaces the offline cache, dropping
  /// entries for deleted/exited people.
  Future<void> _refreshWorkerCache() async {
    if (_siteId == null) return;
    try {
      final dio = ref.read(apiClientProvider).dio;
      final res = await dio.get('/workers/by-site', queryParameters: {'siteId': _siteId});
      final data = (res.data['data'] as List).cast<Map<String, dynamic>>();
      await ref.read(localDbProvider).replaceWorkers(data.map(WorkerCard.fromMap).toList());
      // Who is already logged in, org-wide — including logins recorded on other
      // devices. Without this a handset that goes offline would offer a fresh
      // LOGIN to someone another gate already scanned in.
      await ref.read(attendanceRepositoryProvider).refreshOpenSessions();
      _lastCacheRefresh = DateTime.now();
    } catch (_) {
      // Offline — keep the existing cache; retried on the next cycle.
    }
  }

  Future<void> _init() async {
    final db = ref.read(localDbProvider);
    final siteId = await db.getMeta('active_site');
    final name = await db.getMeta('active_site_name') ?? '';
    setState(() {
      _siteId = siteId;
      _siteName = name;
    });
    await _ensureDevice();
    // Kick a sync + fresh worker cache on entry (app start).
    ref.read(syncEngineProvider).syncNow();
    unawaited(_refreshWorkerCache());
  }

  Future<void> _ensureDevice() async {
    final st = await ref.read(deviceServiceProvider).ensureRegisteredAndAuthorized();
    if (!mounted) return;
    setState(() {
      _deviceState = st.state;
      _deviceId = st.deviceId;
    });
  }

  Future<void> _onManual() async {
    final picked = await showModalBottomSheet<WorkerCard>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const ManualSearchSheet(),
    );
    if (picked == null) return;
    final reason = await _askReason();
    if (reason == null) return;
    await _handleTap(TapSource.manual, picked.workerCode,
        manualBackup: true, manualReason: reason);
  }

  Future<String?> _askReason() {
    final controller = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Reason required'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(hintText: 'e.g. Forgot card'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, controller.text.trim()),
            child: const Text('Confirm'),
          ),
        ],
      ),
    );
  }

  /// Continuous gate loop: scan → one dialog showing the worker's details and
  /// LOGIN/LOGOUT with OK/Cancel → record on OK → camera straight back up for
  /// the next badge. The watchman never taps "Scan" again between workers; the
  /// only way out is the back button on the scanner.
  Future<void> _onQr() async {
    if (_siteId == null) return;
    if (await _clockIsWrong()) return;

    while (true) {
      if (!mounted) return;
      final code = await Navigator.of(context).push<String>(
        MaterialPageRoute(builder: (_) => const QrScanScreen()),
      );
      // Back button out of the scanner — done scanning.
      if (code == null || !mounted) return;
      // QR badges are "CLAMS:<EMP-ID>"; accept a bare code too.
      final value = code.startsWith('CLAMS:') ? code.substring(6) : code;
      await _reviewScan(value.trim());
      // Recorded, cancelled or refused — either way, back to the camera.
    }
  }

  /// Handles one scanned badge: preview (writes nothing) → confirm → record.
  Future<void> _reviewScan(String identifier) async {
    setState(() => _busy = true);
    final outcome = await ref.read(attendanceRepositoryProvider).preview(
          siteId: _siteId!,
          source: TapSource.qr,
          identifier: identifier,
          cooldownSeconds: _cooldownSeconds,
        );
    if (!mounted) return;
    setState(() => _busy = false);

    switch (outcome.action) {
      case TapAction.duplicate:
        final name = outcome.worker?.fullName;
        _toast(
          '${name == null ? 'Duplicate scan' : '$name — duplicate scan'} ignored '
          '(${outcome.cooldownRemainingSeconds}s cooldown)',
          ClamsColors.warning,
        );
        setState(() => _status =
            'Duplicate scan ignored (${outcome.cooldownRemainingSeconds}s cooldown)');
        return;
      case TapAction.expired:
        setState(() => _status = 'ID card expired — login not recorded');
        await _showExpired(outcome.message);
        return;
      case TapAction.login:
      case TapAction.logout:
        // One screen: the worker's details AND the OK/Cancel decision.
        final ok = await showDialog<bool>(
          context: context,
          barrierDismissible: false,
          builder: (_) => ConfirmTapDialog(
            action: outcome.action,
            identifier: identifier,
            worker: outcome.worker,
          ),
        );
        if (ok != true) {
          if (mounted) setState(() => _status = 'Cancelled — nothing recorded');
          return;
        }
        await _handleTap(TapSource.qr, identifier);
        return;
    }
  }

  /// Brief confirmation that doesn't interrupt the next scan.
  void _toast(String message, Color color) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: color,
          duration: const Duration(seconds: 2),
        ),
      );
  }

  /// A wrong phone clock would record punches at the wrong time — refuse the
  /// scan while online with >10 min skew. (Offline punches are allowed.)
  Future<bool> _clockIsWrong() async {
    if (!await ref.read(clockGuardProvider).clockIsWrong()) return false;
    if (!mounted) return true;
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: const Icon(Icons.schedule, color: ClamsColors.error, size: 40),
        title: const Text('Phone clock is wrong'),
        content: const Text(
          'This phone\'s time differs from the server by more than 10 minutes, '
          'so punches would be recorded at the wrong time.\n\n'
          'Open Settings → Date & time and enable "Automatic date & time", '
          'then try again.',
        ),
        actions: [
          FilledButton(onPressed: () => Navigator.pop(ctx), child: const Text('OK')),
        ],
      ),
    );
    return true;
  }

  Future<void> _showExpired(String? message) {
    return showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: const Icon(Icons.gpp_bad_outlined, color: Colors.red, size: 40),
        title: const Text('ID card expired'),
        content: Text(
          message ?? 'This ID card has expired. Renew it before logging in.',
        ),
        actions: [
          FilledButton(onPressed: () => Navigator.pop(ctx), child: const Text('OK')),
        ],
      ),
    );
  }

  Future<void> _handleTap(
    TapSource source,
    String identifier, {
    bool manualBackup = false,
    String? manualReason,
  }) async {
    if (_siteId == null) return;
    if (source != TapSource.qr && await _clockIsWrong()) return;

    setState(() => _busy = true);
    final repo = ref.read(attendanceRepositoryProvider);
    final outcome = await repo.tap(
      siteId: _siteId!,
      deviceId: (await ref.read(localDbProvider).getMeta('device_id')) ?? 'unregistered',
      source: source,
      identifier: identifier,
      cooldownSeconds: _cooldownSeconds,
      manualBackup: manualBackup,
      manualReason: manualReason,
    );
    ref.invalidate(pendingCountProvider);
    if (!mounted) return;
    setState(() => _busy = false);

    switch (outcome.action) {
      case TapAction.duplicate:
        setState(() => _status =
            'Duplicate tap ignored (${outcome.cooldownRemainingSeconds}s cooldown)');
        break;
      case TapAction.expired:
        // Nothing was queued: the login is refused outright, not "pending".
        setState(() => _status = 'ID card expired — login not recorded');
        await _showExpired(outcome.message);
        break;
      case TapAction.login:
      case TapAction.logout:
        final verb = outcome.action == TapAction.login ? 'LOGIN' : 'LOGOUT';
        setState(() => _status = outcome.worker == null
            ? (outcome.message ?? 'Recorded')
            : '$verb recorded: ${outcome.worker!.fullName}');
        // A QR scan already showed the worker's details on the confirm screen —
        // don't make the watchman dismiss the same person twice. Manual entry
        // has no such screen, so it still gets the full card.
        if (source == TapSource.qr) {
          _toast(
            outcome.worker == null
                ? '$verb recorded'
                : '$verb recorded: ${outcome.worker!.fullName}',
            outcome.action == TapAction.login
                ? ClamsColors.success
                : ClamsColors.info,
          );
        } else if (outcome.worker != null) {
          await showModalBottomSheet(
            context: context,
            builder: (_) => WorkerCardSheet(worker: outcome.worker!, action: verb),
          );
        }
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    final pending = ref.watch(pendingCountProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text(_siteName.isEmpty ? 'Attendance' : _siteName),
        actions: [
          const SosButton(compact: true),
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: Center(
              child: pending.when(
                data: (n) => ActionChip(
                  avatar: Icon(
                    n == 0 ? Icons.cloud_done : Icons.cloud_upload,
                    size: 18,
                    color: n == 0 ? ClamsColors.success : ClamsColors.warning,
                  ),
                  label: Text(
                    n == 0 ? 'Synced' : '$n to sync',
                    style: TextStyle(
                      color: n == 0 ? ClamsColors.success : ClamsColors.warning,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  backgroundColor:
                      n == 0 ? ClamsColors.successTint : ClamsColors.warningTint,
                  side: BorderSide.none,
                  tooltip: n == 0
                      ? 'All punches uploaded — tap to sync now'
                      : '$n punch(es) waiting to upload — tap to sync now',
                  onPressed: _backgroundSync,
                ),
                loading: () => const SizedBox.shrink(),
                error: (_, __) => const SizedBox.shrink(),
              ),
            ),
          ),
          IconButton(
            tooltip: 'Change site',
            icon: const Icon(Icons.location_city),
            onPressed: () => context.go('/site'),
          ),
          IconButton(
            tooltip: 'Logout',
            icon: const Icon(Icons.logout),
            onPressed: () => ref.read(authControllerProvider.notifier).logout(),
          ),
        ],
      ),
      body: NotificationWatcher(
        child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (_deviceState == DeviceState.pending || _deviceState == DeviceState.error)
              StatusBanner(
                color: ClamsColors.warning,
                icon: Icons.warning_amber,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _deviceState == DeviceState.pending
                          ? 'Device awaiting authorization'
                          : 'Could not reach server',
                      style: Theme.of(context)
                          .textTheme
                          .titleMedium
                          ?.copyWith(fontWeight: FontWeight.w500),
                    ),
                    ClamsSpacing.gapSm,
                    if (_deviceState == DeviceState.pending && _deviceId != null)
                      Text(
                        'Ask an admin to authorize this device in Admin → Devices, '
                        'then tap Retry.\nDevice ID: $_deviceId',
                        style: const TextStyle(color: ClamsColors.textSecondary),
                      ),
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(
                        onPressed: _ensureDevice,
                        style: TextButton.styleFrom(
                            foregroundColor: ClamsColors.accent),
                        child: const Text('Retry'),
                      ),
                    ),
                  ],
                ),
              ),
            ClamsSpacing.gapMd,
            const Icon(Icons.qr_code_scanner, size: 96, color: ClamsColors.primary),
            ClamsSpacing.gapXl,
            Text(_status, textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleMedium),
            ClamsSpacing.gapXxl,
            FilledButton.icon(
              onPressed: _busy ? null : _onQr,
              icon: const Icon(Icons.qr_code_scanner),
              label: const Text('Scan QR code'),
            ),
            ClamsSpacing.gapMd,
            OutlinedButton.icon(
              onPressed: _busy ? null : _onManual,
              icon: const Icon(Icons.search),
              label: const Text('Manual / lost card'),
            ),
          ],
        ),
        ),
      ),
    );
  }
}
