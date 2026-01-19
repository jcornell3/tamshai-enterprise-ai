/**
 * AuthRedirectHandler Tests - Unified Flutter Client
 *
 * RED Phase: Tests for the authentication-based route redirect handler.
 * This consolidates duplicate redirect logic across screens.
 *
 * Issue 3.1: Router Logic (Flutter)
 */

import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:unified_flutter/core/auth/models/auth_state.dart';
import 'package:unified_flutter/core/auth/providers/auth_provider.dart';
import 'package:unified_flutter/core/storage/secure_storage_service.dart';
import 'package:unified_flutter/core/routing/auth_redirect_handler.dart';

// Mock classes
class MockAuthNotifier extends Mock implements AuthNotifier {}
class MockSecureStorageService extends Mock implements SecureStorageService {}

// Fake AuthUser for testing
final testUser = AuthUser(
  id: 'user-123',
  username: 'alice.chen',
  email: 'alice.chen@tamshai.com',
  roles: ['hr-read', 'hr-write'],
  fullName: 'Alice Chen',
);

void main() {
  late AuthRedirectHandler handler;
  late MockAuthNotifier mockAuthNotifier;
  late MockSecureStorageService mockStorage;

  setUp(() {
    mockAuthNotifier = MockAuthNotifier();
    mockStorage = MockSecureStorageService();
    handler = AuthRedirectHandler(
      authNotifier: mockAuthNotifier,
      storage: mockStorage,
    );
  });

  group('AuthRedirectHandler', () {
    group('getRedirectPath', () {
      test('returns null when authenticating (no redirect during auth)', () async {
        when(() => mockAuthNotifier.state)
            .thenReturn(const AuthState.authenticating());

        final result = await handler.getRedirectPath('/dashboard');

        expect(result, isNull);
      });

      test('redirects to / when authenticated and on login page', () async {
        when(() => mockAuthNotifier.state)
            .thenReturn(AuthState.authenticated(testUser));

        final result = await handler.getRedirectPath('/login');

        expect(result, equals('/'));
      });

      test('redirects to / when authenticated and on biometric-unlock page', () async {
        when(() => mockAuthNotifier.state)
            .thenReturn(AuthState.authenticated(testUser));

        final result = await handler.getRedirectPath('/biometric-unlock');

        expect(result, equals('/'));
      });

      test('returns null when authenticated and on non-login page', () async {
        when(() => mockAuthNotifier.state)
            .thenReturn(AuthState.authenticated(testUser));

        final result = await handler.getRedirectPath('/dashboard');

        expect(result, isNull);
      });

      test('redirects to /login when not authenticated and no biometric token', () async {
        when(() => mockAuthNotifier.state)
            .thenReturn(const AuthState.unauthenticated());
        when(() => mockStorage.hasBiometricRefreshToken())
            .thenAnswer((_) async => false);

        final result = await handler.getRedirectPath('/dashboard');

        expect(result, equals('/login'));
      });

      test('redirects to /biometric-unlock when has biometric token', () async {
        when(() => mockAuthNotifier.state)
            .thenReturn(const AuthState.unauthenticated());
        when(() => mockStorage.hasBiometricRefreshToken())
            .thenAnswer((_) async => true);

        final result = await handler.getRedirectPath('/dashboard');

        expect(result, equals('/biometric-unlock'));
      });

      test('allows access to login page when unauthenticated', () async {
        when(() => mockAuthNotifier.state)
            .thenReturn(const AuthState.unauthenticated());

        final result = await handler.getRedirectPath('/login');

        expect(result, isNull);
      });

      test('allows access to biometric-unlock when has biometric token', () async {
        when(() => mockAuthNotifier.state)
            .thenReturn(const AuthState.unauthenticated());
        when(() => mockStorage.hasBiometricRefreshToken())
            .thenAnswer((_) async => true);

        final result = await handler.getRedirectPath('/biometric-unlock');

        expect(result, isNull);
      });
    });

    group('error state handling', () {
      test('redirects to /login on error state', () async {
        when(() => mockAuthNotifier.state)
            .thenReturn(const AuthState.error('Session expired'));
        when(() => mockStorage.hasBiometricRefreshToken())
            .thenAnswer((_) async => false);

        final result = await handler.getRedirectPath('/dashboard');

        expect(result, equals('/login'));
      });

      test('shows error page for persistent errors', () async {
        when(() => mockAuthNotifier.state)
            .thenReturn(const AuthState.error('Network error'));

        final result = await handler.getRedirectPath('/login');

        // Should allow showing error on login page
        expect(result, isNull);
      });
    });

    group('protected routes', () {
      test('redirects unauthenticated user from /chat', () async {
        when(() => mockAuthNotifier.state)
            .thenReturn(const AuthState.unauthenticated());
        when(() => mockStorage.hasBiometricRefreshToken())
            .thenAnswer((_) async => false);

        final result = await handler.getRedirectPath('/chat');

        expect(result, equals('/login'));
      });

      test('redirects unauthenticated user from /settings', () async {
        when(() => mockAuthNotifier.state)
            .thenReturn(const AuthState.unauthenticated());
        when(() => mockStorage.hasBiometricRefreshToken())
            .thenAnswer((_) async => false);

        final result = await handler.getRedirectPath('/settings');

        expect(result, equals('/login'));
      });

      test('allows authenticated user to access /chat', () async {
        when(() => mockAuthNotifier.state)
            .thenReturn(AuthState.authenticated(testUser));

        final result = await handler.getRedirectPath('/chat');

        expect(result, isNull);
      });
    });

    group('public routes', () {
      test('allows access to /about without authentication', () async {
        when(() => mockAuthNotifier.state)
            .thenReturn(const AuthState.unauthenticated());

        // Public routes should not redirect
        final shouldRedirect = handler.isProtectedRoute('/about');

        expect(shouldRedirect, isFalse);
      });

      test('allows access to /privacy without authentication', () async {
        when(() => mockAuthNotifier.state)
            .thenReturn(const AuthState.unauthenticated());

        final shouldRedirect = handler.isProtectedRoute('/privacy');

        expect(shouldRedirect, isFalse);
      });
    });

    group('isProtectedRoute', () {
      test('returns true for /dashboard', () {
        expect(handler.isProtectedRoute('/dashboard'), isTrue);
      });

      test('returns true for /chat', () {
        expect(handler.isProtectedRoute('/chat'), isTrue);
      });

      test('returns true for /settings', () {
        expect(handler.isProtectedRoute('/settings'), isTrue);
      });

      test('returns false for /login', () {
        expect(handler.isProtectedRoute('/login'), isFalse);
      });

      test('returns false for /biometric-unlock', () {
        expect(handler.isProtectedRoute('/biometric-unlock'), isFalse);
      });

      test('returns false for public routes', () {
        expect(handler.isProtectedRoute('/about'), isFalse);
        expect(handler.isProtectedRoute('/privacy'), isFalse);
        expect(handler.isProtectedRoute('/terms'), isFalse);
      });
    });
  });

  group('Route configuration', () {
    test('login-related routes are listed correctly', () {
      final loginRoutes = AuthRedirectHandler.authRoutes;

      expect(loginRoutes, contains('/login'));
      expect(loginRoutes, contains('/biometric-unlock'));
    });

    test('public routes are listed correctly', () {
      final publicRoutes = AuthRedirectHandler.publicRoutes;

      expect(publicRoutes, contains('/about'));
      expect(publicRoutes, contains('/privacy'));
    });
  });
}
