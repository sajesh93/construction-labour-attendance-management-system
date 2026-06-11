import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'sos_service.dart';

/// Red SOS trigger. [compact] renders an AppBar icon; otherwise a full-width
/// button (login screen). Always asks for confirmation before sending.
class SosButton extends ConsumerWidget {
  const SosButton({super.key, this.compact = false});
  final bool compact;

  Future<void> _confirmAndSend(BuildContext context, WidgetRef ref) async {
    final messageController = TextEditingController();
    final send = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: const Icon(Icons.sos, color: Colors.red, size: 40),
        title: const Text('Send SOS alert?'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'All safety officers and admins will be alerted immediately, '
              'including your location.',
            ),
            const SizedBox(height: 12),
            TextField(
              controller: messageController,
              decoration: const InputDecoration(
                labelText: 'Message (optional)',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('SEND SOS'),
          ),
        ],
      ),
    );
    if (send != true || !context.mounted) return;

    final messenger = ScaffoldMessenger.of(context);
    messenger.showSnackBar(const SnackBar(content: Text('Sending SOS…')));
    final ok = await ref.read(sosServiceProvider).trigger(message: messageController.text.trim());
    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(
      SnackBar(
        backgroundColor: ok ? Colors.green.shade700 : Colors.red.shade700,
        content: Text(
          ok
              ? 'SOS sent — safety officers and admins have been alerted.'
              : 'SOS could not be sent (no network). Try again or call directly.',
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (compact) {
      return IconButton(
        tooltip: 'SOS — emergency alert',
        icon: const Icon(Icons.sos, color: Colors.red),
        onPressed: () => _confirmAndSend(context, ref),
      );
    }
    return OutlinedButton.icon(
      style: OutlinedButton.styleFrom(
        foregroundColor: Colors.red,
        side: const BorderSide(color: Colors.red, width: 2),
        padding: const EdgeInsets.symmetric(vertical: 14),
      ),
      onPressed: () => _confirmAndSend(context, ref),
      icon: const Icon(Icons.sos),
      label: const Text('EMERGENCY SOS'),
    );
  }
}
