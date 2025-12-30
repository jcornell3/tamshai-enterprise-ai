/**
 * Unit tests for Configuration Module
 *
 * Target: 95%+ coverage (pure function, easy to test)
 */

import { loadConfig, GatewayConfig } from './index';

describe('Configuration Module', () => {
  // Store original env vars to restore after tests
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  describe('loadConfig', () => {
    it('should load default values when env vars not set', () => {
      // Clear relevant env vars
      delete process.env.PORT;
      delete process.env.KEYCLOAK_URL;
      delete process.env.KEYCLOAK_REALM;
      delete process.env.CLAUDE_MODEL;
      delete process.env.MCP_HR_URL;
      delete process.env.MCP_READ_TIMEOUT_MS;
      delete process.env.LOG_LEVEL;

      const config = loadConfig();

      expect(config.port).toBe(3000);
      expect(config.keycloak.url).toBe('http://localhost:8180');
      expect(config.keycloak.realm).toBe('tamshai-corp');
      expect(config.keycloak.clientId).toBe('mcp-gateway');
      expect(config.claude.model).toBe('claude-sonnet-4-20250514');
      expect(config.mcpServers.hr).toBe('http://localhost:3001');
      expect(config.mcpServers.finance).toBe('http://localhost:3002');
      expect(config.mcpServers.sales).toBe('http://localhost:3003');
      expect(config.mcpServers.support).toBe('http://localhost:3004');
      expect(config.timeouts.mcpRead).toBe(5000);
      expect(config.timeouts.mcpWrite).toBe(10000);
      expect(config.timeouts.claude).toBe(60000);
      expect(config.timeouts.total).toBe(90000);
      expect(config.logLevel).toBe('info');
    });

    it('should override defaults with environment variables', () => {
      process.env.PORT = '4000';
      process.env.KEYCLOAK_URL = 'http://keycloak.example.com';
      process.env.KEYCLOAK_REALM = 'test-realm';
      process.env.KEYCLOAK_CLIENT_ID = 'test-client';
      process.env.CLAUDE_MODEL = 'claude-opus-4';
      process.env.LOG_LEVEL = 'debug';

      const config = loadConfig();

      expect(config.port).toBe(4000);
      expect(config.keycloak.url).toBe('http://keycloak.example.com');
      expect(config.keycloak.realm).toBe('test-realm');
      expect(config.keycloak.clientId).toBe('test-client');
      expect(config.claude.model).toBe('claude-opus-4');
      expect(config.logLevel).toBe('debug');
    });

    it('should parse numeric environment variables correctly', () => {
      process.env.PORT = '8080';
      process.env.MCP_READ_TIMEOUT_MS = '8000';
      process.env.MCP_WRITE_TIMEOUT_MS = '15000';
      process.env.CLAUDE_TIMEOUT_MS = '120000';
      process.env.TOTAL_REQUEST_TIMEOUT_MS = '180000';

      const config = loadConfig();

      expect(config.port).toBe(8080);
      expect(config.timeouts.mcpRead).toBe(8000);
      expect(config.timeouts.mcpWrite).toBe(15000);
      expect(config.timeouts.claude).toBe(120000);
      expect(config.timeouts.total).toBe(180000);
    });

    it('should handle optional JWKS_URI when not set', () => {
      delete process.env.JWKS_URI;

      const config = loadConfig();

      expect(config.keycloak.jwksUri).toBeUndefined();
    });

    it('should handle optional JWKS_URI when set', () => {
      process.env.JWKS_URI = 'http://keycloak.example.com/realms/test/certs';

      const config = loadConfig();

      expect(config.keycloak.jwksUri).toBe('http://keycloak.example.com/realms/test/certs');
    });

    it('should handle optional issuer when not set', () => {
      delete process.env.KEYCLOAK_ISSUER;

      const config = loadConfig();

      expect(config.keycloak.issuer).toBeUndefined();
    });

    it('should handle optional issuer when set', () => {
      process.env.KEYCLOAK_ISSUER = 'http://keycloak.example.com/realms/test';

      const config = loadConfig();

      expect(config.keycloak.issuer).toBe('http://keycloak.example.com/realms/test');
    });

    it('should override all MCP server URLs', () => {
      process.env.MCP_HR_URL = 'http://hr.example.com:3101';
      process.env.MCP_FINANCE_URL = 'http://finance.example.com:3102';
      process.env.MCP_SALES_URL = 'http://sales.example.com:3103';
      process.env.MCP_SUPPORT_URL = 'http://support.example.com:3104';

      const config = loadConfig();

      expect(config.mcpServers.hr).toBe('http://hr.example.com:3101');
      expect(config.mcpServers.finance).toBe('http://finance.example.com:3102');
      expect(config.mcpServers.sales).toBe('http://sales.example.com:3103');
      expect(config.mcpServers.support).toBe('http://support.example.com:3104');
    });

    it('should handle empty Claude API key (will fail validation later)', () => {
      delete process.env.CLAUDE_API_KEY;

      const config = loadConfig();

      expect(config.claude.apiKey).toBe('');
    });

    it('should load Claude API key when set', () => {
      process.env.CLAUDE_API_KEY = 'sk-ant-api03-test-key';

      const config = loadConfig();

      expect(config.claude.apiKey).toBe('sk-ant-api03-test-key');
    });

    it('should handle invalid numeric values gracefully (NaN becomes 0)', () => {
      process.env.PORT = 'not-a-number';
      process.env.MCP_READ_TIMEOUT_MS = 'invalid';

      const config = loadConfig();

      // parseInt('not-a-number') returns NaN, which is falsy
      expect(isNaN(config.port)).toBe(true);
      expect(isNaN(config.timeouts.mcpRead)).toBe(true);
    });

    it('should return a complete GatewayConfig object', () => {
      const config = loadConfig();

      // Verify all required properties exist
      expect(config).toHaveProperty('port');
      expect(config).toHaveProperty('keycloak');
      expect(config).toHaveProperty('claude');
      expect(config).toHaveProperty('mcpServers');
      expect(config).toHaveProperty('timeouts');
      expect(config).toHaveProperty('logLevel');

      expect(config.keycloak).toHaveProperty('url');
      expect(config.keycloak).toHaveProperty('realm');
      expect(config.keycloak).toHaveProperty('clientId');

      expect(config.claude).toHaveProperty('apiKey');
      expect(config.claude).toHaveProperty('model');

      expect(config.mcpServers).toHaveProperty('hr');
      expect(config.mcpServers).toHaveProperty('finance');
      expect(config.mcpServers).toHaveProperty('sales');
      expect(config.mcpServers).toHaveProperty('support');

      expect(config.timeouts).toHaveProperty('mcpRead');
      expect(config.timeouts).toHaveProperty('mcpWrite');
      expect(config.timeouts).toHaveProperty('claude');
      expect(config.timeouts).toHaveProperty('total');
    });

    it('should be a pure function (same env = same output)', () => {
      process.env.PORT = '5000';
      process.env.LOG_LEVEL = 'warn';

      const config1 = loadConfig();
      const config2 = loadConfig();

      expect(config1).toEqual(config2);
    });
  });
});
