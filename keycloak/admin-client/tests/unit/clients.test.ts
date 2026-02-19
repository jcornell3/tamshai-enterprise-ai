import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClientSync } from '../../src/sync/clients.js';

describe('ClientSync', () => {
  const mockKc = {
    clients: {
      find: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };

  const mockSecrets = {
    mcpGateway: 'test-gateway-secret',
    mcpHrService: 'test-hr-secret',
    mcpUi: 'test-ui-secret',
    mcpIntegrationRunner: 'test-runner-secret',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getMcpGatewayConfig', () => {
    it('returns explicit webOrigins for dev environment', () => {
      const sync = new ClientSync(mockKc as any, mockSecrets, 'dev');
      const config = (sync as any).getMcpGatewayConfig();

      expect(config.webOrigins).toContain('http://localhost:3100');
      expect(config.webOrigins).toContain('https://www.tamshai.local');
      expect(config.webOrigins).not.toContain('+');
    });

    it('returns single origin for stage environment', () => {
      const sync = new ClientSync(mockKc as any, mockSecrets, 'stage');
      const config = (sync as any).getMcpGatewayConfig();

      expect(config.webOrigins).toEqual(['https://www.tamshai.com']);
    });

    it('returns prod origin for prod environment', () => {
      const sync = new ClientSync(mockKc as any, mockSecrets, 'prod');
      const config = (sync as any).getMcpGatewayConfig();

      expect(config.webOrigins).toEqual(['https://prod.tamshai.com']);
    });

    it('has directAccessGrantsEnabled set to false (ROPC disabled)', () => {
      const sync = new ClientSync(mockKc as any, mockSecrets, 'dev');
      const config = (sync as any).getMcpGatewayConfig();

      expect(config.directAccessGrantsEnabled).toBe(false);
    });
  });

  describe('getMcpHrServiceConfig', () => {
    it('has fullScopeAllowed set to false (M1 security fix)', () => {
      const sync = new ClientSync(mockKc as any, mockSecrets, 'dev');
      const config = (sync as any).getMcpHrServiceConfig();

      expect(config.fullScopeAllowed).toBe(false);
    });

    it('has serviceAccountsEnabled set to true', () => {
      const sync = new ClientSync(mockKc as any, mockSecrets, 'dev');
      const config = (sync as any).getMcpHrServiceConfig();

      expect(config.serviceAccountsEnabled).toBe(true);
    });
  });

  describe('getTamshaiWebsiteConfig', () => {
    it('is a public client', () => {
      const sync = new ClientSync(mockKc as any, mockSecrets, 'dev');
      const config = (sync as any).getTamshaiWebsiteConfig();

      expect(config.publicClient).toBe(true);
    });

    it('has correct redirect URIs for dev', () => {
      const sync = new ClientSync(mockKc as any, mockSecrets, 'dev');
      const config = (sync as any).getTamshaiWebsiteConfig();

      expect(config.redirectUris).toContain('http://localhost:4000/*');
      expect(config.redirectUris).toContain('https://www.tamshai.local/*');
    });
  });

  describe('getFlutterClientConfig', () => {
    it('uses wildcard webOrigins for desktop OAuth', () => {
      const sync = new ClientSync(mockKc as any, mockSecrets, 'dev');
      const config = (sync as any).getFlutterClientConfig();

      // Flutter desktop requires wildcard for OAuth
      expect(config.webOrigins).toEqual(['+']);
    });

    it('includes offline_access scope', () => {
      const sync = new ClientSync(mockKc as any, mockSecrets, 'dev');
      const config = (sync as any).getFlutterClientConfig();

      expect(config.defaultClientScopes).toContain('offline_access');
    });
  });

  describe('syncAll', () => {
    it('creates mcp-integration-runner only in dev and stage', async () => {
      mockKc.clients.find.mockResolvedValue([]);
      mockKc.clients.create.mockResolvedValue({ id: 'new-id' });

      // Dev should create it
      const devSync = new ClientSync(mockKc as any, mockSecrets, 'dev');
      await devSync.syncAll();
      expect(mockKc.clients.create).toHaveBeenCalledWith(
        expect.objectContaining({ clientId: 'mcp-integration-runner' })
      );

      vi.clearAllMocks();

      // Stage should create it
      const stageSync = new ClientSync(mockKc as any, mockSecrets, 'stage');
      await stageSync.syncAll();
      expect(mockKc.clients.create).toHaveBeenCalledWith(
        expect.objectContaining({ clientId: 'mcp-integration-runner' })
      );

      vi.clearAllMocks();

      // Prod should NOT create it
      const prodSync = new ClientSync(mockKc as any, mockSecrets, 'prod');
      await prodSync.syncAll();
      expect(mockKc.clients.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ clientId: 'mcp-integration-runner' })
      );
    });
  });
});
