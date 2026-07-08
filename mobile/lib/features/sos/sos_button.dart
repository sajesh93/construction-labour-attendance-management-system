import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
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
        icon: const Icon(Icons.sos, color: ClamsColors.error, size: 40),
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
            style: FilledButton.styleFrom(backgroundColor: ClamsColors.error),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('SEND SOS'),
          ),
        ],
      ),
    );
    if (send != true || !context.mounted) return;

    final messenger = ScaffoldMessenger.of(context);
    messenger.showSnackBar(const SnackBar(content: Text('Sending SOS…')));
    final result = await ref.read(sosServiceProvider).trigger(message: messageController.text.trim());
    messenger.hideCurrentSnackBar();
    final (color, text) = switch (result) {
      SosResult.sent => (
          ClamsColors.success,
          'SOS sent — safety officers and admins have been alerted.',
        ),
      SosResult.throttled => (
          ClamsColors.warning,
          'An SOS from this device just went out — responders are already alerted. '
              'You can resend in a few seconds.',
        ),
      SosResult.failed => (
          ClamsColors.error,
          'SOS could not be sent (no network). Try again or call directly.',
        ),
    };
    messenger.showSnackBar(SnackBar(backgroundColor: color, content: Text(text)));
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (compact) {
      return IconButton(
        tooltip: 'SOS — emergency alert',
        icon: const Icon(Icons.sos, color: ClamsColors.error),
        onPressed: () => _confirmAndSend(context, ref),
      );
    }
    return OutlinedButton.icon(
      style: OutlinedButton.styleFrom(
        foregroundColor: ClamsColors.error,
        side: const BorderSide(color: ClamsColors.error, width: 2),
        padding: const EdgeInsets.symmetric(vertical: 14),
      ),
      onPressed: () => _confirmAndSend(context, ref),
      icon: const Icon(Icons.sos),
      label: const Text('EMERGENCY SOS'),
    );
  }
}
