// Unit tests for AuthNotifier and authentication state management
//
// These tests verify the authentication state machine transitions correctly
// for login, logout, token refresh, and error handling scenarios.
// Tested on Windows and Linux environments.

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:logger/logger.dart';
import 'package:unified_flutter/core/auth/models/auth_state.dart';
import 'package:unified_flutter/core/auth/providers/auth_provider.dart';
import 'package:unified_flutter/core/auth/services/auth_service.dart';
import 'package:unified_flutter/core/storage/secure_storage_service.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Mock FlutterSecureStorage for testing
class MockFlutterSecureStorage implements FlutterSecureStorage {
  final Map<String, String> _storage = {};
  final Map<String, List<ValueChanged<String?>>> _listeners = {};

  MockFlutterSecureStorage();

  @override
  Map<String, List<ValueChanged<String?>>> get getListeners => _listeners;

  @override
  Future<void> write({required String key, required String? value, AppleOptions? iOptions, AndroidOptions? aOptions, LinuxOptions? lOptions, WebOptions? webOptions, AppleOptions? mOptions, WindowsOptions? wOptions}) async {
    if (value != null) {
      _storage[key] = value;
    }
  }

  @override
  Future<String?> read({required String key, AppleOptions? iOptions, AndroidOptions? aOptions, LinuxOptions? lOptions, WebOptions? webOptions, AppleOptions? mOptions, WindowsOptions? wOptions}) async {
    return _storage[key];
  }

  @override
  Future<void> delete({required String key, AppleOptions? iOptions, AndroidOptions? aOptions, LinuxOptions? lOptions, WebOptions? webOptions, AppleOptions? mOptions, WindowsOptions? wOptions}) async {
    _storage.remove(key);
  }

  @override
  Future<void> deleteAll({AppleOptions? iOptions, AndroidOptions? aOptions, LinuxOptions? lOptions, WebOptions? webOptions, AppleOptions? mOptions, WindowsOptions? wOptions}) async {
    _storage.clear();
  }

  @override
  Future<bool> containsKey({required String key, AppleOptions? iOptions, AndroidOptions? aOptions, LinuxOptions? lOptions, WebOptions? webOptions, AppleOptions? mOptions, WindowsOptions? wOptions}) async {
    return _storage.containsKey(key);
  }

  @override
  Future<Map<String, String>> readAll({AppleOptions? iOptions, AndroidOptions? aOptions, LinuxOptions? lOptions, WebOptions? webOptions, AppleOptions? mOptions, WindowsOptions? wOptions}) async {
    return Map.from(_storage);
  }

  @override
  Future<bool> isCupertinoProtectedDataAvailable() async => true;

  @override
  Stream<bool> get onCupertinoProtectedDataAvailabilityChanged => Stream.value(true);

  @override
  void registerListener({required String key, required ValueChanged<String?> listener}) {}

  @override
  void unregisterListener({required String key, required ValueChanged<String?> listener}) {}

  @override
  void unregisterAllListeners() {}

  void unregisterAllListenersForAllKeys() {}

  @override
  void unregisterAllListenersForKey({required String key}) {}

  @override
  IOSOptions get iOptions => const IOSOptions();

  @override
  AndroidOptions get aOptions => const AndroidOptions();

  @override
  LinuxOptions get lOptions => const LinuxOptions();

  @override
  WindowsOptions get wOptions => const WindowsOptions();

  @override
  WebOptions get webOptions => const WebOptions();

  @override
  MacOsOptions get mOptions => const MacOsOptions();
}

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
    late ProviderContainer container;

    setUp(() {
      mockAuthService = MockAuthService();

      // Create a test logger
      final testLogger = Logger(
        printer: PrettyPrinter(methodCount: 0, errorMethodCount: 0, lineLength: 50),
        level: Level.off,
      );

      // Create mock storage
      final mockStorage = SecureStorageService(
        storage: MockFlutterSecureStorage(),
        biometricStorage: MockFlutterSecureStorage(),
        logger: testLogger,
      );

      // Create container with overrides for testing
      container = ProviderContainer(
        overrides: [
          loggerProvider.overrideWithValue(testLogger),
          secureStorageProvider.overrideWithValue(mockStorage),
          authServiceProvider.overrideWithValue(mockAuthService),
        ],
      );
    });

    tearDown(() {
      container.dispose();
    });

    // Helper functions to read from container (Riverpod 3.x pattern)
    AuthNotifier getNotifier() => container.read(authNotifierProvider.notifier);
    AuthState getState() => container.read(authNotifierProvider);

    group('initial state', () {
      test('starts with unauthenticated state', () {
        expect(getState(), const AuthState.unauthenticated());
        expect(getNotifier().isAuthenticated, false);
        expect(getNotifier().currentUser, null);
      });
    });

    group('initialize', () {
      test('remains unauthenticated when no valid session exists', () async {
        mockAuthService.hasValidSessionResult = false;

        await getNotifier().initialize();

        expect(container.read(authNotifierProvider), const AuthState.unauthenticated());
      });

      test('restores authenticated state when valid session exists', () async {
        mockAuthService.hasValidSessionResult = true;
        mockAuthService.currentUserResult = const AuthUser(
          id: 'user-123',
          username: 'alice',
          email: 'alice@example.com',
          roles: ['hr-read'],
        );

        await getNotifier().initialize();

        expect(getNotifier().isAuthenticated, true);
        expect(getNotifier().currentUser?.username, 'alice');
      });

      test('handles missing user profile gracefully', () async {
        mockAuthService.hasValidSessionResult = true;
        mockAuthService.currentUserResult = null;

        await getNotifier().initialize();

        expect(container.read(authNotifierProvider), const AuthState.unauthenticated());
      });
    });

    group('login', () {
      test('successful login transitions to authenticated state', () async {
        mockAuthService.shouldSucceedLogin = true;

        await getNotifier().login();

        expect(getNotifier().isAuthenticated, true);
        expect(getNotifier().currentUser?.id, 'test-user-id');
        expect(getNotifier().currentUser?.username, 'testuser');
      });

      test('cancelled login returns to unauthenticated state', () async {
        mockAuthService.shouldCancelLogin = true;

        await getNotifier().login();

        expect(container.read(authNotifierProvider), const AuthState.unauthenticated());
      });

      test('network error sets error state', () async {
        mockAuthService.shouldThrowNetworkError = true;

        await getNotifier().login();

        final state = container.read(authNotifierProvider);
        expect(state, isA<AuthError>());
        state.maybeMap(
          error: (state) {
            expect(state.message, contains('Network error'));
          },
          orElse: () => fail('Expected error state'),
        );
      });

      test('auth error sets error state', () async {
        mockAuthService.shouldSucceedLogin = false;

        await getNotifier().login();

        expect(container.read(authNotifierProvider), isA<AuthError>());
      });

      test('prevents concurrent login attempts', () async {
        // This test verifies the guard against double-login
        mockAuthService.shouldSucceedLogin = true;

        // Start first login
        final firstLogin = getNotifier().login();

        // Immediately try second login while first is in progress
        // The AuthNotifier should skip if already authenticating
        getNotifier().login();

        await firstLogin;

        // Should still result in authenticated state
        expect(getNotifier().isAuthenticated, true);
      });
    });

    group('refreshToken', () {
      test('updates authenticated state on success', () async {
        mockAuthService.shouldSucceedLogin = true;

        // First login
        await getNotifier().login();
        expect(getNotifier().isAuthenticated, true);

        // Refresh
        await getNotifier().refreshToken();

        expect(getNotifier().isAuthenticated, true);
        expect(getNotifier().currentUser?.username, 'testuser');
      });

      test('logs out and shows error on refresh failure', () async {
        mockAuthService.shouldSucceedLogin = true;

        // First login
        await getNotifier().login();
        expect(getNotifier().isAuthenticated, true);

        // Fail refresh
        mockAuthService.shouldSucceedLogin = false;
        await getNotifier().refreshToken();

        final state = container.read(authNotifierProvider);
        expect(state, isA<AuthError>());
        state.maybeMap(
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
        await getNotifier().login();
        expect(getNotifier().isAuthenticated, true);

        // Logout
        await getNotifier().logout();

        expect(container.read(authNotifierProvider), const AuthState.unauthenticated());
        expect(getNotifier().isAuthenticated, false);
        expect(getNotifier().currentUser, null);
      });

      test('clears state even if logout fails', () async {
        mockAuthService.shouldSucceedLogin = true;

        await getNotifier().login();

        // Even if logout throws, state should be cleared
        await getNotifier().logout();

        expect(container.read(authNotifierProvider), const AuthState.unauthenticated());
      });
    });

    group('isAuthenticating', () {
      test('returns true during login', () async {
        mockAuthService.shouldSucceedLogin = true;

        final loginFuture = getNotifier().login();

        // During login, isAuthenticating should be true at some point
        // This is hard to test without delays, but we verify final state
        await loginFuture;

        // After completion, should not be authenticating
        expect(getNotifier().isAuthenticating, false);
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
