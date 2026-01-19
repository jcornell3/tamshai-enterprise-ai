/// JwtUtils - Unified Flutter Client
///
/// JWT token parsing and validation utilities.
/// Consolidates duplicate JWT parsing code across the application.
///
/// Issue 3.2: JWT Parsing (Flutter)

import 'dart:convert';

/// Utility class for parsing and validating JWT tokens.
///
/// This class provides static methods for:
/// - Decoding JWT headers and payloads
/// - Checking token expiration
/// - Extracting common claims (sub, roles, email, etc.)
///
/// Note: This class does NOT verify JWT signatures.
/// Signature verification is handled by the Keycloak/auth server.
class JwtUtils {
  JwtUtils._(); // Private constructor - static only

  /// Parse the payload (claims) section of a JWT token.
  ///
  /// Throws [FormatException] if the token is malformed.
  ///
  /// Example:
  /// ```dart
  /// final claims = JwtUtils.parsePayload(token);
  /// final userId = claims['sub'];
  /// ```
  static Map<String, dynamic> parsePayload(String jwt) {
    if (jwt.isEmpty) {
      throw FormatException('JWT cannot be empty');
    }

    final parts = jwt.split('.');
    if (parts.length != 3) {
      throw FormatException(
        'Invalid JWT format: expected 3 parts, got ${parts.length}',
      );
    }

    final payload = parts[1];
    return _decodeSegment(payload);
  }

  /// Decode the header section of a JWT token.
  ///
  /// Throws [FormatException] if the token is malformed.
  ///
  /// Example:
  /// ```dart
  /// final header = JwtUtils.decodeHeader(token);
  /// final algorithm = header['alg']; // e.g., 'RS256'
  /// ```
  static Map<String, dynamic> decodeHeader(String jwt) {
    if (jwt.isEmpty) {
      throw FormatException('JWT cannot be empty');
    }

    final parts = jwt.split('.');
    if (parts.length != 3) {
      throw FormatException(
        'Invalid JWT format: expected 3 parts, got ${parts.length}',
      );
    }

    final header = parts[0];
    return _decodeSegment(header);
  }

  /// Check if a JWT token is expired.
  ///
  /// Returns `true` if:
  /// - The token is null or empty
  /// - The token is malformed
  /// - The token has no `exp` claim
  /// - The token's `exp` time has passed (considering buffer)
  ///
  /// [bufferSeconds] - Consider token expired this many seconds early
  ///                   (default: 0, useful for refresh before expiry)
  static bool isExpired(String? jwt, {int bufferSeconds = 0}) {
    if (jwt == null || jwt.isEmpty) {
      return true;
    }

    try {
      final claims = parsePayload(jwt);
      final exp = claims['exp'];

      if (exp == null) {
        return true;
      }

      final expirationTime = DateTime.fromMillisecondsSinceEpoch(
        (exp as int) * 1000,
        isUtc: true,
      );

      final now = DateTime.now().toUtc();
      final bufferedNow = now.add(Duration(seconds: bufferSeconds));

      return bufferedNow.isAfter(expirationTime);
    } catch (e) {
      // If we can't parse the token, consider it expired
      return true;
    }
  }

  /// Get the expiration time of a JWT token.
  ///
  /// Returns `null` if:
  /// - The token is null or empty
  /// - The token is malformed
  /// - The token has no `exp` claim
  static DateTime? getExpiration(String? jwt) {
    if (jwt == null || jwt.isEmpty) {
      return null;
    }

    try {
      final claims = parsePayload(jwt);
      final exp = claims['exp'];

      if (exp == null) {
        return null;
      }

      return DateTime.fromMillisecondsSinceEpoch(
        (exp as int) * 1000,
        isUtc: true,
      );
    } catch (e) {
      return null;
    }
  }

  /// Get the subject (user ID) from a JWT token.
  ///
  /// Returns the `sub` claim value, or `null` if not present.
  static String? getSubject(String? jwt) {
    if (jwt == null || jwt.isEmpty) {
      return null;
    }

    try {
      final claims = parsePayload(jwt);
      return claims['sub'] as String?;
    } catch (e) {
      return null;
    }
  }

  /// Get client roles from a Keycloak JWT token.
  ///
  /// Extracts roles from the `resource_access.<clientId>.roles` path.
  ///
  /// Returns an empty list if:
  /// - The token is invalid
  /// - No roles are found for the client
  ///
  /// Example:
  /// ```dart
  /// final roles = JwtUtils.getRoles(token, clientId: 'mcp-gateway');
  /// // ['hr-read', 'hr-write']
  /// ```
  static List<String> getRoles(String? jwt, {required String clientId}) {
    if (jwt == null || jwt.isEmpty) {
      return [];
    }

    try {
      final claims = parsePayload(jwt);
      final resourceAccess = claims['resource_access'] as Map<String, dynamic>?;

      if (resourceAccess == null) {
        return [];
      }

      final clientAccess = resourceAccess[clientId] as Map<String, dynamic>?;
      if (clientAccess == null) {
        return [];
      }

      final roles = clientAccess['roles'] as List<dynamic>?;
      if (roles == null) {
        return [];
      }

      return roles.cast<String>().toList();
    } catch (e) {
      return [];
    }
  }

  /// Get realm-level roles from a Keycloak JWT token.
  ///
  /// Extracts roles from the `realm_access.roles` path.
  ///
  /// Returns an empty list if:
  /// - The token is invalid
  /// - No realm roles are found
  ///
  /// Example:
  /// ```dart
  /// final roles = JwtUtils.getRealmRoles(token);
  /// // ['user', 'employee']
  /// ```
  static List<String> getRealmRoles(String? jwt) {
    if (jwt == null || jwt.isEmpty) {
      return [];
    }

    try {
      final claims = parsePayload(jwt);
      final realmAccess = claims['realm_access'] as Map<String, dynamic>?;

      if (realmAccess == null) {
        return [];
      }

      final roles = realmAccess['roles'] as List<dynamic>?;
      if (roles == null) {
        return [];
      }

      return roles.cast<String>().toList();
    } catch (e) {
      return [];
    }
  }

  /// Get the username from a JWT token.
  ///
  /// First tries `preferred_username`, then falls back to `name`.
  ///
  /// Returns `null` if neither claim is present.
  static String? getUsername(String? jwt) {
    if (jwt == null || jwt.isEmpty) {
      return null;
    }

    try {
      final claims = parsePayload(jwt);

      // Try preferred_username first (Keycloak standard)
      final preferredUsername = claims['preferred_username'] as String?;
      if (preferredUsername != null) {
        return preferredUsername;
      }

      // Fall back to name claim
      return claims['name'] as String?;
    } catch (e) {
      return null;
    }
  }

  /// Get the email from a JWT token.
  ///
  /// Returns the `email` claim value, or `null` if not present.
  static String? getEmail(String? jwt) {
    if (jwt == null || jwt.isEmpty) {
      return null;
    }

    try {
      final claims = parsePayload(jwt);
      return claims['email'] as String?;
    } catch (e) {
      return null;
    }
  }

  /// Get the time remaining until token expiration.
  ///
  /// Returns a [Duration] representing time until expiry.
  /// Returns negative duration if token is already expired.
  /// Returns `null` if token has no expiration or is invalid.
  static Duration? getTimeUntilExpiry(String? jwt) {
    final expiration = getExpiration(jwt);
    if (expiration == null) {
      return null;
    }

    final now = DateTime.now().toUtc();
    return expiration.difference(now);
  }

  /// Decode a base64url-encoded JWT segment.
  ///
  /// Handles JWT's base64url encoding which may lack padding.
  static Map<String, dynamic> _decodeSegment(String segment) {
    // Add padding if necessary (base64url may omit padding)
    String normalized = segment.replaceAll('-', '+').replaceAll('_', '/');

    switch (normalized.length % 4) {
      case 0:
        break; // No padding needed
      case 2:
        normalized += '==';
        break;
      case 3:
        normalized += '=';
        break;
      default:
        throw FormatException('Invalid base64 string');
    }

    try {
      final decoded = base64Decode(normalized);
      final jsonString = utf8.decode(decoded);
      final json = jsonDecode(jsonString);

      if (json is! Map<String, dynamic>) {
        throw FormatException('JWT segment is not a JSON object');
      }

      return json;
    } on FormatException {
      rethrow;
    } catch (e) {
      throw FormatException('Failed to decode JWT segment: $e');
    }
  }
}
