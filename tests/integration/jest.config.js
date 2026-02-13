const path = require('path');
const fs = require('fs');

// Load .env from Terraform-generated file (REQUIRED for local dev)
const envPath = path.resolve(__dirname, '../../infrastructure/docker/.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath, override: true });
} else if (process.env.CI !== 'true') {
  console.error('ERROR: infrastructure/docker/.env not found.');
  console.error('Run: cd infrastructure/terraform/dev && terraform apply -var-file=dev.tfvars');
  process.exit(1);
}

// Derive service URLs from PORT_* variables (no hardcoded defaults)
// Local dev Keycloak uses /auth prefix (KC_HTTP_RELATIVE_PATH=/auth in docker-compose.yml)
// CI Keycloak runs at root path (no /auth) - CI sets KEYCLOAK_URL explicitly
process.env.KEYCLOAK_URL = process.env.KEYCLOAK_URL || `http://127.0.0.1:${process.env.PORT_KEYCLOAK}/auth`;
process.env.KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'tamshai-corp';
process.env.KEYCLOAK_CUSTOMER_REALM = process.env.KEYCLOAK_CUSTOMER_REALM || 'tamshai-customers';
process.env.MCP_GATEWAY_URL = process.env.MCP_GATEWAY_URL || `http://127.0.0.1:${process.env.PORT_MCP_GATEWAY}`;
process.env.MCP_HR_URL = process.env.MCP_HR_URL || `http://127.0.0.1:${process.env.PORT_MCP_HR}`;
process.env.MCP_FINANCE_URL = process.env.MCP_FINANCE_URL || `http://127.0.0.1:${process.env.PORT_MCP_FINANCE}`;
process.env.MCP_SALES_URL = process.env.MCP_SALES_URL || `http://127.0.0.1:${process.env.PORT_MCP_SALES}`;
process.env.MCP_SUPPORT_URL = process.env.MCP_SUPPORT_URL || `http://127.0.0.1:${process.env.PORT_MCP_SUPPORT}`;
process.env.REDIS_URL = process.env.REDIS_URL || `redis://127.0.0.1:${process.env.PORT_REDIS}`;

/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    '**/*.test.ts',
    '!**/node_modules/**',
    '!**/dist/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 120000, // 120 seconds for SSE streaming tests with Claude
  verbose: true,
  bail: false, // Continue running tests after first failure
  maxWorkers: 1, // Run tests sequentially to avoid race conditions
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
