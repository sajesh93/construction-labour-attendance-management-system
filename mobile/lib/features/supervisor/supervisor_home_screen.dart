import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/providers.dart';
import '../../core/widgets/api_image.dart';
import '../aadhaar/aadhaar_verify_screen.dart';
import '../attendance/domain/models.dart';
import '../auth/auth_controller.dart';
import '../printing/badge_printer.dart';
import '../printing/bulk_print_screen.dart';
import '../printing/print_cards.dart';
import '../sos/notification_watcher.dart';
import '../sos/sos_button.dart';
import 'supervisor_summary_screen.dart';
import 'worker_edit_screen.dart';

/// Safety Officer view: manage workers at the active site — register new
/// workers/staff/visitors (with photo + QR badge), check monthly summaries,
/// print badges (single or bulk for today's entries) and verify Aadhaar QRs.
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
        _error = null;
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

  Future<void> _addWorker() async {
    final created = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const WorkerEditScreen()),
    );
    if (created == true) _load();
  }

  Future<void> _editWorker(WorkerCard w) async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => WorkerEditScreen(workerId: w.id)),
    );
    if (changed == true) _load();
  }

  Future<void> _printBadge(WorkerCard w) async {
    await printWorkerCards(context, ref, [
      BadgeData(
        fullName: w.fullName,
        workerCode: w.workerCode,
        designation: w.designationName,
        vendor: w.vendorName,
        siteName: _siteName.isEmpty ? null : _siteName,
        bloodGroup: w.bloodGroup,
        emergencyName: w.emergencyContactName,
        emergencyNumber: w.emergencyContactNumber,
        photoUrl: w.photoUrl,
      ),
    ]);
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
        title: Row(
          children: [
            const CompanyLogo(),
            Flexible(
              child: Text(
                _siteName.isEmpty ? 'Safety Officer' : 'Safety Officer · $_siteName',
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        actions: [
          const SosButton(compact: true),
          PopupMenuButton<String>(
            onSelected: (v) {
              switch (v) {
                case 'bulk-print':
                  Navigator.of(context)
                      .push(MaterialPageRoute(builder: (_) => const BulkPrintScreen()));
                  break;
                case 'aadhaar':
                  Navigator.of(context)
                      .push(MaterialPageRoute(builder: (_) => const AadhaarVerifyScreen()));
                  break;
                case 'site':
                  context.go('/site');
                  break;
                case 'logout':
                  ref.read(authControllerProvider.notifier).logout();
                  break;
              }
            },
            itemBuilder: (_) => const [
              PopupMenuItem(
                value: 'bulk-print',
                child: ListTile(
                  leading: Icon(Icons.print),
                  title: Text("Print today's badges"),
                ),
              ),
              PopupMenuItem(
                value: 'aadhaar',
                child: ListTile(
                  leading: Icon(Icons.verified_user),
                  title: Text('Verify Aadhaar QR'),
                ),
              ),
              PopupMenuItem(
                value: 'site',
                child: ListTile(
                  leading: Icon(Icons.location_city),
                  title: Text('Change site'),
                ),
              ),
              PopupMenuItem(
                value: 'logout',
                child: ListTile(leading: Icon(Icons.logout), title: Text('Logout')),
              ),
            ],
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _addWorker,
        icon: const Icon(Icons.person_add),
        label: const Text('Add worker'),
      ),
      body: NotificationWatcher(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? Center(child: Text(_error!))
                : RefreshIndicator(
                    onRefresh: _load,
                    child: Column(
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
                            physics: const AlwaysScrollableScrollPhysics(),
                            itemCount: filtered.length,
                            separatorBuilder: (_, __) => const Divider(height: 1),
                            itemBuilder: (_, i) {
                              final w = filtered[i];
                              return ListTile(
                                leading: ApiCircleAvatar(photoUrl: w.photoUrl),
                                title: Text(w.fullName),
                                subtitle: Text(
                                  [
                                    w.workerCode,
                                    if (w.designationName != null) w.designationName!,
                                    if (w.category != null && w.category != 'WORKER') w.category!,
                                  ].join(' · '),
                                ),
                                onTap: () => _openSummary(w),
                                trailing: PopupMenuButton<String>(
                                  onSelected: (v) {
                                    switch (v) {
                                      case 'summary':
                                        _openSummary(w);
                                        break;
                                      case 'edit':
                                        _editWorker(w);
                                        break;
                                      case 'print':
                                        _printBadge(w);
                                        break;
                                    }
                                  },
                                  itemBuilder: (_) => const [
                                    PopupMenuItem(
                                      value: 'summary',
                                      child: ListTile(
                                        leading: Icon(Icons.bar_chart),
                                        title: Text('Attendance summary'),
                                      ),
                                    ),
                                    PopupMenuItem(
                                      value: 'edit',
                                      child: ListTile(
                                        leading: Icon(Icons.edit),
                                        title: Text('Edit details'),
                                      ),
                                    ),
                                    PopupMenuItem(
                                      value: 'print',
                                      child: ListTile(
                                        leading: Icon(Icons.print),
                                        title: Text('Print QR badge'),
                                      ),
                                    ),
                                  ],
                                ),
                              );
                            },
                          ),
                        ),
                      ],
                    ),
                  ),
      ),
    );
  }
}
