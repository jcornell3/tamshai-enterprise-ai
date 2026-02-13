/**
 * Tax App Type Definitions
 */

// Sales Tax Rate for a state/jurisdiction
export interface SalesTaxRate {
  id: string;
  state: string;
  stateCode: string;
  baseRate: number;
  localRate: number;
  combinedRate: number;
  effectiveDate: string;
  expirationDate?: string;
  notes?: string;
}

// Quarterly Tax Estimate
export interface QuarterlyEstimate {
  id: string;
  year: number;
  quarter: 1 | 2 | 3 | 4;
  federalEstimate: number;
  stateEstimate: number;
  totalEstimate: number;
  dueDate: string;
  paidDate?: string;
  paidAmount?: number;
  status: 'pending' | 'paid' | 'overdue' | 'partial';
  notes?: string;
}

// Annual Tax Filing
export interface AnnualFiling {
  id: string;
  year: number;
  filingType: '1099' | 'W-2' | '941' | '940' | 'state';
  entityName: string;
  entityId: string;
  totalAmount: number;
  filingDate?: string;
  dueDate: string;
  status: 'draft' | 'filed' | 'accepted' | 'rejected' | 'amended';
  confirmationNumber?: string;
  notes?: string;
}

// State Tax Registration
export interface StateRegistration {
  id: string;
  state: string;
  stateCode: string;
  registrationType: 'sales_tax' | 'income_tax' | 'payroll_tax' | 'franchise_tax';
  registrationNumber: string;
  registrationDate: string;
  expirationDate?: string;
  status: 'active' | 'pending' | 'expired' | 'revoked';
  filingFrequency: 'monthly' | 'quarterly' | 'annually';
  notes?: string;
}

// Audit Log Entry
export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: 'create' | 'update' | 'delete' | 'submit' | 'approve' | 'reject';
  entityType: 'filing' | 'estimate' | 'registration' | 'rate';
  entityId: string;
  userId: string;
  userName: string;
  previousValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  ipAddress?: string;
  notes?: string;
}

// Tax Dashboard Summary
export interface TaxSummary {
  currentYear: number;
  currentQuarter: number;
  totalTaxLiability: number;
  paidToDate: number;
  remainingBalance: number;
  upcomingDeadlines: {
    description: string;
    dueDate: string;
    amount: number;
  }[];
  stateBreakdown: {
    state: string;
    liability: number;
    paid: number;
  }[];
  recentFilings: AnnualFiling[];
  complianceStatus: 'compliant' | 'at_risk' | 'non_compliant';
}

// Quarterly Filing for Review Flow
export interface QuarterlyFiling {
  id: string;
  year: number;
  quarter: 1 | 2 | 3 | 4;
  jurisdictions: JurisdictionSummary[];
  totals: FilingTotals;
  status: 'draft' | 'reviewed' | 'filed';
  reviewedBy?: string;
  reviewedAt?: string;
  filedAt?: string;
  confirmationNumber?: string;
  notes?: string;
  auditTrail: FilingAuditEntry[];
}

export interface JurisdictionSummary {
  state: string;
  stateCode: string;
  grossSales: number;
  taxableSales: number;
  exemptSales: number;
  taxCollected: number;
  taxRate: number;
  transactionCount: number;
}

export interface FilingTotals {
  grossSales: number;
  taxableSales: number;
  exemptSales: number;
  taxCollected: number;
}

export interface FilingAuditEntry {
  id: string;
  timestamp: string;
  action: 'created' | 'reviewed' | 'filed' | 'exported';
  userId: string;
  userName: string;
  details?: string;
}

export interface QuarterlyFilingExport {
  format: 'csv' | 'pdf' | 'json';
  period: { year: number; quarter: number };
  jurisdictions: JurisdictionSummary[];
  totals: FilingTotals;
  generatedAt: string;
  generatedBy: string;
}

// API Response Types
export interface TaxApiResponse<T> {
  status: 'success' | 'error' | 'pending_confirmation';
  data?: T;
  metadata?: {
    truncated?: boolean;
    totalCount?: string;
    warning?: string;
  };
  code?: string;
  message?: string;
  suggestedAction?: string;
  confirmationId?: string;
}
