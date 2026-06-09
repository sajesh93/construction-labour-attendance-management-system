import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Token + device-credential storage backed by the platform keystore/keychain.
class SecureStore {
  SecureStore([FlutterSecureStorage? storage])
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  static const _accessKey = 'access_token';
  static const _refreshKey = 'refresh_token';
  static const _deviceIdKey = 'device_id';
  static const _deviceTokenKey = 'device_token';

  Future<void> saveTokens(String access, String refresh) async {
    await _storage.write(key: _accessKey, value: access);
    await _storage.write(key: _refreshKey, value: refresh);
  }

  Future<String?> get accessToken => _storage.read(key: _accessKey);
  Future<String?> get refreshToken => _storage.read(key: _refreshKey);

  Future<void> saveDevice(String deviceId, String deviceToken) async {
    await _storage.write(key: _deviceIdKey, value: deviceId);
    await _storage.write(key: _deviceTokenKey, value: deviceToken);
  }

  Future<String?> get deviceId => _storage.read(key: _deviceIdKey);
  Future<String?> get deviceToken => _storage.read(key: _deviceTokenKey);

  Future<void> clear() => _storage.deleteAll();
}
