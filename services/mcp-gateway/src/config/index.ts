/**
 * Gateway Configuration Module
 *
 * Centralizes all environment variable loading with type-safe defaults.
 * Pure function - no side effects, easy to test.
 */

/**
 * Safely parse integer from string with fallback to default.
 * Returns defaultVal if parsing fails or results in NaN.
 *
 * @param val - String value to parse (may be undefined)
 * @param defaultVal - Default value if parsing fails
 * @returns Parsed integer or default value
 */
export function safeParseInt(val: string | undefined, defaultVal: number): number {
  if (!val) return defaultVal;
  const parsed = parseInt(val, 10);
  return Number.isNaN(parsed) ? defaultVal : parsed;
}

export interface GatewayConfig {
  port: number;
  keycloak: {
    url: string;
    realm: string;
    clientId: string;
    jwksUri?: string;
    issuer?: string;
  };
  claude: {
    apiKey: string;
    model: string;
  };
  mcpServers: {
    hr: string;
    finance: string;
    sales: string;
    support: string;
  };
  timeouts: {
    mcpRead: number;
    mcpWrite: number;
    claude: number;
    total: number;
  };
  logLevel: string;
}

/**
 * Load configuration from environment variables with sensible defaults
 *
 * @returns GatewayConfig object with all required configuration
 */
export function loadConfig(): GatewayConfig {
  return {
    port: safeParseInt(process.env.PORT, 3000),
    keycloak: {
      url: process.env.KEYCLOAK_URL || 'http://localhost:8180',
      realm: process.env.KEYCLOAK_REALM || 'tamshai-corp',
      clientId: process.env.KEYCLOAK_CLIENT_ID || 'mcp-gateway',
      jwksUri: process.env.JWKS_URI || undefined,
      issuer: process.env.KEYCLOAK_ISSUER || undefined,
    },
    claude: {
      apiKey: process.env.CLAUDE_API_KEY || '',
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
    },
    mcpServers: {
      hr: process.env.MCP_HR_URL || 'http://localhost:3001',
      finance: process.env.MCP_FINANCE_URL || 'http://localhost:3002',
      sales: process.env.MCP_SALES_URL || 'http://localhost:3003',
      support: process.env.MCP_SUPPORT_URL || 'http://localhost:3004',
    },
    timeouts: {
      mcpRead: safeParseInt(process.env.MCP_READ_TIMEOUT_MS, 5000),
      mcpWrite: safeParseInt(process.env.MCP_WRITE_TIMEOUT_MS, 10000),
      claude: safeParseInt(process.env.CLAUDE_TIMEOUT_MS, 60000),
      total: safeParseInt(process.env.TOTAL_REQUEST_TIMEOUT_MS, 90000),
    },
    logLevel: process.env.LOG_LEVEL || 'info',
  };
}
