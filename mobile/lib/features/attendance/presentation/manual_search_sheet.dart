import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../attendance_providers.dart';
import '../domain/models.dart';

/// Manual backup search (lost card): search cached workers by name/code,
/// returns the selected worker. A reason is collected by the caller.
class ManualSearchSheet extends ConsumerStatefulWidget {
  const ManualSearchSheet({super.key});

  @override
  ConsumerState<ManualSearchSheet> createState() => _ManualSearchSheetState();
}

class _ManualSearchSheetState extends ConsumerState<ManualSearchSheet> {
  List<WorkerCard> _results = [];

  Future<void> _search(String q) async {
    if (q.length < 2) {
      setState(() => _results = []);
      return;
    }
    final results = await ref.read(attendanceRepositoryProvider).search(q);
    setState(() => _results = results);
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
        left: 16,
        right: 16,
        top: 16,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            autofocus: true,
            decoration: const InputDecoration(
              labelText: 'Search name or worker code',
              prefixIcon: Icon(Icons.search),
            ),
            onChanged: _search,
          ),
          const SizedBox(height: 8),
          SizedBox(
            height: 320,
            child: ListView.builder(
              itemCount: _results.length,
              itemBuilder: (_, i) {
                final w = _results[i];
                return ListTile(
                  leading: const Icon(Icons.person),
                  title: Text(w.fullName),
                  subtitle: Text(w.workerCode),
                  onTap: () => Navigator.pop(context, w),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
