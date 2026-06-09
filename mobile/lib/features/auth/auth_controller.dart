import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../core/storage/secure_store.dart';

class AuthState {
  const AuthState({
    this.initialized = false,
    this.loading = false,
    this.authenticated = false,
    this.role,
    this.fullName,
    this.error,
  });

  /// Whether startup bootstrap has finished (so the router can stop showing splash).
  final bool initialized;
  final bool loading;
  final bool authenticated;
  final String? role;
  final String? fullName;
  final String? error;

  AuthState copyWith({
    bool? initialized,
    bool? loading,
    bool? authenticated,
    String? role,
    String? fullName,
    String? error,
  }) =>
      AuthState(
        initialized: initialized ?? this.initialized,
        loading: loading ?? this.loading,
        authenticated: authenticated ?? this.authenticated,
        role: role ?? this.role,
        fullName: fullName ?? this.fullName,
        error: error,
      );
}

class AuthController extends StateNotifier<AuthState> {
  AuthController(this._ref) : super(const AuthState());
  final Ref _ref;

  SecureStore get _store => _ref.read(secureStoreProvider);
  Dio get _dio => _ref.read(apiClientProvider).dio;

  /// On app start: if a token is stored, validate it via /auth/me (the API
  /// client auto-refreshes on 401), restoring the session + role across restarts.
  Future<void> bootstrap() async {
    final token = await _store.accessToken;
    if (token == null) {
      state = state.copyWith(initialized: true, authenticated: false);
      return;
    }
    try {
      final me = await _dio.get('/auth/me');
      state = state.copyWith(
        initialized: true,
        authenticated: true,
        role: me.data['role'] as String?,
        fullName: me.data['fullName'] as String?,
      );
    } catch (_) {
      await _store.clear();
      state = state.copyWith(initialized: true, authenticated: false, role: null);
    }
  }

  Future<bool> login(String email, String password) async {
    state = state.copyWith(loading: true, error: null);
    try {
      final res = await _dio.post('/auth/login', data: {'email': email, 'password': password});
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
      );
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
    await _store.clear();
    state = const AuthState(initialized: true, authenticated: false);
  }
}

final authControllerProvider =
    StateNotifierProvider<AuthController, AuthState>((ref) => AuthController(ref));
