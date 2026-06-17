import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/providers.dart';
import '../../../core/time/clock_guard.dart';
import '../attendance_providers.dart';
import '../../auth/auth_controller.dart';
import '../../device/device_service.dart';
import '../domain/models.dart';
import '../domain/tap_decision.dart';
import '../../sos/notification_watcher.dart';
import '../../sos/sos_button.dart';
import 'worker_card_sheet.dart';
import 'manual_search_sheet.dart';
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
  String _status = 'Tap a card to begin';

  // Site cooldown — refreshed from cached settings; default 30s.
  final int _cooldownSeconds = 30;

  DeviceState? _deviceState;
  String? _deviceId;
  bool _nfcAvailable = true;
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
      _lastCacheRefresh = DateTime.now();
    } catch (_) {
      // Offline — keep the existing cache; retried on the next cycle.
    }
  }

  Future<void> _init() async {
    final db = ref.read(localDbProvider);
    final siteId = await db.getMeta('active_site');
    final name = await db.getMeta('active_site_name') ?? '';
    final nfcOk = await ref.read(nfcReaderProvider).isAvailable();
    setState(() {
      _siteId = siteId;
      _siteName = name;
      _nfcAvailable = nfcOk;
      if (!nfcOk) _status = 'No NFC on this device — scan the worker QR code';
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

  Future<void> _onNfc() async {
    final reader = ref.read(nfcReaderProvider);
    if (!await reader.isAvailable()) {
      setState(() => _status = 'NFC unavailable — use QR or manual');
      return;
    }
    setState(() {
      _busy = true;
      _status = 'Hold the card to the device…';
    });
    final result = await reader.readOnce();
    if (!result.hasData) {
      setState(() {
        _busy = false;
        _status = result.error ?? 'Could not read tag — try QR or manual';
      });
      return;
    }
    // Prefer NDEF worker code; fall back to UID.
    if (result.ndefText != null && result.ndefText!.isNotEmpty) {
      await _handleTap(TapSource.nfcNdef, result.ndefText!);
    } else if (result.uid != null) {
      await _handleTap(TapSource.nfcUid, result.uid!);
    }
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

  Future<void> _onQr() async {
    final code = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const QrScanScreen()),
    );
    if (code == null || !mounted) return;
    // QR badges are "CLAMS:<EMP-ID>"; accept a bare code too.
    final value = code.startsWith('CLAMS:') ? code.substring(6) : code;
    await _handleTap(TapSource.qr, value.trim());
  }

  Future<void> _handleTap(
    TapSource source,
    String identifier, {
    bool manualBackup = false,
    String? manualReason,
  }) async {
    if (_siteId == null) return;

    // A wrong phone clock would record punches at the wrong time — refuse the
    // scan while online with >10 min skew. (Offline punches are allowed.)
    if (await ref.read(clockGuardProvider).clockIsWrong()) {
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          icon: const Icon(Icons.schedule, color: Colors.red, size: 40),
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
      return;
    }

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
      case TapAction.login:
      case TapAction.logout:
        final verb = outcome.action == TapAction.login ? 'LOGIN' : 'LOGOUT';
        setState(() => _status = outcome.worker == null
            ? (outcome.message ?? 'Recorded')
            : '$verb recorded: ${outcome.worker!.fullName}');
        if (outcome.worker != null) {
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
                  avatar: Icon(n == 0 ? Icons.cloud_done : Icons.cloud_upload, size: 18),
                  label: Text(n == 0 ? 'Synced' : '$n to sync'),
                  backgroundColor: n == 0 ? Colors.green.shade100 : Colors.orange.shade100,
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
              Card(
                color: Colors.orange.shade50,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(Icons.warning_amber, color: Colors.orange.shade800),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              _deviceState == DeviceState.pending
                                  ? 'Device awaiting authorization'
                                  : 'Could not reach server',
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      if (_deviceState == DeviceState.pending && _deviceId != null)
                        Text('Ask an admin to authorize this device in Admin → Devices, '
                            'then tap Retry.\nDevice ID: $_deviceId'),
                      const SizedBox(height: 8),
                      Align(
                        alignment: Alignment.centerRight,
                        child: TextButton(onPressed: _ensureDevice, child: const Text('Retry')),
                      ),
                    ],
                  ),
                ),
              ),
            const SizedBox(height: 12),
            Icon(Icons.contactless, size: 96, color: Theme.of(context).colorScheme.primary),
            const SizedBox(height: 24),
            Text(_status, textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 32),
            if (_nfcAvailable) ...[
              FilledButton.icon(
                onPressed: _busy ? null : _onNfc,
                icon: const Icon(Icons.nfc),
                label: const Text('Tap NFC card'),
              ),
              const SizedBox(height: 12),
            ],
            // QR is the primary action when there is no NFC.
            _nfcAvailable
                ? OutlinedButton.icon(
                    onPressed: _busy ? null : _onQr,
                    icon: const Icon(Icons.qr_code_scanner),
                    label: const Text('Scan QR code'),
                  )
                : FilledButton.icon(
                    onPressed: _busy ? null : _onQr,
                    icon: const Icon(Icons.qr_code_scanner),
                    label: const Text('Scan QR code'),
                  ),
            const SizedBox(height: 12),
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
