import { WebStorageStateStore } from 'oidc-client-ts';

/**
 * Detect the current app's base path from the URL
 * Returns: /app, /hr, /finance, /sales, /support, or empty string
 */
function getAppBasePath(): string {
  const pathname = window.location.pathname;
  const appPaths = ['/app', '/hr', '/finance', '/sales', '/support'];

  for (const appPath of appPaths) {
    if (pathname.startsWith(appPath)) {
      return appPath;
    }
  }

  return '';
}

/**
 * Check if the current hostname indicates a deployed environment
 * (dev with Caddy, stage VPS, or production)
 */
function isDeployedEnvironment(hostname: string): boolean {
  // Known deployed hostnames
  const deployedHosts = [
    'tamshai.local',
    'www.tamshai.local',
    'tamshai.com',
    'www.tamshai.com',
    'vps.tamshai.com',
  ];

  // Check known hosts
  if (deployedHosts.some(h => hostname.includes(h))) {
    return true;
  }

  // Check for VPS IP via environment variable (set at build time)
  // This allows stage builds to recognize the VPS IP without hardcoding
  const stageHost = import.meta.env.VITE_STAGE_HOST;
  if (stageHost && hostname.includes(stageHost)) {
    return true;
  }

  return false;
}

/**
 * GCP Production hostnames (primary and DR)
 * These use Keycloak on separate Cloud Run URL (not proxied)
 */
const GCP_PROD_HOSTS = [
  'prod.tamshai.com',
  'prod-dr.tamshai.com',  // DR: Regional evacuation
  'app.tamshai.com',
  'app-dr.tamshai.com',   // DR: Regional evacuation
];

/**
 * Determine environment-specific Keycloak configuration
 */
function getKeycloakConfig() {
  const hostname = window.location.hostname;
  const origin = window.location.origin;
  const basePath = getAppBasePath();

  // GCP Production (Primary or DR) - Keycloak on separate Cloud Run URL (not proxied)
  // VITE_KEYCLOAK_URL must be set at build time to point to either:
  //   - Primary: https://auth.tamshai.com/auth/realms/tamshai-corp
  //   - DR: https://auth-dr.tamshai.com/auth/realms/tamshai-corp
  if (GCP_PROD_HOSTS.includes(hostname)) {
    return {
      authority: import.meta.env.VITE_KEYCLOAK_URL,
      client_id: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'web-portal',
      redirect_uri: `${origin}${basePath}/callback`,
      post_logout_redirect_uri: origin,
    };
  }

  // Deployed environment with proxied Keycloak (Caddy routing, stage VPS)
  if (isDeployedEnvironment(hostname)) {
    return {
      authority: `${origin}/auth/realms/tamshai-corp`,
      client_id: 'tamshai-website',
      redirect_uri: `${origin}${basePath}/callback`,
      post_logout_redirect_uri: origin,
    };
  }

  // Local development (localhost)
  return {
    authority: import.meta.env.VITE_KEYCLOAK_URL || 'http://127.0.0.1:8180/auth/realms/tamshai-corp',
    client_id: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'tamshai-website',
    redirect_uri: `${origin}/callback`,
    post_logout_redirect_uri: origin,
  };
}

const envConfig = getKeycloakConfig();

/**
 * Keycloak OIDC Configuration
 *
 * SECURITY NOTE (Article V.2):
 * - Access tokens stored in memory only (not localStorage/sessionStorage)
 * - Only refresh tokens stored in sessionStorage via WebStorageStateStore
 * - Tokens have 5-minute lifetime with automatic refresh
 */
export const oidcConfig = {
  // Environment-aware Keycloak endpoints
  authority: envConfig.authority,
  client_id: envConfig.client_id,
  redirect_uri: envConfig.redirect_uri,
  post_logout_redirect_uri: envConfig.post_logout_redirect_uri,

  // PKCE flow (Article V: OIDC with PKCE, no implicit flow)
  response_type: 'code',
  scope: 'openid profile email',

  // Silent refresh configuration - DISABLED for debugging
  automaticSilentRenew: false,
  // silent_redirect_uri: `${window.location.origin}/silent-renew.html`,

  // Storage: sessionStorage for refresh token only
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),

  // Token validation
  loadUserInfo: true,
  monitorSession: false, // Disabled - can cause iframe issues

  // Timeout settings
  silentRequestTimeoutInSeconds: 10,
  accessTokenExpiringNotificationTimeInSeconds: 60, // Refresh 1 min before expiry
};

/**
 * API Gateway configuration
 *
 * NOTE: Web apps use empty string for same-origin requests
 * - Requests go through Nginx proxy → Kong Gateway → MCP Gateway
 * - Avoids CORS issues
 * - Desktop app can override with full URL in env vars
 */
export const apiConfig = {
  gatewayUrl: import.meta.env.VITE_API_GATEWAY_URL || '',  // Same origin (proxied by Nginx)
  mcpGatewayUrl: import.meta.env.VITE_MCP_GATEWAY_URL || '',  // Same origin (proxied by Nginx)
};
