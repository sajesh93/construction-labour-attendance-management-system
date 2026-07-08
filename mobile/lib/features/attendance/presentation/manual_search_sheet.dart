import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme.dart';
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
  Timer? _debounce;
  bool _searching = false;

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  void _onChanged(String q) {
    _debounce?.cancel();
    if (q.trim().length < 2) {
      setState(() => _results = []);
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 300), () => _runSearch(q.trim()));
  }

  Future<void> _runSearch(String q) async {
    setState(() => _searching = true);
    final results = await ref.read(attendanceRepositoryProvider).search(q);
    if (!mounted) return;
    setState(() {
      _results = results;
      _searching = false;
    });
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
            decoration: InputDecoration(
              labelText: 'Search name or worker code',
              prefixIcon: const Icon(Icons.search),
              suffixIcon: _searching
                  ? const Padding(
                      padding: EdgeInsets.all(12),
                      child: SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    )
                  : null,
            ),
            onChanged: _onChanged,
          ),
          ClamsSpacing.gapSm,
          SizedBox(
            height: 320,
            child: _results.isEmpty
                ? Center(
                    child: Text(
                      _searching ? 'Searching…' : 'Type a name or ID to search',
                      style: const TextStyle(color: ClamsColors.textSecondary),
                    ),
                  )
                : ListView.builder(
                    itemCount: _results.length,
                    itemBuilder: (_, i) {
                      final w = _results[i];
                      final subtitle = [w.workerCode, if (w.category == 'STAFF') 'Staff', if (w.category == 'VISITOR') 'Visitor']
                          .join(' · ');
                      return ListTile(
                        leading: const Icon(Icons.person),
                        title: Text(w.fullName,
                            style: const TextStyle(fontWeight: FontWeight.w500)),
                        subtitle: Text(subtitle,
                            style: const TextStyle(color: ClamsColors.textSecondary)),
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
