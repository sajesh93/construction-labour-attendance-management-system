import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/providers.dart';
import '../attendance/domain/models.dart';
import '../auth/auth_controller.dart';
import 'supervisor_summary_screen.dart';

/// Supervisor view: pick a worker at the active site to see their monthly
/// attendance summary (hours, overtime, absences, late arrivals, daily log).
class SupervisorHomeScreen extends ConsumerStatefulWidget {
  const SupervisorHomeScreen({super.key});

  @override
  ConsumerState<SupervisorHomeScreen> createState() => _SupervisorHomeScreenState();
}

class _SupervisorHomeScreenState extends ConsumerState<SupervisorHomeScreen> {
  String _siteName = '';
  String? _siteId;
  List<WorkerCard> _workers = [];
  bool _loading = true;
  String? _error;
  String _q = '';

  @override
  void initState() {
    super.initState();
    Future.microtask(_load);
  }

  Future<void> _load() async {
    final db = ref.read(localDbProvider);
    _siteId = await db.getMeta('active_site');
    _siteName = await db.getMeta('active_site_name') ?? '';
    try {
      final dio = ref.read(apiClientProvider).dio;
      final res = await dio.get('/workers/by-site', queryParameters: {'siteId': _siteId});
      final data = (res.data['data'] as List).cast<Map<String, dynamic>>();
      if (!mounted) return;
      setState(() {
        _workers = data.map(WorkerCard.fromMap).toList();
        _loading = false;
      });
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message ?? 'Could not load workers';
        _loading = false;
      });
    }
  }

  void _openSummary(WorkerCard w) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => SupervisorSummaryScreen(worker: w)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _q.isEmpty
        ? _workers
        : _workers
            .where((w) =>
                w.fullName.toLowerCase().contains(_q.toLowerCase()) ||
                w.workerCode.toLowerCase().contains(_q.toLowerCase()))
            .toList();

    return Scaffold(
      appBar: AppBar(
        title: Text(_siteName.isEmpty ? 'Supervisor' : 'Supervisor · $_siteName'),
        actions: [
          IconButton(
            tooltip: 'Change site',
            icon: const Icon(Icons.location_city),
            onPressed: () => context.go('/site'),
          ),
          IconButton(
            tooltip: 'Logout',
            icon: const Icon(Icons.logout),
            onPressed: () => ref.read(authControllerProvider.notifier).logout(),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.all(12),
                      child: TextField(
                        decoration: const InputDecoration(
                          labelText: 'Search worker',
                          prefixIcon: Icon(Icons.search),
                          border: OutlineInputBorder(),
                        ),
                        onChanged: (v) => setState(() => _q = v),
                      ),
                    ),
                    Expanded(
                      child: ListView.separated(
                        itemCount: filtered.length,
                        separatorBuilder: (_, __) => const Divider(height: 1),
                        itemBuilder: (_, i) {
                          final w = filtered[i];
                          return ListTile(
                            leading: CircleAvatar(
                              backgroundImage:
                                  w.photoUrl != null ? NetworkImage(w.photoUrl!) : null,
                              child: w.photoUrl == null ? const Icon(Icons.person) : null,
                            ),
                            title: Text(w.fullName),
                            subtitle: Text(w.workerCode),
                            trailing: const Icon(Icons.chevron_right),
                            onTap: () => _openSummary(w),
                          );
                        },
                      ),
                    ),
                  ],
                ),
    );
  }
}
