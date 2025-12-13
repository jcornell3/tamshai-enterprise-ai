/**
 * Jest Setup File
 *
 * Global setup and teardown for integration tests.
 * Verifies all services are healthy before running tests.
 */

const axios = require('axios');

const CONFIG = {
  keycloakUrl: process.env.KEYCLOAK_URL || 'http://localhost:8180',
  mcpHrUrl: process.env.MCP_HR_URL || 'http://localhost:3101',
  mcpFinanceUrl: process.env.MCP_FINANCE_URL || 'http://localhost:3102',
  mcpSalesUrl: process.env.MCP_SALES_URL || 'http://localhost:3103',
  mcpSupportUrl: process.env.MCP_SUPPORT_URL || 'http://localhost:3104',
};

/**
 * Check if a service is healthy
 */
async function checkServiceHealth(name, url) {
  try {
    const response = await axios.get(`${url}/health`, { timeout: 5000 });
    if (response.status === 200 && response.data.status === 'healthy') {
      console.log(`✅ ${name} is healthy`);
      return true;
    }
  } catch (error) {
    console.error(`❌ ${name} is NOT healthy: ${error.message}`);
    return false;
  }
  return false;
}

/**
 * Check if Keycloak is ready
 */
async function checkKeycloakHealth() {
  try {
    const response = await axios.get(`${CONFIG.keycloakUrl}/health/ready`, { timeout: 5000 });
    if (response.status === 200) {
      console.log('✅ Keycloak is ready');
      return true;
    }
  } catch (error) {
    console.error(`❌ Keycloak is NOT ready: ${error.message}`);
    return false;
  }
  return false;
}

/**
 * Global setup - runs once before all tests
 */
beforeAll(async () => {
  console.log('🔍 Verifying all services are healthy...\n');

  const checks = await Promise.all([
    checkKeycloakHealth(),
    checkServiceHealth('MCP HR', CONFIG.mcpHrUrl),
    checkServiceHealth('MCP Finance', CONFIG.mcpFinanceUrl),
    checkServiceHealth('MCP Sales', CONFIG.mcpSalesUrl),
    checkServiceHealth('MCP Support', CONFIG.mcpSupportUrl),
  ]);

  const allHealthy = checks.every((check) => check === true);

  if (!allHealthy) {
    console.error('\n❌ Some services are not healthy. Please start all services:');
    console.error('   cd infrastructure/docker && docker compose up -d\n');
    throw new Error('Services not ready for integration tests');
  }

  console.log('\n✅ All services are healthy. Starting tests...\n');
}, 30000); // 30 second timeout for health checks

/**
 * Global teardown - runs once after all tests
 */
afterAll(async () => {
  console.log('\n✅ All integration tests complete');
});
