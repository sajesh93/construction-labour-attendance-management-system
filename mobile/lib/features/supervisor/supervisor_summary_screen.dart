import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/providers.dart';
import '../../core/widgets/section_header.dart';
import '../attendance/domain/models.dart';
import 'correction_request_screen.dart';

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
      appBar: AppBar(
        title: Text(widget.worker.fullName),
        actions: [
          IconButton(
            tooltip: 'Request correction',
            icon: const Icon(Icons.edit_calendar),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => CorrectionRequestScreen(worker: widget.worker),
              ),
            ),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : ListView(
                  padding: const EdgeInsets.all(ClamsSpacing.lg),
                  children: [
                    Text('${widget.worker.workerCode} · $_month',
                        style: Theme.of(context)
                            .textTheme
                            .bodyMedium
                            ?.copyWith(color: ClamsColors.textSecondary)),
                    ClamsSpacing.gapMd,
                    Wrap(
                      spacing: ClamsSpacing.md,
                      runSpacing: ClamsSpacing.md,
                      children: [
                        _kpi('Total hours', _h(_data?['totalMonthlyMinutes'] as num?)),
                        _kpi('Overtime hours', _h(_data?['overtimeMinutes'] as num?)),
                        _kpi('Absent days', '${_data?['absentDays'] ?? 0}'),
                        _kpi('Late arrivals', '${_data?['lateArrivals'] ?? 0}'),
                      ],
                    ),
                    ClamsSpacing.gapXl,
                    const SectionHeader('Daily records'),
                    ClamsSpacing.gapSm,
                    if (daily.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: ClamsSpacing.lg),
                        child: Text('No attendance recorded this month.',
                            style: TextStyle(color: ClamsColors.textSecondary)),
                      ),
                    ...daily.map((d) => Padding(
                          padding: const EdgeInsets.only(bottom: ClamsSpacing.sm),
                          child: Card(
                            child: ListTile(
                              title: Text(d['date'] as String? ?? '',
                                  style:
                                      const TextStyle(fontWeight: FontWeight.w500)),
                              subtitle: Text(
                                'In: ${_fmt(d['loginAt'])}   Out: ${_fmt(d['logoutAt'])}   '
                                '${_h(d['workedMinutes'] as num?)}h'
                                '${(d['overtimeMinutes'] ?? 0) != 0 ? '  +${_h(d['overtimeMinutes'] as num?)}h OT' : ''}',
                                style: const TextStyle(
                                    color: ClamsColors.textSecondary),
                              ),
                              trailing: (d['late'] == true)
                                  ? Chip(
                                      label: const Text('Late'),
                                      backgroundColor: ClamsColors.warningTint,
                                      side: BorderSide.none,
                                      labelStyle: const TextStyle(
                                        color: ClamsColors.warning,
                                        fontSize: 12,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    )
                                  : null,
                            ),
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
                Text(
                  label.toUpperCase(),
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.8,
                    color: ClamsColors.textSecondary,
                  ),
                ),
                const SizedBox(height: 6),
                Text(value,
                    style: Theme.of(context)
                        .textTheme
                        .headlineSmall
                        ?.copyWith(fontWeight: FontWeight.w600)),
              ],
            ),
          ),
        ),
      );
}
