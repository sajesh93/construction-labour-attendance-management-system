import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_ringtone_player/flutter_ringtone_player.dart';

import '../../core/providers.dart';

/// Polls /notifications while the app is open and surfaces alerts:
///  • SOS → blocking red dialog with a LOOPING alarm sound until "OK" is
///    pressed. Each notification id is remembered in local storage, so an
///    acknowledged alert never pops again — not even after app restart.
///  • Notifications already acknowledged in the admin panel are skipped.
///  • FORGOT_LOGOUT → orange snackbar (shown once per id).
/// (Polling-only by design — no Firebase in this deployment.)
class NotificationWatcher extends ConsumerStatefulWidget {
  const NotificationWatcher({super.key, required this.child});
  final Widget child;

  @override
  ConsumerState<NotificationWatcher> createState() => _NotificationWatcherState();
}

class _NotificationWatcherState extends ConsumerState<NotificationWatcher> {
  static const _seenKey = 'notif_seen_ids';
  static const _maxRemembered = 200;

  Timer? _timer;
  DateTime _since = DateTime.now().toUtc().subtract(const Duration(hours: 12));
  final Set<String> _seen = {};
  bool _seenLoaded = false;
  bool _alertShowing = false;
  final _ringtone = FlutterRingtonePlayer();

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => _poll());
    Future.microtask(() async {
      await _loadSeen();
      await _poll();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    unawaited(_ringtone.stop());
    super.dispose();
  }

  Future<void> _loadSeen() async {
    try {
      final raw = await ref.read(localDbProvider).getMeta(_seenKey);
      if (raw != null) {
        _seen.addAll((jsonDecode(raw) as List).cast<String>());
      }
    } catch (_) {}
    _seenLoaded = true;
  }

  Future<void> _persistSeen() async {
    try {
      final list = _seen.toList();
      final trimmed = list.length > _maxRemembered
          ? list.sublist(list.length - _maxRemembered)
          : list;
      await ref.read(localDbProvider).setMeta(_seenKey, jsonEncode(trimmed));
    } catch (_) {}
  }

  Future<void> _poll() async {
    if (!_seenLoaded || _alertShowing) return;
    try {
      final dio = ref.read(apiClientProvider).dio;
      final res = await dio.get('/notifications', queryParameters: {
        'since': _since.toIso8601String(),
      });
      final items = (res.data as List).cast<Map<String, dynamic>>();
      if (!mounted) return;
      for (final n in items.reversed) {
        final id = n['id'] as String;
        final created = DateTime.tryParse(n['createdAt'] as String? ?? '');
        if (created != null && created.isAfter(_since)) _since = created;
        if (_seen.contains(id)) continue;

        // Someone already acknowledged it (e.g. in the admin panel) — skip.
        if (n['readAt'] != null) {
          _seen.add(id);
          continue;
        }

        _seen.add(id);
        final type = n['type'] as String?;
        if (type == 'SOS') {
          await _showSosAlert(n);
        } else if (type == 'FORGOT_LOGOUT' && mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              backgroundColor: Colors.orange.shade800,
              duration: const Duration(seconds: 8),
              content: Text('${n['title']}\n${n['body']}'),
            ),
          );
        }
      }
      await _persistSeen();
    } catch (_) {
      // Offline — try again on the next tick.
    }
  }

  Future<void> _showSosAlert(Map<String, dynamic> n) async {
    if (!mounted) return;
    _alertShowing = true;
    // Loop the system alarm until the user explicitly acknowledges.
    unawaited(_ringtone.playAlarm(looping: true, volume: 1.0, asAlarm: true));
    try {
      await showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (ctx) => PopScope(
          canPop: false,
          child: AlertDialog(
            backgroundColor: Colors.red.shade50,
            icon: const Icon(Icons.sos, color: Colors.red, size: 48),
            title: Text(n['title'] as String? ?? 'SOS'),
            content: Text(n['body'] as String? ?? ''),
            actions: [
              FilledButton(
                style: FilledButton.styleFrom(backgroundColor: Colors.red),
                onPressed: () => Navigator.pop(ctx),
                child: const Text('OK — responding'),
              ),
            ],
          ),
        ),
      );
    } finally {
      unawaited(_ringtone.stop());
      _alertShowing = false;
      await _persistSeen();
    }
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
