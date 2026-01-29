import 'package:flutter_appauth/flutter_appauth.dart';
import 'package:logger/logger.dart';
import '../models/auth_state.dart';
import '../models/keycloak_config.dart';
import '../../storage/secure_storage_service.dart';
import '../../utils/jwt_utils.dart';
import 'auth_service.dart';

/// Keycloak authentication service using OAuth 2.0 / OIDC
///
/// For mobile platforms (iOS/Android) using flutter_appauth.
///
/// Handles:
/// - Login with Authorization Code Flow + PKCE
/// - Token refresh
/// - Logout (local and Keycloak session)
/// - TOTP is handled by Keycloak in the browser flow
class KeycloakAuthService implements AuthService {
  final FlutterAppAuth _appAuth;
  final SecureStorageService _storage;
  final KeycloakConfig _config;
  final Logger _logger;

  KeycloakAuthService({
    required KeycloakConfig config,
    required SecureStorageService storage,
    FlutterAppAuth? appAuth,
    Logger? logger,
  })  : _config = config,
        _storage = storage,
        _appAuth = appAuth ?? const FlutterAppAuth(),
        _logger = logger ?? Logger();

  @override
  Future<AuthUser> login() async {
    try {
      _logger.i('Starting Keycloak login flow');

      // Perform authorization with PKCE
      final AuthorizationTokenResponse? result =
          await _appAuth.authorizeAndExchangeCode(
        AuthorizationTokenRequest(
          _config.clientId,
          _config.redirectUrl,
          issuer: _config.issuer,
          scopes: _config.scopes,
          // PKCE is automatically enabled by flutter_appauth
          // promptValues: ['login'], // Uncomment to force re-authentication
        ),
      );

      if (result == null) {
        throw LoginCancelledException();
      }

      _logger.i('Authorization successful, processing tokens');

      // Store tokens
      final storedTokens = StoredTokens(
        accessToken: result.accessToken!,
        idToken: result.idToken!,
        refreshToken: result.refreshToken,
        accessTokenExpirationDateTime: result.accessTokenExpirationDateTime!,
        idTokenClaims: result.idToken != null ? JwtUtils.tryParsePayload(result.idToken!) : null,
      );

      await _storage.storeTokens(storedTokens);

      // Extract user profile from ID token
      final user = _extractUserFromIdToken(result.idToken!);
      await _storage.storeUserProfile(user);

      _logger.i('Login successful for user: ${user.username}');
      return user;
    } on FlutterAppAuthUserCancelledException {
      _logger.w('User cancelled login');
      throw LoginCancelledException();
    } on FlutterAppAuthPlatformException catch (e, stackTrace) {
      _logger.e('AppAuth error during login', error: e, stackTrace: stackTrace);
      final message = e.toString();
      if (message.contains('network') || message.contains('timeout')) {
        throw NetworkAuthException(
          'Network error during login: $message',
          originalError: e,
        );
      }
      throw AuthException(
        'Login failed: $message',
        originalError: e,
      );
    } catch (e, stackTrace) {
      _logger.e('Unexpected error during login', error: e, stackTrace: stackTrace);
      throw AuthException(
        'Unexpected error during login: $e',
        originalError: e,
      );
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

      final result = await _appAuth.token(
        TokenRequest(
          _config.clientId,
          _config.redirectUrl,
          issuer: _config.issuer,
          refreshToken: refreshToken,
          scopes: _config.scopes,
        ),
      );

      if (result == null) {
        throw TokenRefreshException(
          'Token refresh returned null',
          code: 'NULL_RESPONSE',
        );
      }

      _logger.i('Token refresh successful');

      // Store new tokens
      final storedTokens = StoredTokens(
        accessToken: result.accessToken!,
        idToken: result.idToken!,
        refreshToken: result.refreshToken ?? refreshToken, // Keep old if not provided
        accessTokenExpirationDateTime: result.accessTokenExpirationDateTime!,
        idTokenClaims: result.idToken != null ? JwtUtils.tryParsePayload(result.idToken!) : null,
      );

      await _storage.storeTokens(storedTokens);

      // Extract updated user profile
      final user = _extractUserFromIdToken(result.idToken!);
      await _storage.storeUserProfile(user);

      return user;
    } on FlutterAppAuthPlatformException catch (e, stackTrace) {
      _logger.e('Token refresh failed', error: e, stackTrace: stackTrace);
      throw TokenRefreshException(
        'Failed to refresh token: $e',
        originalError: e,
      );
    } catch (e, stackTrace) {
      _logger.e('Unexpected error during token refresh', error: e, stackTrace: stackTrace);
      throw TokenRefreshException(
        'Unexpected error during token refresh: $e',
        originalError: e,
      );
    }
  }

  @override
  Future<void> logout({bool endKeycloakSession = true}) async {
    try {
      _logger.i('Logging out (endKeycloakSession: $endKeycloakSession)');

      if (endKeycloakSession && _config.endSessionRedirectUrl != null) {
        try {
          final idToken = await _storage.getIdToken();
          
          if (idToken != null) {
            // End session on Keycloak server
            await _appAuth.endSession(
              EndSessionRequest(
                idTokenHint: idToken,
                postLogoutRedirectUrl: _config.endSessionRedirectUrl!,
                issuer: _config.issuer,
              ),
            );
            _logger.i('Keycloak session ended');
          }
        } catch (e, stackTrace) {
          // Don't fail logout if end session fails
          _logger.w('Failed to end Keycloak session', error: e, stackTrace: stackTrace);
        }
      }

      // Always clear local storage
      await _storage.clearAll();
      _logger.i('Logout complete');
    } catch (e, stackTrace) {
      _logger.e('Error during logout', error: e, stackTrace: stackTrace);
      // Still try to clear local storage
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
    return await _storage.getUserProfile();
  }

  /// Extract user profile from ID token claims
  AuthUser _extractUserFromIdToken(String idToken) {
    final claims = JwtUtils.tryParsePayload(idToken);

    return AuthUser(
      id: claims['sub'] as String? ?? '',
      username: claims['preferred_username'] as String? ??
                claims['name'] as String? ??
                'Unknown',
      email: claims['email'] as String?,
      firstName: claims['given_name'] as String?,
      lastName: claims['family_name'] as String?,
      fullName: claims['name'] as String?,
      roles: JwtUtils.getAllRoles(idToken, clientId: _config.clientId),
      attributes: claims,
    );
  }
}
