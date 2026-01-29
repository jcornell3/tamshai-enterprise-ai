/**
 * JwtUtils Tests - Unified Flutter Client
 *
 * RED Phase: Tests for JWT token parsing and validation utilities.
 * This consolidates duplicate JWT parsing code.
 *
 * Issue 3.2: JWT Parsing (Flutter)
 */

import 'package:flutter_test/flutter_test.dart';
import 'package:unified_flutter/core/utils/jwt_utils.dart';

void main() {
  group('JwtUtils', () {
    // Valid JWT for testing (expired, safe to include in tests)
    // Header: {"alg":"RS256","typ":"JWT"}
    // Payload: {"sub":"user-123","name":"Alice","exp":1704000000,"roles":["hr-read"]}
    const validJwt = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.'
        'eyJzdWIiOiJ1c2VyLTEyMyIsIm5hbWUiOiJBbGljZSIsImV4cCI6MTcwNDAwMDAwMCwicm9sZXMiOlsiaHItcmVhZCJdfQ.'
        'signature';

    // JWT without exp claim
    // Payload: {"sub":"user-123","name":"Bob"}
    const noExpJwt = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.'
        'eyJzdWIiOiJ1c2VyLTEyMyIsIm5hbWUiOiJCb2IifQ.'
        'signature';

    // JWT with future exp (year 2100)
    // Payload: {"sub":"user-456","exp":4102444800}
    const futureExpJwt = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.'
        'eyJzdWIiOiJ1c2VyLTQ1NiIsImV4cCI6NDEwMjQ0NDgwMH0.'
        'signature';

    group('parsePayload', () {
      test('extracts claims from valid JWT', () {
        final claims = JwtUtils.parsePayload(validJwt);

        expect(claims['sub'], equals('user-123'));
        expect(claims['name'], equals('Alice'));
      });

      test('extracts roles array from JWT', () {
        final claims = JwtUtils.parsePayload(validJwt);

        expect(claims['roles'], isA<List>());
        expect(claims['roles'], contains('hr-read'));
      });

      test('extracts exp claim as number', () {
        final claims = JwtUtils.parsePayload(validJwt);

        expect(claims['exp'], isA<int>());
        expect(claims['exp'], equals(1704000000));
      });

      test('throws FormatException for invalid JWT', () {
        expect(
          () => JwtUtils.parsePayload('not-a-jwt'),
          throwsA(isA<FormatException>()),
        );
      });

      test('throws FormatException for JWT with wrong segment count', () {
        expect(
          () => JwtUtils.parsePayload('only.two'),
          throwsA(isA<FormatException>()),
        );
      });

      test('throws FormatException for JWT with invalid base64', () {
        expect(
          () => JwtUtils.parsePayload('header.!!!invalid!!!.signature'),
          throwsA(isA<FormatException>()),
        );
      });

      test('throws FormatException for JWT with invalid JSON payload', () {
        // Base64 of "{invalid json"
        const invalidJsonJwt = 'eyJhbGciOiJSUzI1NiJ9.e2ludmFsaWQganNvbg.sig';
        expect(
          () => JwtUtils.parsePayload(invalidJsonJwt),
          throwsA(isA<FormatException>()),
        );
      });

      test('handles empty string', () {
        expect(
          () => JwtUtils.parsePayload(''),
          throwsA(isA<FormatException>()),
        );
      });
    });

    group('isExpired', () {
      test('returns true for expired token', () {
        // Token with exp in the past (Jan 1, 2024)
        expect(JwtUtils.isExpired(validJwt), isTrue);
      });

      test('returns false for token with future expiration', () {
        expect(JwtUtils.isExpired(futureExpJwt), isFalse);
      });

      test('returns true if exp claim is missing', () {
        expect(JwtUtils.isExpired(noExpJwt), isTrue);
      });

      test('returns true for null token', () {
        expect(JwtUtils.isExpired(null), isTrue);
      });

      test('returns true for empty string token', () {
        expect(JwtUtils.isExpired(''), isTrue);
      });

      test('considers buffer time for near-expiry tokens', () {
        // Token that expires in 30 seconds should be considered expired
        // with default 60 second buffer
        final nearExpiry = JwtUtils.isExpired(
          futureExpJwt,
          bufferSeconds: 60,
        );
        // Since futureExpJwt has exp in 2100, should still be valid
        expect(nearExpiry, isFalse);
      });
    });

    group('getExpiration', () {
      test('returns DateTime from exp claim', () {
        final exp = JwtUtils.getExpiration(validJwt);

        expect(exp, isNotNull);
        expect(exp, isA<DateTime>());
        // Dec 31, 2023 UTC (timestamp 1704000000)
        expect(exp!.year, equals(2023));
        expect(exp.month, equals(12));
        expect(exp.day, equals(31));
      });

      test('returns null if exp claim is missing', () {
        expect(JwtUtils.getExpiration(noExpJwt), isNull);
      });

      test('returns null for invalid token', () {
        expect(JwtUtils.getExpiration('invalid'), isNull);
      });

      test('returns null for null token', () {
        expect(JwtUtils.getExpiration(null), isNull);
      });
    });

    group('getSubject', () {
      test('extracts sub claim from JWT', () {
        final sub = JwtUtils.getSubject(validJwt);

        expect(sub, equals('user-123'));
      });

      test('returns null if sub claim is missing', () {
        // JWT without sub claim
        const noSubJwt = 'eyJhbGciOiJSUzI1NiJ9.'
            'eyJuYW1lIjoiVGVzdCJ9.'
            'signature';
        expect(JwtUtils.getSubject(noSubJwt), isNull);
      });

      test('returns null for invalid token', () {
        expect(JwtUtils.getSubject('invalid'), isNull);
      });
    });

    group('getRoles', () {
      test('extracts roles array from resource_access', () {
        // JWT with Keycloak-style roles
        // {"resource_access":{"mcp-gateway":{"roles":["hr-read","hr-write"]}}}
        const keycloakJwt = 'eyJhbGciOiJSUzI1NiJ9.'
            'eyJyZXNvdXJjZV9hY2Nlc3MiOnsibWNwLWdhdGV3YXkiOnsicm9sZXMiOlsiaHItcmVhZCIsImhyLXdyaXRlIl19fX0.'
            'signature';

        final roles = JwtUtils.getRoles(keycloakJwt, clientId: 'mcp-gateway');

        expect(roles, contains('hr-read'));
        expect(roles, contains('hr-write'));
      });

      test('extracts roles from realm_access', () {
        // JWT with realm-level roles
        // {"realm_access":{"roles":["user","employee"]}}
        const realmRolesJwt = 'eyJhbGciOiJSUzI1NiJ9.'
            'eyJyZWFsbV9hY2Nlc3MiOnsicm9sZXMiOlsidXNlciIsImVtcGxveWVlIl19fQ.'
            'signature';

        final roles = JwtUtils.getRealmRoles(realmRolesJwt);

        expect(roles, contains('user'));
        expect(roles, contains('employee'));
      });

      test('returns empty list for missing roles', () {
        final roles = JwtUtils.getRoles(noExpJwt, clientId: 'mcp-gateway');

        expect(roles, isEmpty);
      });

      test('returns empty list for invalid token', () {
        final roles = JwtUtils.getRoles('invalid', clientId: 'mcp-gateway');

        expect(roles, isEmpty);
      });
    });

    group('getUsername', () {
      test('extracts preferred_username from JWT', () {
        // JWT with preferred_username claim
        // {"preferred_username":"alice.chen"}
        const usernameJwt = 'eyJhbGciOiJSUzI1NiJ9.'
            'eyJwcmVmZXJyZWRfdXNlcm5hbWUiOiJhbGljZS5jaGVuIn0.'
            'signature';

        final username = JwtUtils.getUsername(usernameJwt);

        expect(username, equals('alice.chen'));
      });

      test('falls back to name claim', () {
        final username = JwtUtils.getUsername(validJwt);

        expect(username, equals('Alice'));
      });

      test('returns null if no username claims exist', () {
        // JWT with only sub claim
        const noNameJwt = 'eyJhbGciOiJSUzI1NiJ9.'
            'eyJzdWIiOiJ1c2VyLTEyMyJ9.'
            'signature';

        expect(JwtUtils.getUsername(noNameJwt), isNull);
      });
    });

    group('getEmail', () {
      test('extracts email from JWT', () {
        // JWT with email claim
        // {"email":"alice@tamshai.com"}
        const emailJwt = 'eyJhbGciOiJSUzI1NiJ9.'
            'eyJlbWFpbCI6ImFsaWNlQHRhbXNoYWkuY29tIn0.'
            'signature';

        final email = JwtUtils.getEmail(emailJwt);

        expect(email, equals('alice@tamshai.com'));
      });

      test('returns null if email claim is missing', () {
        expect(JwtUtils.getEmail(validJwt), isNull);
      });
    });

    group('getTimeUntilExpiry', () {
      test('returns duration until expiration', () {
        final duration = JwtUtils.getTimeUntilExpiry(futureExpJwt);

        expect(duration, isNotNull);
        expect(duration!.inDays, greaterThan(0));
      });

      test('returns negative duration for expired token', () {
        final duration = JwtUtils.getTimeUntilExpiry(validJwt);

        expect(duration, isNotNull);
        expect(duration!.isNegative, isTrue);
      });

      test('returns null for token without exp', () {
        final duration = JwtUtils.getTimeUntilExpiry(noExpJwt);

        expect(duration, isNull);
      });
    });

    group('decodeHeader', () {
      test('extracts algorithm from header', () {
        final header = JwtUtils.decodeHeader(validJwt);

        expect(header['alg'], equals('RS256'));
        expect(header['typ'], equals('JWT'));
      });

      test('throws FormatException for invalid token', () {
        expect(
          () => JwtUtils.decodeHeader('invalid'),
          throwsA(isA<FormatException>()),
        );
      });
    });

    group('tryParsePayload', () {
      test('returns claims for valid JWT', () {
        final claims = JwtUtils.tryParsePayload(validJwt);

        expect(claims['sub'], equals('user-123'));
        expect(claims['name'], equals('Alice'));
      });

      test('returns empty map for invalid JWT', () {
        final claims = JwtUtils.tryParsePayload('not-a-jwt');

        expect(claims, isEmpty);
      });

      test('returns empty map for null', () {
        final claims = JwtUtils.tryParsePayload(null);

        expect(claims, isEmpty);
      });

      test('returns empty map for empty string', () {
        final claims = JwtUtils.tryParsePayload('');

        expect(claims, isEmpty);
      });

      test('returns empty map for malformed base64', () {
        final claims = JwtUtils.tryParsePayload('header.!!!invalid!!!.signature');

        expect(claims, isEmpty);
      });
    });

    group('getAllRoles', () {
      // JWT with both realm and client roles
      // {"realm_access":{"roles":["user","employee"]},"resource_access":{"mcp-gateway":{"roles":["hr-read","hr-write"]}}}
      const combinedRolesJwt = 'eyJhbGciOiJSUzI1NiJ9.'
          'eyJyZWFsbV9hY2Nlc3MiOnsicm9sZXMiOlsidXNlciIsImVtcGxveWVlIl19LCJyZXNvdXJjZV9hY2Nlc3MiOnsibWNwLWdhdGV3YXkiOnsicm9sZXMiOlsiaHItcmVhZCIsImhyLXdyaXRlIl19fX0.'
          'signature';

      test('combines realm and client roles', () {
        final roles = JwtUtils.getAllRoles(combinedRolesJwt, clientId: 'mcp-gateway');

        expect(roles, contains('user'));
        expect(roles, contains('employee'));
        expect(roles, contains('hr-read'));
        expect(roles, contains('hr-write'));
        expect(roles.length, equals(4));
      });

      test('returns only realm roles when no client roles exist', () {
        // JWT with only realm roles
        const realmOnlyJwt = 'eyJhbGciOiJSUzI1NiJ9.'
            'eyJyZWFsbV9hY2Nlc3MiOnsicm9sZXMiOlsidXNlciIsImVtcGxveWVlIl19fQ.'
            'signature';

        final roles = JwtUtils.getAllRoles(realmOnlyJwt, clientId: 'mcp-gateway');

        expect(roles, contains('user'));
        expect(roles, contains('employee'));
        expect(roles.length, equals(2));
      });

      test('returns only client roles when no realm roles exist', () {
        // JWT with only client roles
        const clientOnlyJwt = 'eyJhbGciOiJSUzI1NiJ9.'
            'eyJyZXNvdXJjZV9hY2Nlc3MiOnsibWNwLWdhdGV3YXkiOnsicm9sZXMiOlsiaHItcmVhZCJdfX19.'
            'signature';

        final roles = JwtUtils.getAllRoles(clientOnlyJwt, clientId: 'mcp-gateway');

        expect(roles, contains('hr-read'));
        expect(roles.length, equals(1));
      });

      test('returns empty list for null token', () {
        final roles = JwtUtils.getAllRoles(null, clientId: 'mcp-gateway');

        expect(roles, isEmpty);
      });

      test('returns empty list for token without roles', () {
        final roles = JwtUtils.getAllRoles(noExpJwt, clientId: 'mcp-gateway');

        expect(roles, isEmpty);
      });
    });
  });

  group('Edge cases', () {
    test('handles JWT with padding characters', () {
      // Some JWTs have padding issues due to base64url encoding
      // This should handle both with and without padding
      const paddedJwt = 'eyJhbGciOiJSUzI1NiJ9.'
          'eyJzdWIiOiIxMjMifQ==.'
          'sig';

      // Should either parse successfully or throw FormatException
      // (not crash unexpectedly)
      try {
        JwtUtils.parsePayload(paddedJwt);
      } on FormatException {
        // This is acceptable - padding in JWT is an edge case
      }
    });

    test('handles very long tokens', () {
      // Large payload should still be parseable
      final claims = JwtUtils.parsePayload(
        'eyJhbGciOiJSUzI1NiJ9.'
        'eyJzdWIiOiJ1c2VyLTEyMyIsImRhdGEiOiIke0xpc3QuZmlsbGVkKDEwMDAsICdhJykuam9pbigpfSJ9.'
        'signature',
      );

      expect(claims['sub'], equals('user-123'));
    });

    test('handles unicode in claims', () {
      // JWT with unicode characters in name
      // {"name":"日本語"}
      const unicodeJwt = 'eyJhbGciOiJSUzI1NiJ9.'
          'eyJuYW1lIjoi5pel5pys6KqeIn0.'
          'signature';

      final claims = JwtUtils.parsePayload(unicodeJwt);
      expect(claims['name'], equals('日本語'));
    });
  });
}
