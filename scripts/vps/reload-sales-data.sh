#!/usr/bin/env bash
#
# Reload Sales database on VPS with latest sample data
#
# This script reloads the tamshai_sales MongoDB database
# with the latest data from sample-data/sales-data.js
#
# Usage:
#   ./scripts/vps/reload-sales-data.sh
#

set -e

VPS_IP="${VPS_IP:-5.78.159.29}"
SSH_KEY="${SSH_KEY:-infrastructure/terraform/vps/.keys/deploy_key}"

echo "=================================================="
echo "Sales Data Reload for VPS"
echo "=================================================="
echo "VPS IP: $VPS_IP"
echo ""

# Check if SSH key exists
if [ ! -f "$SSH_KEY" ]; then
    echo "ERROR: SSH key not found at $SSH_KEY"
    echo "Please set SSH_KEY environment variable or run from project root"
    exit 1
fi

# Check if sales-data.js exists
if [ ! -f "sample-data/sales-data.js" ]; then
    echo "ERROR: sample-data/sales-data.js not found"
    echo "Please run from project root directory"
    exit 1
fi

echo "Step 1: Copy updated sales-data.js to VPS..."
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no \
    sample-data/sales-data.js \
    root@$VPS_IP:/tmp/sales-data.js

echo "Step 2: Stop MCP Sales service..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no root@$VPS_IP << 'ENDSSH'
cd /opt/tamshai
docker compose stop mcp-sales
ENDSSH

echo "Step 3: Reload Sales data into MongoDB..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no root@$VPS_IP << 'ENDSSH'
# Get MongoDB root password from secrets (set by Terraform)
MONGODB_ROOT_PASSWORD=$(cat /root/.mongodb_root_password 2>/dev/null || echo "changeme")

# Load the sales data
docker exec -i tamshai-mongodb mongosh -u root -p "$MONGODB_ROOT_PASSWORD" --authenticationDatabase admin < /tmp/sales-data.js
ENDSSH

echo "Step 4: Restart MCP Sales service..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no root@$VPS_IP << 'ENDSSH'
cd /opt/tamshai
docker compose start mcp-sales
sleep 3
docker compose ps mcp-sales
ENDSSH

echo "Step 5: Verify data..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no root@$VPS_IP << 'ENDSSH'
MONGODB_ROOT_PASSWORD=$(cat /root/.mongodb_root_password 2>/dev/null || echo "changeme")

echo ""
echo "Customer count:"
docker exec tamshai-mongodb mongosh -u root -p "$MONGODB_ROOT_PASSWORD" --authenticationDatabase admin tamshai_sales --quiet --eval \
    "db.customers.countDocuments()"

echo ""
echo "Deal count by stage (Q1 2026):"
docker exec tamshai-mongodb mongosh -u root -p "$MONGODB_ROOT_PASSWORD" --authenticationDatabase admin tamshai_sales --quiet --eval \
    "db.deals.aggregate([{\\$group: {_id: '\\$stage', count: {\\$sum: 1}}}]).toArray()"

echo ""
echo "Q1 2026 pipeline summary:"
docker exec tamshai-mongodb mongosh -u root -p "$MONGODB_ROOT_PASSWORD" --authenticationDatabase admin tamshai_sales --quiet --eval \
    "db.pipeline_summary.findOne({_id: '2026-Q1'})"
ENDSSH

echo ""
echo "=================================================="
echo "Sales data reload complete!"
echo "=================================================="
echo "Next steps:"
echo "  1. Test Sales Dashboard at https://vps.tamshai.com/app"
echo "  2. Verify customers show up in CRM"
echo "  3. Check Q1 2026 pipeline data appears"
echo ""
