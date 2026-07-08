import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/theme.dart';
import '../../core/providers.dart';
import '../attendance/attendance_providers.dart';
import '../attendance/domain/models.dart';
import '../auth/auth_controller.dart';

/// Watchman selects the active site. Worker cards for that site are cached
/// locally so the attendance flow works fully offline afterwards.
class SiteSelectionScreen extends ConsumerStatefulWidget {
  const SiteSelectionScreen({super.key});

  @override
  ConsumerState<SiteSelectionScreen> createState() => _SiteSelectionScreenState();
}

class _SiteSelectionScreenState extends ConsumerState<SiteSelectionScreen> {
  List<Map<String, dynamic>> _sites = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final dio = ref.read(apiClientProvider).dio;
      final res = await dio.get('/sites', queryParameters: {'active': 'true'});
      if (!mounted) return;
      setState(() {
        _sites = (res.data as List).cast<Map<String, dynamic>>();
        _error = null;
        _loading = false;
      });
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message ?? 'Could not load sites';
        _loading = false;
      });
    }
  }

  Future<void> _select(Map<String, dynamic> site) async {
    final db = ref.read(localDbProvider);
    final dio = ref.read(apiClientProvider).dio;
    final siteId = site['id'] as String;

    await db.setMeta('active_site', siteId);
    await db.setMeta('active_site_name', site['name'] as String);
    ref.read(activeSiteProvider.notifier).state = siteId;

    // Warm the offline worker cache for this site (watchman-accessible endpoint).
    try {
      final res = await dio.get('/workers/by-site', queryParameters: {'siteId': siteId});
      final data = (res.data['data'] as List).cast<Map<String, dynamic>>();
      await db.replaceWorkers(data.map(WorkerCard.fromMap).toList());
    } catch (_) {
      // Offline or empty — proceed; sync will refresh later.
    }

    if (!mounted) return;
    final role = ref.read(authControllerProvider).role;
    context.go(role == 'SUPERVISOR' ? '/supervisor' : '/attendance');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Select site'),
        actions: [
          IconButton(
            tooltip: 'Refresh sites',
            icon: const Icon(Icons.refresh),
            onPressed: _load,
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: _error != null
                  ? ListView(children: [
                      Padding(
                        padding: const EdgeInsets.all(32),
                        child: Center(child: Text(_error!)),
                      ),
                    ])
                  : ListView.separated(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.all(ClamsSpacing.lg),
                      itemCount: _sites.length,
                      separatorBuilder: (_, __) => ClamsSpacing.gapSm,
                      itemBuilder: (_, i) {
                        final s = _sites[i];
                        return Card(
                          child: ListTile(
                            leading: const Icon(Icons.location_city,
                                color: ClamsColors.primary),
                            title: Text(
                              s['name'] as String,
                              style: const TextStyle(fontWeight: FontWeight.w500),
                            ),
                            subtitle: Text(
                              s['code'] as String,
                              style:
                                  const TextStyle(color: ClamsColors.textSecondary),
                            ),
                            trailing: const Icon(Icons.chevron_right,
                                color: ClamsColors.textSecondary),
                            onTap: () => _select(s),
                          ),
                        );
                      },
                    ),
            ),
    );
  }
}
