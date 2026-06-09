import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/providers.dart';
import '../attendance/attendance_providers.dart';
import '../attendance/domain/models.dart';

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
      setState(() {
        _sites = (res.data as List).cast<Map<String, dynamic>>();
        _loading = false;
      });
    } on DioException catch (e) {
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

    // Warm the offline worker cache for this site.
    try {
      final res = await dio.get('/workers', queryParameters: {'siteId': siteId, 'limit': '500'});
      final data = (res.data['data'] as List).cast<Map<String, dynamic>>();
      await db.cacheWorkers(data.map(WorkerCard.fromMap).toList());
    } catch (_) {
      // Offline or empty — proceed; sync will refresh later.
    }

    if (mounted) context.go('/attendance');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Select site')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : ListView.separated(
                  itemCount: _sites.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (_, i) {
                    final s = _sites[i];
                    return ListTile(
                      leading: const Icon(Icons.location_city),
                      title: Text(s['name'] as String),
                      subtitle: Text(s['code'] as String),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => _select(s),
                    );
                  },
                ),
    );
  }
}
