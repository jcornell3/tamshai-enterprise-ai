/**
 * Simple Performance Benchmark for Tamshai MCP Gateway
 * Measures latency and response sizes to verify optimization targets:
 * - P95 latency: target -30% improvement
 * - P99 latency: target -25% improvement
 * - Response sizes: target -60% reduction (with compression)
 */

const GATEWAY_URL = process.env.MCP_GATEWAY_URL;
if (!GATEWAY_URL) {
  console.error('ERROR: MCP_GATEWAY_URL environment variable is required.');
  process.exit(1);
}
const ITERATIONS = 100;

async function measureEndpoint(url, name, headers = {}) {
  const latencies = [];
  const sizes = [];
  let errors = 0;

  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    try {
      const response = await fetch(url, { headers });
      const end = performance.now();
      const body = await response.text();

      if (response.ok) {
        latencies.push(end - start);
        sizes.push(body.length);
      } else {
        errors++;
      }
    } catch (e) {
      errors++;
    }
  }

  // Sort for percentile calculations
  latencies.sort((a, b) => a - b);

  const p50 = latencies[Math.floor(latencies.length * 0.50)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length || 0;
  const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length || 0;

  return {
    name,
    iterations: ITERATIONS,
    errors,
    latency: {
      avg: avg.toFixed(2),
      p50: p50.toFixed(2),
      p95: p95.toFixed(2),
      p99: p99.toFixed(2),
    },
    responseSize: {
      avgBytes: Math.round(avgSize),
    },
  };
}

async function runBenchmark() {
  console.log('='.repeat(60));
  console.log('TAMSHAI MCP GATEWAY PERFORMANCE BENCHMARK');
  console.log('='.repeat(60));
  console.log(`Gateway URL: ${GATEWAY_URL}`);
  console.log(`Iterations per endpoint: ${ITERATIONS}`);
  console.log('');

  // Test 1: Health endpoint (baseline, no auth)
  console.log('Testing /health endpoint...');
  const healthResult = await measureEndpoint(`${GATEWAY_URL}/health`, 'Health');

  // Test 2: API health endpoint
  console.log('Testing /api/health endpoint...');
  const apiHealthResult = await measureEndpoint(`${GATEWAY_URL}/api/health`, 'API Health');

  // Test 3: OpenAPI docs (larger response, tests compression)
  console.log('Testing /api-docs.json endpoint...');
  const openApiResult = await measureEndpoint(`${GATEWAY_URL}/api-docs.json`, 'OpenAPI Docs');

  // Test 4: With Accept-Encoding to test compression
  console.log('Testing /api-docs.json with gzip...');
  const openApiGzipResult = await measureEndpoint(
    `${GATEWAY_URL}/api-docs.json`,
    'OpenAPI (gzip)',
    { 'Accept-Encoding': 'gzip, deflate' }
  );

  const results = [healthResult, apiHealthResult, openApiResult, openApiGzipResult];

  // Print results
  console.log('\n' + '='.repeat(60));
  console.log('RESULTS');
  console.log('='.repeat(60));

  console.log('\nLatency (ms):');
  console.log('-'.repeat(60));
  console.log('Endpoint'.padEnd(20) + 'Avg'.padStart(10) + 'P50'.padStart(10) + 'P95'.padStart(10) + 'P99'.padStart(10));
  console.log('-'.repeat(60));

  for (const r of results) {
    console.log(
      r.name.padEnd(20) +
      r.latency.avg.padStart(10) +
      r.latency.p50.padStart(10) +
      r.latency.p95.padStart(10) +
      r.latency.p99.padStart(10)
    );
  }

  console.log('\nResponse Sizes (bytes):');
  console.log('-'.repeat(40));
  for (const r of results) {
    console.log(`${r.name.padEnd(20)} ${r.responseSize.avgBytes}`);
  }

  // Compression effectiveness
  if (openApiResult.responseSize.avgBytes > 0 && openApiGzipResult.responseSize.avgBytes > 0) {
    const compressionRatio = (1 - openApiGzipResult.responseSize.avgBytes / openApiResult.responseSize.avgBytes) * 100;
    console.log(`\nCompression Ratio: ${compressionRatio.toFixed(1)}% reduction`);
  }

  console.log('\nErrors:');
  for (const r of results) {
    if (r.errors > 0) {
      console.log(`  ${r.name}: ${r.errors}/${r.iterations} failed`);
    }
  }
  if (results.every(r => r.errors === 0)) {
    console.log('  None - all requests succeeded');
  }

  // Output JSON for documentation
  const jsonOutput = {
    timestamp: new Date().toISOString(),
    config: { gatewayUrl: GATEWAY_URL, iterations: ITERATIONS },
    results: results,
  };

  console.log('\n' + '='.repeat(60));
  console.log('JSON OUTPUT (for documentation):');
  console.log('='.repeat(60));
  console.log(JSON.stringify(jsonOutput, null, 2));
}

runBenchmark().catch(console.error);
