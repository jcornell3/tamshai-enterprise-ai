# Performance Tests

Performance and load testing for Tamshai Enterprise AI using [k6](https://k6.io/).

## Prerequisites

- [k6](https://k6.io/docs/getting-started/installation/) installed
- MCP Gateway running on localhost:3100 (or set `GATEWAY_URL`)
- Optional: Keycloak running for authenticated endpoint tests

## Installation

```bash
# Install k6 (macOS)
brew install k6

# Install k6 (Windows via Chocolatey)
choco install k6

# Install k6 (Linux)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

## Running Tests

```bash
# Standard load test
npm test

# Quick smoke test (1 user, 10 seconds)
npm run test:smoke

# Stress test (50 users, 60 seconds)
npm run test:stress

# Generate JSON report
npm run test:report
```

## Test Scenarios

### gateway-load.js

Tests the MCP Gateway endpoints under load:

- **Health endpoints**: `/health`, `/api/health`
- **Authentication**: Verifies protected endpoints require auth
- **OpenAPI**: Tests documentation endpoints
- **Authenticated endpoints**: `/api/user`, `/api/mcp/tools`

#### Default Load Profile

| Stage | Duration | Virtual Users |
|-------|----------|---------------|
| Ramp up | 30s | 0 → 10 |
| Steady | 1m | 10 |
| Ramp up | 30s | 10 → 25 |
| Steady | 1m | 25 |
| Ramp down | 30s | 25 → 0 |

#### Thresholds

- 95% of requests under 500ms
- Less than 1% HTTP errors
- Less than 5% custom errors
- Health check P95 under 100ms

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GATEWAY_URL` | `http://localhost:3100` | MCP Gateway URL |
| `KEYCLOAK_URL` | `http://localhost:8180` | Keycloak URL |
| `KEYCLOAK_REALM` | `tamshai-corp` | Keycloak realm name |
| `ENVIRONMENT` | `local` | Environment tag |

## Output

Test results include:
- HTTP request duration (avg, p95, p99, max)
- Total requests and requests/second
- Failed request percentage
- Custom metric durations
- Threshold pass/fail status

JSON reports are written to `summary.json` when using `test:report`.

## CI Integration

Performance tests can be run in CI with:

```yaml
- name: Run k6 Load Test
  uses: grafana/k6-action@v0.3.1
  with:
    filename: tests/performance/scenarios/gateway-load.js
    flags: --vus 5 --duration 30s
  env:
    GATEWAY_URL: http://localhost:3100
```
