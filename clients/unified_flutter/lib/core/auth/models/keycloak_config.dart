import 'package:freezed_annotation/freezed_annotation.dart';
import '../../config/environment_config.dart';

part 'keycloak_config.freezed.dart';
part 'keycloak_config.g.dart';

/// Keycloak server configuration
///
/// Configure these values for your Keycloak instance:
/// - issuer: Your Keycloak realm URL (e.g., https://auth.tamshai.com/realms/tamshai)
/// - clientId: Your client ID configured in Keycloak (should be a public client)
/// - redirectUrl: OAuth callback URL (for Windows: http://localhost:0/callback)
/// - scopes: OAuth scopes to request (openid is required, add profile, email as needed)
@freezed
sealed class KeycloakConfig with _$KeycloakConfig {
  const factory KeycloakConfig({
    required String issuer,
    required String clientId,
    required String redirectUrl,
    @Default(['openid', 'profile', 'email', 'offline_access']) List<String> scopes,
    String? discoveryUrl,
    String? endSessionRedirectUrl,
  }) = _KeycloakConfig;

  factory KeycloakConfig.fromJson(Map<String, dynamic> json) =>
      _$KeycloakConfigFromJson(json);
}

/// Keycloak configuration provider for Tamshai Enterprise AI
///
/// Uses EnvironmentConfig to determine the correct Keycloak settings
/// based on the build-time ENV variable (dev, stage, prod).
class KeycloakConfigProvider {
  /// Get Keycloak configuration for current environment
  /// Set via: flutter build --dart-define=ENV=stage
  static KeycloakConfig getConfig() {
    final env = EnvironmentConfig.current;
    return KeycloakConfig(
      issuer: env.keycloakIssuer,
      clientId: env.keycloakClientId,
      redirectUrl: env.redirectUrl,
      endSessionRedirectUrl: env.endSessionRedirectUrl,
      scopes: env.scopes,
    );
  }

  /// Legacy method - returns config for current environment
  @Deprecated('Use getConfig() instead')
  static KeycloakConfig getDevelopmentConfig() => getConfig();

  /// Legacy method - returns config for current environment
  @Deprecated('Use getConfig() instead')
  static KeycloakConfig getProductionConfig() => getConfig();
}
