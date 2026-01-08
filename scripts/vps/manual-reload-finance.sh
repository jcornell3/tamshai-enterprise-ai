#!/bin/bash
# Manual script to reload Finance database on VPS
# This script can be run directly on the VPS or via SSH

set -e

echo "=== Manual Finance Database Reload ==="
echo "Timestamp: $(date)"
echo ""

echo "[1/3] Stopping MCP Finance service..."
docker stop tamshai-mcp-finance || true

echo "[2/3] Dropping and recreating Finance database..."
docker exec tamshai-postgres psql -U postgres -c "DROP DATABASE IF EXISTS tamshai_finance;"
docker exec tamshai-postgres psql -U postgres -c "CREATE DATABASE tamshai_finance OWNER tamshai;"
docker exec -i tamshai-postgres psql -U tamshai -d tamshai_finance < /opt/tamshai/sample-data/finance-data.sql

echo "[3/3] Restarting MCP Finance service..."
docker start tamshai-mcp-finance
docker restart tamshai-mcp-gateway

echo ""
echo "=== Verifying Finance Data ==="
echo "Finance budgets by fiscal year:"
docker exec tamshai-postgres psql -U tamshai -d tamshai_finance -c "SELECT fiscal_year, COUNT(*) FROM finance.department_budgets GROUP BY fiscal_year ORDER BY fiscal_year;"

echo ""
echo "Finance invoices (first 5):"
docker exec tamshai-postgres psql -U tamshai -d tamshai_finance -c "SELECT invoice_number, vendor_name, amount, issue_date FROM finance.invoices ORDER BY issue_date DESC LIMIT 5;"

echo ""
echo "=== Finance Database Reload Complete ==="
