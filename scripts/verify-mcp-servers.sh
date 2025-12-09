#!/bin/bash

# MCP Servers Verification Script (Architecture v1.4)
#
# This script verifies that all MCP servers are properly implemented
# with v1.4 features (truncation, confirmations, error schemas).

set -e

echo "=================================================="
echo "MCP Servers v1.4 Verification Script"
echo "=================================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counter for results
PASS=0
FAIL=0

# Function to check if a file exists
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} Found: $1"
        ((PASS++))
        return 0
    else
        echo -e "${RED}✗${NC} Missing: $1"
        ((FAIL++))
        return 1
    fi
}

# Function to check if a pattern exists in a file
check_pattern() {
    local file=$1
    local pattern=$2
    local description=$3

    if grep -q "$pattern" "$file" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} $description"
        ((PASS++))
        return 0
    else
        echo -e "${RED}✗${NC} $description"
        ((FAIL++))
        return 1
    fi
}

# Function to run TypeScript type check
check_typescript() {
    local dir=$1
    local service_name=$2

    echo ""
    echo "Checking TypeScript compilation for $service_name..."

    if [ -d "$dir" ]; then
        cd "$dir"
        if npm run typecheck > /dev/null 2>&1; then
            echo -e "${GREEN}✓${NC} $service_name TypeScript compiles successfully"
            ((PASS++))
        else
            echo -e "${RED}✗${NC} $service_name TypeScript compilation failed"
            ((FAIL++))
        fi
        cd - > /dev/null
    else
        echo -e "${RED}✗${NC} Directory not found: $dir"
        ((FAIL++))
    fi
}

echo "=== MCP Gateway (Port 3100) ==="
echo ""

check_file "services/mcp-gateway/src/index.ts"
check_file "services/mcp-gateway/src/types/mcp-response.ts"
check_file "services/mcp-gateway/src/utils/redis.ts"

echo ""
echo "Checking v1.4 features in MCP Gateway..."
check_pattern "services/mcp-gateway/src/index.ts" "text/event-stream" "SSE streaming endpoint"
check_pattern "services/mcp-gateway/src/index.ts" "/api/confirm" "Confirmation endpoint"
check_pattern "services/mcp-gateway/src/index.ts" "metadata.truncated" "Truncation detection"
check_pattern "services/mcp-gateway/src/types/mcp-response.ts" "MCPPendingConfirmationResponse" "Pending confirmation type"
check_pattern "services/mcp-gateway/src/types/mcp-response.ts" "TruncationMetadata" "Truncation metadata type"

check_typescript "services/mcp-gateway" "MCP Gateway"

echo ""
echo "=== MCP HR Server (Port 3101) ==="
echo ""

check_file "services/mcp-hr/src/index.ts"
check_file "services/mcp-hr/src/types/response.ts"
check_file "services/mcp-hr/src/database/connection.ts"
check_file "services/mcp-hr/src/utils/error-handler.ts"
check_file "services/mcp-hr/src/utils/redis.ts"
check_file "services/mcp-hr/src/tools/get-employee.ts"
check_file "services/mcp-hr/src/tools/list-employees.ts"
check_file "services/mcp-hr/src/tools/delete-employee.ts"

echo ""
echo "Checking v1.4 features in MCP HR..."
check_pattern "services/mcp-hr/src/tools/list-employees.ts" "LIMIT.*1.*pattern" "LIMIT+1 truncation detection"
check_pattern "services/mcp-hr/src/tools/delete-employee.ts" "pending_confirmation" "Confirmation flow"
check_pattern "services/mcp-hr/src/utils/error-handler.ts" "suggestedAction" "LLM-friendly errors"
check_pattern "services/mcp-hr/src/index.ts" "/execute" "Execute endpoint"

check_typescript "services/mcp-hr" "MCP HR"

echo ""
echo "=== MCP Finance Server (Port 3102) ==="
echo ""

check_file "services/mcp-finance/src/index.ts"
check_file "services/mcp-finance/src/types/response.ts"
check_file "services/mcp-finance/src/database/connection.ts"
check_file "services/mcp-finance/src/utils/error-handler.ts"
check_file "services/mcp-finance/src/utils/redis.ts"
check_file "services/mcp-finance/src/tools/get-budget.ts"
check_file "services/mcp-finance/src/tools/list-invoices.ts"
check_file "services/mcp-finance/src/tools/get-expense-report.ts"
check_file "services/mcp-finance/src/tools/delete-invoice.ts"
check_file "services/mcp-finance/src/tools/approve-budget.ts"

echo ""
echo "Checking v1.4 features in MCP Finance..."
check_pattern "services/mcp-finance/src/tools/list-invoices.ts" "LIMIT.*1.*pattern" "LIMIT+1 truncation detection"
check_pattern "services/mcp-finance/src/tools/delete-invoice.ts" "pending_confirmation" "Delete confirmation flow"
check_pattern "services/mcp-finance/src/tools/approve-budget.ts" "pending_confirmation" "Approve confirmation flow"
check_pattern "services/mcp-finance/src/utils/error-handler.ts" "suggestedAction" "LLM-friendly errors"
check_pattern "services/mcp-finance/src/index.ts" "/execute" "Execute endpoint"

check_typescript "services/mcp-finance" "MCP Finance"

echo ""
echo "=== MCP Sales Server (Port 3103) ==="
echo ""

check_file "services/mcp-sales/src/index.ts"
check_file "services/mcp-sales/src/types/response.ts"
check_file "services/mcp-sales/src/database/connection.ts"
check_file "services/mcp-sales/src/utils/error-handler.ts"
check_file "services/mcp-sales/src/utils/redis.ts"

echo ""
echo "Checking v1.4 features in MCP Sales..."
check_pattern "services/mcp-sales/src/index.ts" "LIMIT.*1.*pattern" "LIMIT+1 truncation detection"
check_pattern "services/mcp-sales/src/index.ts" "pending_confirmation" "Confirmation flow"
check_pattern "services/mcp-sales/src/utils/error-handler.ts" "suggestedAction" "LLM-friendly errors"
check_pattern "services/mcp-sales/src/index.ts" "/execute" "Execute endpoint"
check_pattern "services/mcp-sales/src/database/connection.ts" "buildRoleFilter" "Role-based filtering"

check_typescript "services/mcp-sales" "MCP Sales"

echo ""
echo "=== MCP Support Server (Port 3104) ==="
echo ""

check_file "services/mcp-support/src/index.ts"
check_file "services/mcp-support/src/types/response.ts"
check_file "services/mcp-support/src/utils/redis.ts"

echo ""
echo "Checking v1.4 features in MCP Support..."
check_pattern "services/mcp-support/src/index.ts" "LIMIT.*1.*pattern" "LIMIT+1 truncation detection"
check_pattern "services/mcp-support/src/index.ts" "pending_confirmation" "Confirmation flow"
check_pattern "services/mcp-support/src/index.ts" "suggestedAction" "LLM-friendly errors"
check_pattern "services/mcp-support/src/index.ts" "/execute" "Execute endpoint"
check_pattern "services/mcp-support/src/index.ts" "@elastic/elasticsearch" "Elasticsearch integration"

check_typescript "services/mcp-support" "MCP Support"

echo ""
echo "=================================================="
echo "Verification Results"
echo "=================================================="
echo -e "${GREEN}Passed: $PASS${NC}"
echo -e "${RED}Failed: $FAIL${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}✓ All MCP servers v1.4 implementation verified!${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠ Some checks failed. Review the output above.${NC}"
    exit 1
fi
