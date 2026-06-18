import 'dart:io';

import 'package:device_info_plus/device_info_plus.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/config/env.dart';
import '../../core/providers.dart';
import '../auth/auth_controller.dart';

/// Outcome of an SOS attempt — lets the UI message be accurate (a recent-resend
/// block is not the same as having no network).
enum SosResult { sent, throttled, failed }

/// Sends an SOS to the backend. Works WITHOUT login (public endpoint) so the
/// button is usable straight from the login screen.
///
/// Logged in: the alert carries the last-selected site plus the sender's
/// name/role/email. Logged out: no site is claimed — the backend resolves it
/// from GPS — but the phone's make/model and location still go along.
class SosService {
  SosService(this._ref);
  final Ref _ref;

  Future<String?> _deviceName() async {
    try {
      final plugin = DeviceInfoPlugin();
      if (Platform.isAndroid) {
        final info = await plugin.androidInfo;
        return '${info.manufacturer} ${info.model}'.trim();
      }
      if (Platform.isIOS) {
        final info = await plugin.iosInfo;
        return '${info.name} (${info.model})';
      }
    } catch (_) {}
    return null;
  }

  Future<SosResult> trigger({String? message}) async {
    double? lat;
    double? lng;
    double? accuracyM;
    try {
      final fix = await _ref.read(locationServiceProvider).current();
      lat = fix?.lat;
      lng = fix?.lng;
      accuracyM = fix?.accuracyM;
    } catch (_) {
      // No GPS — backend falls back to last-known site / device site.
    }

    final auth = _ref.read(authControllerProvider);
    final loggedIn = auth.authenticated;

    String? siteId;
    String? deviceUid;
    try {
      final db = _ref.read(localDbProvider);
      // Only a logged-in sender may claim the last-selected site; a logged-out
      // phone is located by GPS instead.
      if (loggedIn) siteId = await db.getMeta('active_site');
      deviceUid = await db.getMeta('device_uid');
    } catch (_) {}

    final deviceName = await _deviceName();

    try {
      // Plain Dio on purpose: must work with no auth tokens at all.
      await Dio(BaseOptions(baseUrl: Env.apiBaseUrl)).post('/sos', data: {
        if (lat != null) 'latitude': lat,
        if (lng != null) 'longitude': lng,
        if (accuracyM != null) 'accuracyM': accuracyM,
        if (siteId != null) 'siteId': siteId,
        if (deviceUid != null) 'deviceUid': deviceUid,
        if (deviceName != null) 'deviceName': deviceName,
        if (loggedIn && auth.fullName != null) 'senderName': auth.fullName,
        if (loggedIn && auth.role != null) 'senderRole': auth.role,
        if (loggedIn && auth.email != null) 'senderEmail': auth.email,
        if (message != null && message.isNotEmpty) 'message': message,
      });
      return SosResult.sent;
    } on DioException catch (e) {
      // 429 = a recent SOS from this device is still within the cooldown — the
      // alert already went out; this is NOT a network failure.
      if (e.response?.statusCode == 429) return SosResult.throttled;
      return SosResult.failed;
    } catch (_) {
      return SosResult.failed;
    }
  }
}

final sosServiceProvider = Provider<SosService>((ref) => SosService(ref));
