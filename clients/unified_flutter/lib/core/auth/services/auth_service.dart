import '../models/auth_state.dart';

/// Abstract authentication service interface
///
/// Platform-specific implementations:
/// - Mobile (iOS/Android): Uses flutter_appauth with system browser
/// - Desktop (Windows/macOS/Linux): Uses url_launcher + local HTTP server
abstract class AuthService {
  /// Initiate login flow
  ///
  /// Opens browser/WebView to Keycloak login page.
  /// User enters credentials and TOTP code (if required).
  /// Returns user profile on success.
  ///
  /// Throws:
  /// - [LoginCancelledException] if user cancels
  /// - [NetworkAuthException] on network errors
  /// - [AuthException] for other errors
  Future<AuthUser> login();

  /// Refresh access token using refresh token
  ///
  /// Automatically called when access token expires.
  /// Returns new user profile with updated tokens.
  ///
  /// Throws [TokenRefreshException] if refresh fails
  Future<AuthUser> refreshToken();

  /// Logout user
  ///
  /// Performs:
  /// 1. End session with Keycloak (if configured)
  /// 2. Clear local tokens and user data
  ///
  /// [endKeycloakSession] - if true, also terminates session on Keycloak server
  Future<void> logout({bool endKeycloakSession = true});

  /// Check if user has a valid session
  Future<bool> hasValidSession();

  /// Get current user from storage
  Future<AuthUser?> getCurrentUser();
}
