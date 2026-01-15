/**
 * k6 Performance Test for Tamshai MCP Gateway
 *
 * Run with: k6 run scenarios/gateway-load.js
 * Run with report: k6 run --out json=results.json scenarios/gateway-load.js
 *
 * Prerequisites:
 * - MCP Gateway running on GATEWAY_URL (default: http://localhost:3100)
 * - Keycloak running for authenticated tests
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const healthCheckDuration = new Trend('health_check_duration');
const authEndpointDuration = new Trend('auth_endpoint_duration');
const mcpToolsDuration = new Trend('mcp_tools_duration');
const requestCounter = new Counter('total_requests');

// Configuration
const GATEWAY_URL = __ENV.GATEWAY_URL || 'http://localhost:3100';
const KEYCLOAK_URL = __ENV.KEYCLOAK_URL || 'http://localhost:8180';
const KEYCLOAK_REALM = __ENV.KEYCLOAK_REALM || 'tamshai-corp';

// Test options
export const options = {
  // Test stages
  stages: [
    { duration: '30s', target: 10 },   // Ramp up to 10 users
    { duration: '1m', target: 10 },     // Stay at 10 users
    { duration: '30s', target: 25 },   // Ramp up to 25 users
    { duration: '1m', target: 25 },     // Stay at 25 users
    { duration: '30s', target: 0 },    // Ramp down
  ],

  // Thresholds - test fails if these are not met
  thresholds: {
    http_req_duration: ['p(95)<500'],      // 95% of requests under 500ms
    http_req_failed: ['rate<0.01'],        // Less than 1% errors
    errors: ['rate<0.05'],                  // Less than 5% custom errors
    health_check_duration: ['p(95)<100'],  // Health check under 100ms
  },

  // Configure tags
  tags: {
    service: 'mcp-gateway',
    environment: __ENV.ENVIRONMENT || 'local',
  },
};

// Setup - runs once before the test
export function setup() {
  // Verify gateway is accessible
  const healthRes = http.get(`${GATEWAY_URL}/health`);
  check(healthRes, {
    'gateway is healthy': (r) => r.status === 200,
  });

  if (healthRes.status !== 200) {
    throw new Error('Gateway health check failed - aborting test');
  }

  console.log(`Testing gateway at: ${GATEWAY_URL}`);
  return { gatewayUrl: GATEWAY_URL };
}

// Get access token from Keycloak (cached per VU)
let cachedToken = null;
let tokenExpiry = 0;

function getAccessToken() {
  const now = Date.now();

  // Return cached token if still valid (with 30s buffer)
  if (cachedToken && tokenExpiry > now + 30000) {
    return cachedToken;
  }

  const tokenUrl = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`;

  const response = http.post(
    tokenUrl,
    {
      grant_type: 'password',
      client_id: 'mcp-gateway',
      username: 'alice.chen',
      password: __ENV.DEV_USER_PASSWORD || 'dev-password-not-set',
      scope: 'openid',
    },
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      tags: { name: 'auth-token' },
    }
  );

  if (response.status === 200) {
    const data = JSON.parse(response.body);
    cachedToken = data.access_token;
    tokenExpiry = now + (data.expires_in * 1000);
    return cachedToken;
  }

  return null;
}

// Main test function - runs for each virtual user
export default function (data) {
  requestCounter.add(1);

  group('Health Check', () => {
    const start = Date.now();
    const response = http.get(`${GATEWAY_URL}/health`);
    healthCheckDuration.add(Date.now() - start);

    const passed = check(response, {
      'health status is 200': (r) => r.status === 200,
      'health response has status': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.status === 'healthy';
        } catch {
          return false;
        }
      },
    });

    errorRate.add(!passed);
  });

  sleep(0.5);

  group('API Health Check', () => {
    const response = http.get(`${GATEWAY_URL}/api/health`);

    const passed = check(response, {
      'api health status is 200': (r) => r.status === 200,
    });

    errorRate.add(!passed);
  });

  sleep(0.5);

  group('Unauthenticated Endpoints', () => {
    // Test that protected endpoints return 401 without auth
    const start = Date.now();
    const userResponse = http.get(`${GATEWAY_URL}/api/user`);
    authEndpointDuration.add(Date.now() - start);

    const passed = check(userResponse, {
      'user endpoint requires auth': (r) => r.status === 401,
    });

    errorRate.add(!passed);

    const toolsResponse = http.get(`${GATEWAY_URL}/api/mcp/tools`);

    check(toolsResponse, {
      'mcp tools requires auth': (r) => r.status === 401,
    });
  });

  sleep(0.5);

  group('OpenAPI Documentation', () => {
    const response = http.get(`${GATEWAY_URL}/api-docs.json`);

    const passed = check(response, {
      'openapi json returns 200': (r) => r.status === 200,
      'openapi json has content': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.openapi === '3.0.3';
        } catch {
          return false;
        }
      },
    });

    errorRate.add(!passed);
  });

  sleep(0.5);

  // Authenticated tests (only if Keycloak is available)
  group('Authenticated Endpoints', () => {
    const token = getAccessToken();

    if (!token) {
      console.log('Skipping authenticated tests - no token available');
      return;
    }

    const headers = {
      Authorization: `Bearer ${token}`,
    };

    // Test /api/user
    const userResponse = http.get(`${GATEWAY_URL}/api/user`, { headers });
    check(userResponse, {
      'user endpoint returns 200': (r) => r.status === 200,
      'user has userId': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.userId !== undefined;
        } catch {
          return false;
        }
      },
    });

    sleep(0.3);

    // Test /api/mcp/tools
    const start = Date.now();
    const toolsResponse = http.get(`${GATEWAY_URL}/api/mcp/tools`, { headers });
    mcpToolsDuration.add(Date.now() - start);

    check(toolsResponse, {
      'mcp tools returns 200': (r) => r.status === 200,
      'mcp tools has accessibleDataSources': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.accessibleDataSources);
        } catch {
          return false;
        }
      },
    });
  });

  sleep(1);
}

// Teardown - runs once after the test
export function teardown(data) {
  console.log('Performance test completed');
}

// Handle summary report
export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    'summary.json': JSON.stringify(data),
  };
}

// Simple text summary function
function textSummary(data) {
  const metrics = data.metrics;

  let summary = '\n=== Performance Test Summary ===\n\n';

  // Request duration
  if (metrics.http_req_duration) {
    const dur = metrics.http_req_duration.values;
    summary += `HTTP Request Duration:\n`;
    summary += `  Average: ${dur.avg.toFixed(2)}ms\n`;
    summary += `  P95: ${dur['p(95)'].toFixed(2)}ms\n`;
    summary += `  P99: ${dur['p(99)'].toFixed(2)}ms\n`;
    summary += `  Max: ${dur.max.toFixed(2)}ms\n\n`;
  }

  // Request count
  if (metrics.http_reqs) {
    summary += `Total Requests: ${metrics.http_reqs.values.count}\n`;
    summary += `Requests/sec: ${metrics.http_reqs.values.rate.toFixed(2)}\n\n`;
  }

  // Failed requests
  if (metrics.http_req_failed) {
    const failRate = metrics.http_req_failed.values.rate * 100;
    summary += `Failed Requests: ${failRate.toFixed(2)}%\n\n`;
  }

  // Custom metrics
  if (metrics.health_check_duration) {
    summary += `Health Check P95: ${metrics.health_check_duration.values['p(95)'].toFixed(2)}ms\n`;
  }

  // Thresholds
  summary += '\n=== Thresholds ===\n';
  for (const [name, threshold] of Object.entries(data.thresholds || {})) {
    const status = threshold.ok ? '✓ PASS' : '✗ FAIL';
    summary += `  ${name}: ${status}\n`;
  }

  return summary;
}
