import 'dart:convert';
import 'dart:io';

import 'package:logger/logger.dart';

import '../models/auth_state.dart';
import '../models/keycloak_config.dart';
import '../../storage/secure_storage_service.dart';
import '../../utils/jwt_utils.dart';
import 'auth_service.dart';

/// Direct Grant (Resource Owner Password Credentials) auth service
///
/// For mobile platforms (iOS/Android) - provides native login experience
/// without browser redirect.
///
/// Flow:
/// 1. User enters username/password in native UI
/// 2. App sends credentials directly to Keycloak token endpoint
/// 3. If TOTP required, Keycloak returns error with session info
/// 4. User enters TOTP code
/// 5. App sends credentials + TOTP to complete authentication
/// 6. Store tokens and return user profile
class DirectGrantAuthService implements AuthService {
  final SecureStorageService _storage;
  final KeycloakConfig _config;
  final Logger _logger;

  DirectGrantAuthService({
    required KeycloakConfig config,
    required SecureStorageService storage,
    Logger? logger,
  })  : _config = config,
        _storage = storage,
        _logger = logger ?? Logger();

  /// Login is not supported directly - use loginWithCredentials instead
  @override
  Future<AuthUser> login() async {
    throw AuthException(
      'DirectGrantAuthService requires credentials. Use loginWithCredentials() instead.',
    );
  }

  /// Authenticate with username and password
  ///
  /// Returns [AuthUser] on success.
  /// Throws [TotpRequiredException] if TOTP is needed - caller should
  /// prompt for TOTP and call [loginWithTotp].
  /// Throws [AuthException] on failure.
  Future<AuthUser> loginWithCredentials({
    required String username,
    required String password,
  }) async {
    try {
      _logger.i('Starting direct grant login for user: $username');

      final result = await _performTokenRequest(
        username: username,
        password: password,
      );

      return result;
    } catch (e, stackTrace) {
      _logger.e('Error during login', error: e, stackTrace: stackTrace);
      if (e is AuthException) rethrow;
      throw AuthException('Login failed: $e', originalError: e);
    }
  }

  /// Complete authentication with TOTP code
  ///
  /// Called after [loginWithCredentials] throws [TotpRequiredException].
  Future<AuthUser> loginWithTotp({
    required String username,
    required String password,
    required String totpCode,
  }) async {
    try {
      _logger.i('Completing login with TOTP for user: $username');

      final result = await _performTokenRequest(
        username: username,
        password: password,
        totp: totpCode,
      );

      return result;
    } catch (e, stackTrace) {
      _logger.e('Error during TOTP login', error: e, stackTrace: stackTrace);
      if (e is AuthException) rethrow;
      throw AuthException('TOTP login failed: $e', originalError: e);
    }
  }

  /// Perform the actual token request to Keycloak
  Future<AuthUser> _performTokenRequest({
    required String username,
    required String password,
    String? totp,
  }) async {
    final tokenUrl = '${_config.issuer}/protocol/openid-connect/token';

    final client = HttpClient();
    try {
      final request = await client.postUrl(Uri.parse(tokenUrl));
      request.headers.contentType = ContentType('application', 'x-www-form-urlencoded');

      final params = {
        'grant_type': 'password',
        'client_id': _config.clientId,
        'username': username,
        'password': password,
        'scope': _config.scopes.join(' '),
      };

      // Add TOTP if provided
      if (totp != null && totp.isNotEmpty) {
        params['totp'] = totp;
      }

      final body = Uri(queryParameters: params).query;
      request.write(body);

      final response = await request.close();
      final responseBody = await response.transform(utf8.decoder).join();

      if (response.statusCode == 200) {
        // Success - parse tokens
        final tokenResponse = jsonDecode(responseBody) as Map<String, dynamic>;
        return _handleSuccessResponse(tokenResponse);
      } else if (response.statusCode == 401 || response.statusCode == 400) {
        // Check for TOTP requirement or invalid credentials
        return _handleErrorResponse(responseBody, response.statusCode);
      } else {
        _logger.e('Token request failed: ${response.statusCode} - $responseBody');
        throw AuthException('Authentication failed: ${response.statusCode}');
      }
    } finally {
      client.close();
    }
  }

  /// Handle successful token response
  Future<AuthUser> _handleSuccessResponse(Map<String, dynamic> tokenResponse) async {
    _logger.i('Token response received:');
    _logger.i('  - access_token: ${(tokenResponse['access_token'] as String?)?.substring(0, 20)}...');
    _logger.i('  - refresh_token present: ${tokenResponse['refresh_token'] != null}');
    _logger.i('  - expires_in: ${tokenResponse['expires_in']}');

    final expiresIn = tokenResponse['expires_in'] as int? ?? 300;
    final expirationDateTime = DateTime.now().add(Duration(seconds: expiresIn));

    final tokens = StoredTokens(
      accessToken: tokenResponse['access_token'] as String,
      idToken: tokenResponse['id_token'] as String,
      refreshToken: tokenResponse['refresh_token'] as String?,
      accessTokenExpirationDateTime: expirationDateTime,
      idTokenClaims: JwtUtils.tryParsePayload(tokenResponse['id_token'] as String),
    );

    await _storage.storeTokens(tokens);

    final user = _extractUserFromIdToken(tokens.idToken);
    await _storage.storeUserProfile(user);

    _logger.i('Login successful for user: ${user.username}');
    return user;
  }

  /// Handle error response - check for TOTP requirement
  Never _handleErrorResponse(String responseBody, int statusCode) {
    try {
      final errorResponse = jsonDecode(responseBody) as Map<String, dynamic>;
      final error = errorResponse['error'] as String?;
      final errorDescription = errorResponse['error_description'] as String?;

      _logger.w('Auth error: $error - $errorDescription');

      // Check for TOTP requirement
      // Keycloak returns different error messages depending on version
      if (error == 'invalid_grant') {
        if (errorDescription?.contains('Invalid user credentials') == true) {
          throw InvalidCredentialsException('Invalid username or password');
        }
        if (errorDescription?.contains('OTP') == true ||
            errorDescription?.contains('totp') == true ||
            errorDescription?.contains('TOTP') == true ||
            errorDescription?.contains('verification code') == true) {
          throw TotpRequiredException('TOTP verification required');
        }
        if (errorDescription?.contains('Account is not fully set up') == true ||
            errorDescription?.contains('requires action') == true) {
          throw TotpRequiredException('TOTP verification required');
        }
      }

      // Generic error
      throw AuthException(errorDescription ?? error ?? 'Authentication failed');
    } catch (e) {
      if (e is AuthException) rethrow;
      _logger.e('Failed to parse error response: $responseBody');
      throw AuthException('Authentication failed: $statusCode');
    }
  }

  @override
  Future<AuthUser> refreshToken() async {
    try {
      _logger.i('Refreshing access token');

      final refreshToken = await _storage.getRefreshToken();
      if (refreshToken == null) {
        throw TokenRefreshException(
          'No refresh token available',
          code: 'NO_REFRESH_TOKEN',
        );
      }

      final tokenUrl = '${_config.issuer}/protocol/openid-connect/token';

      final client = HttpClient();
      try {
        final request = await client.postUrl(Uri.parse(tokenUrl));
        request.headers.contentType = ContentType('application', 'x-www-form-urlencoded');

        final body = Uri(queryParameters: {
          'grant_type': 'refresh_token',
          'client_id': _config.clientId,
          'refresh_token': refreshToken,
        }).query;

        request.write(body);
        final response = await request.close();
        final responseBody = await response.transform(utf8.decoder).join();

        if (response.statusCode != 200) {
          _logger.e('Token refresh failed: $responseBody');
          throw TokenRefreshException(
            'Token refresh failed: ${response.statusCode}',
            code: 'REFRESH_FAILED',
          );
        }

        final tokenResponse = jsonDecode(responseBody) as Map<String, dynamic>;

        final tokens = StoredTokens(
          accessToken: tokenResponse['access_token'] as String,
          idToken: tokenResponse['id_token'] as String,
          refreshToken: tokenResponse['refresh_token'] as String? ?? refreshToken,
          accessTokenExpirationDateTime: DateTime.now().add(
            Duration(seconds: tokenResponse['expires_in'] as int? ?? 300),
          ),
          idTokenClaims: JwtUtils.tryParsePayload(tokenResponse['id_token'] as String),
        );

        await _storage.storeTokens(tokens);

        final user = _extractUserFromIdToken(tokens.idToken);
        await _storage.storeUserProfile(user);

        _logger.i('Token refresh successful');
        return user;
      } finally {
        client.close();
      }
    } catch (e, stackTrace) {
      _logger.e('Error during token refresh', error: e, stackTrace: stackTrace);
      if (e is TokenRefreshException) rethrow;
      throw TokenRefreshException(
        'Unexpected error during token refresh: $e',
        originalError: e,
      );
    }
  }

  @override
  Future<void> logout({bool endKeycloakSession = true}) async {
    try {
      _logger.i('Logging out');

      if (endKeycloakSession) {
        try {
          final refreshToken = await _storage.getRefreshToken();
          if (refreshToken != null) {
            // Revoke the refresh token
            final logoutUrl = '${_config.issuer}/protocol/openid-connect/logout';
            final client = HttpClient();
            try {
              final request = await client.postUrl(Uri.parse(logoutUrl));
              request.headers.contentType = ContentType('application', 'x-www-form-urlencoded');

              final body = Uri(queryParameters: {
                'client_id': _config.clientId,
                'refresh_token': refreshToken,
              }).query;

              request.write(body);
              await request.close();
              _logger.i('Keycloak session revoked');
            } finally {
              client.close();
            }
          }
        } catch (e, stackTrace) {
          _logger.w('Failed to revoke Keycloak session', error: e, stackTrace: stackTrace);
        }
      }

      // Always clear local storage
      await _storage.clearAll();
      _logger.i('Logout complete');
    } catch (e, stackTrace) {
      _logger.e('Error during logout', error: e, stackTrace: stackTrace);
      await _storage.clearAll();
      rethrow;
    }
  }

  @override
  Future<bool> hasValidSession() async {
    return await _storage.hasValidSession();
  }

  @override
  Future<AuthUser?> getCurrentUser() async {
    final idToken = await _storage.getIdToken();
    if (idToken != null) {
      try {
        final user = _extractUserFromIdToken(idToken);
        await _storage.storeUserProfile(user);
        return user;
      } catch (e) {
        _logger.w('Failed to extract user from ID token', error: e);
      }
    }
    return await _storage.getUserProfile();
  }

  AuthUser _extractUserFromIdToken(String idToken) {
    final claims = JwtUtils.tryParsePayload(idToken);

    final firstName = claims['given_name'] as String?;
    final lastName = claims['family_name'] as String?;
    final name = claims['name'] as String?;
    final preferredUsername = claims['preferred_username'] as String?;

    String? fullName = name;
    if (fullName == null && (firstName != null || lastName != null)) {
      fullName = [firstName, lastName].where((s) => s != null).join(' ');
    }

    String username = preferredUsername ?? name ?? 'Unknown';
    if (username == 'Unknown') {
      final email = claims['email'] as String?;
      if (email != null && email.contains('@')) {
        username = email.split('@').first;
      }
    }

    _logger.i('Extracted user: username=$username, fullName=$fullName');

    return AuthUser(
      id: claims['sub'] as String? ?? '',
      username: username,
      email: claims['email'] as String?,
      firstName: firstName,
      lastName: lastName,
      fullName: fullName,
      roles: JwtUtils.getAllRoles(idToken, clientId: _config.clientId),
      attributes: claims,
    );
  }
}

/// Exception thrown when TOTP verification is required
class TotpRequiredException extends AuthException {
  TotpRequiredException(super.message);
}

/// Exception thrown when username/password is invalid
class InvalidCredentialsException extends AuthException {
  InvalidCredentialsException(super.message);
}
