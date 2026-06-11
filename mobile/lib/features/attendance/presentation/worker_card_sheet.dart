import 'package:flutter/material.dart';

import '../../../core/widgets/api_image.dart';
import '../domain/models.dart';

/// Shows the person card after a tap: photo, name, vendor and designation.
class WorkerCardSheet extends StatelessWidget {
  const WorkerCardSheet({super.key, required this.worker, required this.action});
  final WorkerCard worker;
  final String action;

  @override
  Widget build(BuildContext context) {
    final color = action == 'LOGIN' ? Colors.green : Colors.blueGrey;
    final category = worker.category;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                ApiCircleAvatar(photoUrl: worker.photoUrl, radius: 36),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(worker.fullName,
                          style: Theme.of(context).textTheme.titleLarge),
                      Text(worker.workerCode,
                          style: Theme.of(context).textTheme.bodyMedium),
                      if (category != null && category != 'WORKER')
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Chip(
                            label: Text(category),
                            visualDensity: VisualDensity.compact,
                            backgroundColor: Colors.indigo.withValues(alpha: 0.12),
                          ),
                        ),
                    ],
                  ),
                ),
                Chip(label: Text(action), backgroundColor: color.withValues(alpha: 0.15)),
              ],
            ),
            const SizedBox(height: 20),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _InfoRow(
                      icon: Icons.engineering,
                      label: 'Designation',
                      value: worker.designationName,
                    ),
                    const SizedBox(height: 8),
                    _InfoRow(
                      icon: Icons.business,
                      label: 'Vendor',
                      value: worker.vendorName,
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Done'),
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.label, required this.value});
  final IconData icon;
  final String label;
  final String? value;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 20, color: Theme.of(context).colorScheme.primary),
        const SizedBox(width: 10),
        Text('$label: ', style: Theme.of(context).textTheme.bodyMedium),
        Expanded(
          child: Text(
            value ?? '—',
            style: Theme.of(context)
                .textTheme
                .bodyMedium
                ?.copyWith(fontWeight: FontWeight.w600),
          ),
        ),
      ],
    );
  }
}
