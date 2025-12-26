import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:logger/logger.dart';
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
      final expiryString = tokens.accessTokenExpirationDateTime.toIso8601String();
      _logger.i('Storing tokens:');
      _logger.i('  - access_token: ${tokens.accessToken.substring(0, 20)}...');
      _logger.i('  - refresh_token present: ${tokens.refreshToken != null}');
      _logger.i('  - expiry: $expiryString');

      // Store tokens sequentially to ensure all writes complete
      await _storage.write(key: _accessTokenKey, value: tokens.accessToken);
      await _storage.write(key: _idTokenKey, value: tokens.idToken);
      await _storage.write(key: _tokenExpiryKey, value: expiryString);

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
