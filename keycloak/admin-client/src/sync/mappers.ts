import type { KeycloakAdminWrapper } from '../client.js';
import { logger } from '../utils/logger.js';

interface ProtocolMapperConfig {
  name: string;
  protocol: string;
  protocolMapper: string;
  config: Record<string, string>;
}

export class MapperSync {
  constructor(private kc: KeycloakAdminWrapper) {}

  async syncAll(): Promise<void> {
    logger.info('Syncing protocol mappers...');

    // Add audience mapper to tamshai-website client
    await this.syncAudienceMapper('tamshai-website', 'mcp-gateway');

    // Add audience mapper to mcp-gateway client (self-audience)
    await this.syncAudienceMapper('mcp-gateway', 'mcp-gateway');

    // Add realm roles mapper to roles scope
    await this.syncRolesMapper();

    logger.info('Protocol mapper sync complete');
  }

  private async syncAudienceMapper(
    clientId: string,
    audienceClientId: string
  ): Promise<void> {
    const mapperName = `${audienceClientId}-audience`;
    logger.info(`Syncing audience mapper: ${mapperName} for client ${clientId}`);

    try {
      // Find the client
      const clients = await this.kc.clients.find({ clientId });
      if (clients.length === 0) {
        logger.warn(`  Client ${clientId} not found, skipping mapper`);
        return;
      }

      const client = clients[0];
      const clientUuid = client.id!;

      // Check if mapper already exists
      const existingMappers = await this.kc.clients.listProtocolMappers({ id: clientUuid });
      const existingMapper = existingMappers.find((m) => m.name === mapperName);

      const mapperConfig: ProtocolMapperConfig = {
        name: mapperName,
        protocol: 'openid-connect',
        protocolMapper: 'oidc-audience-mapper',
        config: {
          'included.client.audience': audienceClientId,
          'id.token.claim': 'false',
          'access.token.claim': 'true',
        },
      };

      if (existingMapper) {
        // Update existing mapper
        await this.kc.clients.updateProtocolMapper(
          { id: clientUuid, mapperId: existingMapper.id! },
          { ...mapperConfig, id: existingMapper.id }
        );
        logger.info(`  Updated mapper: ${mapperName}`);
      } else {
        // Create new mapper
        await this.kc.clients.addProtocolMapper({ id: clientUuid }, mapperConfig);
        logger.info(`  Created mapper: ${mapperName}`);
      }
    } catch (error) {
      logger.error(`Failed to sync audience mapper for ${clientId}`, { error });
      throw error;
    }
  }

  private async syncRolesMapper(): Promise<void> {
    const scopeName = 'roles';
    const mapperName = 'realm roles';
    logger.info(`Syncing roles mapper in scope: ${scopeName}`);

    try {
      // Find the roles scope
      const scopes = await this.kc.clientScopes.find();
      const rolesScope = scopes.find((s) => s.name === scopeName);

      if (!rolesScope) {
        logger.warn(`  Scope '${scopeName}' not found, skipping mapper`);
        return;
      }

      const scopeId = rolesScope.id!;

      // Check if mapper already exists
      const existingMappers = await this.kc.clientScopes.listProtocolMappers({ id: scopeId });
      const existingMapper = existingMappers.find((m) => m.name === mapperName);

      const mapperConfig = {
        name: mapperName,
        protocol: 'openid-connect',
        protocolMapper: 'oidc-usermodel-realm-role-mapper',
        config: {
          'claim.name': 'roles',
          'jsonType.label': 'String',
          'multivalued': 'true',
          'id.token.claim': 'true',
          'access.token.claim': 'true',
          'userinfo.token.claim': 'true',
        },
      };

      if (existingMapper) {
        await this.kc.clientScopes.updateProtocolMapper(
          { id: scopeId, mapperId: existingMapper.id! },
          { ...mapperConfig, id: existingMapper.id }
        );
        logger.info(`  Updated mapper: ${mapperName}`);
      } else {
        await this.kc.clientScopes.addProtocolMapper({ id: scopeId }, mapperConfig);
        logger.info(`  Created mapper: ${mapperName}`);
      }
    } catch (error) {
      logger.error(`Failed to sync roles mapper`, { error });
      throw error;
    }
  }
}
