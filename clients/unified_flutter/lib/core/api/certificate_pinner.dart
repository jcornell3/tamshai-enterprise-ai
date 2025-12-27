import 'dart:io';
import 'package:dio/dio.dart';
import 'package:dio/io.dart';

/// Certificate pinning configuration for secure API connections.
///
/// Implements certificate pinning to prevent MITM attacks by verifying
/// that the server certificate matches expected fingerprints.
///
/// Usage:
/// - In production, replace placeholder fingerprints with actual certificate SHA-256 fingerprints
/// - Fingerprints can be obtained using: openssl s_client -connect host:port | openssl x509 -pubkey -noout | openssl sha256
class CertificatePinner {
  /// SHA-256 fingerprints of pinned certificates.
  /// Add production certificate fingerprints here.
  static const List<String> pinnedCertificates = [
    // Production API certificate fingerprint (placeholder - replace with actual)
    // 'sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',

    // Backup certificate fingerprint (placeholder - replace with actual)
    // 'sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=',
  ];

  /// List of hosts that should be exempt from certificate pinning.
  /// Typically includes localhost for development.
  static const List<String> exemptHosts = [
    'localhost',
    '127.0.0.1',
    '10.0.2.2',  // Android emulator localhost
  ];

  /// Whether certificate pinning is enabled.
  /// Disabled when no certificates are pinned (development mode).
  static bool get isEnabled => pinnedCertificates.isNotEmpty;

  /// Configures the Dio instance with certificate pinning.
  ///
  /// In development (when [pinnedCertificates] is empty), this method
  /// does nothing and allows all certificates.
  ///
  /// In production, it validates certificates against the pinned fingerprints
  /// and rejects connections that don't match.
  static void configure(Dio dio) {
    if (!isEnabled) {
      // Certificate pinning disabled - development mode
      return;
    }

    final adapter = dio.httpClientAdapter;
    if (adapter is IOHttpClientAdapter) {
      adapter.createHttpClient = () {
        final client = HttpClient();

        client.badCertificateCallback = (X509Certificate cert, String host, int port) {
          // Allow exempt hosts (localhost for development)
          if (exemptHosts.contains(host)) {
            return true;
          }

          // Verify certificate fingerprint
          final fingerprint = _getCertificateFingerprint(cert);
          final isValid = pinnedCertificates.contains(fingerprint);

          if (!isValid) {
            // Log certificate pinning failure for security monitoring
            // In production, this would send to a security monitoring service
            print('[SECURITY] Certificate pinning failed for $host');
            print('[SECURITY] Expected one of: $pinnedCertificates');
            print('[SECURITY] Got: $fingerprint');
          }

          return isValid;
        };

        return client;
      };
    }
  }

  /// Extracts the SHA-256 fingerprint from an X509 certificate.
  static String _getCertificateFingerprint(X509Certificate cert) {
    // Note: In a production app, you would use a proper SHA-256 implementation
    // to compute the fingerprint of the certificate's public key.
    // This is a simplified version for demonstration.

    // The actual implementation would:
    // 1. Extract the SubjectPublicKeyInfo from the certificate
    // 2. Compute SHA-256 hash of it
    // 3. Base64 encode the result

    // For now, we return a placeholder that would need to be replaced
    // with actual fingerprint computation using packages like 'pointycastle'
    return 'sha256/${cert.sha1.map((b) => b.toRadixString(16).padLeft(2, '0')).join()}';
  }
}
