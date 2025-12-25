import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'core/auth/providers/auth_provider.dart';
import 'core/auth/models/auth_state.dart';
import 'features/authentication/login_screen.dart';
import 'features/home/home_screen.dart';

void main() {
  runApp(
    const ProviderScope(
      child: TamshaiApp(),
    ),
  );
}

class TamshaiApp extends ConsumerStatefulWidget {
  const TamshaiApp({super.key});

  @override
  ConsumerState<TamshaiApp> createState() => _TamshaiAppState();
}

class _TamshaiAppState extends ConsumerState<TamshaiApp> {
  @override
  void initState() {
    super.initState();
    // Initialize auth state on app start
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(authNotifierProvider.notifier).initialize();
    });
  }

  @override
  Widget build(BuildContext context) {
    final router = _createRouter(ref);

    return MaterialApp.router(
      title: 'Tamshai Enterprise AI',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.blue),
        useMaterial3: true,
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            elevation: 2,
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
          ),
        ),
        cardTheme: CardThemeData(
          elevation: 2,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
      routerConfig: router,
      debugShowCheckedModeBanner: false,
    );
  }

  GoRouter _createRouter(WidgetRef ref) {
    return GoRouter(
      initialLocation: '/',
      debugLogDiagnostics: true,
      redirect: (context, state) {
        final authState = ref.read(authNotifierProvider);
        final isAuthenticated = authState is Authenticated;
        final isAuthenticating = authState is Authenticating;
        final isLoginRoute = state.matchedLocation == '/login';

        // If authenticating, don't redirect
        if (isAuthenticating) {
          return null;
        }

        // If not authenticated and not on login page, redirect to login
        if (!isAuthenticated && !isLoginRoute) {
          return '/login';
        }

        // If authenticated and on login page, redirect to home
        if (isAuthenticated && isLoginRoute) {
          return '/';
        }

        return null;
      },
      refreshListenable: _AuthStateNotifier(ref),
      routes: [
        GoRoute(
          path: '/',
          builder: (context, state) => const HomeScreen(),
        ),
        GoRoute(
          path: '/login',
          builder: (context, state) => const LoginScreen(),
        ),
      ],
      errorBuilder: (context, state) => Scaffold(
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, size: 80, color: Colors.red),
              const SizedBox(height: 16),
              Text(
                'Page not found',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 8),
              Text(state.error?.toString() ?? 'Unknown error'),
            ],
          ),
        ),
      ),
    );
  }
}

/// Notifier that triggers router refresh when auth state changes
class _AuthStateNotifier extends ChangeNotifier {
  final WidgetRef _ref;

  _AuthStateNotifier(this._ref) {
    _ref.listen<AuthState>(
      authNotifierProvider,
      (previous, next) {
        notifyListeners();
      },
    );
  }
}
