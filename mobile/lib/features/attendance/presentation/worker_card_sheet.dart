import 'package:flutter/material.dart';

import '../domain/models.dart';

/// Shows the worker card after a tap. Emergency info (blood group + contact) is
/// always visible here regardless of permissions (Emergency Mode).
class WorkerCardSheet extends StatelessWidget {
  const WorkerCardSheet({super.key, required this.worker, required this.action});
  final WorkerCard worker;
  final String action;

  @override
  Widget build(BuildContext context) {
    final color = action == 'LOGIN' ? Colors.green : Colors.blueGrey;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 36,
                  backgroundImage:
                      worker.photoUrl != null ? NetworkImage(worker.photoUrl!) : null,
                  child: worker.photoUrl == null ? const Icon(Icons.person, size: 36) : null,
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(worker.fullName,
                          style: Theme.of(context).textTheme.titleLarge),
                      Text(worker.workerCode,
                          style: Theme.of(context).textTheme.bodyMedium),
                    ],
                  ),
                ),
                Chip(label: Text(action), backgroundColor: color.withValues(alpha: 0.15)),
              ],
            ),
            const SizedBox(height: 20),
            _EmergencyBlock(worker: worker),
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

class _EmergencyBlock extends StatelessWidget {
  const _EmergencyBlock({required this.worker});
  final WorkerCard worker;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: Colors.red.shade50,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.medical_services, color: Colors.red.shade700),
                const SizedBox(width: 8),
                Text('Emergency', style: Theme.of(context).textTheme.titleMedium),
              ],
            ),
            const SizedBox(height: 8),
            Text('Blood group: ${worker.bloodGroup ?? '—'}'),
            Text('Contact: ${worker.emergencyContactName ?? '—'}'),
            Text('Phone: ${worker.emergencyContactNumber ?? '—'}'),
          ],
        ),
      ),
    );
  }
}
