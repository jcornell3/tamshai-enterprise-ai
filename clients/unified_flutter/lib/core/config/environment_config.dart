/// Environment configuration for Tamshai Enterprise AI Flutter client
///
/// This file centralizes all environment-specific configuration.
/// The environment is determined at build time via --dart-define=ENV=<env>
///
/// Environments:
///   - dev: Local Docker development (localhost)
///   - stage: VPS staging (www.tamshai.com)
///   - prod: Production GCP (api.tamshai.com)

/// Current environment from build-time dart-define
const String currentEnvironment = String.fromEnvironment(
  'ENV',
  defaultValue: 'dev',
);

/// Environment-specific configuration
class EnvironmentConfig {
  final String name;
  final String apiBaseUrl;
  final String keycloakIssuer;
  final String keycloakClientId;
  final String redirectUrl;
  final String endSessionRedirectUrl;
  final List<String> scopes;

  const EnvironmentConfig({
    required this.name,
    required this.apiBaseUrl,
    required this.keycloakIssuer,
    required this.keycloakClientId,
    required this.redirectUrl,
    required this.endSessionRedirectUrl,
    required this.scopes,
  });

  /// Development environment - local Docker
  static const dev = EnvironmentConfig(
    name: 'dev',
    // Local MCP Gateway (direct, bypasses Kong)
    apiBaseUrl: 'http://127.0.0.1:3100',
    // Local Keycloak
    keycloakIssuer: 'http://127.0.0.1:8180/realms/tamshai-corp',
    keycloakClientId: 'tamshai-flutter-client',
    // Desktop OAuth uses dynamic port
    redirectUrl: 'http://127.0.0.1/callback',
    endSessionRedirectUrl: 'http://127.0.0.1/logout',
    scopes: ['openid', 'profile', 'email', 'roles'],
  );

  /// Stage environment - VPS at vps.tamshai.com
  static const stage = EnvironmentConfig(
    name: 'stage',
    // VPS API via Cloudflare (Kong → MCP Gateway)
    // Note: Do NOT include /api suffix - chat_service.dart adds /api/query path
    apiBaseUrl: 'https://vps.tamshai.com',
    // VPS Keycloak via Cloudflare
    keycloakIssuer: 'https://vps.tamshai.com/auth/realms/tamshai-corp',
    keycloakClientId: 'tamshai-flutter-client',
    // Mobile deep links for OAuth callback
    redirectUrl: 'com.tamshai.stage://callback',
    endSessionRedirectUrl: 'com.tamshai.stage://logout',
    scopes: ['openid', 'profile', 'email', 'offline_access', 'roles'],
  );

  /// Production environment - GCP
  static const prod = EnvironmentConfig(
    name: 'prod',
    // Production API
    apiBaseUrl: 'https://api.tamshai.com',
    // Production Keycloak
    keycloakIssuer: 'https://auth.tamshai.com/realms/tamshai-corp',
    keycloakClientId: 'tamshai-flutter-client',
    // Production deep links
    redirectUrl: 'com.tamshai.ai://callback',
    endSessionRedirectUrl: 'com.tamshai.ai://logout',
    scopes: ['openid', 'profile', 'email', 'offline_access', 'roles'],
  );

  /// Get configuration for current environment
  static EnvironmentConfig get current {
    switch (currentEnvironment) {
      case 'stage':
        return stage;
      case 'prod':
        return prod;
      case 'dev':
      default:
        return dev;
    }
  }

  /// Check if running in development mode
  static bool get isDev => currentEnvironment == 'dev';

  /// Check if running in stage mode
  static bool get isStage => currentEnvironment == 'stage';

  /// Check if running in production mode
  static bool get isProd => currentEnvironment == 'prod';
}
