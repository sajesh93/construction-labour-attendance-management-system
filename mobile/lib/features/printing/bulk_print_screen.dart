import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/providers.dart';
import 'badge_printer.dart';
import 'print_cards.dart';

/// "Print today's badges": every worker/staff/visitor the signed-in safety
/// officer created or updated today, with select/deselect before printing.
class BulkPrintScreen extends ConsumerStatefulWidget {
  const BulkPrintScreen({super.key});

  @override
  ConsumerState<BulkPrintScreen> createState() => _BulkPrintScreenState();
}

class _BulkPrintScreenState extends ConsumerState<BulkPrintScreen> {
  List<Map<String, dynamic>> _rows = [];
  final Set<String> _selected = {};
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    Future.microtask(_load);
  }

  Future<void> _load() async {
    try {
      final dio = ref.read(apiClientProvider).dio;
      final res = await dio.get('/workers/my-recent');
      final rows = (res.data['data'] as List).cast<Map<String, dynamic>>();
      if (!mounted) return;
      setState(() {
        _rows = rows;
        _selected
          ..clear()
          ..addAll(rows.map((r) => r['id'] as String));
        _loading = false;
      });
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message ?? 'Could not load today\'s entries';
        _loading = false;
      });
    }
  }

  Future<void> _print() async {
    final picked = _rows.where((r) => _selected.contains(r['id'])).toList();
    if (picked.isEmpty) return;
    await printWorkerCards(context, ref, [
      for (final r in picked)
        BadgeData(
          fullName: r['fullName'] as String? ?? '',
          workerCode: r['workerCode'] as String? ?? '',
          designation: r['designationName'] as String?,
          vendor: r['vendorName'] as String?,
          siteName: r['siteName'] as String?,
          bloodGroup: r['bloodGroup'] as String?,
          emergencyName: r['emergencyContactName'] as String?,
          emergencyNumber: r['emergencyContactNumber'] as String?,
          photoUrl: r['photoUrl'] as String?,
        ),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("Print today's badges"),
        actions: [
          IconButton(tooltip: 'Reload', icon: const Icon(Icons.refresh), onPressed: _load),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : _rows.isEmpty
                  ? const Center(
                      child: Padding(
                        padding: EdgeInsets.all(32),
                        child: Text(
                          'No entries added or updated by you today.\n'
                          'Workers you register will show up here for bulk printing.',
                          textAlign: TextAlign.center,
                        ),
                      ),
                    )
                  : ListView.separated(
                      itemCount: _rows.length,
                      separatorBuilder: (_, __) => const Divider(height: 1),
                      itemBuilder: (_, i) {
                        final r = _rows[i];
                        final id = r['id'] as String;
                        return CheckboxListTile(
                          value: _selected.contains(id),
                          tileColor: ClamsColors.surface,
                          activeColor: ClamsColors.primary,
                          onChanged: (v) => setState(() {
                            if (v == true) {
                              _selected.add(id);
                            } else {
                              _selected.remove(id);
                            }
                          }),
                          title: Text(r['fullName'] as String? ?? '',
                              style: const TextStyle(fontWeight: FontWeight.w500)),
                          subtitle: Text(
                            [
                              r['workerCode'],
                              r['designationName'],
                              r['category'],
                            ].whereType<String>().join(' · '),
                            style:
                                const TextStyle(color: ClamsColors.textSecondary),
                          ),
                        );
                      },
                    ),
      bottomNavigationBar: _rows.isEmpty
          ? null
          : Container(
              decoration: const BoxDecoration(
                color: ClamsColors.surface,
                border: Border(top: BorderSide(color: ClamsColors.border)),
              ),
              child: SafeArea(
                child: Padding(
                  padding: const EdgeInsets.all(ClamsSpacing.md),
                  child: FilledButton.icon(
                    onPressed: _selected.isEmpty ? null : _print,
                    icon: const Icon(Icons.print),
                    label: Text('Print ${_selected.length} badge(s)'),
                  ),
                ),
              ),
            ),
    );
  }
}
