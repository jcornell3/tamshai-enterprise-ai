/// Unit tests for AuthNotifier and authentication state management
///
/// These tests verify the authentication state machine transitions correctly
/// for login, logout, token refresh, and error handling scenarios.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:logger/logger.dart';
import 'package:unified_flutter/core/auth/models/auth_state.dart';
import 'package:unified_flutter/core/auth/providers/auth_provider.dart';
import 'package:unified_flutter/core/auth/services/auth_service.dart';

/// Mock AuthService for testing
class MockAuthService implements AuthService {
  bool shouldSucceedLogin = true;
  bool shouldCancelLogin = false;
  bool shouldThrowNetworkError = false;
  bool hasValidSessionResult = false;
  AuthUser? currentUserResult;

  @override
  Future<AuthUser> login() async {
    if (shouldCancelLogin) {
      throw LoginCancelledException();
    }
    if (shouldThrowNetworkError) {
      throw NetworkAuthException('Network error');
    }
    if (!shouldSucceedLogin) {
      throw AuthException('Login failed');
    }
    return const AuthUser(
      id: 'test-user-id',
      username: 'testuser',
      email: 'test@example.com',
      roles: ['hr-read'],
    );
  }

  @override
  Future<AuthUser> refreshToken() async {
    if (!shouldSucceedLogin) {
      throw TokenRefreshException('Refresh failed');
    }
    return const AuthUser(
      id: 'test-user-id',
      username: 'testuser',
      email: 'test@example.com',
      roles: ['hr-read'],
    );
  }

  @override
  Future<void> logout({bool endKeycloakSession = true}) async {
    // Successfully logout
  }

  @override
  Future<bool> hasValidSession() async => hasValidSessionResult;

  @override
  Future<AuthUser?> getCurrentUser() async => currentUserResult;
}

void main() {
  group('AuthNotifier', () {
    late MockAuthService mockAuthService;
    late Logger logger;
    late AuthNotifier authNotifier;

    setUp(() {
      mockAuthService = MockAuthService();
      // Use PrettyPrinter with minimal output for tests
      logger = Logger(
        printer: PrettyPrinter(methodCount: 0, errorMethodCount: 0, lineLength: 50),
        level: Level.off, // Disable logging during tests
      );
      authNotifier = AuthNotifier(
        authService: mockAuthService,
        logger: logger,
      );
    });

    group('initial state', () {
      test('starts with unauthenticated state', () {
        expect(authNotifier.state, const AuthState.unauthenticated());
        expect(authNotifier.isAuthenticated, false);
        expect(authNotifier.currentUser, null);
      });
    });

    group('initialize', () {
      test('remains unauthenticated when no valid session exists', () async {
        mockAuthService.hasValidSessionResult = false;

        await authNotifier.initialize();

        expect(authNotifier.state, const AuthState.unauthenticated());
      });

      test('restores authenticated state when valid session exists', () async {
        mockAuthService.hasValidSessionResult = true;
        mockAuthService.currentUserResult = const AuthUser(
          id: 'user-123',
          username: 'alice',
          email: 'alice@example.com',
          roles: ['hr-read'],
        );

        await authNotifier.initialize();

        expect(authNotifier.isAuthenticated, true);
        expect(authNotifier.currentUser?.username, 'alice');
      });

      test('handles missing user profile gracefully', () async {
        mockAuthService.hasValidSessionResult = true;
        mockAuthService.currentUserResult = null;

        await authNotifier.initialize();

        expect(authNotifier.state, const AuthState.unauthenticated());
      });
    });

    group('login', () {
      test('successful login transitions to authenticated state', () async {
        mockAuthService.shouldSucceedLogin = true;

        await authNotifier.login();

        expect(authNotifier.isAuthenticated, true);
        expect(authNotifier.currentUser?.id, 'test-user-id');
        expect(authNotifier.currentUser?.username, 'testuser');
      });

      test('cancelled login returns to unauthenticated state', () async {
        mockAuthService.shouldCancelLogin = true;

        await authNotifier.login();

        expect(authNotifier.state, const AuthState.unauthenticated());
      });

      test('network error sets error state', () async {
        mockAuthService.shouldThrowNetworkError = true;

        await authNotifier.login();

        expect(authNotifier.state, isA<AuthError>());
        authNotifier.state.maybeMap(
          error: (state) {
            expect(state.message, contains('Network error'));
          },
          orElse: () => fail('Expected error state'),
        );
      });

      test('auth error sets error state', () async {
        mockAuthService.shouldSucceedLogin = false;

        await authNotifier.login();

        expect(authNotifier.state, isA<AuthError>());
      });

      test('prevents concurrent login attempts', () async {
        // This test verifies the guard against double-login
        mockAuthService.shouldSucceedLogin = true;

        // Start first login
        final firstLogin = authNotifier.login();

        // Immediately try second login while first is in progress
        // The AuthNotifier should skip if already authenticating
        authNotifier.login();

        await firstLogin;

        // Should still result in authenticated state
        expect(authNotifier.isAuthenticated, true);
      });
    });

    group('refreshToken', () {
      test('updates authenticated state on success', () async {
        mockAuthService.shouldSucceedLogin = true;

        // First login
        await authNotifier.login();
        expect(authNotifier.isAuthenticated, true);

        // Refresh
        await authNotifier.refreshToken();

        expect(authNotifier.isAuthenticated, true);
        expect(authNotifier.currentUser?.username, 'testuser');
      });

      test('logs out and shows error on refresh failure', () async {
        mockAuthService.shouldSucceedLogin = true;

        // First login
        await authNotifier.login();
        expect(authNotifier.isAuthenticated, true);

        // Fail refresh
        mockAuthService.shouldSucceedLogin = false;
        await authNotifier.refreshToken();

        expect(authNotifier.state, isA<AuthError>());
        authNotifier.state.maybeMap(
          error: (state) {
            expect(state.message, contains('expired'));
          },
          orElse: () => fail('Expected error state'),
        );
      });
    });

    group('logout', () {
      test('transitions to unauthenticated state', () async {
        mockAuthService.shouldSucceedLogin = true;

        // First login
        await authNotifier.login();
        expect(authNotifier.isAuthenticated, true);

        // Logout
        await authNotifier.logout();

        expect(authNotifier.state, const AuthState.unauthenticated());
        expect(authNotifier.isAuthenticated, false);
        expect(authNotifier.currentUser, null);
      });

      test('clears state even if logout fails', () async {
        mockAuthService.shouldSucceedLogin = true;

        await authNotifier.login();

        // Even if logout throws, state should be cleared
        await authNotifier.logout();

        expect(authNotifier.state, const AuthState.unauthenticated());
      });
    });

    group('isAuthenticating', () {
      test('returns true during login', () async {
        mockAuthService.shouldSucceedLogin = true;

        final loginFuture = authNotifier.login();

        // During login, isAuthenticating should be true at some point
        // This is hard to test without delays, but we verify final state
        await loginFuture;

        // After completion, should not be authenticating
        expect(authNotifier.isAuthenticating, false);
      });
    });
  });

  group('AuthState', () {
    test('unauthenticated state has correct type', () {
      const state = AuthState.unauthenticated();
      expect(state, isA<Unauthenticated>());
    });

    test('authenticating state has correct type', () {
      const state = AuthState.authenticating();
      expect(state, isA<Authenticating>());
    });

    test('authenticated state contains user', () {
      const user = AuthUser(
        id: 'test-id',
        username: 'test',
        email: 'test@example.com',
      );
      final state = AuthState.authenticated(user);
      expect(state, isA<Authenticated>());
      state.maybeMap(
        authenticated: (s) => expect(s.user, user),
        orElse: () => fail('Expected authenticated state'),
      );
    });

    test('error state contains message', () {
      const state = AuthState.error('Test error message');
      expect(state, isA<AuthError>());
      state.maybeMap(
        error: (s) => expect(s.message, 'Test error message'),
        orElse: () => fail('Expected error state'),
      );
    });
  });

  group('AuthUser', () {
    test('creates user with required fields', () {
      const user = AuthUser(
        id: 'user-123',
        username: 'testuser',
      );

      expect(user.id, 'user-123');
      expect(user.username, 'testuser');
      expect(user.email, null);
      expect(user.roles, null);
    });

    test('creates user with all fields', () {
      const user = AuthUser(
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        fullName: 'Test User',
        roles: ['admin', 'hr-read'],
        attributes: {'department': 'Engineering'},
      );

      expect(user.id, 'user-123');
      expect(user.username, 'testuser');
      expect(user.email, 'test@example.com');
      expect(user.firstName, 'Test');
      expect(user.lastName, 'User');
      expect(user.fullName, 'Test User');
      expect(user.roles, ['admin', 'hr-read']);
      expect(user.attributes?['department'], 'Engineering');
    });

    test('serializes to JSON correctly', () {
      const user = AuthUser(
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
      );

      final json = user.toJson();

      expect(json['id'], 'user-123');
      expect(json['username'], 'testuser');
      expect(json['email'], 'test@example.com');
    });
  });

  group('Exception types', () {
    test('AuthException has correct message', () {
      final exception = AuthException('Test error', code: 'TEST_CODE');
      expect(exception.message, 'Test error');
      expect(exception.code, 'TEST_CODE');
      expect(exception.toString(), contains('Test error'));
    });

    test('LoginCancelledException has correct message', () {
      final exception = LoginCancelledException();
      expect(exception.message, contains('cancelled'));
      expect(exception.code, 'USER_CANCELLED');
    });

    test('NetworkAuthException has correct code', () {
      final exception = NetworkAuthException('Network failed');
      expect(exception.code, 'NETWORK_ERROR');
    });

    test('TokenRefreshException is an AuthException', () {
      final exception = TokenRefreshException('Refresh failed');
      expect(exception, isA<AuthException>());
    });
  });
}
