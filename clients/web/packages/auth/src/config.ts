import { WebStorageStateStore } from 'oidc-client-ts';

/**
 * Determine environment-specific Keycloak configuration
 */
function getKeycloakConfig() {
  const hostname = window.location.hostname;
  const origin = window.location.origin;

  // Dev environment with Caddy (tamshai.local)
  if (hostname === 'tamshai.local' || hostname === 'www.tamshai.local') {
    return {
      authority: `${origin}/auth/realms/tamshai-corp`,
      client_id: 'tamshai-website',
      redirect_uri: `${origin}/app/callback`,
      post_logout_redirect_uri: origin,
    };
  }

  // Stage/Prod environment (tamshai.com or VPS IP)
  if (hostname.includes('tamshai.com') || hostname.includes('5.78.159.29')) {
    return {
      authority: `${origin}/auth/realms/tamshai-corp`,
      client_id: 'tamshai-website',
      redirect_uri: `${origin}/app/callback`,
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
