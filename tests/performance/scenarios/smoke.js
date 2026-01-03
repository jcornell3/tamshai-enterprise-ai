/**
 * k6 Smoke Test for Tamshai MCP Gateway
 *
 * TDD RED PHASE: Thresholds defined FIRST
 *
 * Purpose: Quick validation that the system is working
 * Duration: ~30 seconds
 * Virtual Users: 1
 *
 * Run: k6 run scenarios/smoke.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const healthDuration = new Trend('health_duration', true);
const apiDuration = new Trend('api_duration', true);
const openApiDuration = new Trend('openapi_duration', true);

// Configuration
const GATEWAY_URL = __ENV.GATEWAY_URL || 'http://localhost:3100';

// =============================================================================
// TDD: THRESHOLDS DEFINED FIRST
// These are our "tests" - the system must meet these to pass
// =============================================================================
export const options = {
  // Minimal load - single user
  vus: 1,
  duration: '30s',

  // STRICT THRESHOLDS - Define expectations FIRST
  thresholds: {
    // Overall HTTP performance
    http_req_duration: ['p(95)<200'],        // 95th percentile under 200ms
    http_req_failed: ['rate<0.01'],          // Less than 1% errors

    // Endpoint-specific thresholds (strict for smoke test)
    'health_duration': ['p(95)<50'],         // Health check: 50ms
    'api_duration': ['p(95)<100'],           // API endpoints: 100ms
    'openapi_duration': ['p(95)<150'],       // OpenAPI docs: 150ms

    // Custom error tracking
    'errors': ['rate<0.01'],                 // Less than 1% custom errors
  },

  // Tags for filtering
  tags: {
    test_type: 'smoke',
    service: 'mcp-gateway',
    environment: __ENV.ENVIRONMENT || 'local',
  },
};

// Setup - verify gateway is accessible
export function setup() {
  const res = http.get(`${GATEWAY_URL}/health`);
  if (res.status !== 200) {
    throw new Error(`Gateway not accessible at ${GATEWAY_URL}`);
  }
  console.log(`[SMOKE TEST] Testing gateway at: ${GATEWAY_URL}`);
  console.log('[SMOKE TEST] Thresholds defined - RED phase validation');
  return { gatewayUrl: GATEWAY_URL };
}

// Main test function
export default function () {
  // Test 1: Health endpoint
  {
    const start = Date.now();
    const res = http.get(`${GATEWAY_URL}/health`, {
      tags: { name: 'health' },
    });
    healthDuration.add(Date.now() - start);

    const passed = check(res, {
      'health: status 200': (r) => r.status === 200,
      'health: body has status': (r) => {
        try {
          return JSON.parse(r.body).status === 'healthy';
        } catch {
          return false;
        }
      },
    });
    errorRate.add(!passed);
  }

  sleep(0.5);

  // Test 2: API health endpoint
  {
    const start = Date.now();
    const res = http.get(`${GATEWAY_URL}/api/health`, {
      tags: { name: 'api-health' },
    });
    apiDuration.add(Date.now() - start);

    const passed = check(res, {
      'api/health: status 200': (r) => r.status === 200,
    });
    errorRate.add(!passed);
  }

  sleep(0.5);

  // Test 3: OpenAPI documentation
  {
    const start = Date.now();
    const res = http.get(`${GATEWAY_URL}/api-docs.json`, {
      tags: { name: 'openapi' },
    });
    openApiDuration.add(Date.now() - start);

    const passed = check(res, {
      'openapi: status 200': (r) => r.status === 200,
      'openapi: valid spec': (r) => {
        try {
          return JSON.parse(r.body).openapi === '3.0.3';
        } catch {
          return false;
        }
      },
    });
    errorRate.add(!passed);
  }

  sleep(0.5);

  // Test 4: Protected endpoint returns 401 (security check)
  // Note: We use responseCallback to tell k6 that 401 is expected here
  {
    const start = Date.now();
    const res = http.get(`${GATEWAY_URL}/api/user`, {
      tags: { name: 'auth-check' },
      responseCallback: http.expectedStatuses(401),  // 401 is expected, not a failure
    });
    apiDuration.add(Date.now() - start);

    const passed = check(res, {
      'api/user: requires auth (401)': (r) => r.status === 401,
    });
    errorRate.add(!passed);
  }

  sleep(0.5);
}

// Teardown
export function teardown(data) {
  console.log('[SMOKE TEST] Complete');
}

// Summary handler
export function handleSummary(data) {
  const passed = Object.values(data.thresholds || {}).every(t => t.ok);
  const status = passed ? 'PASSED (GREEN)' : 'FAILED (RED)';

  let summary = `\n${'='.repeat(60)}\n`;
  summary += `SMOKE TEST RESULTS: ${status}\n`;
  summary += `${'='.repeat(60)}\n\n`;

  // Threshold results
  summary += 'Thresholds:\n';
  for (const [name, threshold] of Object.entries(data.thresholds || {})) {
    const icon = threshold.ok ? '✓' : '✗';
    summary += `  ${icon} ${name}: ${threshold.ok ? 'PASS' : 'FAIL'}\n`;
  }

  summary += '\nMetrics:\n';
  if (data.metrics.http_req_duration) {
    const dur = data.metrics.http_req_duration.values;
    summary += `  HTTP Duration P95: ${dur['p(95)'].toFixed(2)}ms\n`;
  }
  if (data.metrics.http_reqs) {
    summary += `  Total Requests: ${data.metrics.http_reqs.values.count}\n`;
  }

  return {
    stdout: summary,
    'smoke-results.json': JSON.stringify(data, null, 2),
  };
}
