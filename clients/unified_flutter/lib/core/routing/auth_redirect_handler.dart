/// AuthRedirectHandler - Unified Flutter Client
///
/// Authentication-based route redirect handler.
/// Consolidates duplicate redirect logic across screens.
///
/// Issue 3.1: Router Logic (Flutter)

import '../auth/models/auth_state.dart';
import '../auth/providers/auth_provider.dart';
import '../storage/secure_storage_service.dart';

/// Handles authentication-based route redirects.
///
/// This class determines where users should be redirected based on:
/// - Their current authentication state
/// - The route they're trying to access
/// - Whether biometric authentication is available
///
/// Usage with go_router:
/// ```dart
/// final router = GoRouter(
///   redirect: (context, state) async {
///     final handler = ref.read(authRedirectHandlerProvider);
///     return handler.getRedirectPath(state.uri.path);
///   },
///   routes: [...],
/// );
/// ```
class AuthRedirectHandler {
  final AuthNotifier _authNotifier;
  final SecureStorageService _storage;

  /// Routes that are related to authentication (login flow)
  static const List<String> authRoutes = [
    '/login',
    '/biometric-unlock',
  ];

  /// Routes that are publicly accessible without authentication
  static const List<String> publicRoutes = [
    '/about',
    '/privacy',
    '/terms',
  ];

  AuthRedirectHandler({
    required AuthNotifier authNotifier,
    required SecureStorageService storage,
  })  : _authNotifier = authNotifier,
        _storage = storage;

  /// Get the redirect path based on authentication state.
  ///
  /// Returns:
  /// - `null` if no redirect is needed (user can access the route)
  /// - A path string if the user should be redirected
  ///
  /// Redirect logic:
  /// 1. During authentication (loading): no redirect
  /// 2. Authenticated user on auth page: redirect to home
  /// 3. Authenticated user on protected page: no redirect
  /// 4. Unauthenticated user on public/auth page: no redirect
  /// 5. Unauthenticated user on protected page: redirect to login or biometric
  Future<String?> getRedirectPath(String path) async {
    final state = _authNotifier.state;

    // 1. During authentication, don't redirect (let loading UI show)
    if (state is Authenticating) {
      return null;
    }

    // 2. Authenticated user
    if (state is Authenticated) {
      // If on auth pages (login, biometric-unlock), redirect to home
      if (_isAuthRoute(path)) {
        return '/';
      }
      // Otherwise, allow access to any route
      return null;
    }

    // 3. Error state - treat similarly to unauthenticated
    // but allow staying on login page to see error
    if (state is AuthError) {
      if (_isAuthRoute(path)) {
        return null; // Allow showing error on login page
      }
      // For protected routes, redirect to login
      if (isProtectedRoute(path)) {
        final hasBiometric = await _storage.hasBiometricRefreshToken();
        return hasBiometric ? '/biometric-unlock' : '/login';
      }
      return null;
    }

    // 4. Unauthenticated state
    if (state is Unauthenticated) {
      // Allow access to auth routes
      if (path == '/login') {
        return null;
      }

      // For biometric-unlock, only allow if biometric token exists
      if (path == '/biometric-unlock') {
        final hasBiometric = await _storage.hasBiometricRefreshToken();
        return hasBiometric ? null : '/login';
      }

      // Allow access to public routes
      if (!isProtectedRoute(path)) {
        return null;
      }

      // For protected routes, redirect based on biometric availability
      final hasBiometric = await _storage.hasBiometricRefreshToken();
      return hasBiometric ? '/biometric-unlock' : '/login';
    }

    // Default: no redirect (shouldn't reach here)
    return null;
  }

  /// Check if a route requires authentication.
  ///
  /// A route is protected if it's not:
  /// - An authentication route (login, biometric-unlock)
  /// - A public route (about, privacy, terms)
  bool isProtectedRoute(String path) {
    // Auth routes are not protected (anyone can access login)
    if (_isAuthRoute(path)) {
      return false;
    }

    // Public routes are not protected
    if (_isPublicRoute(path)) {
      return false;
    }

    // Everything else requires authentication
    return true;
  }

  /// Check if the path is an authentication-related route
  bool _isAuthRoute(String path) {
    return authRoutes.contains(path);
  }

  /// Check if the path is a public route
  bool _isPublicRoute(String path) {
    return publicRoutes.contains(path);
  }
}
