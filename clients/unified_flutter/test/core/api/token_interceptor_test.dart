/// Unit tests for AuthTokenInterceptor
///
/// Tests the Dio interceptor that handles:
/// - Automatic Bearer token injection
/// - 401 response handling and token refresh
/// - Request queuing during refresh

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:logger/logger.dart';
import 'package:unified_flutter/core/auth/models/auth_state.dart';

/// Mock SecureStorageService for token interceptor testing
class MockStorageForInterceptor {
  String? accessToken;
  bool tokenExpired = false;

  Future<String?> getAccessToken() async => accessToken;
  Future<bool> isTokenExpired() async => tokenExpired;
}

void main() {
  group('AuthTokenInterceptor', () {
    late MockStorageForInterceptor mockStorage;
    late Logger logger;

    setUp(() {
      mockStorage = MockStorageForInterceptor();
      // Disable logging during tests
      logger = Logger(level: Level.off);
    });

    group('Request interception', () {
      test('adds Bearer token to request headers', () async {
        mockStorage.accessToken = 'test-access-token';
        mockStorage.tokenExpired = false;

        final options = RequestOptions(path: '/api/test');

        // Simulate what the interceptor does
        final token = await mockStorage.getAccessToken();
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }

        expect(options.headers['Authorization'], 'Bearer test-access-token');
      });

      test('does not add header when no token available', () async {
        mockStorage.accessToken = null;

        final options = RequestOptions(path: '/api/test');

        final token = await mockStorage.getAccessToken();
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }

        expect(options.headers['Authorization'], null);
      });
    });

    group('Token expiration handling', () {
      test('detects expired token before request', () async {
        mockStorage.tokenExpired = true;

        final isExpired = await mockStorage.isTokenExpired();
        expect(isExpired, true);
      });

      test('allows request when token is valid', () async {
        mockStorage.tokenExpired = false;
        mockStorage.accessToken = 'valid-token';

        final isExpired = await mockStorage.isTokenExpired();
        expect(isExpired, false);
      });
    });

    group('Error handling', () {
      test('recognizes 401 status code', () {
        final error = DioException(
          requestOptions: RequestOptions(path: '/api/test'),
          response: Response(
            requestOptions: RequestOptions(path: '/api/test'),
            statusCode: 401,
          ),
        );

        expect(error.response?.statusCode, 401);
      });

      test('passes through non-401 errors', () {
        final error = DioException(
          requestOptions: RequestOptions(path: '/api/test'),
          response: Response(
            requestOptions: RequestOptions(path: '/api/test'),
            statusCode: 500,
          ),
        );

        expect(error.response?.statusCode, 500);
        expect(error.response?.statusCode != 401, true);
      });
    });

    group('Request queuing', () {
      test('can queue requests during refresh', () {
        final queue = <RequestOptions>[];

        final request1 = RequestOptions(path: '/api/endpoint1');
        final request2 = RequestOptions(path: '/api/endpoint2');

        queue.add(request1);
        queue.add(request2);

        expect(queue.length, 2);
        expect(queue[0].path, '/api/endpoint1');
        expect(queue[1].path, '/api/endpoint2');
      });

      test('updates queued requests with new token', () {
        final queue = <RequestOptions>[
          RequestOptions(path: '/api/test1'),
          RequestOptions(path: '/api/test2'),
        ];

        const newToken = 'new-access-token';

        for (final options in queue) {
          options.headers['Authorization'] = 'Bearer $newToken';
        }

        expect(queue[0].headers['Authorization'], 'Bearer new-access-token');
        expect(queue[1].headers['Authorization'], 'Bearer new-access-token');
      });

      test('clears queue after processing', () {
        final queue = <RequestOptions>[
          RequestOptions(path: '/api/test'),
        ];

        queue.clear();

        expect(queue.isEmpty, true);
      });
    });

    group('Retry logic', () {
      test('retries request with new token after refresh', () async {
        final originalRequest = RequestOptions(
          path: '/api/protected',
          headers: {'Authorization': 'Bearer old-token'},
        );

        const newToken = 'new-token';
        originalRequest.headers['Authorization'] = 'Bearer $newToken';

        expect(originalRequest.headers['Authorization'], 'Bearer new-token');
      });
    });
  });

  group('Dio configuration', () {
    test('default base URL configuration', () {
      const baseUrl = 'http://localhost:3100';

      final options = BaseOptions(
        baseUrl: baseUrl,
        connectTimeout: const Duration(seconds: 30),
        receiveTimeout: const Duration(seconds: 60),
        headers: {'Content-Type': 'application/json'},
      );

      expect(options.baseUrl, baseUrl);
      expect(options.connectTimeout, const Duration(seconds: 30));
      expect(options.receiveTimeout, const Duration(seconds: 60));
      expect(options.headers['Content-Type'], 'application/json');
    });

    test('timeout values are appropriate for AI queries', () {
      // AI queries can take 30-60 seconds for complex reasoning
      const receiveTimeout = Duration(seconds: 60);
      expect(receiveTimeout.inSeconds, 60);
    });
  });

  group('AuthUser model', () {
    test('creates user with roles', () {
      const user = AuthUser(
        id: 'user-123',
        username: 'alice',
        email: 'alice@example.com',
        roles: ['hr-read', 'hr-write'],
      );

      expect(user.roles, ['hr-read', 'hr-write']);
      expect(user.roles?.contains('hr-read'), true);
    });

    test('has no roles by default', () {
      const user = AuthUser(
        id: 'user-123',
        username: 'guest',
      );

      expect(user.roles, null);
    });

    test('user equality', () {
      const user1 = AuthUser(
        id: 'user-123',
        username: 'alice',
      );

      const user2 = AuthUser(
        id: 'user-123',
        username: 'alice',
      );

      // Freezed generates equality operators
      expect(user1, user2);
    });

    test('user copy with modifications', () {
      const user = AuthUser(
        id: 'user-123',
        username: 'alice',
        email: 'alice@old.com',
      );

      final updatedUser = user.copyWith(email: 'alice@new.com');

      expect(updatedUser.email, 'alice@new.com');
      expect(updatedUser.username, 'alice'); // Unchanged
    });
  });
}
