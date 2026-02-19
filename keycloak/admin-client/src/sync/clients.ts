import type ClientRepresentation from '@keycloak/keycloak-admin-client/lib/defs/clientRepresentation.js';
import type { KeycloakAdminWrapper } from '../client.js';
import type { ClientSecrets, Environment } from '../config.js';
import { logger } from '../utils/logger.js';

export interface ClientConfig {
  clientId: string;
  name: string;
  description: string;
  publicClient: boolean;
  standardFlowEnabled: boolean;
  directAccessGrantsEnabled: boolean;
  serviceAccountsEnabled: boolean;
  fullScopeAllowed: boolean;
  redirectUris: string[];
  webOrigins: string[];
  defaultClientScopes: string[];
  secret?: string;
}

export class ClientSync {
  constructor(
    private kc: KeycloakAdminWrapper,
    private secrets: ClientSecrets,
    private environment: Environment
  ) {}

  async syncAll(): Promise<void> {
    logger.info('Syncing Keycloak clients...');

    // MCP Gateway
    await this.syncClient(this.getMcpGatewayConfig());

    // MCP HR Service
    await this.syncClient(this.getMcpHrServiceConfig());

    // MCP UI
    await this.syncClient(this.getMcpUiConfig());

    // MCP Integration Runner (dev/stage only - for tests)
    if (this.environment === 'dev' || this.environment === 'stage') {
      await this.syncClient(this.getMcpIntegrationRunnerConfig());
    }

    // Tamshai Website (public client for SPA)
    await this.syncClient(this.getTamshaiWebsiteConfig());

    // Flutter Client
    await this.syncClient(this.getFlutterClientConfig());

    logger.info('Client sync complete');
  }

  private async syncClient(config: ClientConfig): Promise<void> {
    const { clientId } = config;
    logger.info(`Syncing client: ${clientId}`);

    try {
      // Check if client exists
      const existing = await this.kc.clients.find({ clientId });

      const clientRep: ClientRepresentation = {
        clientId: config.clientId,
        name: config.name,
        description: config.description,
        enabled: true,
        publicClient: config.publicClient,
        standardFlowEnabled: config.standardFlowEnabled,
        directAccessGrantsEnabled: config.directAccessGrantsEnabled,
        serviceAccountsEnabled: config.serviceAccountsEnabled,
        fullScopeAllowed: config.fullScopeAllowed,
        protocol: 'openid-connect',
        redirectUris: config.redirectUris,
        webOrigins: config.webOrigins,
        defaultClientScopes: config.defaultClientScopes,
        attributes: {
          'pkce.code.challenge.method': 'S256',
        },
      };

      if (existing.length > 0) {
        // Update existing client
        const id = existing[0].id!;
        await this.kc.clients.update({ id }, clientRep);
        logger.info(`  Updated existing client: ${clientId}`);

        // Set secret if provided (for confidential clients)
        if (config.secret && !config.publicClient) {
          await this.kc.clients.update({ id }, { secret: config.secret });
          logger.info(`  Updated client secret`);
        }
      } else {
        // Create new client
        if (config.secret && !config.publicClient) {
          clientRep.secret = config.secret;
        }
        await this.kc.clients.create(clientRep);
        logger.info(`  Created new client: ${clientId}`);
      }
    } catch (error) {
      logger.error(`Failed to sync client ${clientId}`, { error });
      throw error;
    }
  }

  private getMcpGatewayConfig(): ClientConfig {
    const domain = this.getDomain();
    return {
      clientId: 'mcp-gateway',
      name: 'MCP Gateway',
      description: 'Backend service for AI orchestration',
      publicClient: false,
      standardFlowEnabled: true,
      directAccessGrantsEnabled: false, // Security: ROPC disabled
      serviceAccountsEnabled: true,
      fullScopeAllowed: true,
      redirectUris: [
        'http://localhost:3100/*',
        `https://${domain}/*`,
        `https://${domain}/api/*`,
      ],
      webOrigins: this.getWebOrigins(), // E3 fix: explicit origins
      defaultClientScopes: ['openid', 'profile', 'email', 'roles'],
      secret: this.secrets.mcpGateway,
    };
  }

  private getMcpHrServiceConfig(): ClientConfig {
    return {
      clientId: 'mcp-hr-service',
      name: 'MCP HR Identity Sync Service',
      description: 'Service account for syncing HR employees to Keycloak users',
      publicClient: false,
      standardFlowEnabled: false,
      directAccessGrantsEnabled: false,
      serviceAccountsEnabled: true,
      fullScopeAllowed: false, // M1 fix: minimal scope
      redirectUris: [],
      webOrigins: [],
      defaultClientScopes: ['profile', 'email'],
      secret: this.secrets.mcpHrService,
    };
  }

  private getMcpUiConfig(): ClientConfig {
    return {
      clientId: 'mcp-ui',
      name: 'MCP UI Service',
      description: 'Generative UI component renderer',
      publicClient: false,
      standardFlowEnabled: false,
      directAccessGrantsEnabled: false,
      serviceAccountsEnabled: true,
      fullScopeAllowed: false,
      redirectUris: [],
      webOrigins: [],
      defaultClientScopes: ['profile', 'email', 'roles'],
      secret: this.secrets.mcpUi,
    };
  }

  private getMcpIntegrationRunnerConfig(): ClientConfig {
    return {
      clientId: 'mcp-integration-runner',
      name: 'MCP Integration Test Runner',
      description: 'Service account for integration tests with token exchange',
      publicClient: false,
      standardFlowEnabled: false,
      directAccessGrantsEnabled: false,
      serviceAccountsEnabled: true,
      fullScopeAllowed: true,
      redirectUris: [],
      webOrigins: [],
      defaultClientScopes: ['openid', 'profile', 'email', 'roles'],
      secret: this.secrets.mcpIntegrationRunner,
    };
  }

  private getTamshaiWebsiteConfig(): ClientConfig {
    const domain = this.getDomain();
    return {
      clientId: 'tamshai-website',
      name: 'Tamshai Website',
      description: 'Employee web portal (SPA)',
      publicClient: true,
      standardFlowEnabled: true,
      directAccessGrantsEnabled: false,
      serviceAccountsEnabled: false,
      fullScopeAllowed: true,
      redirectUris: [
        'http://localhost:4000/*',
        'http://localhost:4001/*',
        'http://localhost:4002/*',
        'http://localhost:4003/*',
        'http://localhost:4004/*',
        'http://localhost:4005/*',
        `https://${domain}/*`,
        `https://${domain}/app/*`,
      ],
      webOrigins: this.getWebOrigins(),
      defaultClientScopes: ['openid', 'profile', 'email', 'roles'],
    };
  }

  private getFlutterClientConfig(): ClientConfig {
    return {
      clientId: 'tamshai-flutter',
      name: 'Tamshai Flutter Client',
      description: 'Desktop and mobile application',
      publicClient: true,
      standardFlowEnabled: true,
      directAccessGrantsEnabled: false,
      serviceAccountsEnabled: false,
      fullScopeAllowed: true,
      redirectUris: [
        'tamshai://callback',
        'http://localhost:18765/*',
        'http://localhost:18766/*',
        'http://localhost:18767/*',
        'http://localhost:18768/*',
        'http://localhost:18769/*',
      ],
      webOrigins: ['+'], // Required for desktop OAuth
      defaultClientScopes: ['openid', 'profile', 'email', 'roles', 'offline_access'],
    };
  }

  private getDomain(): string {
    const domains: Record<Environment, string> = {
      dev: 'www.tamshai.local',
      stage: 'www.tamshai.com',
      prod: 'prod.tamshai.com',
    };
    return domains[this.environment];
  }

  private getWebOrigins(): string[] {
    // E3 fix: Explicit webOrigins per environment (not wildcard)
    const origins: Record<Environment, string[]> = {
      dev: [
        'http://localhost:3100',
        'http://localhost:4000',
        'http://localhost:4001',
        'http://localhost:4002',
        'http://localhost:4003',
        'http://localhost:4004',
        'http://localhost:4005',
        'https://www.tamshai.local',
      ],
      stage: ['https://www.tamshai.com'],
      prod: ['https://prod.tamshai.com'],
    };
    return origins[this.environment];
  }
}
