#!/bin/bash
# Baseline Performance Measurements Script
# Run BEFORE starting any optimizations
# Usage: ./scripts/test/baseline-measurements.sh

set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RESULTS_DIR="tests/performance/baselines/$TIMESTAMP"
mkdir -p "$RESULTS_DIR"

echo "=== BASELINE PERFORMANCE MEASUREMENTS ==="
echo "Timestamp: $TIMESTAMP"
echo "Results directory: $RESULTS_DIR"
echo ""

# 1. Check if services are running
echo "Checking service health..."
if curl -s http://localhost:3100/health > /dev/null 2>&1; then
    echo "  MCP Gateway: OK"
else
    echo "  MCP Gateway: NOT RUNNING - Please start services first"
    exit 1
fi

# 2. API Latency Measurements
echo ""
echo "Measuring API latency..."
cat > "$RESULTS_DIR/api-latency.txt" << 'EOF'
API Latency Baseline Measurements
=================================
EOF

# Health endpoint timing
for i in {1..10}; do
    curl -w "Request $i: %{time_total}s\n" -o /dev/null -s http://localhost:3100/health >> "$RESULTS_DIR/api-latency.txt"
done

echo "  API latency recorded to $RESULTS_DIR/api-latency.txt"

# 3. Memory Usage
echo ""
echo "Capturing memory usage..."
docker stats --no-stream --format "{{.Name}},{{.MemUsage}},{{.MemPerc}}" 2>/dev/null | grep -E "(mcp-|web-)" > "$RESULTS_DIR/memory-usage.csv" || echo "Docker not available or no containers running"
echo "  Memory usage recorded to $RESULTS_DIR/memory-usage.csv"

# 4. Docker Image Sizes
echo ""
echo "Recording Docker image sizes..."
docker images --format "{{.Repository}},{{.Tag}},{{.Size}}" 2>/dev/null | grep -E "(mcp-|web-)" > "$RESULTS_DIR/docker-sizes.csv" || echo "Docker not available"
echo "  Docker sizes recorded to $RESULTS_DIR/docker-sizes.csv"

# 5. Log volume measurement
echo ""
echo "Measuring log volume (10 second sample)..."
if docker logs mcp-hr --since 10s 2>&1 | wc -l > "$RESULTS_DIR/log-volume.txt" 2>/dev/null; then
    LOG_LINES=$(cat "$RESULTS_DIR/log-volume.txt")
    echo "  Log lines in 10s: $LOG_LINES"
else
    echo "  Could not measure log volume (container may not be running)"
    echo "0" > "$RESULTS_DIR/log-volume.txt"
fi

# 6. Record system info
echo ""
echo "Recording system info..."
cat > "$RESULTS_DIR/system-info.txt" << EOF
Baseline Measurements System Info
=================================
Date: $(date)
Hostname: $(hostname)
Node Version: $(node --version 2>/dev/null || echo "N/A")
Docker Version: $(docker --version 2>/dev/null || echo "N/A")
EOF

# 7. Create summary
echo ""
echo "Creating summary..."
cat > "$RESULTS_DIR/BASELINE_SUMMARY.md" << EOF
# Baseline Performance Summary

**Measured:** $(date)
**Environment:** Development

## Metrics Recorded

| Metric | File | Status |
|--------|------|--------|
| API Latency | api-latency.txt | RECORDED |
| Memory Usage | memory-usage.csv | RECORDED |
| Docker Sizes | docker-sizes.csv | RECORDED |
| Log Volume | log-volume.txt | RECORDED |
| System Info | system-info.txt | RECORDED |

## Next Steps

1. Review the baseline values
2. Start P0 optimizations
3. Run verification tests after each phase
4. Compare against these baselines

EOF

echo ""
echo "=== BASELINE COMPLETE ==="
echo "Results saved to: $RESULTS_DIR"
echo ""
echo "Run 'cat $RESULTS_DIR/BASELINE_SUMMARY.md' to view summary"
