/**
 * k6 Stress Test for Tamshai MCP Gateway
 *
 * TDD RED PHASE: Thresholds defined FIRST
 *
 * Purpose: Find the breaking point of the system
 * Duration: ~15 minutes
 * Virtual Users: Ramp from 50 to 200 (beyond normal capacity)
 *
 * Run: k6 run scenarios/stress.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const healthDuration = new Trend('health_duration', true);
const apiDuration = new Trend('api_duration', true);
const requestCounter = new Counter('total_requests');
const currentVUs = new Gauge('current_vus');

// Configuration
const GATEWAY_URL = __ENV.GATEWAY_URL || 'http://localhost:3100';
const KEYCLOAK_URL = __ENV.KEYCLOAK_URL || 'http://localhost:8180';
const KEYCLOAK_REALM = __ENV.KEYCLOAK_REALM || 'tamshai-corp';

// =============================================================================
// TDD: THRESHOLDS DEFINED FIRST
// Stress test allows some degradation but still has limits
// =============================================================================
export const options = {
  // Stress profile: Push beyond normal capacity
  stages: [
    { duration: '2m', target: 50 },    // Normal load
    { duration: '2m', target: 100 },   // Above normal
    { duration: '3m', target: 100 },   // Sustained stress
    { duration: '2m', target: 150 },   // High stress
    { duration: '3m', target: 150 },   // Sustained high stress
    { duration: '2m', target: 200 },   // Breaking point
    { duration: '1m', target: 0 },     // Recovery
  ],

  // STRESS THRESHOLDS - Relaxed compared to load test
  thresholds: {
    // Allow degradation under stress (2s P95, 5s P99)
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],

    // Allow up to 5% HTTP errors under extreme stress
    http_req_failed: ['rate<0.05'],

    // Health endpoint must stay responsive
    'health_duration': ['p(95)<500'],    // Even under stress: 500ms

    // API can degrade more
    'api_duration': ['p(95)<1500'],      // API under stress: 1.5s

    // Custom errors
    'errors': ['rate<0.10'],             // Up to 10% custom errors OK

    // Minimum throughput under stress
    'http_reqs': ['rate>20'],            // At least 20 req/s even under stress
  },

  // Tags
  tags: {
    test_type: 'stress',
    service: 'mcp-gateway',
    environment: __ENV.ENVIRONMENT || 'local',
  },
};

// Token cache
let cachedToken = null;
let tokenExpiry = 0;

function getAccessToken() {
  const now = Date.now();
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
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      tags: { name: 'keycloak-token' },
      timeout: '10s',  // Longer timeout under stress
    }
  );

  if (response.status === 200) {
    try {
      const data = JSON.parse(response.body);
      cachedToken = data.access_token;
      tokenExpiry = now + (data.expires_in * 1000);
      return cachedToken;
    } catch {
      return null;
    }
  }
  return null;
}

// Setup
export function setup() {
  const res = http.get(`${GATEWAY_URL}/health`);
  if (res.status !== 200) {
    throw new Error(`Gateway not accessible at ${GATEWAY_URL}`);
  }

  console.log(`[STRESS TEST] Testing gateway at: ${GATEWAY_URL}`);
  console.log('[STRESS TEST] Thresholds defined - RED phase validation');
  console.log('[STRESS TEST] Peak stress: 200 virtual users');
  console.log('[STRESS TEST] WARNING: This test pushes beyond normal capacity');
  return { gatewayUrl: GATEWAY_URL };
}

// Main test function
export default function () {
  requestCounter.add(1);
  currentVUs.add(__VU);

  // Health check - critical for stress testing
  group('Health Check', () => {
    const start = Date.now();
    const res = http.get(`${GATEWAY_URL}/health`, {
      tags: { name: 'health' },
      timeout: '5s',
    });
    healthDuration.add(Date.now() - start);

    const passed = check(res, {
      'health: status 200': (r) => r.status === 200,
    });
    errorRate.add(!passed);
  });

  sleep(0.2);

  // API endpoints under stress
  group('API Endpoints', () => {
    // OpenAPI endpoint
    {
      const start = Date.now();
      const res = http.get(`${GATEWAY_URL}/api-docs.json`, {
        tags: { name: 'openapi' },
        timeout: '5s',
      });
      apiDuration.add(Date.now() - start);

      const passed = check(res, {
        'openapi: accessible': (r) => r.status === 200 || r.status === 503,
      });
      errorRate.add(!passed && res.status !== 503);
    }

    sleep(0.1);

    // Authenticated endpoint
    const token = getAccessToken();
    if (token) {
      const start = Date.now();
      const res = http.get(`${GATEWAY_URL}/api/user`, {
        headers: { Authorization: `Bearer ${token}` },
        tags: { name: 'user' },
        timeout: '5s',
      });
      apiDuration.add(Date.now() - start);

      const passed = check(res, {
        'user: accessible under stress': (r) => r.status === 200 || r.status === 503 || r.status === 429,
      });
      // 503 and 429 are acceptable under stress (graceful degradation)
      if (res.status !== 200 && res.status !== 503 && res.status !== 429) {
        errorRate.add(true);
      }
    }
  });

  // Shorter sleep under stress to increase pressure
  sleep(0.2);
}

// Teardown
export function teardown(data) {
  console.log('[STRESS TEST] Complete');
  console.log('[STRESS TEST] Check results for breaking point analysis');
}

// Summary handler
export function handleSummary(data) {
  const thresholdResults = Object.entries(data.thresholds || {});
  const passed = thresholdResults.every(([, t]) => t.ok);
  const passedCount = thresholdResults.filter(([, t]) => t.ok).length;
  const status = passed ? 'PASSED (GREEN)' : 'FAILED (RED)';

  let summary = `\n${'='.repeat(60)}\n`;
  summary += `STRESS TEST RESULTS: ${status}\n`;
  summary += `Thresholds: ${passedCount}/${thresholdResults.length} passed\n`;
  summary += `${'='.repeat(60)}\n\n`;

  // Threshold results
  summary += 'Thresholds:\n';
  for (const [name, threshold] of thresholdResults) {
    const icon = threshold.ok ? '✓' : '✗';
    summary += `  ${icon} ${name}: ${threshold.ok ? 'PASS' : 'FAIL'}\n`;
  }

  // Breaking point analysis
  summary += '\nBreaking Point Analysis:\n';
  const metrics = data.metrics;

  if (metrics.http_req_duration) {
    const dur = metrics.http_req_duration.values;
    summary += `  Response Time:\n`;
    summary += `    P50: ${dur['p(50)']?.toFixed(2) || 'N/A'}ms\n`;
    summary += `    P95: ${dur['p(95)']?.toFixed(2) || 'N/A'}ms\n`;
    summary += `    P99: ${dur['p(99)']?.toFixed(2) || 'N/A'}ms\n`;
    summary += `    Max: ${dur.max?.toFixed(2) || 'N/A'}ms\n`;
  }

  if (metrics.http_req_failed) {
    const failRate = (metrics.http_req_failed.values.rate || 0) * 100;
    summary += `  Error Rate: ${failRate.toFixed(2)}%\n`;

    if (failRate > 5) {
      summary += `  ⚠ WARNING: Error rate exceeded 5% - possible breaking point reached\n`;
    }
  }

  if (metrics.http_reqs) {
    summary += `  Throughput: ${metrics.http_reqs.values.rate?.toFixed(2) || 'N/A'} req/s\n`;
    summary += `  Total Requests: ${metrics.http_reqs.values.count || 0}\n`;
  }

  return {
    stdout: summary,
    'stress-results.json': JSON.stringify(data, null, 2),
  };
}
