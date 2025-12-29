import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logger/logger.dart';
import '../models/auth_state.dart';
import '../models/keycloak_config.dart';
import '../services/keycloak_auth_service.dart';
import '../../storage/secure_storage_service.dart';

/// Logger provider
final loggerProvider = Provider<Logger>((ref) => Logger());

/// Secure storage provider
final secureStorageProvider = Provider<SecureStorageService>((ref) {
  return SecureStorageService(logger: ref.watch(loggerProvider));
});

/// Keycloak configuration provider
final keycloakConfigProvider = Provider<KeycloakConfig>((ref) {
  // TODO: Switch to production config when deploying
  return KeycloakConfigProvider.getDevelopmentConfig();
});

/// Keycloak auth service provider
final keycloakAuthServiceProvider = Provider<KeycloakAuthService>((ref) {
  return KeycloakAuthService(
    config: ref.watch(keycloakConfigProvider),
    storage: ref.watch(secureStorageProvider),
    logger: ref.watch(loggerProvider),
  );
});

/// Authentication state notifier
class AuthNotifier extends StateNotifier<AuthState> {
  final KeycloakAuthService _authService;
  final Logger _logger;

  AuthNotifier({
    required KeycloakAuthService authService,
    required Logger logger,
  })  : _authService = authService,
        _logger = logger,
        super(const AuthState.unauthenticated());

  /// Initialize authentication state
  /// 
  /// Checks for existing valid session and restores user if found
  Future<void> initialize() async {
    try {
      _logger.i('Initializing authentication');

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
}

/// Authentication state provider
final authNotifierProvider =
    StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(
    authService: ref.watch(keycloakAuthServiceProvider),
    logger: ref.watch(loggerProvider),
  );
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
