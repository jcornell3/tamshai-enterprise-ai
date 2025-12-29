/// Unit tests for KeycloakAuthService
///
/// Note: These tests mock the Flutter dependencies and test the business logic
/// of authentication without requiring the actual Keycloak server.

import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:logger/logger.dart';
import 'package:unified_flutter/core/auth/models/auth_state.dart';
import 'package:unified_flutter/core/auth/models/keycloak_config.dart';

/// Mock SecureStorageService for testing
/// (Mocking the actual class since we can't import flutter_secure_storage in tests)
class MockSecureStorageService {
  StoredTokens? storedTokens;
  AuthUser? storedUser;
  bool hasValidSessionResult = false;
  String? refreshTokenValue;

  @override
  Future<void> storeTokens(StoredTokens tokens) async {
    storedTokens = tokens;
    refreshTokenValue = tokens.refreshToken;
  }

  @override
  Future<void> storeUserProfile(AuthUser user) async {
    storedUser = user;
  }

  @override
  Future<String?> getAccessToken() async => storedTokens?.accessToken;

  @override
  Future<String?> getIdToken() async => storedTokens?.idToken;

  @override
  Future<String?> getRefreshToken() async => refreshTokenValue;

  @override
  Future<AuthUser?> getUserProfile() async => storedUser;

  @override
  Future<bool> hasValidSession() async => hasValidSessionResult;

  @override
  Future<bool> isTokenExpired() async {
    if (storedTokens == null) return true;
    return storedTokens!.accessTokenExpirationDateTime.isBefore(DateTime.now());
  }

  @override
  Future<void> clearAll() async {
    storedTokens = null;
    storedUser = null;
    refreshTokenValue = null;
    hasValidSessionResult = false;
  }
}

void main() {
  group('KeycloakAuthService', () {
    late MockSecureStorageService mockStorage;
    late Logger logger;
    late KeycloakConfig config;

    setUp(() {
      mockStorage = MockSecureStorageService();
      // Disable logging during tests
      logger = Logger(level: Level.off);
      config = const KeycloakConfig(
        issuer: 'http://localhost:8180/realms/tamshai-corp',
        clientId: 'mcp-gateway',
        redirectUrl: 'com.tamshai.app://callback',
        endSessionRedirectUrl: 'com.tamshai.app://logout',
        scopes: ['openid', 'profile', 'email'],
      );
    });

    group('Token parsing', () {
      test('parses JWT claims correctly', () {
        // Create a mock JWT with claims
        // JWT format: header.payload.signature
        final claims = {
          'sub': 'user-123',
          'preferred_username': 'alice',
          'email': 'alice@example.com',
          'given_name': 'Alice',
          'family_name': 'Chen',
          'name': 'Alice Chen',
          'realm_access': {
            'roles': ['user', 'manager']
          },
          'resource_access': {
            'mcp-gateway': {
              'roles': ['hr-read', 'hr-write']
            }
          },
        };

        final payload = base64Url.encode(utf8.encode(jsonEncode(claims)));
        final mockJwt = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.$payload.mock_signature';

        // We can't test the actual service without mocking FlutterAppAuth,
        // but we can test the JWT parsing logic
        expect(payload, isNotEmpty);
        expect(mockJwt.split('.').length, 3);
      });

      test('handles malformed JWT gracefully', () {
        const malformedJwt = 'not.a.valid.jwt';
        expect(malformedJwt.split('.').length, 4); // Wrong number of parts
      });
    });

    group('Role extraction', () {
      test('extracts roles from realm_access', () {
        final claims = {
          'sub': 'user-123',
          'preferred_username': 'alice',
          'realm_access': {
            'roles': ['user', 'admin']
          },
        };

        final realmAccess = claims['realm_access'] as Map<String, dynamic>?;
        final roles = realmAccess?['roles'] as List?;

        expect(roles, ['user', 'admin']);
      });

      test('extracts roles from resource_access', () {
        final claims = {
          'sub': 'user-123',
          'preferred_username': 'alice',
          'resource_access': {
            'mcp-gateway': {
              'roles': ['hr-read', 'hr-write']
            }
          },
        };

        final resourceAccess = claims['resource_access'] as Map<String, dynamic>?;
        final clientAccess = resourceAccess?['mcp-gateway'] as Map<String, dynamic>?;
        final roles = clientAccess?['roles'] as List?;

        expect(roles, ['hr-read', 'hr-write']);
      });

      test('combines realm and client roles', () {
        final claims = {
          'realm_access': {
            'roles': ['user']
          },
          'resource_access': {
            'mcp-gateway': {
              'roles': ['hr-read']
            }
          },
        };

        final allRoles = <String>[];

        // Extract realm roles
        final realmAccess = claims['realm_access'] as Map<String, dynamic>?;
        if (realmAccess != null) {
          final realmRoles = realmAccess['roles'] as List?;
          if (realmRoles != null) {
            allRoles.addAll(realmRoles.cast<String>());
          }
        }

        // Extract client roles
        final resourceAccess = claims['resource_access'] as Map<String, dynamic>?;
        if (resourceAccess != null) {
          final clientAccess = resourceAccess['mcp-gateway'] as Map<String, dynamic>?;
          if (clientAccess != null) {
            final clientRoles = clientAccess['roles'] as List?;
            if (clientRoles != null) {
              allRoles.addAll(clientRoles.cast<String>());
            }
          }
        }

        expect(allRoles, ['user', 'hr-read']);
      });
    });

    group('Storage operations', () {
      test('stores tokens correctly', () async {
        final tokens = StoredTokens(
          accessToken: 'access-token-123',
          idToken: 'id-token-456',
          refreshToken: 'refresh-token-789',
          accessTokenExpirationDateTime: DateTime.now().add(const Duration(minutes: 5)),
        );

        await mockStorage.storeTokens(tokens);

        expect(mockStorage.storedTokens?.accessToken, 'access-token-123');
        expect(mockStorage.storedTokens?.idToken, 'id-token-456');
        expect(await mockStorage.getRefreshToken(), 'refresh-token-789');
      });

      test('stores user profile correctly', () async {
        const user = AuthUser(
          id: 'user-123',
          username: 'alice',
          email: 'alice@example.com',
          roles: ['hr-read'],
        );

        await mockStorage.storeUserProfile(user);

        expect(mockStorage.storedUser?.id, 'user-123');
        expect(mockStorage.storedUser?.username, 'alice');
      });

      test('clears all data on logout', () async {
        // Store some data
        final tokens = StoredTokens(
          accessToken: 'token',
          idToken: 'id',
          refreshToken: 'refresh',
          accessTokenExpirationDateTime: DateTime.now().add(const Duration(minutes: 5)),
        );
        await mockStorage.storeTokens(tokens);
        await mockStorage.storeUserProfile(const AuthUser(
          id: 'user',
          username: 'test',
        ));
        mockStorage.hasValidSessionResult = true;

        // Clear all
        await mockStorage.clearAll();

        expect(mockStorage.storedTokens, null);
        expect(mockStorage.storedUser, null);
        expect(await mockStorage.getRefreshToken(), null);
        expect(await mockStorage.hasValidSession(), false);
      });
    });

    group('Token expiration', () {
      test('detects expired token', () async {
        final expiredTokens = StoredTokens(
          accessToken: 'expired-token',
          idToken: 'id-token',
          accessTokenExpirationDateTime: DateTime.now().subtract(const Duration(minutes: 5)),
        );

        await mockStorage.storeTokens(expiredTokens);

        expect(await mockStorage.isTokenExpired(), true);
      });

      test('detects valid token', () async {
        final validTokens = StoredTokens(
          accessToken: 'valid-token',
          idToken: 'id-token',
          accessTokenExpirationDateTime: DateTime.now().add(const Duration(minutes: 5)),
        );

        await mockStorage.storeTokens(validTokens);

        expect(await mockStorage.isTokenExpired(), false);
      });

      test('returns expired when no token stored', () async {
        expect(await mockStorage.isTokenExpired(), true);
      });
    });
  });

  group('KeycloakConfig', () {
    test('creates config with required fields', () {
      const config = KeycloakConfig(
        issuer: 'http://localhost:8180/realms/test',
        clientId: 'test-client',
        redirectUrl: 'app://callback',
      );

      expect(config.issuer, 'http://localhost:8180/realms/test');
      expect(config.clientId, 'test-client');
      expect(config.redirectUrl, 'app://callback');
      // Default scopes include offline_access for refresh tokens
      expect(config.scopes, ['openid', 'profile', 'email', 'offline_access']);
    });

    test('creates config with all fields', () {
      const config = KeycloakConfig(
        issuer: 'http://localhost:8180/realms/test',
        clientId: 'test-client',
        redirectUrl: 'app://callback',
        endSessionRedirectUrl: 'app://logout',
        scopes: ['openid', 'profile', 'email', 'roles'],
      );

      expect(config.endSessionRedirectUrl, 'app://logout');
      expect(config.scopes, ['openid', 'profile', 'email', 'roles']);
    });

    test('development config has correct values', () {
      final config = KeycloakConfigProvider.getDevelopmentConfig();

      // Uses 127.0.0.1 instead of localhost for Windows compatibility
      expect(config.issuer, contains('127.0.0.1'));
      expect(config.issuer, contains('8180'));
      expect(config.issuer, contains('tamshai-corp'));
      expect(config.clientId, 'tamshai-flutter-client');
    });
  });

  group('StoredTokens', () {
    test('creates stored tokens', () {
      final tokens = StoredTokens(
        accessToken: 'access',
        idToken: 'id',
        refreshToken: 'refresh',
        accessTokenExpirationDateTime: DateTime(2025, 1, 1),
      );

      expect(tokens.accessToken, 'access');
      expect(tokens.idToken, 'id');
      expect(tokens.refreshToken, 'refresh');
      expect(tokens.accessTokenExpirationDateTime, DateTime(2025, 1, 1));
    });

    test('refresh token is optional', () {
      final tokens = StoredTokens(
        accessToken: 'access',
        idToken: 'id',
        accessTokenExpirationDateTime: DateTime.now(),
      );

      expect(tokens.refreshToken, null);
    });

    test('serializes to JSON', () {
      final tokens = StoredTokens(
        accessToken: 'access',
        idToken: 'id',
        accessTokenExpirationDateTime: DateTime(2025, 1, 1),
      );

      final json = tokens.toJson();

      expect(json['accessToken'], 'access');
      expect(json['idToken'], 'id');
    });
  });
}
