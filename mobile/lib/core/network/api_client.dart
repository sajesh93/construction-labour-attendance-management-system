import 'package:dio/dio.dart';

import '../config/env.dart';
import '../storage/secure_store.dart';

/// Dio-based API client. Attaches the bearer + device headers and transparently
/// refreshes the access token on 401.
class ApiClient {
  ApiClient(this._store) : _dio = Dio(BaseOptions(baseUrl: Env.apiBaseUrl)) {
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await _store.accessToken;
          if (token != null) options.headers['authorization'] = 'Bearer $token';
          final deviceId = await _store.deviceId;
          final deviceToken = await _store.deviceToken;
          if (deviceId != null) options.headers['x-device-id'] = deviceId;
          if (deviceToken != null) options.headers['x-device-token'] = deviceToken;
          handler.next(options);
        },
        onError: (e, handler) async {
          if (e.response?.statusCode == 401 && !_isRefreshCall(e.requestOptions)) {
            final refreshed = await _tryRefresh();
            if (refreshed) {
              final clone = await _retry(e.requestOptions);
              return handler.resolve(clone);
            }
          }
          handler.next(e);
        },
      ),
    );
  }

  final Dio _dio;
  final SecureStore _store;

  Dio get dio => _dio;

  bool _isRefreshCall(RequestOptions o) => o.path.contains('/auth/refresh');

  Future<bool> _tryRefresh() async {
    final refresh = await _store.refreshToken;
    if (refresh == null) return false;
    try {
      final res = await Dio(BaseOptions(baseUrl: Env.apiBaseUrl))
          .post('/auth/refresh', data: {'refreshToken': refresh});
      await _store.saveTokens(
        res.data['accessToken'] as String,
        res.data['refreshToken'] as String,
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<Response<dynamic>> _retry(RequestOptions o) async {
    final token = await _store.accessToken;
    return _dio.request(
      o.path,
      data: o.data,
      queryParameters: o.queryParameters,
      options: Options(method: o.method, headers: {...o.headers, 'authorization': 'Bearer $token'}),
    );
  }
}
