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
