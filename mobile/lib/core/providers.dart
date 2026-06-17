import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'geo/location_service.dart';
import 'network/api_client.dart';
import 'nfc/nfc_reader.dart';
import 'storage/local_db.dart';
import 'storage/secure_store.dart';

/// Overridden in main() once the database is opened.
final localDbProvider = Provider<LocalDb>((ref) => throw UnimplementedError('override in main'));

final secureStoreProvider = Provider<SecureStore>((ref) => SecureStore());

final apiClientProvider = Provider<ApiClient>(
  (ref) => ApiClient(ref.watch(secureStoreProvider)),
);

final nfcReaderProvider = Provider<NfcReader>((ref) => NfcManagerReader());

final locationServiceProvider = Provider<LocationService>((ref) => LocationService());

/// Company logo bytes (for app-bar branding), fetched once and cached. Returns
/// null when no logo is set or the device is offline.
final companyLogoProvider = FutureProvider<Uint8List?>((ref) async {
  final dio = ref.read(apiClientProvider).dio;
  try {
    final res = await dio.get('/organizations/current');
    final url = (res.data as Map)['logoUrl'] as String?;
    if (url == null || url.isEmpty) return null;
    final img = await dio.get<List<int>>(url, options: Options(responseType: ResponseType.bytes));
    final bytes = Uint8List.fromList(img.data ?? const []);
    return bytes.isEmpty ? null : bytes;
  } catch (_) {
    return null;
  }
});
