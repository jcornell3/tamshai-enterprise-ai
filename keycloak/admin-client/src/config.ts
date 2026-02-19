import { config as loadEnv } from 'dotenv';

export type Environment = 'dev' | 'stage' | 'prod';

export interface KeycloakConfig {
  baseUrl: string;
  realmName: string;
  adminUser: string;
  adminPassword?: string;
  adminClientSecret?: string;
  environment: Environment;
}

export interface ClientSecrets {
  mcpGateway: string;
  mcpHrService: string;
  mcpIntegrationRunner?: string;
  mcpUi: string;
}

export interface Config {
  keycloak: KeycloakConfig;
  secrets: ClientSecrets;
}

export function loadConfig(): Config {
  // Load .env file if present
  loadEnv();

  const env = (process.env.ENV || 'dev') as Environment;

  const baseUrls: Record<Environment, string> = {
    dev: process.env.KEYCLOAK_URL || 'http://localhost:8180/auth',
    stage: process.env.KEYCLOAK_URL || 'https://www.tamshai.com/auth',
    prod: process.env.KEYCLOAK_URL || 'https://prod.tamshai.com/auth',
  };

  return {
    keycloak: {
      baseUrl: baseUrls[env],
      realmName: 'tamshai-corp',
      adminUser: process.env.KEYCLOAK_ADMIN || 'admin',
      adminPassword: process.env.KEYCLOAK_ADMIN_PASSWORD,
      adminClientSecret: process.env.KEYCLOAK_ADMIN_CLIENT_SECRET,
      environment: env,
    },
    secrets: {
      mcpGateway: process.env.MCP_GATEWAY_CLIENT_SECRET || '',
      mcpHrService: process.env.MCP_HR_SERVICE_CLIENT_SECRET || '',
      mcpIntegrationRunner: process.env.MCP_INTEGRATION_RUNNER_SECRET,
      mcpUi: process.env.MCP_UI_CLIENT_SECRET || '',
    },
  };
}
