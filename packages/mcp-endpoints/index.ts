/**
 * MCP Endpoint Constants
 *
 * Shared constants for MCP API endpoint paths used by both frontend and backend.
 * This ensures consistency and prevents endpoint path mismatches.
 *
 * Usage in frontend:
 *   import { MCP_ENDPOINTS } from '@tamshai/mcp-endpoints';
 *   fetch(`${apiConfig.mcpGatewayUrl}${MCP_ENDPOINTS.HR.LIST_EMPLOYEES}`, ...)
 *
 * Usage in backend tests:
 *   import { MCP_ENDPOINTS } from '@tamshai/mcp-endpoints';
 *   await client.get(MCP_ENDPOINTS.HR.LIST_EMPLOYEES);
 */

export const MCP_ENDPOINTS = {
  // HR Service Endpoints
  HR: {
    LIST_EMPLOYEES: '/api/mcp/hr/list_employees',
    GET_EMPLOYEE: '/api/mcp/hr/get_employee',
    UPDATE_EMPLOYEE: '/api/mcp/hr/update_employee',
    DELETE_EMPLOYEE: '/api/mcp/hr/delete_employee',
    UPDATE_SALARY: '/api/mcp/hr/update_salary',
    GET_TIME_OFF_BALANCES: '/api/mcp/hr/get_time_off_balances',
    LIST_TIME_OFF_REQUESTS: '/api/mcp/hr/list_time_off_requests',
    LIST_TEAM_TIME_OFF_REQUESTS: '/api/mcp/hr/list_team_time_off_requests',
    CREATE_TIME_OFF_REQUEST: '/api/mcp/hr/create_time_off_request',
    APPROVE_TIME_OFF_REQUEST: '/api/mcp/hr/approve_time_off_request',
    GET_ORG_CHART: '/api/mcp/hr/get_org_chart',
  },

  // Finance Service Endpoints
  FINANCE: {
    LIST_BUDGETS: '/api/mcp/finance/list_budgets',
    GET_BUDGET: '/api/mcp/finance/get_budget',
    APPROVE_BUDGET: '/api/mcp/finance/approve_budget',
    REJECT_BUDGET: '/api/mcp/finance/reject_budget',
    DELETE_BUDGET: '/api/mcp/finance/delete_budget',
    LIST_INVOICES: '/api/mcp/finance/list_invoices',
    GET_INVOICE: '/api/mcp/finance/get_invoice',
    APPROVE_INVOICE: '/api/mcp/finance/approve_invoice',
    PAY_INVOICE: '/api/mcp/finance/pay_invoice',
    DELETE_INVOICE: '/api/mcp/finance/delete_invoice',
    LIST_EXPENSE_REPORTS: '/api/mcp/finance/list_expense_reports',
    GET_EXPENSE_REPORT: '/api/mcp/finance/get_expense_report',
    APPROVE_EXPENSE_REPORT: '/api/mcp/finance/approve_expense_report',
    REJECT_EXPENSE_REPORT: '/api/mcp/finance/reject_expense_report',
    REIMBURSE_EXPENSE_REPORT: '/api/mcp/finance/reimburse_expense_report',
    DELETE_EXPENSE_REPORT: '/api/mcp/finance/delete_expense_report',
    GET_ARR: '/api/mcp/finance/get_arr',
    GET_ARR_MOVEMENT: '/api/mcp/finance/get_arr_movement',
  },

  // Sales Service Endpoints
  SALES: {
    LIST_OPPORTUNITIES: '/api/mcp/sales/list_opportunities',
    GET_OPPORTUNITY: '/api/mcp/sales/get_opportunity',
    CLOSE_OPPORTUNITY: '/api/mcp/sales/close_opportunity',
    UPDATE_OPPORTUNITY: '/api/mcp/sales/update_opportunity',
    DELETE_OPPORTUNITY: '/api/mcp/sales/delete_opportunity',
    LIST_CUSTOMERS: '/api/mcp/sales/list_customers',
    GET_CUSTOMER: '/api/mcp/sales/get_customer',
    DELETE_CUSTOMER: '/api/mcp/sales/delete_customer',
    LIST_LEADS: '/api/mcp/sales/list_leads',
    GET_FORECAST: '/api/mcp/sales/get_forecast',
  },

  // Support Service Endpoints
  SUPPORT: {
    SEARCH_TICKETS: '/api/mcp/support/search_tickets',
    GET_TICKET: '/api/mcp/support/get_ticket',
    CREATE_TICKET: '/api/mcp/support/create_ticket',
    UPDATE_TICKET: '/api/mcp/support/update_ticket',
    CLOSE_TICKET: '/api/mcp/support/close_ticket',
    ASSIGN_TICKET: '/api/mcp/support/assign_ticket',
    ADD_COMMENT: '/api/mcp/support/add_comment',
    GET_KNOWLEDGE_ARTICLE: '/api/mcp/support/get_knowledge_article',
    SEARCH_KNOWLEDGE_BASE: '/api/mcp/support/search_knowledge_base',
    GET_SLA_SUMMARY: '/api/mcp/support/get_sla_summary',
    GET_SLA_TICKETS: '/api/mcp/support/get_sla_tickets',
    GET_AGENT_METRICS: '/api/mcp/support/get_agent_metrics',
  },

  // Payroll Service Endpoints
  PAYROLL: {
    GET_PAYROLL_SUMMARY: '/api/mcp/payroll/get_payroll_summary',
    LIST_PAY_RUNS: '/api/mcp/payroll/list_pay_runs',
    GET_PAY_RUN: '/api/mcp/payroll/get_pay_run',
    LIST_PAY_STUBS: '/api/mcp/payroll/list_pay_stubs',
    GET_PAY_STUB: '/api/mcp/payroll/get_pay_stub',
    LIST_CONTRACTORS: '/api/mcp/payroll/list_contractors',
    GET_CONTRACTOR: '/api/mcp/payroll/get_contractor',
    GET_TAX_WITHHOLDINGS: '/api/mcp/payroll/get_tax_withholdings',
    GET_BENEFITS: '/api/mcp/payroll/get_benefits',
    GET_DIRECT_DEPOSIT: '/api/mcp/payroll/get_direct_deposit',
  },

  // Tax Service Endpoints
  TAX: {
    GET_TAX_SUMMARY: '/api/mcp/tax/get_tax_summary',
    LIST_TAX_FILINGS: '/api/mcp/tax/list_tax_filings',
    GET_TAX_FILING: '/api/mcp/tax/get_tax_filing',
    GET_SALES_TAX_RATES: '/api/mcp/tax/get_sales_tax_rates',
    GET_QUARTERLY_ESTIMATES: '/api/mcp/tax/get_quarterly_estimates',
  },
} as const;

// Type for endpoint paths
export type MCPEndpoint = typeof MCP_ENDPOINTS[keyof typeof MCP_ENDPOINTS][keyof typeof MCP_ENDPOINTS[keyof typeof MCP_ENDPOINTS]];

// Helper to get tool name from endpoint
export function getToolNameFromEndpoint(endpoint: string): string {
  const parts = endpoint.split('/');
  return parts[parts.length - 1];
}

// Helper to get service name from endpoint
export function getServiceNameFromEndpoint(endpoint: string): string {
  const parts = endpoint.split('/');
  return parts[parts.length - 2];
}
