import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:logger/logger.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/auth_state.dart';
import '../models/keycloak_config.dart';
import '../../storage/secure_storage_service.dart';
import '../../utils/jwt_utils.dart';
import 'auth_service.dart';

/// Desktop OAuth service using browser + local HTTP server callback
///
/// For Windows, macOS, and Linux desktop platforms.
/// Uses OAuth 2.0 Authorization Code Flow with PKCE.
///
/// Flow:
/// 1. Start local HTTP server on preferred fixed port (fallback to dynamic)
/// 2. Generate PKCE code verifier and challenge
/// 3. Open browser to Keycloak authorization endpoint
/// 4. User authenticates (including TOTP if required)
/// 5. Keycloak redirects to local server with authorization code
/// 6. Exchange code for tokens using PKCE code verifier
/// 7. Store tokens and return user profile
class DesktopOAuthService implements AuthService {
  final SecureStorageService _storage;
  final KeycloakConfig _config;
  final Logger _logger;

  /// Preferred ports for OAuth callback (in order of preference)
  /// These ports must be registered in Keycloak client redirect URIs
  static const List<int> _preferredPorts = [18765, 18766, 18767, 18768, 18769];

  HttpServer? _server;
  Completer<String>? _authCodeCompleter;

  DesktopOAuthService({
    required KeycloakConfig config,
    required SecureStorageService storage,
    Logger? logger,
  })  : _config = config,
        _storage = storage,
        _logger = logger ?? Logger();

  @override
  Future<AuthUser> login() async {
    try {
      _logger.i('Starting desktop OAuth login flow');

      // Generate PKCE parameters
      final codeVerifier = _generateCodeVerifier();
      final codeChallenge = _generateCodeChallenge(codeVerifier);
      final state = _generateState();

      // Start local server for callback
      final server = await _startLocalServer();
      // Use 127.0.0.1 instead of localhost for Windows compatibility
      final redirectUri = 'http://127.0.0.1:${server.port}/callback';

      _logger.i('Local callback server started on port ${server.port}');

      // Build authorization URL
      final authUrl = _buildAuthorizationUrl(
        redirectUri: redirectUri,
        codeChallenge: codeChallenge,
        state: state,
      );

      _logger.i('Opening browser for authentication (private mode)');

      // Open browser in private/incognito mode to avoid saved credentials
      // This prevents Windows Hello from auto-filling passwords for the wrong user
      final launched = await _launchBrowserPrivate(authUrl);
      if (!launched) {
        await _stopServer();
        throw AuthException('Could not open browser for authentication');
      }

      // Wait for authorization code
      _authCodeCompleter = Completer<String>();
      final authCode = await _authCodeCompleter!.future.timeout(
        const Duration(minutes: 5),
        onTimeout: () {
          _stopServer();
          throw AuthException('Authentication timed out');
        },
      );

      await _stopServer();

      if (authCode.isEmpty) {
        throw LoginCancelledException();
      }

      _logger.i('Authorization code received, exchanging for tokens');

      // Exchange code for tokens
      final tokens = await _exchangeCodeForTokens(
        authCode: authCode,
        codeVerifier: codeVerifier,
        redirectUri: redirectUri,
      );

      // Store tokens
      await _storage.storeTokens(tokens);

      // Extract user profile
      final user = _extractUserFromIdToken(tokens.idToken);
      await _storage.storeUserProfile(user);

      _logger.i('Login successful for user: ${user.username}');
      return user;
    } catch (e, stackTrace) {
      _logger.e('Error during desktop OAuth login', error: e, stackTrace: stackTrace);
      await _stopServer();

      if (e is AuthException) rethrow;
      if (e is TimeoutException) {
        throw AuthException('Authentication timed out');
      }
      throw AuthException('Unexpected error during login: $e', originalError: e);
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

      // Build token endpoint URL
      final tokenUrl = '${_config.issuer}/protocol/openid-connect/token';

      // Make token refresh request
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
      _logger.i('Logging out (endKeycloakSession: $endKeycloakSession)');

      if (endKeycloakSession) {
        try {
          final idToken = await _storage.getIdToken();
          if (idToken != null) {
            // Build end session URL and open in browser
            // Only send id_token_hint, no redirect URI to avoid Keycloak validation errors
            final endSessionUrl = Uri.parse(
              '${_config.issuer}/protocol/openid-connect/logout',
            ).replace(queryParameters: {
              'id_token_hint': idToken,
            });

            await launchUrl(
              endSessionUrl,
              mode: LaunchMode.externalApplication,
            );
            _logger.i('Keycloak session end initiated');
          }
        } catch (e, stackTrace) {
          _logger.w('Failed to end Keycloak session', error: e, stackTrace: stackTrace);
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
    // Re-extract user from ID token to pick up any extraction logic fixes
    final idToken = await _storage.getIdToken();
    if (idToken != null) {
      try {
        final user = _extractUserFromIdToken(idToken);
        // Update stored profile with fresh extraction
        await _storage.storeUserProfile(user);
        return user;
      } catch (e) {
        _logger.w('Failed to re-extract user from ID token', error: e);
      }
    }
    // Fallback to stored profile
    return await _storage.getUserProfile();
  }

  // Private helper methods

  /// Launch browser in private/incognito mode to avoid saved credentials
  /// This prevents Windows Hello from auto-filling passwords
  Future<bool> _launchBrowserPrivate(String url) async {
    if (Platform.isWindows) {
      // Try Microsoft Edge first (default on Windows)
      try {
        final edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
        final edgePathAlt = 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe';

        String? browserPath;
        if (await File(edgePath).exists()) {
          browserPath = edgePath;
        } else if (await File(edgePathAlt).exists()) {
          browserPath = edgePathAlt;
        }

        if (browserPath != null) {
          final result = await Process.run(browserPath, ['--inprivate', url]);
          if (result.exitCode == 0) {
            _logger.i('Launched Edge in InPrivate mode');
            return true;
          }
        }
      } catch (e) {
        _logger.d('Edge not available: $e');
      }

      // Try Chrome as fallback
      try {
        final chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
        final chromePathAlt = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';

        String? browserPath;
        if (await File(chromePath).exists()) {
          browserPath = chromePath;
        } else if (await File(chromePathAlt).exists()) {
          browserPath = chromePathAlt;
        }

        if (browserPath != null) {
          final result = await Process.run(browserPath, ['--incognito', url]);
          if (result.exitCode == 0) {
            _logger.i('Launched Chrome in Incognito mode');
            return true;
          }
        }
      } catch (e) {
        _logger.d('Chrome not available: $e');
      }
    }

    // Fallback to default browser (may use saved credentials)
    _logger.w('No private browser found, falling back to default browser');
    return await launchUrl(
      Uri.parse(url),
      mode: LaunchMode.externalApplication,
    );
  }

  Future<HttpServer> _startLocalServer() async {
    // Try preferred fixed ports first (for Keycloak redirect URI matching)
    for (final port in _preferredPorts) {
      try {
        _server = await HttpServer.bind(InternetAddress.loopbackIPv4, port);
        _logger.i('Started local HTTP server on preferred port $port');
        break;
      } catch (e) {
        _logger.d('Port $port not available, trying next...');
      }
    }

    // Fallback to dynamic port if all preferred ports are in use
    _server ??= await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    _logger.i('Started local HTTP server on port ${_server!.port}');

    _server!.listen((request) async {
      if (request.uri.path == '/callback') {
        final code = request.uri.queryParameters['code'];
        final error = request.uri.queryParameters['error'];
        final errorDescription = request.uri.queryParameters['error_description'];

        // Send response to browser
        request.response.headers.contentType = ContentType.html;

        if (error != null) {
          request.response.write('''
<!DOCTYPE html>
<html>
<head><title>Login Failed</title></head>
<body style="font-family: sans-serif; text-align: center; padding: 50px;">
  <h1>Login Failed</h1>
  <p>Error: $error</p>
  <p>${errorDescription ?? ''}</p>
  <p>You can close this window.</p>
</body>
</html>
''');
          await request.response.close();
          _authCodeCompleter?.complete('');
        } else if (code != null) {
          request.response.write('''
<!DOCTYPE html>
<html>
<head><title>Login Successful</title></head>
<body style="font-family: sans-serif; text-align: center; padding: 50px;">
  <h1>Login Successful!</h1>
  <p>You can close this window and return to the application.</p>
  <script>window.close();</script>
</body>
</html>
''');
          await request.response.close();
          _authCodeCompleter?.complete(code);
        } else {
          request.response.write('''
<!DOCTYPE html>
<html>
<head><title>Error</title></head>
<body style="font-family: sans-serif; text-align: center; padding: 50px;">
  <h1>Error</h1>
  <p>Invalid callback response.</p>
</body>
</html>
''');
          await request.response.close();
          _authCodeCompleter?.complete('');
        }
      }
    });

    return _server!;
  }

  Future<void> _stopServer() async {
    if (_server != null) {
      await _server!.close(force: true);
      _server = null;
      _logger.i('Stopped local HTTP server');
    }
  }

  String _buildAuthorizationUrl({
    required String redirectUri,
    required String codeChallenge,
    required String state,
  }) {
    final authEndpoint = '${_config.issuer}/protocol/openid-connect/auth';

    final params = {
      'client_id': _config.clientId,
      'response_type': 'code',
      'redirect_uri': redirectUri,
      'scope': _config.scopes.join(' '),
      'state': state,
      'code_challenge': codeChallenge,
      'code_challenge_method': 'S256',
      // Force fresh login with no session reuse
      // - prompt=login: force re-authentication
      // - max_age=0: reject any cached session
      'prompt': 'login',
      'max_age': '0',
    };

    return Uri.parse(authEndpoint).replace(queryParameters: params).toString();
  }

  Future<StoredTokens> _exchangeCodeForTokens({
    required String authCode,
    required String codeVerifier,
    required String redirectUri,
  }) async {
    final tokenUrl = '${_config.issuer}/protocol/openid-connect/token';

    final client = HttpClient();
    try {
      final request = await client.postUrl(Uri.parse(tokenUrl));
      request.headers.contentType = ContentType('application', 'x-www-form-urlencoded');

      final body = Uri(queryParameters: {
        'grant_type': 'authorization_code',
        'client_id': _config.clientId,
        'code': authCode,
        'redirect_uri': redirectUri,
        'code_verifier': codeVerifier,
      }).query;

      request.write(body);
      final response = await request.close();
      final responseBody = await response.transform(utf8.decoder).join();

      if (response.statusCode != 200) {
        _logger.e('Token exchange failed: $responseBody');
        throw AuthException('Token exchange failed: ${response.statusCode}');
      }

      final tokenResponse = jsonDecode(responseBody) as Map<String, dynamic>;

      // Debug logging for token response
      _logger.i('Token response received:');
      _logger.i('  - access_token: ${(tokenResponse['access_token'] as String?)?.substring(0, 20)}...');
      _logger.i('  - refresh_token present: ${tokenResponse['refresh_token'] != null}');
      _logger.i('  - expires_in: ${tokenResponse['expires_in']}');

      final expiresIn = tokenResponse['expires_in'] as int? ?? 300;
      final expirationDateTime = DateTime.now().add(Duration(seconds: expiresIn));
      _logger.i('  - calculated expiration: ${expirationDateTime.toIso8601String()}');

      return StoredTokens(
        accessToken: tokenResponse['access_token'] as String,
        idToken: tokenResponse['id_token'] as String,
        refreshToken: tokenResponse['refresh_token'] as String?,
        accessTokenExpirationDateTime: expirationDateTime,
        idTokenClaims: JwtUtils.tryParsePayload(tokenResponse['id_token'] as String),
      );
    } finally {
      client.close();
    }
  }

  String _generateCodeVerifier() {
    final random = Random.secure();
    final values = List<int>.generate(32, (i) => random.nextInt(256));
    return base64UrlEncode(values).replaceAll('=', '');
  }

  String _generateCodeChallenge(String codeVerifier) {
    final bytes = utf8.encode(codeVerifier);
    final digest = sha256.convert(bytes);
    return base64UrlEncode(digest.bytes).replaceAll('=', '');
  }

  String _generateState() {
    final random = Random.secure();
    final values = List<int>.generate(16, (i) => random.nextInt(256));
    return base64UrlEncode(values).replaceAll('=', '');
  }

  AuthUser _extractUserFromIdToken(String idToken) {
    final claims = JwtUtils.tryParsePayload(idToken);

    final firstName = claims['given_name'] as String?;
    final lastName = claims['family_name'] as String?;
    final name = claims['name'] as String?;
    final preferredUsername = claims['preferred_username'] as String?;

    // Build fullName: prefer 'name' claim, fallback to firstName + lastName
    String? fullName = name;
    if (fullName == null && (firstName != null || lastName != null)) {
      fullName = [firstName, lastName].where((s) => s != null).join(' ');
    }

    // Username fallbacks: preferred_username -> name -> email prefix -> Unknown
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
