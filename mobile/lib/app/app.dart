import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/auth_controller.dart';
import '../features/auth/login_screen.dart';
import '../features/site_selection/site_selection_screen.dart';
import '../features/attendance/presentation/attendance_home_screen.dart';
import 'theme.dart';

class ClamsApp extends ConsumerStatefulWidget {
  const ClamsApp({super.key});

  @override
  ConsumerState<ClamsApp> createState() => _ClamsAppState();
}

class _ClamsAppState extends ConsumerState<ClamsApp> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(authControllerProvider.notifier).bootstrap());
  }

  @override
  Widget build(BuildContext context) {
    final router = GoRouter(
      initialLocation: '/login',
      redirect: (context, state) {
        final authed = ref.read(authControllerProvider).authenticated;
        final loggingIn = state.matchedLocation == '/login';
        if (!authed) return loggingIn ? null : '/login';
        if (loggingIn) return '/site';
        return null;
      },
      routes: [
        GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
        GoRoute(path: '/site', builder: (_, __) => const SiteSelectionScreen()),
        GoRoute(path: '/attendance', builder: (_, __) => const AttendanceHomeScreen()),
      ],
    );

    return MaterialApp.router(
      title: 'CLAMS',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      routerConfig: router,
    );
  }
}
