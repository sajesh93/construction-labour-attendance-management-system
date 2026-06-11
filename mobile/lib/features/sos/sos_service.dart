import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/config/env.dart';
import '../../core/providers.dart';

/// Sends an SOS to the backend. Works WITHOUT login (public endpoint) so the
/// button is usable straight from the login screen. The backend resolves the
/// site from GPS proximity, falling back to the phone's last-selected site.
class SosService {
  SosService(this._ref);
  final Ref _ref;

  Future<bool> trigger({String? message}) async {
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

    String? siteId;
    String? deviceUid;
    try {
      final db = _ref.read(localDbProvider);
      siteId = await db.getMeta('active_site');
      deviceUid = await db.getMeta('device_uid');
    } catch (_) {}

    try {
      // Plain Dio on purpose: must work with no auth tokens at all.
      await Dio(BaseOptions(baseUrl: Env.apiBaseUrl)).post('/sos', data: {
        if (lat != null) 'latitude': lat,
        if (lng != null) 'longitude': lng,
        if (accuracyM != null) 'accuracyM': accuracyM,
        if (siteId != null) 'siteId': siteId,
        if (deviceUid != null) 'deviceUid': deviceUid,
        if (message != null && message.isNotEmpty) 'message': message,
      });
      return true;
    } catch (_) {
      return false;
    }
  }
}

final sosServiceProvider = Provider<SosService>((ref) => SosService(ref));
