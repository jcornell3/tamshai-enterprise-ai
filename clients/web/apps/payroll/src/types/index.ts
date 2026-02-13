/**
 * Payroll App Type Definitions
 */

export type PayRunStatus = 'draft' | 'review' | 'approved' | 'processing' | 'completed' | 'cancelled';

export interface PayRun {
  pay_run_id: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  employee_count: number;
  gross_pay: number;
  net_pay: number;
  status: PayRunStatus;
  created_at: string;
  updated_at: string;
}

export interface PayStub {
  pay_stub_id: string;
  pay_run_id: string;
  employee_id: string;
  employee_name: string;
  department: string;
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  gross_pay: number;
  federal_tax: number;
  state_tax: number;
  social_security: number;
  medicare: number;
  benefits_deductions: number;
  retirement_401k: number;
  net_pay: number;
  ytd_gross: number;
  ytd_net: number;
}

export interface TaxWithholding {
  withholding_id: string;
  employee_id: string;
  federal_filing_status: 'single' | 'married_filing_jointly' | 'head_of_household';
  federal_allowances: number;
  federal_additional: number;
  state: string;
  state_filing_status: string;
  state_allowances: number;
  state_additional: number;
}

export interface BenefitDeduction {
  deduction_id: string;
  employee_id: string;
  type: 'health' | 'dental' | 'vision' | '401k' | 'hsa' | 'fsa' | 'life' | 'disability';
  name: string;
  amount: number;
  employer_contribution: number;
  is_pretax: boolean;
  frequency: 'per_pay_period' | 'monthly' | 'annual';
}

export interface DirectDeposit {
  deposit_id: string;
  employee_id: string;
  bank_name: string;
  routing_number: string;
  account_number_masked: string;
  account_type: 'checking' | 'savings';
  allocation_type: 'percentage' | 'fixed' | 'remainder';
  allocation_amount: number;
  is_primary: boolean;
}

export interface Contractor {
  contractor_id: string;
  name: string;
  company_name: string | null;
  tax_id_masked: string;
  email: string;
  status: 'active' | 'inactive';
  ytd_payments: number;
  form_1099_status: 'pending' | 'generated' | 'filed';
}

export interface ContractorPayment {
  payment_id: string;
  contractor_id: string;
  amount: number;
  payment_date: string;
  description: string;
  invoice_number: string | null;
}

export interface PayrollDashboardMetrics {
  next_pay_date: string;
  days_until_payday: number;
  current_period_gross: number;
  employees_count: number;
  ytd_payroll: number;
  ytd_payroll_change: number;
}

export interface PayrollSummaryByMonth {
  month: string;
  gross_pay: number;
  net_pay: number;
  employee_count: number;
}

export interface TaxBreakdown {
  category: string;
  amount: number;
  percentage: number;
}

export interface StateTaxSummary {
  state: string;
  employee_count: number;
  ytd_withheld: number;
}
