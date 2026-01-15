/**
 * k6 Load Test for Tamshai MCP Gateway
 *
 * TDD RED PHASE: Thresholds defined FIRST
 *
 * Purpose: Verify system handles expected production load
 * Duration: ~10 minutes
 * Virtual Users: 10-50 concurrent
 *
 * Run: k6 run scenarios/load.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const healthDuration = new Trend('health_duration', true);
const authDuration = new Trend('auth_duration', true);
const userDuration = new Trend('user_endpoint_duration', true);
const mcpToolsDuration = new Trend('mcp_tools_duration', true);
const requestCounter = new Counter('total_requests');

// Configuration
const GATEWAY_URL = __ENV.GATEWAY_URL || 'http://localhost:3100';
const KEYCLOAK_URL = __ENV.KEYCLOAK_URL || 'http://localhost:8180';
const KEYCLOAK_REALM = __ENV.KEYCLOAK_REALM || 'tamshai-corp';

// =============================================================================
// TDD: THRESHOLDS DEFINED FIRST
// These are our "tests" - the system must meet these under load
// =============================================================================
export const options = {
  // Load profile: Gradual ramp to production-like load
  stages: [
    { duration: '1m', target: 10 },    // Warm-up: ramp to 10 users
    { duration: '3m', target: 25 },    // Normal load: 25 users
    { duration: '2m', target: 50 },    // Peak load: 50 users
    { duration: '3m', target: 50 },    // Sustained peak
    { duration: '1m', target: 0 },     // Cool-down
  ],

  // STRICT THRESHOLDS - Define expectations FIRST
  thresholds: {
    // Overall HTTP performance
    http_req_duration: ['p(95)<500', 'p(99)<1000'],   // P95 < 500ms, P99 < 1s
    http_req_failed: ['rate<0.01'],                   // Less than 1% HTTP errors

    // Endpoint-specific thresholds
    'health_duration': ['p(95)<100'],                 // Health: 100ms
    'auth_duration': ['p(95)<300'],                   // Token acquisition: 300ms
    'user_endpoint_duration': ['p(95)<200'],          // /api/user: 200ms
    'mcp_tools_duration': ['p(95)<400'],              // /api/mcp/tools: 400ms

    // Throughput requirements
    'http_reqs': ['rate>50'],                         // At least 50 req/s

    // Custom error tracking
    'errors': ['rate<0.05'],                          // Less than 5% custom errors

    // Check pass rate
    'checks': ['rate>0.95'],                          // 95% of checks must pass
  },

  // Tags for filtering
  tags: {
    test_type: 'load',
    service: 'mcp-gateway',
    environment: __ENV.ENVIRONMENT || 'local',
  },
};

// Token cache (per VU)
let cachedToken = null;
let tokenExpiry = 0;

// Get access token from Keycloak
function getAccessToken() {
  const now = Date.now();

  // Return cached token if valid
  if (cachedToken && tokenExpiry > now + 30000) {
    return cachedToken;
  }

  const tokenUrl = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`;

  const start = Date.now();
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
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      tags: { name: 'keycloak-token' },
    }
  );
  authDuration.add(Date.now() - start);

  if (response.status === 200) {
    const data = JSON.parse(response.body);
    cachedToken = data.access_token;
    tokenExpiry = now + (data.expires_in * 1000);
    return cachedToken;
  }

  return null;
}

// Setup
export function setup() {
  const res = http.get(`${GATEWAY_URL}/health`);
  if (res.status !== 200) {
    throw new Error(`Gateway not accessible at ${GATEWAY_URL}`);
  }

  console.log(`[LOAD TEST] Testing gateway at: ${GATEWAY_URL}`);
  console.log('[LOAD TEST] Thresholds defined - RED phase validation');
  console.log('[LOAD TEST] Peak load: 50 virtual users');
  return { gatewayUrl: GATEWAY_URL };
}

// Main test function
export default function () {
  requestCounter.add(1);

  // Group 1: Health Check
  group('Health Endpoints', () => {
    const start = Date.now();
    const res = http.get(`${GATEWAY_URL}/health`, {
      tags: { name: 'health', endpoint: 'health' },
    });
    healthDuration.add(Date.now() - start);

    const passed = check(res, {
      'health: status 200': (r) => r.status === 200,
      'health: response valid': (r) => {
        try {
          return JSON.parse(r.body).status === 'healthy';
        } catch {
          return false;
        }
      },
    });
    errorRate.add(!passed);
  });

  sleep(0.3);

  // Group 2: Public endpoints
  group('Public Endpoints', () => {
    // OpenAPI docs
    const res = http.get(`${GATEWAY_URL}/api-docs.json`, {
      tags: { name: 'openapi', endpoint: 'openapi' },
    });

    const passed = check(res, {
      'openapi: status 200': (r) => r.status === 200,
    });
    errorRate.add(!passed);
  });

  sleep(0.3);

  // Group 3: Authenticated endpoints
  group('Authenticated Endpoints', () => {
    const token = getAccessToken();

    if (!token) {
      // If Keycloak unavailable, just test 401 behavior
      const res = http.get(`${GATEWAY_URL}/api/user`);
      check(res, { 'api/user: requires auth': (r) => r.status === 401 });
      return;
    }

    const headers = { Authorization: `Bearer ${token}` };

    // /api/user endpoint
    {
      const start = Date.now();
      const res = http.get(`${GATEWAY_URL}/api/user`, {
        headers,
        tags: { name: 'user', endpoint: 'user' },
      });
      userDuration.add(Date.now() - start);

      const passed = check(res, {
        'user: status 200': (r) => r.status === 200,
        'user: has userId': (r) => {
          try {
            return JSON.parse(r.body).userId !== undefined;
          } catch {
            return false;
          }
        },
      });
      errorRate.add(!passed);
    }

    sleep(0.2);

    // /api/mcp/tools endpoint
    {
      const start = Date.now();
      const res = http.get(`${GATEWAY_URL}/api/mcp/tools`, {
        headers,
        tags: { name: 'mcp-tools', endpoint: 'mcp-tools' },
      });
      mcpToolsDuration.add(Date.now() - start);

      const passed = check(res, {
        'mcp/tools: status 200': (r) => r.status === 200,
        'mcp/tools: has data sources': (r) => {
          try {
            return Array.isArray(JSON.parse(r.body).accessibleDataSources);
          } catch {
            return false;
          }
        },
      });
      errorRate.add(!passed);
    }
  });

  sleep(0.5);
}

// Teardown
export function teardown(data) {
  console.log('[LOAD TEST] Complete');
}

// Summary handler
export function handleSummary(data) {
  const thresholdResults = Object.entries(data.thresholds || {});
  const passed = thresholdResults.every(([, t]) => t.ok);
  const passedCount = thresholdResults.filter(([, t]) => t.ok).length;
  const status = passed ? 'PASSED (GREEN)' : 'FAILED (RED)';

  let summary = `\n${'='.repeat(60)}\n`;
  summary += `LOAD TEST RESULTS: ${status}\n`;
  summary += `Thresholds: ${passedCount}/${thresholdResults.length} passed\n`;
  summary += `${'='.repeat(60)}\n\n`;

  // Threshold results
  summary += 'Thresholds:\n';
  for (const [name, threshold] of thresholdResults) {
    const icon = threshold.ok ? '✓' : '✗';
    summary += `  ${icon} ${name}: ${threshold.ok ? 'PASS' : 'FAIL'}\n`;
  }

  // Key metrics
  summary += '\nPerformance Metrics:\n';
  const metrics = data.metrics;

  if (metrics.http_req_duration) {
    const dur = metrics.http_req_duration.values;
    summary += `  HTTP Duration:\n`;
    summary += `    P50: ${dur['p(50)']?.toFixed(2) || 'N/A'}ms\n`;
    summary += `    P95: ${dur['p(95)']?.toFixed(2) || 'N/A'}ms\n`;
    summary += `    P99: ${dur['p(99)']?.toFixed(2) || 'N/A'}ms\n`;
  }

  if (metrics.http_reqs) {
    summary += `  Throughput: ${metrics.http_reqs.values.rate?.toFixed(2) || 'N/A'} req/s\n`;
    summary += `  Total Requests: ${metrics.http_reqs.values.count || 0}\n`;
  }

  if (metrics.http_req_failed) {
    const failRate = (metrics.http_req_failed.values.rate || 0) * 100;
    summary += `  Error Rate: ${failRate.toFixed(2)}%\n`;
  }

  return {
    stdout: summary,
    'load-results.json': JSON.stringify(data, null, 2),
  };
}
