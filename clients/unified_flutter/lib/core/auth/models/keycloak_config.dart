import 'package:freezed_annotation/freezed_annotation.dart';

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
class KeycloakConfig with _$KeycloakConfig {
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

/// Keycloak configuration for Tamshai Enterprise AI
///
/// Development: Local Keycloak at port 8180
/// Production: Production Keycloak server
class KeycloakConfigProvider {
  static KeycloakConfig getDevelopmentConfig() {
    return const KeycloakConfig(
      // Local Keycloak instance (Docker)
      // See: infrastructure/docker/docker-compose.yml
      // Realm name is 'tamshai-corp' (from keycloak/realm-export.json)
      issuer: 'http://localhost:8180/realms/tamshai-corp',

      // Public client for Flutter app (PKCE enabled)
      // Configured in keycloak/realm-export.json
      clientId: 'tamshai-flutter-client',

      // For Windows desktop - flutter_appauth handles the port dynamically
      redirectUrl: 'http://localhost:0/callback',

      // End session redirect
      endSessionRedirectUrl: 'http://localhost:0/logout',

      // Scopes: offline_access needed for refresh tokens
      // 'roles' scope added for role-based access control
      scopes: ['openid', 'profile', 'email', 'offline_access', 'roles'],
    );
  }

  static KeycloakConfig getProductionConfig() {
    return const KeycloakConfig(
      // Production Keycloak URL
      issuer: 'https://auth.tamshai.com/realms/tamshai-corp',
      clientId: 'tamshai-flutter-client',
      redirectUrl: 'com.tamshai.ai://callback',
      endSessionRedirectUrl: 'com.tamshai.ai://logout',
      scopes: ['openid', 'profile', 'email', 'offline_access', 'roles'],
    );
  }
}
