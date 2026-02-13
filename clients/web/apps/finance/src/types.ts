/**
 * Finance App Type Definitions
 */

export interface Budget {
  department_code: string;  // Backend returns department_code (ENG, FIN, etc.)
  department?: string;      // Optional full name for display
  fiscal_year: number;      // Backend returns number, not string
  category_name: string;    // Budget category (Salaries, Technology, etc.)
  category_type: string;    // REVENUE, EXPENSE, CAPITAL
  budgeted_amount: number;
  actual_amount: number;
  forecast_amount: number | null;
  utilization_pct: number;
  remaining_amount: number;
  status: string;           // 'DRAFT', 'APPROVED', etc. - from backend
}

export interface Invoice {
  id: string;                  // Backend returns id (not _id)
  invoice_number: string;
  vendor_name: string;
  amount: number;
  currency: string;
  invoice_date: string;        // Backend returns invoice_date (not issue_date)
  due_date: string;
  paid_date: string | null;    // Backend returns paid_date (not paid_at)
  status: string;              // Backend returns string status
  department_code: string | null;  // Backend returns department_code (not department)
  description: string | null;
  approved_by: string | null;
  approved_at: string | null;  // Backend returns approved_at (timestamp)
  created_at: string;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  category: string;
}

export interface ExpenseReport {
  _id: string;
  report_number: string;
  employee_id: string;
  employee_name: string;
  department: string;
  total_amount: number;
  status: 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'REIMBURSED';
  submission_date: string;
  expenses: Expense[];
  created_at: string;
  updated_at: string;
  approved_by?: string;
  reimbursed_at?: string;
}

export interface Expense {
  _id: string;
  description: string;
  category: 'TRAVEL' | 'MEALS' | 'SUPPLIES' | 'EQUIPMENT' | 'SOFTWARE' | 'OTHER';
  amount: number;
  date: string;
  receipt_url?: string;
  notes?: string;
}

export interface DashboardMetrics {
  total_budget: number;
  total_spent: number;
  remaining_budget: number;
  pending_approvals: number;
  pending_invoices: number;
  pending_expense_reports: number;
  budget_utilization_percent: number;
  departments: DepartmentBudgetSummary[];
}

export interface DepartmentBudgetSummary {
  department: string;
  allocated: number;
  spent: number;
  remaining: number;
  utilization_percent: number;
}

export interface AIQueryMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  isStreaming?: boolean;
}

export interface AIQueryResponse {
  status: 'streaming' | 'complete' | 'error';
  content?: string;
  error?: string;
  metadata?: {
    truncated?: boolean;
    warning?: string;
  };
}

/**
 * ARR (Annual Recurring Revenue) Types
 */
export interface ARRMetrics {
  arr: number;
  mrr: number;
  net_new_arr: number;
  gross_revenue_retention: number;
  net_revenue_retention: number;
  arpu: number;
  active_subscriptions: number;
  as_of_date: string;
}

export interface ARRMovement {
  period: string;
  period_label: string;
  starting_arr: number;
  new_arr: number;
  expansion_arr: number;
  churn_arr: number;
  net_new_arr: number;
  ending_arr: number;
}

export interface CustomerCohort {
  cohort_month: string;
  cohort_label: string;
  customer_count: number;
  initial_arr: number;
  months: CohortMonth[];
}

export interface CohortMonth {
  month_offset: number;
  remaining_customers: number;
  retention_percent: number;
  arr_retained: number;
  revenue_retention_percent: number;
}

export interface Subscription {
  subscription_id: string;
  customer_id: string;
  customer_name: string;
  plan_name: string;
  plan_tier: 'starter' | 'professional' | 'enterprise';
  billing_cycle: 'monthly' | 'annual';
  mrr: number;
  arr: number;
  start_date: string;
  renewal_date: string;
  status: 'active' | 'cancelled' | 'churned' | 'paused';
  expansion_mrr?: number;
  churn_reason?: string;
}
