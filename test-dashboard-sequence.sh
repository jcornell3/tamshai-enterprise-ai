#!/bin/bash

# Test the exact sequence: Expense Reports -> Dashboard
echo "=== Testing Dashboard Failure After Expense Reports ==="
echo ""

BASE_URL="http://localhost:3100/api/mcp/finance"
TOKEN="eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJvN2VMN1VEYXdORDJGRzhjZjhSOGpfZVN5LUo5b2hYdmNfTzY3OVJMZF9zIn0.eyJleHAiOjE3MzYzNzczNTEsImlhdCI6MTczNjM3NzA1MSwianRpIjoiNDA1N2I1ZTctYzFlZS00ZjI4LWExMzgtZmY5NGEyMDA3MzY4IiwiaXNzIjoiaHR0cDovL2xvY2FsaG9zdDo4MTgwL3JlYWxtcy90YW1zaGFpIiwiYXVkIjoiYWNjb3VudCIsInN1YiI6ImFsaWNlLXV1aWQiLCJ0eXAiOiJCZWFyZXIiLCJhenAiOiJ3ZWItZmluYW5jZSIsInNpZCI6IjM1NTFmODA4LTJkZGUtNDkwMy1iYzBhLWY2ODhkMDI3ZWM3ZCIsImFjciI6IjEiLCJhbGxvd2VkLW9yaWdpbnMiOlsiaHR0cDovL2xvY2FsaG9zdDo0MDAyIl0sInJlYWxtX2FjY2VzcyI6eyJyb2xlcyI6WyJkZWZhdWx0LXJvbGVzLXRhbXNoYWkiLCJvZmZsaW5lX2FjY2VzcyIsInVtYV9hdXRob3JpemF0aW9uIl19LCJyZXNvdXJjZV9hY2Nlc3MiOnsibWNwLWdhdGV3YXkiOnsicm9sZXMiOlsiZmluYW5jZS1yZWFkIiwiZmluYW5jZS13cml0ZSJdfSwiYWNjb3VudCI6eyJyb2xlcyI6WyJtYW5hZ2UtYWNjb3VudCIsIm1hbmFnZS1hY2NvdW50LWxpbmtzIiwidmlldy1wcm9maWxlIl19fSwic2NvcGUiOiJvcGVuaWQgcHJvZmlsZSBlbWFpbCIsImVtYWlsX3ZlcmlmaWVkIjpmYWxzZSwicHJlZmVycmVkX3VzZXJuYW1lIjoiYWxpY2UuY2hlbiIsImVtYWlsIjoiYWxpY2UuY2hlbkB0YW1zaGFpLmNvbSJ9.Fake-Signature"

echo "Step 1: Call list_expense_reports (should return NOT_IMPLEMENTED)"
echo "GET $BASE_URL/list_expense_reports"
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/list_expense_reports" | head -20

echo ""
echo "=================================="
echo ""

sleep 1

echo "Step 2: Call list_budgets (this should work but might fail)"
echo "GET $BASE_URL/list_budgets?fiscalYear=2025"
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/list_budgets?fiscalYear=2025" | head -20

echo ""
echo "=================================="
echo "Test complete"
