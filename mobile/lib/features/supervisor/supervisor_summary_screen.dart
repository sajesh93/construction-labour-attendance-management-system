import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../attendance/domain/models.dart';

/// Monthly attendance summary for one worker (supervisor read-only view).
class SupervisorSummaryScreen extends ConsumerStatefulWidget {
  const SupervisorSummaryScreen({super.key, required this.worker});
  final WorkerCard worker;

  @override
  ConsumerState<SupervisorSummaryScreen> createState() => _SupervisorSummaryScreenState();
}

class _SupervisorSummaryScreenState extends ConsumerState<SupervisorSummaryScreen> {
  Map<String, dynamic>? _data;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    Future.microtask(_load);
  }

  String get _month {
    final now = DateTime.now();
    return '${now.year}-${now.month.toString().padLeft(2, '0')}';
  }

  Future<void> _load() async {
    try {
      final dio = ref.read(apiClientProvider).dio;
      final res = await dio.get(
        '/attendance/worker/${widget.worker.id}/summary',
        queryParameters: {'month': _month},
      );
      if (!mounted) return;
      setState(() {
        _data = (res.data as Map).cast<String, dynamic>();
        _loading = false;
      });
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message ?? 'Could not load summary';
        _loading = false;
      });
    }
  }

  String _h(num? minutes) => ((minutes ?? 0) / 60).toStringAsFixed(1);

  @override
  Widget build(BuildContext context) {
    final daily = (_data?['daily'] as List?)?.cast<Map<String, dynamic>>() ?? [];
    return Scaffold(
      appBar: AppBar(title: Text(widget.worker.fullName)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Text('${widget.worker.workerCode} · $_month',
                        style: Theme.of(context).textTheme.bodyMedium),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 12,
                      runSpacing: 12,
                      children: [
                        _kpi('Total hours', _h(_data?['totalMonthlyMinutes'] as num?)),
                        _kpi('Overtime hours', _h(_data?['overtimeMinutes'] as num?)),
                        _kpi('Absent days', '${_data?['absentDays'] ?? 0}'),
                        _kpi('Late arrivals', '${_data?['lateArrivals'] ?? 0}'),
                      ],
                    ),
                    const SizedBox(height: 20),
                    Text('Daily records', style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 8),
                    if (daily.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 16),
                        child: Text('No attendance recorded this month.'),
                      ),
                    ...daily.map((d) => Card(
                          child: ListTile(
                            title: Text(d['date'] as String? ?? ''),
                            subtitle: Text(
                              'In: ${_fmt(d['loginAt'])}   Out: ${_fmt(d['logoutAt'])}   '
                              '${_h(d['workedMinutes'] as num?)}h'
                              '${(d['overtimeMinutes'] ?? 0) != 0 ? '  +${_h(d['overtimeMinutes'] as num?)}h OT' : ''}',
                            ),
                            trailing: (d['late'] == true)
                                ? const Chip(label: Text('Late'))
                                : null,
                          ),
                        )),
                  ],
                ),
    );
  }

  String _fmt(dynamic iso) {
    if (iso == null) return '—';
    final dt = DateTime.tryParse(iso as String)?.toLocal();
    if (dt == null) return '—';
    return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }

  Widget _kpi(String label, String value) => SizedBox(
        width: 150,
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: Theme.of(context).textTheme.bodySmall),
                const SizedBox(height: 6),
                Text(value, style: Theme.of(context).textTheme.headlineSmall),
              ],
            ),
          ),
        ),
      );
}
