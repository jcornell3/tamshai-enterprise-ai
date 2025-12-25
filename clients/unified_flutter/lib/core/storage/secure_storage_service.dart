import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:logger/logger.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/models/auth_state.dart';

/// Secure storage service for authentication tokens and user data
/// 
/// Uses flutter_secure_storage which:
/// - Windows: Uses Windows Credential Manager
/// - iOS: Uses Keychain
/// - Android: Uses KeyStore
class SecureStorageService {
  final FlutterSecureStorage _storage;
  final Logger _logger;

  // Storage keys
  static const _accessTokenKey = 'access_token';
  static const _refreshTokenKey = 'refresh_token';
  static const _idTokenKey = 'id_token';
  static const _tokenExpiryKey = 'token_expiry';
  static const _userProfileKey = 'user_profile';

  SecureStorageService({
    FlutterSecureStorage? storage,
    Logger? logger,
  })  : _storage = storage ?? const FlutterSecureStorage(),
        _logger = logger ?? Logger();

  /// Store authentication tokens
  Future<void> storeTokens(StoredTokens tokens) async {
    try {
      await Future.wait([
        _storage.write(key: _accessTokenKey, value: tokens.accessToken),
        _storage.write(key: _idTokenKey, value: tokens.idToken),
        if (tokens.refreshToken != null)
          _storage.write(key: _refreshTokenKey, value: tokens.refreshToken),
        _storage.write(
          key: _tokenExpiryKey,
          value: tokens.accessTokenExpirationDateTime.toIso8601String(),
        ),
      ]);
      _logger.d('Tokens stored securely');
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
      if (expiryString == null) return true;

      final expiry = DateTime.parse(expiryString);
      // Consider token expired 30 seconds before actual expiry
      final bufferTime = const Duration(seconds: 30);
      return DateTime.now().isAfter(expiry.subtract(bufferTime));
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
      await _storage.deleteAll();
      _logger.w('All secure storage data deleted');
    } catch (e, stackTrace) {
      _logger.e('Failed to delete all data', error: e, stackTrace: stackTrace);
      rethrow;
    }
  }
}

/// Logger provider
final loggerProvider = Provider<Logger>((ref) => Logger());

/// Secure storage provider
final secureStorageProvider = Provider<SecureStorageService>((ref) {
  return SecureStorageService(
    logger: ref.watch(loggerProvider),
  );
});
