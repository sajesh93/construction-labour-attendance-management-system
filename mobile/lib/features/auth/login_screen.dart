import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

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
                    child: Image.asset('assets/logo.png', height: 72, fit: BoxFit.contain),
                  ),
                  const SizedBox(height: 20),
                  Text('CLAMS', style: Theme.of(context).textTheme.headlineMedium),
                  const SizedBox(height: 4),
                  Text('Attendance terminal',
                      style: Theme.of(context).textTheme.bodyMedium),
                  const SizedBox(height: 24),
                  if (state.error != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Text(state.error!,
                          style: TextStyle(color: Theme.of(context).colorScheme.error)),
                    ),
                  TextField(
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    decoration: const InputDecoration(labelText: 'Email', border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _password,
                    obscureText: true,
                    decoration: const InputDecoration(labelText: 'Password', border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 24),
                  FilledButton(
                    onPressed: state.loading ? null : _submit,
                    child: Text(state.loading ? 'Signing in…' : 'Sign in'),
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
