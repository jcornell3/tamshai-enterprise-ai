# Performance Tests

Performance and load testing for Tamshai Enterprise AI using [k6](https://k6.io/).

## TDD Approach

These tests follow Test-Driven Development principles:

1. **RED Phase**: Thresholds (performance requirements) are defined FIRST
2. **GREEN Phase**: System is optimized to meet thresholds
3. **REFACTOR Phase**: Scenarios are refined while maintaining green thresholds

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
# Quick smoke test (30 seconds, 1 user)
npm run test:smoke

# Standard load test (10 minutes, up to 50 users)
npm run test:load

# Stress test (15 minutes, up to 200 users)
npm run test:stress

# Soak test (4 hours, 25 users - detect memory leaks)
npm run test:soak

# Short soak test (30 minutes)
npm run test:soak:short

# All quick tests (smoke + load)
npm run test:all

# CI mode (quick validation)
npm run test:ci
```

## Test Scenarios

### 1. Smoke Test (`scenarios/smoke.js`)

**Purpose**: Quick validation that the system is working

| Setting | Value |
|---------|-------|
| Duration | 30 seconds |
| Virtual Users | 1 |
| Thresholds | Strict (P95 < 200ms) |

```bash
npm run test:smoke
```

**Thresholds**:
- HTTP P95 < 200ms
- Error rate < 1%
- Health check P95 < 50ms

### 2. Load Test (`scenarios/load.js`)

**Purpose**: Verify system handles expected production load

| Setting | Value |
|---------|-------|
| Duration | 10 minutes |
| Peak Users | 50 |
| Profile | Gradual ramp |

```bash
npm run test:load
```

**Thresholds**:
- HTTP P95 < 500ms, P99 < 1000ms
- Error rate < 1%
- Throughput > 50 req/s
- Health P95 < 100ms

### 3. Stress Test (`scenarios/stress.js`)

**Purpose**: Find the breaking point of the system

| Setting | Value |
|---------|-------|
| Duration | 15 minutes |
| Peak Users | 200 |
| Profile | Aggressive ramp |

```bash
npm run test:stress
```

**Thresholds** (relaxed for stress):
- HTTP P95 < 2000ms, P99 < 5000ms
- Error rate < 5%
- Throughput > 20 req/s
- Health P95 < 500ms

### 4. Soak Test (`scenarios/soak.js`)

**Purpose**: Detect memory leaks and resource exhaustion

| Setting | Value |
|---------|-------|
| Duration | 4 hours (configurable) |
| Users | 25 sustained |
| Profile | Flat |

```bash
# Full 4-hour soak
npm run test:soak

# 30-minute soak
npm run test:soak:short

# Custom duration
SOAK_DURATION=2h k6 run scenarios/soak.js
```

**Thresholds**:
- HTTP P95 < 500ms (consistent over time)
- Error rate < 0.1%
- Throughput > 30 req/s sustained

## Threshold Summary

| Scenario | P95 | P99 | Error Rate | Throughput |
|----------|-----|-----|------------|------------|
| Smoke | < 200ms | - | < 1% | - |
| Load | < 500ms | < 1000ms | < 1% | > 50 req/s |
| Stress | < 2000ms | < 5000ms | < 5% | > 20 req/s |
| Soak | < 500ms | < 1000ms | < 0.1% | > 30 req/s |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GATEWAY_URL` | `http://localhost:3100` | MCP Gateway URL |
| `KEYCLOAK_URL` | `http://localhost:8180` | Keycloak URL |
| `KEYCLOAK_REALM` | `tamshai-corp` | Keycloak realm |
| `TEST_PASSWORD` | `[REDACTED-DEV-PASSWORD]` | Test user password |
| `SOAK_DURATION` | `4h` | Soak test duration |
| `ENVIRONMENT` | `local` | Environment tag |

## Output

Each test produces:
- Console summary with pass/fail status
- JSON results file (`*-results.json`)
- Threshold validation (RED/GREEN status)

## CI Integration

Add to GitHub Actions:

```yaml
- name: Run Performance Smoke Test
  uses: grafana/k6-action@v0.3.1
  with:
    filename: tests/performance/scenarios/smoke.js
  env:
    GATEWAY_URL: http://localhost:3100

- name: Upload Results
  uses: actions/upload-artifact@v4
  with:
    name: k6-results
    path: tests/performance/*-results.json
```

## TDD Workflow

1. **Define Thresholds**: Each scenario has thresholds defined at the top
2. **Run Baseline**: Initial run shows which thresholds fail (RED)
3. **Optimize**: Improve Gateway/infrastructure to meet thresholds
4. **Validate**: Re-run to confirm all thresholds pass (GREEN)
5. **Refine**: Adjust thresholds as system matures

## Interpreting Results

### GREEN (All Thresholds Pass)
```
LOAD TEST RESULTS: PASSED (GREEN)
Thresholds: 8/8 passed
```

### RED (Some Thresholds Fail)
```
LOAD TEST RESULTS: FAILED (RED)
Thresholds: 5/8 passed
  ✗ http_req_duration: FAIL
```

When RED:
1. Identify which thresholds failed
2. Profile the bottleneck (CPU, memory, database, network)
3. Optimize the hot path
4. Re-run until GREEN

## Files

```
tests/performance/
├── package.json           # npm scripts
├── README.md              # This file
└── scenarios/
    ├── smoke.js           # Quick validation
    ├── load.js            # Production load
    ├── stress.js          # Breaking point
    ├── soak.js            # Memory leak detection
    └── gateway-load.js    # Legacy combined test
```
