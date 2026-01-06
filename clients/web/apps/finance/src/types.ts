/**
 * Finance App Type Definitions
 */

export interface Budget {
  _id: string;
  department: string;
  fiscal_year: string;
  fiscal_quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  budgeted_amount: number;  // Note: API returns budgeted_amount (not allocated_amount)
  actual_amount: number;    // Note: API returns actual_amount (not spent_amount)
  remaining_amount: number;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CLOSED';
  owner_id: string;
  owner_name: string;
  created_at: string;
  updated_at: string;
  approved_by?: string;
  approved_at?: string;
}

export interface Invoice {
  _id: string;
  invoice_number: string;
  vendor_name: string;
  vendor_id: string;
  amount: number;
  currency: string;
  status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'PAID' | 'REJECTED' | 'CANCELLED';
  due_date: string;
  issue_date: string;
  budget_id?: string;
  department: string;
  line_items: InvoiceLineItem[];
  created_at: string;
  updated_at: string;
  approved_by?: string;
  paid_at?: string;
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
