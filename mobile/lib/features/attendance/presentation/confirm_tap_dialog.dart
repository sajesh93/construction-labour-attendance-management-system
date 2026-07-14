import 'package:flutter/material.dart';

import '../../../app/theme.dart';
import '../../../core/widgets/api_image.dart';
import '../domain/models.dart';
import '../domain/tap_decision.dart';

/// Asks the operator to confirm a scan before anything is recorded: shows who
/// was scanned and whether the tap will be a LOGIN or a LOGOUT.
///
/// Pops `true` for OK (record it) and `false`/null for Cancel (record nothing).
/// [worker] is null when the badge isn't in the offline cache and the device is
/// offline — the punch is still worth recording, so we confirm on the raw code.
class ConfirmTapDialog extends StatelessWidget {
  const ConfirmTapDialog({
    super.key,
    required this.action,
    required this.identifier,
    this.worker,
  });

  final TapAction action;
  final String identifier;
  final WorkerCard? worker;

  bool get _isLogin => action == TapAction.login;

  @override
  Widget build(BuildContext context) {
    final color = _isLogin ? ClamsColors.success : ClamsColors.info;
    final verb = _isLogin ? 'LOGIN' : 'LOGOUT';
    final w = worker;

    return AlertDialog(
      title: Text(_isLogin ? 'Record login?' : 'Record logout?'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (w != null)
            Row(
              children: [
                ApiCircleAvatar(photoUrl: w.photoUrl, radius: 28),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        w.fullName,
                        style: Theme.of(context)
                            .textTheme
                            .titleMedium
                            ?.copyWith(fontWeight: FontWeight.w600),
                      ),
                      Text(
                        w.workerCode,
                        style: Theme.of(context)
                            .textTheme
                            .bodySmall
                            ?.copyWith(color: ClamsColors.textSecondary),
                      ),
                    ],
                  ),
                ),
              ],
            )
          else
            Row(
              children: [
                const Icon(Icons.help_outline, color: ClamsColors.warning, size: 40),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        identifier,
                        style: Theme.of(context)
                            .textTheme
                            .titleMedium
                            ?.copyWith(fontWeight: FontWeight.w600),
                      ),
                      Text(
                        'Card not in this device\'s list — the name appears once it syncs.',
                        style: Theme.of(context)
                            .textTheme
                            .bodySmall
                            ?.copyWith(color: ClamsColors.textSecondary),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ClamsSpacing.gapMd,
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 12),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(_isLogin ? Icons.login : Icons.logout, color: color, size: 20),
                const SizedBox(width: 8),
                Text(
                  verb,
                  style: TextStyle(
                    color: color,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.5,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context, true),
          style: FilledButton.styleFrom(backgroundColor: color),
          child: const Text('OK'),
        ),
      ],
    );
  }
}
