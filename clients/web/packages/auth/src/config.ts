import { WebStorageStateStore } from 'oidc-client-ts';

/**
 * Keycloak OIDC Configuration
 *
 * SECURITY NOTE (Article V.2):
 * - Access tokens stored in memory only (not localStorage/sessionStorage)
 * - Only refresh tokens stored in sessionStorage via WebStorageStateStore
 * - Tokens have 5-minute lifetime with automatic refresh
 */
export const oidcConfig = {
  // Keycloak endpoints
  authority: import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8180/realms/tamshai-corp',
  client_id: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'mcp-gateway',
  redirect_uri: `${window.location.origin}/callback`,
  post_logout_redirect_uri: window.location.origin,

  // PKCE flow (Article V: OIDC with PKCE, no implicit flow)
  response_type: 'code',
  scope: 'openid profile email',

  // Silent refresh configuration
  automaticSilentRenew: true,
  silent_redirect_uri: `${window.location.origin}/silent-renew.html`,

  // Storage: sessionStorage for refresh token only
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),

  // Token validation
  loadUserInfo: true,
  monitorSession: true,

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
