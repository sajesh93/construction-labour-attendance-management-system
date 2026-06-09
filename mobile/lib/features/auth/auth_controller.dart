import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../core/storage/secure_store.dart';

class AuthState {
  const AuthState({this.loading = false, this.authenticated = false, this.role, this.error});
  final bool loading;
  final bool authenticated;
  final String? role;
  final String? error;

  AuthState copyWith({bool? loading, bool? authenticated, String? role, String? error}) =>
      AuthState(
        loading: loading ?? this.loading,
        authenticated: authenticated ?? this.authenticated,
        role: role ?? this.role,
        error: error,
      );
}

class AuthController extends StateNotifier<AuthState> {
  AuthController(this._ref) : super(const AuthState());
  final Ref _ref;

  SecureStore get _store => _ref.read(secureStoreProvider);
  Dio get _dio => _ref.read(apiClientProvider).dio;

  Future<void> bootstrap() async {
    final token = await _store.accessToken;
    state = state.copyWith(authenticated: token != null);
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
        loading: false,
        authenticated: true,
        role: res.data['user']?['role'] as String?,
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
    state = const AuthState();
  }
}

final authControllerProvider =
    StateNotifierProvider<AuthController, AuthState>((ref) => AuthController(ref));
