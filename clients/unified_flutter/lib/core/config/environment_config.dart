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
    // Use tamshaiauth scheme for mobile, desktop uses DesktopOAuthService with dynamic port
    redirectUrl: 'tamshaiauth://callback',
    endSessionRedirectUrl: 'tamshaiauth://logout',
    scopes: ['openid', 'profile', 'email', 'offline_access', 'roles'],
  );

  /// Stage environment - VPS at www.tamshai.com
  static const stage = EnvironmentConfig(
    name: 'stage',
    // VPS API via Cloudflare (Kong → MCP Gateway)
    // Note: Do NOT include /api suffix - chat_service.dart adds /api/query path
    apiBaseUrl: 'https://www.tamshai.com',
    // VPS Keycloak via Cloudflare
    keycloakIssuer: 'https://www.tamshai.com/auth/realms/tamshai-corp',
    keycloakClientId: 'tamshai-flutter-client',
    // Mobile deep links for OAuth callback (simple scheme without dots for Android compatibility)
    redirectUrl: 'tamshaiauth://callback',
    endSessionRedirectUrl: 'tamshaiauth://logout',
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
    // Use tamshaiauth scheme for mobile (simple scheme without dots for Android compatibility)
    // Desktop uses DesktopOAuthService with dynamic port override
    redirectUrl: 'tamshaiauth://callback',
    endSessionRedirectUrl: 'tamshaiauth://logout',
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
