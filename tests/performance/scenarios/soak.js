/**
 * k6 Soak Test for Tamshai MCP Gateway
 *
 * TDD RED PHASE: Thresholds defined FIRST
 *
 * Purpose: Detect memory leaks, resource exhaustion over time
 * Duration: 4 hours (configurable via SOAK_DURATION)
 * Virtual Users: Moderate, sustained load
 *
 * Run: k6 run scenarios/soak.js
 * Short run: SOAK_DURATION=30m k6 run scenarios/soak.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { getAccessToken } from '../lib/auth.js';

// Custom metrics
const errorRate = new Rate('errors');
const healthDuration = new Trend('health_duration', true);
const apiDuration = new Trend('api_duration', true);
const requestCounter = new Counter('total_requests');

// Time-windowed metrics for detecting degradation
const hourlyErrors = new Counter('hourly_errors');

// Configuration
const GATEWAY_URL = __ENV.MCP_GATEWAY_URL;
const SOAK_DURATION = __ENV.SOAK_DURATION || '4h';

// =============================================================================
// TDD: THRESHOLDS DEFINED FIRST
// Soak test: Must maintain performance over extended period
// =============================================================================
export const options = {
  // Soak profile: Steady load over extended period
  stages: [
    { duration: '5m', target: 25 },                    // Ramp up
    { duration: SOAK_DURATION, target: 25 },           // Sustained load
    { duration: '5m', target: 0 },                     // Ramp down
  ],

  // SOAK THRESHOLDS - Consistent performance over time
  thresholds: {
    // Must maintain load test performance over extended period
    http_req_duration: ['p(95)<500', 'p(99)<1000'],

    // Very low error rate required for soak
    http_req_failed: ['rate<0.001'],    // Less than 0.1% errors

    // Health must remain fast
    'health_duration': ['p(95)<100', 'p(99)<200'],

    // API endpoints
    'api_duration': ['p(95)<400', 'p(99)<800'],

    // Custom errors
    'errors': ['rate<0.01'],            // Less than 1% errors

    // Consistent throughput
    'http_reqs': ['rate>30'],           // At least 30 req/s sustained
  },

  // Tags
  tags: {
    test_type: 'soak',
    service: 'mcp-gateway',
    environment: __ENV.ENVIRONMENT || 'local',
  },
};

// Setup
export function setup() {
  const res = http.get(`${GATEWAY_URL}/health`);
  if (res.status !== 200) {
    throw new Error(`Gateway not accessible at ${GATEWAY_URL}`);
  }

  console.log(`[SOAK TEST] Testing gateway at: ${GATEWAY_URL}`);
  console.log('[SOAK TEST] Thresholds defined - RED phase validation');
  console.log(`[SOAK TEST] Duration: ${SOAK_DURATION}`);
  console.log('[SOAK TEST] Purpose: Detect memory leaks and resource exhaustion');
  return {
    gatewayUrl: GATEWAY_URL,
    startTime: Date.now(),
  };
}

// Main test function
export default function (data) {
  requestCounter.add(1);

  // Calculate elapsed hours for degradation detection
  const elapsedHours = Math.floor((Date.now() - data.startTime) / (60 * 60 * 1000));

  // Health check
  {
    const start = Date.now();
    const res = http.get(`${GATEWAY_URL}/health`, {
      tags: { name: 'health', hour: String(elapsedHours) },
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

    if (!passed) {
      errorRate.add(true);
      hourlyErrors.add(1);
    }
  }

  sleep(0.5);

  // API health
  {
    const start = Date.now();
    const res = http.get(`${GATEWAY_URL}/api/health`, {
      tags: { name: 'api-health', hour: String(elapsedHours) },
    });
    apiDuration.add(Date.now() - start);

    const passed = check(res, {
      'api/health: status 200': (r) => r.status === 200,
    });

    if (!passed) {
      errorRate.add(true);
      hourlyErrors.add(1);
    }
  }

  sleep(0.5);

  // OpenAPI endpoint
  {
    const start = Date.now();
    const res = http.get(`${GATEWAY_URL}/api-docs.json`, {
      tags: { name: 'openapi', hour: String(elapsedHours) },
    });
    apiDuration.add(Date.now() - start);

    check(res, {
      'openapi: status 200': (r) => r.status === 200,
    });
  }

  sleep(0.5);

  // Authenticated endpoint (if Keycloak available)
  const token = getAccessToken();
  if (token) {
    const start = Date.now();
    const res = http.get(`${GATEWAY_URL}/api/user`, {
      headers: { Authorization: `Bearer ${token}` },
      tags: { name: 'user', hour: String(elapsedHours) },
    });
    apiDuration.add(Date.now() - start);

    const passed = check(res, {
      'user: status 200': (r) => r.status === 200,
    });

    if (!passed) {
      errorRate.add(true);
      hourlyErrors.add(1);
    }

    sleep(0.3);

    // MCP tools
    {
      const toolsStart = Date.now();
      const toolsRes = http.get(`${GATEWAY_URL}/api/mcp/tools`, {
        headers: { Authorization: `Bearer ${token}` },
        tags: { name: 'mcp-tools', hour: String(elapsedHours) },
      });
      apiDuration.add(Date.now() - toolsStart);

      check(toolsRes, {
        'mcp/tools: status 200': (r) => r.status === 200,
      });
    }
  }

  sleep(1);
}

// Teardown
export function teardown(data) {
  const duration = ((Date.now() - data.startTime) / 1000 / 60).toFixed(2);
  console.log(`[SOAK TEST] Complete after ${duration} minutes`);
}

// Summary handler
export function handleSummary(data) {
  const thresholdResults = Object.entries(data.thresholds || {});
  const passed = thresholdResults.every(([, t]) => t.ok);
  const passedCount = thresholdResults.filter(([, t]) => t.ok).length;
  const status = passed ? 'PASSED (GREEN)' : 'FAILED (RED)';

  let summary = `\n${'='.repeat(60)}\n`;
  summary += `SOAK TEST RESULTS: ${status}\n`;
  summary += `Thresholds: ${passedCount}/${thresholdResults.length} passed\n`;
  summary += `${'='.repeat(60)}\n\n`;

  // Threshold results
  summary += 'Thresholds:\n';
  for (const [name, threshold] of thresholdResults) {
    const icon = threshold.ok ? '✓' : '✗';
    summary += `  ${icon} ${name}: ${threshold.ok ? 'PASS' : 'FAIL'}\n`;
  }

  // Stability analysis
  summary += '\nStability Analysis:\n';
  const metrics = data.metrics;

  if (metrics.http_req_duration) {
    const dur = metrics.http_req_duration.values;
    summary += `  Response Time:\n`;
    summary += `    Average: ${dur.avg?.toFixed(2) || 'N/A'}ms\n`;
    summary += `    P95: ${dur['p(95)']?.toFixed(2) || 'N/A'}ms\n`;
    summary += `    P99: ${dur['p(99)']?.toFixed(2) || 'N/A'}ms\n`;

    // Check for degradation (P99 should be close to P95 in a stable system)
    const p95 = dur['p(95)'] || 0;
    const p99 = dur['p(99)'] || 0;
    const degradationRatio = p95 > 0 ? p99 / p95 : 0;

    if (degradationRatio > 2) {
      summary += `  ⚠ WARNING: P99/P95 ratio is ${degradationRatio.toFixed(2)}x - possible resource exhaustion\n`;
    }
  }

  if (metrics.http_req_failed) {
    const failRate = (metrics.http_req_failed.values.rate || 0) * 100;
    summary += `  Error Rate: ${failRate.toFixed(4)}%\n`;

    if (failRate > 0.1) {
      summary += `  ⚠ WARNING: Error rate exceeded 0.1% - possible stability issue\n`;
    }
  }

  if (metrics.http_reqs) {
    summary += `  Total Requests: ${metrics.http_reqs.values.count || 0}\n`;
    summary += `  Avg Throughput: ${metrics.http_reqs.values.rate?.toFixed(2) || 'N/A'} req/s\n`;
  }

  // Memory leak indicator (if response times increased significantly)
  summary += '\nMemory Leak Indicators:\n';
  summary += '  Check: Monitor container memory over test duration\n';
  summary += '  Check: Response time trend should be flat, not increasing\n';

  return {
    stdout: summary,
    'soak-results.json': JSON.stringify(data, null, 2),
  };
}
