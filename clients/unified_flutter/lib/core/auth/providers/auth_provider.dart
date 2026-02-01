import 'dart:io' show Platform;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logger/logger.dart';
import '../models/auth_state.dart';
import '../models/keycloak_config.dart';
import '../services/auth_service.dart';
import '../services/keycloak_auth_service.dart';
import '../services/desktop_oauth_service.dart';
import '../services/direct_grant_auth_service.dart';
import '../services/biometric_service.dart';
import '../../storage/secure_storage_service.dart';

// Re-export exceptions for convenience
export '../services/direct_grant_auth_service.dart'
    show TotpRequiredException, InvalidCredentialsException;

/// Logger provider
final loggerProvider = Provider<Logger>((ref) => Logger());

/// Secure storage provider
final secureStorageProvider = Provider<SecureStorageService>((ref) {
  return SecureStorageService(logger: ref.watch(loggerProvider));
});

/// Keycloak configuration provider
final keycloakConfigProvider = Provider<KeycloakConfig>((ref) {
  return KeycloakConfigProvider.getConfig();
});

/// Check if running on desktop platform
bool get isDesktopPlatform {
  return Platform.isWindows || Platform.isMacOS || Platform.isLinux;
}

/// Check if running on mobile platform
bool get isMobilePlatform {
  return Platform.isIOS || Platform.isAndroid;
}

/// Auth service provider - automatically selects the right implementation
///
/// - Desktop (Windows/macOS/Linux): Uses DesktopOAuthService with browser + local HTTP server
/// - Mobile (iOS/Android): Uses DirectGrantAuthService with native login UI
final authServiceProvider = Provider<AuthService>((ref) {
  final config = ref.watch(keycloakConfigProvider);
  final storage = ref.watch(secureStorageProvider);
  final logger = ref.watch(loggerProvider);

  if (isDesktopPlatform) {
    logger.i('Using DesktopOAuthService for ${Platform.operatingSystem}');
    return DesktopOAuthService(
      config: config,
      storage: storage,
      logger: logger,
    );
  } else {
    logger.i('Using DirectGrantAuthService for ${Platform.operatingSystem}');
    return DirectGrantAuthService(
      config: config,
      storage: storage,
      logger: logger,
    );
  }
});

/// Direct grant auth service provider for native login on mobile
///
/// Use this provider to access the DirectGrantAuthService directly
/// for calling loginWithCredentials and loginWithTotp methods.
final directGrantAuthServiceProvider = Provider<DirectGrantAuthService?>((ref) {
  if (!isMobilePlatform) return null;

  final config = ref.watch(keycloakConfigProvider);
  final storage = ref.watch(secureStorageProvider);
  final logger = ref.watch(loggerProvider);

  return DirectGrantAuthService(
    config: config,
    storage: storage,
    logger: logger,
  );
});

/// Keycloak auth service provider (for backwards compatibility)
/// @deprecated Use authServiceProvider instead
final keycloakAuthServiceProvider = Provider<AuthService>((ref) {
  return ref.watch(authServiceProvider);
});

/// Biometric service provider
final biometricServiceProvider = Provider<BiometricService>((ref) {
  return BiometricService(logger: ref.watch(loggerProvider));
});

/// Check if biometric authentication is available on this device
final isBiometricAvailableProvider = FutureProvider<bool>((ref) async {
  final biometricService = ref.watch(biometricServiceProvider);
  return await biometricService.isBiometricAvailable();
});

/// Check if biometric unlock is enabled and has a saved refresh token
final hasBiometricRefreshTokenProvider = FutureProvider<bool>((ref) async {
  final storage = ref.watch(secureStorageProvider);
  return await storage.hasBiometricRefreshToken();
});

/// Authentication state notifier (Riverpod 3.x Notifier pattern)
class AuthNotifier extends Notifier<AuthState> {
  late final AuthService _authService;
  late final SecureStorageService _storage;
  late final Logger _logger;

  @override
  AuthState build() {
    _authService = ref.watch(authServiceProvider);
    _storage = ref.watch(secureStorageProvider);
    _logger = ref.watch(loggerProvider);
    return const AuthState.unauthenticated();
  }

  /// Initialize authentication state
  ///
  /// Checks for existing valid session and restores user if found.
  /// Also validates that stored tokens match the current environment's
  /// Keycloak issuer - clears stale tokens if environment has changed.
  Future<void> initialize() async {
    try {
      _logger.i('Initializing authentication');

      // Validate stored tokens match current environment issuer
      // This clears stale tokens when switching between environments
      // (e.g., vps.tamshai.com -> www.tamshai.com)
      final issuerValid = await _storage.validateStoredIssuer();
      if (!issuerValid) {
        _logger.i('Stale tokens cleared - environment changed');
        state = const AuthState.unauthenticated();
        return;
      }

      final hasSession = await _authService.hasValidSession();

      if (!hasSession) {
        _logger.i('No valid session found');
        state = const AuthState.unauthenticated();
        return;
      }

      final user = await _authService.getCurrentUser();

      if (user == null) {
        _logger.w('Session exists but no user profile found');
        state = const AuthState.unauthenticated();
        return;
      }

      _logger.i('Valid session restored for user: ${user.username}');
      state = AuthState.authenticated(user);
    } catch (e, stackTrace) {
      _logger.e('Failed to initialize auth', error: e, stackTrace: stackTrace);
      state = const AuthState.unauthenticated();
    }
  }

  /// Perform login
  Future<void> login() async {
    if (state is Authenticating) {
      _logger.w('Login already in progress');
      return;
    }

    try {
      state = const AuthState.authenticating();
      _logger.i('Starting login');

      final user = await _authService.login();

      state = AuthState.authenticated(user);
      _logger.i('Login successful');
    } on LoginCancelledException {
      _logger.i('Login cancelled by user');
      state = const AuthState.unauthenticated();
    } on NetworkAuthException catch (e) {
      _logger.e('Network error during login', error: e);
      state = AuthState.error('Network error: Please check your connection and try again');
    } on AuthException catch (e) {
      _logger.e('Auth error during login', error: e);
      state = AuthState.error(e.message);
    } catch (e, stackTrace) {
      _logger.e('Unexpected error during login', error: e, stackTrace: stackTrace);
      state = const AuthState.error('An unexpected error occurred. Please try again.');
    }
  }

  /// Refresh authentication token
  ///
  /// Called automatically when token expires or on 401 responses
  Future<void> refreshToken() async {
    try {
      _logger.i('Refreshing token');

      final user = await _authService.refreshToken();

      state = AuthState.authenticated(user);
      _logger.i('Token refresh successful');
    } on TokenRefreshException catch (e) {
      _logger.e('Token refresh failed', error: e);
      // If refresh fails, user needs to login again
      await logout();
      state = const AuthState.error('Your session has expired. Please login again.');
    } catch (e, stackTrace) {
      _logger.e('Unexpected error during token refresh', error: e, stackTrace: stackTrace);
      await logout();
      state = const AuthState.error('Session error. Please login again.');
    }
  }

  /// Perform logout
  ///
  /// [endKeycloakSession] - if true, also ends session on Keycloak server
  Future<void> logout({bool endKeycloakSession = true}) async {
    try {
      _logger.i('Logging out');

      await _authService.logout(endKeycloakSession: endKeycloakSession);

      state = const AuthState.unauthenticated();
      _logger.i('Logout successful');
    } catch (e, stackTrace) {
      _logger.e('Error during logout', error: e, stackTrace: stackTrace);
      // Even if logout fails, clear local state
      state = const AuthState.unauthenticated();
    }
  }

  /// Get current authenticated user
  AuthUser? get currentUser {
    return state.maybeMap(
      authenticated: (state) => state.user,
      orElse: () => null,
    );
  }

  /// Check if user is authenticated
  bool get isAuthenticated {
    return state is Authenticated;
  }

  /// Check if authentication is in progress
  bool get isAuthenticating {
    return state is Authenticating;
  }

  // ============================================================
  // Native Login Methods (Mobile Only)
  // ============================================================

  /// Login with username and password (native login for mobile)
  ///
  /// Throws [TotpRequiredException] if TOTP is needed.
  /// Throws [InvalidCredentialsException] if credentials are wrong.
  Future<void> loginWithCredentials({
    required String username,
    required String password,
  }) async {
    if (state is Authenticating) {
      _logger.w('Login already in progress');
      return;
    }

    final directGrantService = _authService as DirectGrantAuthService;

    try {
      state = const AuthState.authenticating();
      _logger.i('Starting native login for: $username');

      final user = await directGrantService.loginWithCredentials(
        username: username,
        password: password,
      );

      state = AuthState.authenticated(user);
      _logger.i('Native login successful');
    } on TotpRequiredException {
      // Don't change state - let the UI handle TOTP prompt
      state = const AuthState.unauthenticated();
      rethrow;
    } on InvalidCredentialsException {
      state = const AuthState.unauthenticated();
      rethrow;
    } on AuthException catch (e) {
      _logger.e('Auth error during native login', error: e);
      state = AuthState.error(e.message);
      rethrow;
    } catch (e, stackTrace) {
      _logger.e('Unexpected error during native login', error: e, stackTrace: stackTrace);
      state = const AuthState.error('An unexpected error occurred. Please try again.');
      rethrow;
    }
  }

  /// Complete login with TOTP code (native login for mobile)
  ///
  /// Called after [loginWithCredentials] throws [TotpRequiredException].
  Future<void> loginWithTotp({
    required String username,
    required String password,
    required String totpCode,
  }) async {
    if (state is Authenticating) {
      _logger.w('Login already in progress');
      return;
    }

    final directGrantService = _authService as DirectGrantAuthService;

    try {
      state = const AuthState.authenticating();
      _logger.i('Completing native login with TOTP for: $username');

      final user = await directGrantService.loginWithTotp(
        username: username,
        password: password,
        totpCode: totpCode,
      );

      state = AuthState.authenticated(user);
      _logger.i('Native login with TOTP successful');
    } on InvalidCredentialsException {
      state = const AuthState.unauthenticated();
      rethrow;
    } on AuthException catch (e) {
      _logger.e('Auth error during TOTP login', error: e);
      state = AuthState.error(e.message);
      rethrow;
    } catch (e, stackTrace) {
      _logger.e('Unexpected error during TOTP login', error: e, stackTrace: stackTrace);
      state = const AuthState.error('An unexpected error occurred. Please try again.');
      rethrow;
    }
  }

  // ============================================================
  // Biometric Authentication Methods
  // ============================================================

  /// Enable biometric unlock for the current session
  ///
  /// Stores the refresh token in biometric-protected storage
  Future<void> enableBiometricUnlock() async {
    try {
      final refreshToken = await _storage.getRefreshToken();
      if (refreshToken == null) {
        _logger.w('Cannot enable biometric unlock: no refresh token');
        return;
      }

      await _storage.enableBiometricUnlock(refreshToken);
      _logger.i('Biometric unlock enabled');
    } catch (e, stackTrace) {
      _logger.e('Failed to enable biometric unlock', error: e, stackTrace: stackTrace);
      rethrow;
    }
  }

  /// Disable biometric unlock
  Future<void> disableBiometricUnlock() async {
    try {
      await _storage.disableBiometricUnlock();
      _logger.i('Biometric unlock disabled');
    } catch (e, stackTrace) {
      _logger.e('Failed to disable biometric unlock', error: e, stackTrace: stackTrace);
      rethrow;
    }
  }

  /// Unlock using biometric authentication
  ///
  /// Called after successful biometric verification from BiometricUnlockScreen.
  /// Retrieves the stored refresh token and performs a token refresh.
  Future<void> unlockWithBiometric() async {
    try {
      state = const AuthState.authenticating();
      _logger.i('Unlocking with biometric authentication');

      // Get the biometric-protected refresh token
      final refreshToken = await _storage.getBiometricProtectedRefreshToken();
      if (refreshToken == null) {
        _logger.e('No biometric refresh token found');
        state = const AuthState.error('Session expired. Please login again.');
        return;
      }

      // Store the refresh token in regular storage for the auth service to use
      final currentTokens = StoredTokens(
        accessToken: '', // Will be refreshed
        idToken: '',
        refreshToken: refreshToken,
        accessTokenExpirationDateTime: DateTime.now(), // Expired, needs refresh
      );
      await _storage.storeTokens(currentTokens);

      // Now refresh the token
      final user = await _authService.refreshToken();

      // Update biometric storage with new refresh token if changed
      final newRefreshToken = await _storage.getRefreshToken();
      if (newRefreshToken != null && newRefreshToken != refreshToken) {
        await _storage.updateBiometricRefreshToken(newRefreshToken);
      }

      state = AuthState.authenticated(user);
      _logger.i('Biometric unlock successful');
    } on TokenRefreshException catch (e) {
      _logger.e('Token refresh failed during biometric unlock', error: e);
      await _storage.disableBiometricUnlock();
      state = const AuthState.error('Session expired. Please login again.');
    } catch (e, stackTrace) {
      _logger.e('Biometric unlock failed', error: e, stackTrace: stackTrace);
      state = AuthState.error('Unlock failed: ${e.toString()}');
    }
  }

  /// Check if biometric unlock is enabled
  Future<bool> isBiometricUnlockEnabled() async {
    return await _storage.isBiometricUnlockEnabled();
  }
}

/// Authentication state provider (Riverpod 3.x NotifierProvider)
final authNotifierProvider = NotifierProvider<AuthNotifier, AuthState>(() {
  return AuthNotifier();
});

/// Convenience provider for current user
final currentUserProvider = Provider<AuthUser?>((ref) {
  return ref.watch(authNotifierProvider).maybeMap(
        authenticated: (state) => state.user,
        orElse: () => null,
      );
});

/// Convenience provider for authentication status
final isAuthenticatedProvider = Provider<bool>((ref) {
  return ref.watch(authNotifierProvider) is Authenticated;
});
