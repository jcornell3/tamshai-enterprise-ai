/**
 * Customer Portal OIDC Configuration
 *
 * Uses the tamshai-customers realm (separate from internal tamshai realm)
 * for customer authentication with lead-customer and basic-customer roles.
 */

import { WebStorageStateStore } from 'oidc-client-ts';

/**
 * Check if running in a deployed environment (Caddy proxy, VPS, or production)
 */
function isDeployedEnvironment(hostname: string): boolean {
  const deployedHosts = [
    'customers.tamshai-playground.local',
    'customers.tamshai.com',
    'customer-support.tamshai.com',
  ];

  if (deployedHosts.some(h => hostname.includes(h))) {
    return true;
  }

  // Check for VPS IP via environment variable
  const stageHost = import.meta.env.VITE_STAGE_HOST;
  if (stageHost && hostname.includes(stageHost)) {
    return true;
  }

  return false;
}

/**
 * Get the Keycloak authority URL for the customer realm.
 * Keycloak's issuer uses the www domain (configured frontend URL),
 * so the authority must match regardless of which subdomain the app runs on.
 */
function getKeycloakAuthorityUrl(): string {
  const hostname = window.location.hostname;
  const port = window.location.port;
  const portSuffix = port && port !== '443' && port !== '80' ? `:${port}` : '';

  // Map customer subdomain to www domain (matches Keycloak's issuer)
  const domainMap: Record<string, string> = {
    'customers.tamshai-playground.local': 'www.tamshai-playground.local',
    'customers.tamshai.com': 'www.tamshai.com',
    'customer-support.tamshai.com': 'www.tamshai.com',
  };

  const keycloakHost = domainMap[hostname] || hostname;
  return `https://${keycloakHost}${portSuffix}/auth/realms/tamshai-customers`;
}

/**
 * Get the customer portal OIDC configuration
 * Uses tamshai-customers realm instead of tamshai
 */
function getCustomerOidcConfig() {
  const hostname = window.location.hostname;
  const origin = window.location.origin;

  // Deployed environment (Caddy routing proxies /auth to Keycloak)
  if (isDeployedEnvironment(hostname)) {
    return {
      authority: getKeycloakAuthorityUrl(),
      client_id: 'customer-portal',
      redirect_uri: `${origin}/callback`,
      post_logout_redirect_uri: origin,
    };
  }

  // Local development (localhost:4006)
  return {
    authority: import.meta.env.VITE_KEYCLOAK_URL || 'http://127.0.0.1:8180/realms/tamshai-customers',
    client_id: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'customer-portal',
    redirect_uri: `${origin}/callback`,
    post_logout_redirect_uri: origin,
  };
}

// Lazy config cache
let _oidcConfig: ReturnType<typeof buildOidcConfig> | null = null;

function buildOidcConfig() {
  const envConfig = getCustomerOidcConfig();
  return {
    authority: envConfig.authority,
    client_id: envConfig.client_id,
    redirect_uri: envConfig.redirect_uri,
    post_logout_redirect_uri: envConfig.post_logout_redirect_uri,

    // PKCE flow (no implicit flow)
    response_type: 'code',
    scope: 'openid profile email organization',

    // Silent refresh - disabled for simplicity
    automaticSilentRenew: false,

    // Storage: sessionStorage for refresh token
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),

    // Token validation
    loadUserInfo: true,
    monitorSession: false,

    // Timeout settings
    silentRequestTimeoutInSeconds: 10,
    accessTokenExpiringNotificationTimeInSeconds: 60,
  };
}

/**
 * Customer OIDC Configuration (lazy loaded)
 */
export const customerOidcConfig = new Proxy({} as ReturnType<typeof buildOidcConfig>, {
  get(_, prop) {
    if (!_oidcConfig) {
      _oidcConfig = buildOidcConfig();
    }
    return (_oidcConfig as any)[prop];
  },
  ownKeys() {
    if (!_oidcConfig) {
      _oidcConfig = buildOidcConfig();
    }
    return Reflect.ownKeys(_oidcConfig!);
  },
  getOwnPropertyDescriptor(_, prop) {
    if (!_oidcConfig) {
      _oidcConfig = buildOidcConfig();
    }
    return Object.getOwnPropertyDescriptor(_oidcConfig!, prop);
  },
});

/**
 * API configuration for customer portal
 */
export const apiConfig = {
  gatewayUrl: import.meta.env.VITE_API_GATEWAY_URL || '',
  mcpGatewayUrl: import.meta.env.VITE_MCP_GATEWAY_URL || '',
};
