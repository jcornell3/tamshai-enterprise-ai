import 'dart:io';
import 'package:local_auth/local_auth.dart';
import 'package:logger/logger.dart';

/// Biometric authentication service
///
/// Wraps the local_auth plugin to provide:
/// - Biometric availability detection
/// - Authentication via Face ID, Touch ID, or Windows Hello
/// - Graceful fallback handling for devices without biometrics
class BiometricService {
  final LocalAuthentication _localAuth;
  final Logger _logger;

  BiometricService({
    LocalAuthentication? localAuth,
    Logger? logger,
  })  : _localAuth = localAuth ?? LocalAuthentication(),
        _logger = logger ?? Logger();

  /// Check if the device supports any form of biometric authentication
  Future<bool> isBiometricAvailable() async {
    try {
      // Check if device has biometric hardware
      final canAuthenticateWithBiometrics = await _localAuth.canCheckBiometrics;

      // Check if device can authenticate (includes PIN/password fallback)
      final canAuthenticate = await _localAuth.isDeviceSupported();

      _logger.d('Biometric availability check:');
      _logger.d('  - canCheckBiometrics: $canAuthenticateWithBiometrics');
      _logger.d('  - isDeviceSupported: $canAuthenticate');

      return canAuthenticateWithBiometrics || canAuthenticate;
    } on LocalAuthException catch (e) {
      _logger.e('Error checking biometric availability', error: e);
      return false;
    }
  }

  /// Get the list of available biometric types
  Future<List<BiometricType>> getAvailableBiometrics() async {
    try {
      final biometrics = await _localAuth.getAvailableBiometrics();
      _logger.d('Available biometrics: $biometrics');
      return biometrics;
    } on LocalAuthException catch (e) {
      _logger.e('Error getting available biometrics', error: e);
      return [];
    }
  }

  /// Get the primary biometric type for UI display
  Future<BiometricDisplayType> getPrimaryBiometricType() async {
    final biometrics = await getAvailableBiometrics();

    if (biometrics.isEmpty) {
      return BiometricDisplayType.none;
    }

    // Check platform-specific biometrics
    if (Platform.isIOS || Platform.isMacOS) {
      if (biometrics.contains(BiometricType.face)) {
        return BiometricDisplayType.faceId;
      }
      if (biometrics.contains(BiometricType.fingerprint)) {
        return BiometricDisplayType.touchId;
      }
    }

    if (Platform.isWindows) {
      // Windows Hello can be face, fingerprint, or PIN
      if (biometrics.contains(BiometricType.face)) {
        return BiometricDisplayType.windowsHelloFace;
      }
      if (biometrics.contains(BiometricType.fingerprint)) {
        return BiometricDisplayType.windowsHelloFingerprint;
      }
      return BiometricDisplayType.windowsHello;
    }

    if (Platform.isAndroid) {
      if (biometrics.contains(BiometricType.face)) {
        return BiometricDisplayType.face;
      }
      if (biometrics.contains(BiometricType.fingerprint)) {
        return BiometricDisplayType.fingerprint;
      }
    }

    return BiometricDisplayType.generic;
  }

  /// Authenticate using biometrics
  ///
  /// Returns true if authentication succeeded, false otherwise.
  /// Throws [BiometricAuthException] on errors.
  Future<bool> authenticate({
    String reason = 'Authenticate to access the app',
    bool biometricOnly = false,
  }) async {
    try {
      _logger.i('Requesting biometric authentication');

      // local_auth 3.0: parameters passed directly
      final didAuthenticate = await _localAuth.authenticate(
        localizedReason: reason,
        biometricOnly: biometricOnly,
      );

      _logger.i('Biometric authentication result: $didAuthenticate');
      return didAuthenticate;
    } on LocalAuthException catch (e) {
      _logger.e('Biometric authentication error', error: e);

      // local_auth 3.0: Use LocalAuthExceptionCode enum for error handling
      switch (e.code) {
        case LocalAuthExceptionCode.noBiometricHardware:
        case LocalAuthExceptionCode.biometricHardwareTemporarilyUnavailable:
          throw BiometricAuthException(
            'Biometric authentication is not available on this device',
            code: BiometricErrorCode.notAvailable,
          );
        case LocalAuthExceptionCode.noBiometricsEnrolled:
        case LocalAuthExceptionCode.noCredentialsSet:
          throw BiometricAuthException(
            'No biometrics enrolled on this device',
            code: BiometricErrorCode.notEnrolled,
          );
        case LocalAuthExceptionCode.temporaryLockout:
          throw BiometricAuthException(
            'Biometric authentication is locked due to too many attempts',
            code: BiometricErrorCode.lockedOut,
          );
        case LocalAuthExceptionCode.biometricLockout:
          throw BiometricAuthException(
            'Biometric authentication is permanently locked',
            code: BiometricErrorCode.permanentlyLockedOut,
          );
        case LocalAuthExceptionCode.userCanceled:
          throw BiometricAuthException(
            'Authentication cancelled by user',
            code: BiometricErrorCode.cancelled,
          );
        default:
          throw BiometricAuthException(
            'Biometric authentication failed: ${e.description}',
            code: BiometricErrorCode.unknown,
            originalError: e,
          );
      }
    }
  }

  /// Cancel any ongoing biometric authentication
  Future<void> cancelAuthentication() async {
    try {
      await _localAuth.stopAuthentication();
      _logger.d('Biometric authentication cancelled');
    } catch (e) {
      _logger.w('Error cancelling biometric authentication', error: e);
    }
  }
}

/// Display type for biometric UI
enum BiometricDisplayType {
  none,
  faceId,
  touchId,
  windowsHello,
  windowsHelloFace,
  windowsHelloFingerprint,
  face,
  fingerprint,
  generic,
}

/// Error codes for biometric authentication
enum BiometricErrorCode {
  notAvailable,
  notEnrolled,
  lockedOut,
  permanentlyLockedOut,
  cancelled,
  unknown,
}

/// Exception thrown when biometric authentication fails
class BiometricAuthException implements Exception {
  final String message;
  final BiometricErrorCode code;
  final dynamic originalError;

  BiometricAuthException(
    this.message, {
    required this.code,
    this.originalError,
  });

  @override
  String toString() => 'BiometricAuthException: $message (code: $code)';
}
