import 'dart:io';

import 'package:device_info_plus/device_info_plus.dart';
import 'package:dio/dio.dart';
import 'package:uuid/uuid.dart';

import '../../core/network/api_client.dart';
import '../../core/storage/local_db.dart';
import '../../core/storage/secure_store.dart';

enum DeviceState { authorized, pending, error }

class DeviceStatus {
  const DeviceStatus(this.state, {this.deviceId, this.message});
  final DeviceState state;
  final String? deviceId;
  final String? message;
}

/// Handles the device registration handshake:
///  1. ensure a stable deviceUid (persisted)
///  2. register with the backend (idempotent) -> deviceId
///  3. request a device token; succeeds only once an admin AUTHORIZES the device
/// The token + deviceId are stored for the API client to send on attendance calls.
class DeviceService {
  DeviceService(this._api, this._store, this._db);
  final ApiClient _api;
  final SecureStore _store;
  final LocalDb _db;

  /// Best-effort human-friendly device name (e.g. "samsung SM-A525F") used as the
  /// initial label so the admin panel shows something meaningful instead of the
  /// random UID. Admins can rename it afterwards; we never overwrite that rename.
  Future<String> _deviceName() async {
    try {
      final plugin = DeviceInfoPlugin();
      if (Platform.isAndroid) {
        final info = await plugin.androidInfo;
        final name = '${info.manufacturer} ${info.model}'.trim();
        if (name.isNotEmpty) return name;
      } else if (Platform.isIOS) {
        final info = await plugin.iosInfo;
        return '${info.name} (${info.model})';
      }
    } catch (_) {}
    return 'CLAMS terminal';
  }

  Future<DeviceStatus> ensureRegisteredAndAuthorized() async {
    // Credentials from a previous session (they survive logout).
    final storedId = await _store.deviceId;
    final storedToken = await _store.deviceToken;
    try {
      var uid = await _db.getMeta('device_uid');
      if (uid == null) {
        uid = const Uuid().v4();
        await _db.setMeta('device_uid', uid);
      }

      final reg = await _api.dio.post('/auth/device/register', data: {
        'deviceUid': uid,
        'platform': Platform.isIOS ? 'ios' : 'android',
        'label': await _deviceName(),
      });
      final deviceId = reg.data['deviceId'] as String;
      await _db.setMeta('device_id', deviceId);
      await _store.saveDeviceId(deviceId);

      // Try to obtain a token — only granted when the device is AUTHORIZED.
      try {
        final t = await _api.dio.post('/auth/device/token', data: {'deviceId': deviceId});
        await _store.saveDeviceToken(t.data['deviceToken'] as String);
        return DeviceStatus(DeviceState.authorized, deviceId: deviceId);
      } on DioException catch (e) {
        if (e.response?.statusCode == 403) {
          return DeviceStatus(DeviceState.pending, deviceId: deviceId);
        }
        rethrow;
      }
    } on DioException catch (e) {
      // Server unreachable — if this phone already holds device credentials,
      // keep operating: punches queue offline and sync later anyway.
      if (storedId != null && storedToken != null) {
        return DeviceStatus(DeviceState.authorized, deviceId: storedId);
      }
      return DeviceStatus(DeviceState.error, message: e.message ?? 'network error');
    }
  }
}
