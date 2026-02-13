/**
 * Auth Module - Keycloak Authentication for MCP-UI
 *
 * Exports the authentication service for obtaining JWT tokens
 * to use when calling MCP Gateway.
 */

export {
  KeycloakAuthService,
  KeycloakAuthConfig,
  createAuthServiceFromEnv,
} from './keycloak-auth';
