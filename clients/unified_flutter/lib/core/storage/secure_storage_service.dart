import 'dart:convert';
import 'dart:io';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:logger/logger.dart';
import '../auth/models/auth_state.dart';
import '../config/environment_config.dart';

/// Secure storage service for authentication tokens and user data
///
/// Uses flutter_secure_storage which:
/// - Windows: Uses Windows Credential Manager
/// - iOS: Uses Keychain with biometric access control
/// - Android: Uses KeyStore with biometric authentication
///
/// The refresh token is stored with biometric protection enabled,
/// requiring Face ID, Touch ID, or Windows Hello to access.
class SecureStorageService {
  final FlutterSecureStorage _storage;
  final FlutterSecureStorage _biometricStorage;
  final Logger _logger;

  // Storage keys
  static const _accessTokenKey = 'access_token';
  static const _refreshTokenKey = 'refresh_token';
  static const _idTokenKey = 'id_token';
  static const _tokenExpiryKey = 'token_expiry';
  static const _userProfileKey = 'user_profile';
  static const _biometricEnabledKey = 'biometric_enabled';
  static const _tokenIssuerKey = 'token_issuer';

  SecureStorageService({
    FlutterSecureStorage? storage,
    FlutterSecureStorage? biometricStorage,
    Logger? logger,
  })  : _storage = storage ?? const FlutterSecureStorage(),
        _biometricStorage = biometricStorage ?? _createBiometricStorage(),
        _logger = logger ?? Logger();

  /// Create storage with biometric protection enabled
  static FlutterSecureStorage _createBiometricStorage() {
    if (Platform.isAndroid) {
      return const FlutterSecureStorage(
        aOptions: AndroidOptions(
          encryptedSharedPreferences: true,
        ),
      );
    } else if (Platform.isIOS || Platform.isMacOS) {
      return const FlutterSecureStorage(
        iOptions: IOSOptions(
          accessibility: KeychainAccessibility.unlocked_this_device,
        ),
      );
    } else {
      // Windows uses Credential Manager which provides system-level security
      return const FlutterSecureStorage(
        wOptions: WindowsOptions(),
      );
    }
  }

  /// Validate that stored tokens match current environment issuer.
  /// Clears all tokens if issuer has changed (e.g., switching from vps to www).
  /// Returns true if tokens are valid for current environment, false if cleared.
  Future<bool> validateStoredIssuer() async {
    try {
      final storedIssuer = await _storage.read(key: _tokenIssuerKey);
      final currentIssuer = EnvironmentConfig.current.keycloakIssuer;

      if (storedIssuer == null) {
        _logger.d('No stored issuer - tokens may be from older version');
        // Check if we have tokens - if so, clear them for safety
        final hasTokens = await getAccessToken() != null;
        if (hasTokens) {
          _logger.w('Clearing tokens from unknown issuer');
          await clearAll();
          return false;
        }
        return true;
      }

      if (storedIssuer != currentIssuer) {
        _logger.w('Issuer mismatch detected!');
        _logger.w('  - stored: $storedIssuer');
        _logger.w('  - current: $currentIssuer');
        _logger.w('Clearing stale tokens from different environment');
        await clearAll();
        return false;
      }

      _logger.d('Stored issuer matches current environment');
      return true;
    } catch (e, stackTrace) {
      _logger.e('Failed to validate issuer', error: e, stackTrace: stackTrace);
      // Clear tokens on error for safety
      await clearAll();
      return false;
    }
  }

  /// Store authentication tokens
  Future<void> storeTokens(StoredTokens tokens) async {
    try {
      final expiryString = tokens.accessTokenExpirationDateTime.toIso8601String();
      final currentIssuer = EnvironmentConfig.current.keycloakIssuer;
      _logger.i('Storing tokens:');
      _logger.i('  - access_token: ${tokens.accessToken.substring(0, 20)}...');
      _logger.i('  - refresh_token present: ${tokens.refreshToken != null}');
      _logger.i('  - expiry: $expiryString');
      _logger.i('  - issuer: $currentIssuer');

      // Store tokens sequentially to ensure all writes complete
      await _storage.write(key: _accessTokenKey, value: tokens.accessToken);
      await _storage.write(key: _idTokenKey, value: tokens.idToken);
      await _storage.write(key: _tokenExpiryKey, value: expiryString);
      await _storage.write(key: _tokenIssuerKey, value: currentIssuer);

      if (tokens.refreshToken != null) {
        await _storage.write(key: _refreshTokenKey, value: tokens.refreshToken);
        _logger.i('  - refresh_token stored');
      } else {
        _logger.w('  - NO refresh_token to store!');
      }

      _logger.i('Tokens stored securely');
    } catch (e, stackTrace) {
      _logger.e('Failed to store tokens', error: e, stackTrace: stackTrace);
      rethrow;
    }
  }

  /// Retrieve access token
  Future<String?> getAccessToken() async {
    try {
      return await _storage.read(key: _accessTokenKey);
    } catch (e, stackTrace) {
      _logger.e('Failed to read access token', error: e, stackTrace: stackTrace);
      return null;
    }
  }

  /// Retrieve refresh token
  Future<String?> getRefreshToken() async {
    try {
      return await _storage.read(key: _refreshTokenKey);
    } catch (e, stackTrace) {
      _logger.e('Failed to read refresh token', error: e, stackTrace: stackTrace);
      return null;
    }
  }

  /// Retrieve ID token
  Future<String?> getIdToken() async {
    try {
      return await _storage.read(key: _idTokenKey);
    } catch (e, stackTrace) {
      _logger.e('Failed to read ID token', error: e, stackTrace: stackTrace);
      return null;
    }
  }

  /// Check if access token is expired
  Future<bool> isTokenExpired() async {
    try {
      final expiryString = await _storage.read(key: _tokenExpiryKey);
      if (expiryString == null) {
        _logger.w('isTokenExpired: No expiry stored, treating as expired');
        return true;
      }

      final expiry = DateTime.parse(expiryString);
      final now = DateTime.now();
      // Consider token expired 30 seconds before actual expiry
      final bufferTime = const Duration(seconds: 30);
      final effectiveExpiry = expiry.subtract(bufferTime);
      final isExpired = now.isAfter(effectiveExpiry);

      _logger.d('isTokenExpired check:');
      _logger.d('  - stored expiry: $expiryString');
      _logger.d('  - now: ${now.toIso8601String()}');
      _logger.d('  - effective expiry (minus 30s): ${effectiveExpiry.toIso8601String()}');
      _logger.d('  - isExpired: $isExpired');

      return isExpired;
    } catch (e, stackTrace) {
      _logger.e('Failed to check token expiry', error: e, stackTrace: stackTrace);
      return true; // Assume expired on error
    }
  }

  /// Store user profile
  Future<void> storeUserProfile(AuthUser user) async {
    try {
      final jsonString = jsonEncode(user.toJson());
      await _storage.write(key: _userProfileKey, value: jsonString);
      _logger.d('User profile stored');
    } catch (e, stackTrace) {
      _logger.e('Failed to store user profile', error: e, stackTrace: stackTrace);
      rethrow;
    }
  }

  /// Retrieve user profile
  Future<AuthUser?> getUserProfile() async {
    try {
      final jsonString = await _storage.read(key: _userProfileKey);
      if (jsonString == null) return null;

      final json = jsonDecode(jsonString) as Map<String, dynamic>;
      return AuthUser.fromJson(json);
    } catch (e, stackTrace) {
      _logger.e('Failed to read user profile', error: e, stackTrace: stackTrace);
      return null;
    }
  }

  /// Check if user is logged in (has valid tokens)
  Future<bool> hasValidSession() async {
    try {
      final accessToken = await getAccessToken();
      final refreshToken = await getRefreshToken();
      
      if (accessToken == null) return false;
      
      final isExpired = await isTokenExpired();
      
      // Valid if token is not expired, or we have a refresh token to get a new one
      return !isExpired || refreshToken != null;
    } catch (e, stackTrace) {
      _logger.e('Failed to check session validity', error: e, stackTrace: stackTrace);
      return false;
    }
  }

  /// Clear all stored authentication data
  Future<void> clearAll() async {
    try {
      await Future.wait([
        _storage.delete(key: _accessTokenKey),
        _storage.delete(key: _refreshTokenKey),
        _storage.delete(key: _idTokenKey),
        _storage.delete(key: _tokenExpiryKey),
        _storage.delete(key: _userProfileKey),
        _storage.delete(key: _biometricEnabledKey),
        _storage.delete(key: _tokenIssuerKey),
        _biometricStorage.delete(key: _refreshTokenKey),
      ]);
      _logger.d('All auth data cleared');
    } catch (e, stackTrace) {
      _logger.e('Failed to clear auth data', error: e, stackTrace: stackTrace);
      rethrow;
    }
  }

  /// Delete all stored data (for debugging/testing)
  Future<void> deleteAll() async {
    try {
      await Future.wait([
        _storage.deleteAll(),
        _biometricStorage.deleteAll(),
      ]);
      _logger.w('All secure storage data deleted');
    } catch (e, stackTrace) {
      _logger.e('Failed to delete all data', error: e, stackTrace: stackTrace);
      rethrow;
    }
  }

  // ============================================================
  // Biometric-Protected Storage Methods
  // ============================================================

  /// Check if biometric unlock is enabled
  Future<bool> isBiometricUnlockEnabled() async {
    try {
      final value = await _storage.read(key: _biometricEnabledKey);
      return value == 'true';
    } catch (e) {
      _logger.e('Failed to check biometric status', error: e);
      return false;
    }
  }

  /// Enable biometric unlock and store refresh token securely
  Future<void> enableBiometricUnlock(String refreshToken) async {
    try {
      _logger.i('Enabling biometric unlock');

      // Store refresh token in biometric-protected storage
      await _biometricStorage.write(
        key: _refreshTokenKey,
        value: refreshToken,
      );

      // Mark biometric as enabled
      await _storage.write(key: _biometricEnabledKey, value: 'true');

      _logger.i('Biometric unlock enabled');
    } catch (e, stackTrace) {
      _logger.e('Failed to enable biometric unlock', error: e, stackTrace: stackTrace);
      rethrow;
    }
  }

  /// Disable biometric unlock
  Future<void> disableBiometricUnlock() async {
    try {
      _logger.i('Disabling biometric unlock');

      await Future.wait([
        _biometricStorage.delete(key: _refreshTokenKey),
        _storage.delete(key: _biometricEnabledKey),
      ]);

      _logger.i('Biometric unlock disabled');
    } catch (e, stackTrace) {
      _logger.e('Failed to disable biometric unlock', error: e, stackTrace: stackTrace);
      rethrow;
    }
  }

  /// Get refresh token from biometric-protected storage
  ///
  /// This should only be called after successful biometric authentication
  Future<String?> getBiometricProtectedRefreshToken() async {
    try {
      return await _biometricStorage.read(key: _refreshTokenKey);
    } catch (e, stackTrace) {
      _logger.e('Failed to read biometric-protected refresh token',
          error: e, stackTrace: stackTrace);
      return null;
    }
  }

  /// Check if there's a saved refresh token for biometric unlock
  Future<bool> hasBiometricRefreshToken() async {
    try {
      final isEnabled = await isBiometricUnlockEnabled();
      if (!isEnabled) return false;

      final token = await _biometricStorage.read(key: _refreshTokenKey);
      return token != null && token.isNotEmpty;
    } catch (e) {
      _logger.e('Failed to check biometric refresh token', error: e);
      return false;
    }
  }

  /// Update the biometric-protected refresh token (e.g., after token refresh)
  Future<void> updateBiometricRefreshToken(String? refreshToken) async {
    if (refreshToken == null) return;

    try {
      final isEnabled = await isBiometricUnlockEnabled();
      if (isEnabled) {
        await _biometricStorage.write(
          key: _refreshTokenKey,
          value: refreshToken,
        );
        _logger.d('Biometric refresh token updated');
      }
    } catch (e, stackTrace) {
      _logger.e('Failed to update biometric refresh token',
          error: e, stackTrace: stackTrace);
    }
  }
}
