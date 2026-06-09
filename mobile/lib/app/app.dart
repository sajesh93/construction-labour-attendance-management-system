import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/auth_controller.dart';
import '../features/auth/login_screen.dart';
import '../features/site_selection/site_selection_screen.dart';
import '../features/attendance/presentation/attendance_home_screen.dart';
import '../features/supervisor/supervisor_home_screen.dart';
import 'theme.dart';

/// Router that reacts to auth-state changes (login/logout/bootstrap) via a
/// refreshListenable, so sessions persist across restarts and role routing works.
final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier(0);
  ref.onDispose(refresh.dispose);
  ref.listen(authControllerProvider, (_, __) => refresh.value++);

  return GoRouter(
    initialLocation: '/splash',
    refreshListenable: refresh,
    redirect: (context, state) {
      final auth = ref.read(authControllerProvider);
      final loc = state.matchedLocation;

      if (!auth.initialized) return loc == '/splash' ? null : '/splash';
      if (!auth.authenticated) return loc == '/login' ? null : '/login';

      // Authenticated: bounce off splash/login to the site picker.
      if (loc == '/splash' || loc == '/login') return '/site';
      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (_, __) => const _Splash()),
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/site', builder: (_, __) => const SiteSelectionScreen()),
      GoRoute(path: '/attendance', builder: (_, __) => const AttendanceHomeScreen()),
      GoRoute(path: '/supervisor', builder: (_, __) => const SupervisorHomeScreen()),
    ],
  );
});

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
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'CLAMS',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      routerConfig: router,
    );
  }
}

class _Splash extends StatelessWidget {
  const _Splash();
  @override
  Widget build(BuildContext context) {
    return const Scaffold(body: Center(child: CircularProgressIndicator()));
  }
}
