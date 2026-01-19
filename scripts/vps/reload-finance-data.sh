#!/usr/bin/env bash
#
# Reload Finance database on VPS with latest sample data
#
# This script drops and recreates the tamshai_finance database
# with the latest data from sample-data/finance-data.sql
#
# Usage:
#   ./scripts/vps/reload-finance-data.sh
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
echo "Finance Data Reload for VPS"
echo "=================================================="
echo "VPS IP: $VPS_IP"
echo ""

# Check if SSH key exists
if [ ! -f "$SSH_KEY" ]; then
    echo "ERROR: SSH key not found at $SSH_KEY"
    echo "Please set SSH_KEY environment variable or run from project root"
    exit 1
fi

# Check if finance-data.sql exists
if [ ! -f "sample-data/finance-data.sql" ]; then
    echo "ERROR: sample-data/finance-data.sql not found"
    echo "Please run from project root directory"
    exit 1
fi

echo "Step 1: Copy updated finance-data.sql to VPS..."
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no \
    sample-data/finance-data.sql \
    root@$VPS_IP:/tmp/finance-data.sql

echo "Step 2: Stop MCP Finance service..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no root@$VPS_IP << 'ENDSSH'
cd /opt/tamshai
docker compose stop mcp-finance
ENDSSH

echo "Step 3: Drop and recreate tamshai_finance database..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no root@$VPS_IP << 'ENDSSH'
docker exec tamshai-postgres psql -U postgres -c "DROP DATABASE IF EXISTS tamshai_finance;"
docker exec tamshai-postgres psql -U postgres -c "CREATE DATABASE tamshai_finance OWNER tamshai;"
ENDSSH

echo "Step 4: Load updated finance data..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no root@$VPS_IP << 'ENDSSH'
docker exec -i tamshai-postgres psql -U tamshai -d tamshai_finance < /tmp/finance-data.sql
ENDSSH

echo "Step 5: Restart MCP Finance service..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no root@$VPS_IP << 'ENDSSH'
cd /opt/tamshai
docker compose start mcp-finance
sleep 3
docker compose ps mcp-finance
ENDSSH

echo "Step 6: Verify data..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no root@$VPS_IP << 'ENDSSH'
echo ""
echo "Budget data for 2025:"
docker exec tamshai-postgres psql -U tamshai -d tamshai_finance -c \
    "SELECT fiscal_year, COUNT(*) as budget_count FROM finance.department_budgets WHERE fiscal_year = 2025 GROUP BY fiscal_year;"

echo ""
echo "Invoice data for 2025:"
docker exec tamshai-postgres psql -U tamshai -d tamshai_finance -c \
    "SELECT EXTRACT(YEAR FROM invoice_date) as year, COUNT(*) as invoice_count FROM finance.invoices WHERE EXTRACT(YEAR FROM invoice_date) = 2025 GROUP BY year;"

echo ""
echo "Revenue summary for 2025:"
docker exec tamshai-postgres psql -U tamshai -d tamshai_finance -c \
    "SELECT fiscal_year, quarter, COUNT(*) FROM finance.revenue_summary WHERE fiscal_year = 2025 GROUP BY fiscal_year, quarter ORDER BY quarter;"
ENDSSH

echo ""
echo "=================================================="
echo "Finance data reload complete!"
echo "=================================================="
echo "Next steps:"
echo "  1. Test Finance Dashboard at https://vps.tamshai.com/app"
echo "  2. Verify budgets show actual values (not \$NaN)"
echo "  3. Check invoices show 2025 dates"
echo ""
