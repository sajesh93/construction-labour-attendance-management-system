import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../core/push/push_service.dart';
import '../../core/storage/secure_store.dart';

class AuthState {
  const AuthState({
    this.initialized = false,
    this.loading = false,
    this.authenticated = false,
    this.role,
    this.fullName,
    this.email,
    this.error,
  });

  /// Whether startup bootstrap has finished (so the router can stop showing splash).
  final bool initialized;
  final bool loading;
  final bool authenticated;
  final String? role;
  final String? fullName;
  final String? email;
  final String? error;

  AuthState copyWith({
    bool? initialized,
    bool? loading,
    bool? authenticated,
    String? role,
    String? fullName,
    String? email,
    String? error,
  }) =>
      AuthState(
        initialized: initialized ?? this.initialized,
        loading: loading ?? this.loading,
        authenticated: authenticated ?? this.authenticated,
        role: role ?? this.role,
        fullName: fullName ?? this.fullName,
        email: email ?? this.email,
        error: error,
      );
}

class AuthController extends StateNotifier<AuthState> {
  AuthController(this._ref) : super(const AuthState());
  final Ref _ref;

  SecureStore get _store => _ref.read(secureStoreProvider);
  Dio get _dio => _ref.read(apiClientProvider).dio;

  /// Send this device's FCM token to the backend so SOS push can reach it.
  Future<void> _registerPush() async {
    try {
      final deviceUid = await _ref.read(localDbProvider).getMeta('device_uid');
      await PushService.registerToken(_dio, deviceUid: deviceUid);
    } catch (_) {
      // Best-effort; retried on next login/start.
    }
  }

  /// On app start: if a token is stored, validate it via /auth/me (the API
  /// client auto-refreshes on 401), restoring the session + role across restarts.
  ///
  /// EVERYTHING here is guarded — bootstrap must always end with
  /// `initialized: true`, otherwise the router keeps showing the splash
  /// spinner forever (secure-storage reads can throw after app upgrades, and
  /// network calls can stall).
  Future<void> bootstrap() async {
    try {
      final token = await _store.accessToken.timeout(const Duration(seconds: 5));
      if (token == null) {
        state = state.copyWith(initialized: true, authenticated: false);
        return;
      }
      final me = await _dio.get('/auth/me').timeout(const Duration(seconds: 15));
      state = state.copyWith(
        initialized: true,
        authenticated: true,
        role: me.data['role'] as String?,
        fullName: me.data['fullName'] as String?,
        email: me.data['email'] as String?,
      );
      unawaited(_registerPush());
    } on DioException catch (e) {
      // The server explicitly rejected the session — drop tokens but KEEP
      // device credentials so this phone stays authorized after re-login.
      // On pure network errors the tokens are kept for the next start.
      if (e.response != null) {
        try {
          await _store.clearAuth();
        } catch (_) {}
      }
      state = state.copyWith(initialized: true, authenticated: false, role: null);
    } catch (_) {
      try {
        await _store.clearAuth();
      } catch (_) {}
      state = state.copyWith(initialized: true, authenticated: false, role: null);
    }
  }

  Future<bool> login(String identifier, String password) async {
    state = state.copyWith(loading: true, error: null);
    try {
      final res = await _dio
          .post('/auth/login', data: {'identifier': identifier, 'password': password});
      await _store.saveTokens(
        res.data['accessToken'] as String,
        res.data['refreshToken'] as String,
      );
      state = state.copyWith(
        initialized: true,
        loading: false,
        authenticated: true,
        role: res.data['user']?['role'] as String?,
        fullName: res.data['user']?['fullName'] as String?,
        email: (res.data['user']?['email'] as String?) ?? identifier,
      );
      unawaited(_registerPush());
      return true;
    } on DioException catch (e) {
      final detail = e.response?.data is Map
          ? (e.response?.data['detail'] ?? e.response?.data['title'])
          : null;
      state = state.copyWith(loading: false, error: (detail as String?) ?? 'Login failed');
      return false;
    }
  }

  Future<void> logout() async {
    // Keep device_id/device_token: the device authorization belongs to the
    // phone, not the user session. Wiping them forced admins to re-authorize
    // the device after every logout/login.
    await _store.clearAuth();
    state = const AuthState(initialized: true, authenticated: false);
  }
}

final authControllerProvider =
    StateNotifierProvider<AuthController, AuthState>((ref) => AuthController(ref));
