import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../device/device_service.dart';
import '../sync/sync_engine.dart';
import 'data/attendance_repository.dart';

final deviceServiceProvider = Provider<DeviceService>(
  (ref) => DeviceService(
    ref.watch(apiClientProvider),
    ref.watch(secureStoreProvider),
    ref.watch(localDbProvider),
  ),
);

final attendanceRepositoryProvider = Provider<AttendanceRepository>(
  (ref) => AttendanceRepository(
    ref.watch(localDbProvider),
    ref.watch(apiClientProvider),
    ref.watch(locationServiceProvider),
  ),
);

final syncEngineProvider = Provider<SyncEngine>(
  (ref) => SyncEngine(ref.watch(localDbProvider), ref.watch(apiClientProvider)),
);

/// Currently selected active site (persisted in meta).
final activeSiteProvider = StateProvider<String?>((ref) => null);

/// Count of unsynced events, for the status badge.
final pendingCountProvider = FutureProvider<int>(
  (ref) => ref.watch(localDbProvider).pendingCount(),
);
