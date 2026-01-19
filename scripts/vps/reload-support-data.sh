#!/usr/bin/env bash
#
# Reload Support data on VPS with latest sample data
#
# This script reloads Elasticsearch indexes (support_tickets, knowledge_base)
# with the latest data from sample-data/support-data.ndjson
#
# Usage:
#   ./scripts/vps/reload-support-data.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Load .env.local if it exists (for VPS_HOST and other local config)
if [ -f "$PROJECT_ROOT/.env.local" ]; then
    # shellcheck source=/dev/null
    source "$PROJECT_ROOT/.env.local"
fi

# Support both VPS_IP and VPS_HOST for backward compatibility
VPS_IP="${VPS_IP:-${VPS_HOST:-}}"
if [ -z "$VPS_IP" ]; then
    echo "ERROR: VPS_IP or VPS_HOST not set. Either:"
    echo "  1. Create .env.local with VPS_HOST=<ip>"
    echo "  2. Export VPS_IP or VPS_HOST environment variable"
    echo "  3. Get IP from: cd infrastructure/terraform/vps && terraform output vps_ip"
    exit 1
fi
SSH_KEY="${SSH_KEY:-infrastructure/terraform/vps/.keys/deploy_key}"

echo "=================================================="
echo "Support Data Reload for VPS"
echo "=================================================="
echo "VPS IP: $VPS_IP"
echo ""

# Check if SSH key exists
if [ ! -f "$SSH_KEY" ]; then
    echo "ERROR: SSH key not found at $SSH_KEY"
    echo "Please set SSH_KEY environment variable or run from project root"
    exit 1
fi

# Check if support-data.ndjson exists
if [ ! -f "sample-data/support-data.ndjson" ]; then
    echo "ERROR: sample-data/support-data.ndjson not found"
    echo "Please run from project root directory"
    exit 1
fi

echo "Step 1: Copy updated support-data.ndjson to VPS..."
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no \
    sample-data/support-data.ndjson \
    root@$VPS_IP:/tmp/support-data.ndjson

echo "Step 2: Stop MCP Support service..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no root@$VPS_IP << 'ENDSSH'
cd /opt/tamshai
docker compose stop mcp-support
ENDSSH

echo "Step 3: Delete existing Elasticsearch indexes..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no root@$VPS_IP << 'ENDSSH'
echo "  - Deleting support_tickets index..."
curl -X DELETE "http://localhost:9200/support_tickets" 2>/dev/null || echo "    (index did not exist)"

echo "  - Deleting knowledge_base index..."
curl -X DELETE "http://localhost:9200/knowledge_base" 2>/dev/null || echo "    (index did not exist)"
ENDSSH

echo "Step 4: Load updated support data..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no root@$VPS_IP << 'ENDSSH'
# Bulk load data using Elasticsearch _bulk API
curl -X POST "http://localhost:9200/_bulk" \
    -H "Content-Type: application/x-ndjson" \
    --data-binary @/tmp/support-data.ndjson \
    2>/dev/null | jq '.errors, .items | length'

echo "  Data loaded successfully"
ENDSSH

echo "Step 5: Verify indexes created..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no root@$VPS_IP << 'ENDSSH'
echo ""
echo "  - support_tickets index:"
curl -s "http://localhost:9200/support_tickets/_count" | jq '{count: .count}'

echo ""
echo "  - knowledge_base index:"
curl -s "http://localhost:9200/knowledge_base/_count" | jq '{count: .count}'
ENDSSH

echo "Step 6: Restart MCP Support service..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no root@$VPS_IP << 'ENDSSH'
cd /opt/tamshai
docker compose start mcp-support
sleep 3
docker compose ps mcp-support
ENDSSH

echo "Step 7: Verify data via MCP Support..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no root@$VPS_IP << 'ENDSSH'
echo ""
echo "Tickets by status:"
curl -s "http://localhost:9200/support_tickets/_search" \
    -H "Content-Type: application/json" \
    -d '{
      "size": 0,
      "aggs": {
        "by_status": {
          "terms": {"field": "status.keyword"}
        }
      }
    }' | jq '.aggregations.by_status.buckets[] | {status: .key, count: .doc_count}'

echo ""
echo "Tickets by priority:"
curl -s "http://localhost:9200/support_tickets/_search" \
    -H "Content-Type: application/json" \
    -d '{
      "size": 0,
      "aggs": {
        "by_priority": {
          "terms": {"field": "priority.keyword"}
        }
      }
    }' | jq '.aggregations.by_priority.buckets[] | {priority: .key, count: .doc_count}'

echo ""
echo "Knowledge base articles by category:"
curl -s "http://localhost:9200/knowledge_base/_search" \
    -H "Content-Type: application/json" \
    -d '{
      "size": 0,
      "aggs": {
        "by_category": {
          "terms": {"field": "category.keyword"}
        }
      }
    }' | jq '.aggregations.by_category.buckets[] | {category: .key, count: .doc_count}'
ENDSSH

echo ""
echo "=================================================="
echo "Support data reload complete!"
echo "=================================================="
echo "Next steps:"
echo "  1. Test Support Dashboard at https://vps.tamshai.com/app"
echo "  2. Verify Tickets tab shows all tickets"
echo "  3. Check Knowledgebase tab displays articles"
echo "  4. Ensure Urgent Tickets section shows high/critical tickets"
echo ""
