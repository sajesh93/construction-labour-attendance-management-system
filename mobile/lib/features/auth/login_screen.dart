import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/theme.dart';
import '../../core/config/env.dart';
import '../sos/sos_button.dart';
import 'auth_controller.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final ok = await ref.read(authControllerProvider.notifier).login(
          _email.text.trim(),
          _password.text,
        );
    if (ok && mounted) context.go('/site');
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(authControllerProvider);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Align(
                    alignment: Alignment.center,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: ClamsSpacing.xl, vertical: 14),
                      decoration: BoxDecoration(
                        color: ClamsColors.primaryDark,
                        borderRadius: BorderRadius.circular(ClamsRadius.card),
                      ),
                      child: Image.asset('assets/logo.png', height: 56, fit: BoxFit.contain),
                    ),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    'CLAMS',
                    style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                          color: ClamsColors.text,
                        ),
                  ),
                  ClamsSpacing.gapXs,
                  Text('Attendance terminal',
                      style: Theme.of(context)
                          .textTheme
                          .bodyMedium
                          ?.copyWith(color: ClamsColors.textSecondary)),
                  ClamsSpacing.gapXl,
                  if (state.error != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: ClamsSpacing.md),
                      child: Text(state.error!,
                          style: const TextStyle(color: ClamsColors.error)),
                    ),
                  TextField(
                    controller: _email,
                    keyboardType: TextInputType.text,
                    decoration: const InputDecoration(labelText: 'Email or user ID'),
                  ),
                  ClamsSpacing.gapLg,
                  TextField(
                    controller: _password,
                    obscureText: true,
                    decoration: const InputDecoration(labelText: 'Password'),
                  ),
                  ClamsSpacing.gapXl,
                  FilledButton(
                    onPressed: state.loading ? null : _submit,
                    child: Text(state.loading ? 'Signing in…' : 'Sign in'),
                  ),
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton(
                      onPressed: () => showDialog<void>(
                        context: context,
                        builder: (_) =>
                            ForgotPasswordDialog(initialIdentifier: _email.text.trim()),
                      ),
                      child: const Text('Forgot password?'),
                    ),
                  ),
                  const SizedBox(height: 32),
                  const Divider(),
                  const SizedBox(height: 8),
                  // Works without signing in — site resolved via GPS.
                  const SosButton(),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Self-service password reset. Step 1 asks for the email/user ID and requests
/// an OTP; if the backend could email a code, step 2 collects the 6-digit code
/// plus the new password and completes the reset. Uses a plain Dio (like the
/// SOS service) because the user is not signed in.
class ForgotPasswordDialog extends StatefulWidget {
  const ForgotPasswordDialog({super.key, this.initialIdentifier = ''});

  final String initialIdentifier;

  @override
  State<ForgotPasswordDialog> createState() => _ForgotPasswordDialogState();
}

class _ForgotPasswordDialogState extends State<ForgotPasswordDialog> {
  late final _identifier = TextEditingController(text: widget.initialIdentifier);
  final _otp = TextEditingController();
  final _newPassword = TextEditingController();
  final _confirmPassword = TextEditingController();

  final _dio = Dio(BaseOptions(baseUrl: Env.apiBaseUrl));

  bool _busy = false;
  bool _otpStage = false;
  String? _info;
  String? _error;

  @override
  void dispose() {
    _identifier.dispose();
    _otp.dispose();
    _newPassword.dispose();
    _confirmPassword.dispose();
    super.dispose();
  }

  String _detail(DioException e, String fallback) {
    final data = e.response?.data;
    final detail = data is Map ? (data['detail'] ?? data['title'] ?? data['message']) : null;
    return detail is String && detail.isNotEmpty ? detail : (e.message ?? fallback);
  }

  Future<void> _requestCode() async {
    final id = _identifier.text.trim();
    if (id.isEmpty) {
      setState(() => _error = 'Enter your email or user ID');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _info = null;
    });
    try {
      final res = await _dio.post('/auth/forgot-password', data: {'identifier': id});
      if (!mounted) return;
      setState(() {
        _busy = false;
        _info = res.data['message'] as String?;
        _otpStage = res.data['emailSent'] == true;
      });
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = _detail(e, 'Could not request a reset code');
      });
    }
  }

  Future<void> _resetPassword() async {
    final otp = _otp.text.trim();
    final pass = _newPassword.text;
    setState(() => _error = null);
    if (otp.length != 6) {
      setState(() => _error = 'Enter the 6-digit code from the email');
      return;
    }
    if (pass.length < 8) {
      setState(() => _error = 'New password must be at least 8 characters');
      return;
    }
    if (pass != _confirmPassword.text) {
      setState(() => _error = 'Passwords do not match');
      return;
    }
    setState(() => _busy = true);
    try {
      final verify = await _dio.post('/auth/forgot-password/verify', data: {
        'identifier': _identifier.text.trim(),
        'otp': otp,
      });
      final resetToken = verify.data['resetToken'] as String;
      await _dio.post('/auth/reset-password', data: {
        'resetToken': resetToken,
        'newPassword': pass,
      });
      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Password changed — sign in with your new password.')),
      );
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = _detail(e, 'Password reset failed');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Forgot password'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: ClamsSpacing.md),
                child: Text(_error!, style: const TextStyle(color: ClamsColors.error)),
              ),
            if (_info != null)
              Padding(
                padding: const EdgeInsets.only(bottom: ClamsSpacing.md),
                child: Text(_info!,
                    style: const TextStyle(color: ClamsColors.textSecondary)),
              ),
            TextField(
              controller: _identifier,
              enabled: !_otpStage,
              keyboardType: TextInputType.text,
              decoration: const InputDecoration(labelText: 'Email or user ID'),
            ),
            if (_otpStage) ...[
              ClamsSpacing.gapMd,
              TextField(
                controller: _otp,
                keyboardType: TextInputType.number,
                maxLength: 6,
                decoration:
                    const InputDecoration(labelText: '6-digit code', counterText: ''),
              ),
              ClamsSpacing.gapMd,
              TextField(
                controller: _newPassword,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'New password'),
              ),
              ClamsSpacing.gapMd,
              TextField(
                controller: _confirmPassword,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Confirm new password'),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _busy ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _busy ? null : (_otpStage ? _resetPassword : _requestCode),
          child: Text(_busy
              ? 'Please wait…'
              : _otpStage
                  ? 'Reset password'
                  : 'Send code'),
        ),
      ],
    );
  }
}
