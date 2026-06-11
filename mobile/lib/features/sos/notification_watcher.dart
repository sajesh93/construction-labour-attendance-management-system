import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

/// Polls /notifications while the app is open and surfaces alerts:
/// SOS → blocking red dialog; FORGOT_LOGOUT → orange snackbar.
/// (Polling-only by design — no Firebase in this deployment.)
class NotificationWatcher extends ConsumerStatefulWidget {
  const NotificationWatcher({super.key, required this.child});
  final Widget child;

  @override
  ConsumerState<NotificationWatcher> createState() => _NotificationWatcherState();
}

class _NotificationWatcherState extends ConsumerState<NotificationWatcher> {
  Timer? _timer;
  DateTime _since = DateTime.now().toUtc().subtract(const Duration(minutes: 5));
  final Set<String> _seen = {};

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => _poll());
    Future.microtask(_poll);
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _poll() async {
    try {
      final dio = ref.read(apiClientProvider).dio;
      final res = await dio.get('/notifications', queryParameters: {
        'since': _since.toIso8601String(),
      });
      final items = (res.data as List).cast<Map<String, dynamic>>();
      if (!mounted) return;
      for (final n in items.reversed) {
        final id = n['id'] as String;
        if (_seen.contains(id)) continue;
        _seen.add(id);
        final created = DateTime.tryParse(n['createdAt'] as String? ?? '');
        if (created != null && created.isAfter(_since)) _since = created;
        final type = n['type'] as String?;
        if (type == 'SOS') {
          _showSosAlert(n);
        } else if (type == 'FORGOT_LOGOUT') {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              backgroundColor: Colors.orange.shade800,
              duration: const Duration(seconds: 8),
              content: Text('${n['title']}\n${n['body']}'),
            ),
          );
        }
      }
    } catch (_) {
      // Offline — try again on the next tick.
    }
  }

  void _showSosAlert(Map<String, dynamic> n) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
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
    );
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
