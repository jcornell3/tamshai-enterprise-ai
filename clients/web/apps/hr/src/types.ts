/**
 * Employee data types
 */
export interface Employee {
  id: string;
  employee_id: string;
  first_name: string;
  last_name: string;
  work_email: string;
  department: string;
  job_title: string;
  employment_status: string;
  salary?: number;  // Only visible to hr-write role
  manager_id?: string;
  hire_date: string;
  profile_photo_url?: string;
  phone?: string;
  location?: string;
  state?: string;
}

/**
 * Time-Off Types
 */
export interface TimeOffType {
  type_id: string;
  name: string;
  code: string;
  default_annual_days: number | null;
  requires_approval: boolean;
  paid: boolean;
}

export interface TimeOffBalance {
  balance_id?: string;
  employee_id?: string;
  type_id?: string;
  type_name: string;
  type_code: string;
  year?: number;
  fiscal_year?: number;  // API returns fiscal_year
  annual_entitlement?: number;
  entitlement?: number;  // API returns entitlement
  carryover: number;
  used: number;
  pending: number;
  available: number;
}

export interface TimeOffRequest {
  request_id: string;
  employee_id: string;
  employee_name: string;
  type_id: string;
  type_name: string;
  start_date: string;
  end_date: string;
  total_days: number;
  half_day_start: boolean;
  half_day_end: boolean;
  notes?: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approver_id?: string;
  approver_name?: string;
  approved_at?: string;
  approval_comments?: string;
  created_at: string;
}

/**
 * Org Chart Types
 */
export interface OrgChartNode {
  employee_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  name: string; // Alias for full_name
  email: string;
  title: string;
  department: string;
  location: string;
  level: number;
  direct_reports_count: number;
  direct_reports: OrgChartNode[];
  profile_photo_url?: string; // Optional - not returned by API currently
}

/**
 * API response wrapper
 */
export interface APIResponse<T> {
  status: 'success' | 'error' | 'pending_confirmation';
  data?: T;
  confirmationId?: string;
  message?: string;
  metadata?: {
    truncated?: boolean;
    hasMore?: boolean;
    nextCursor?: string;
    returnedCount?: number;
    totalCount?: string;
    totalEstimate?: string;
    warning?: string;
  };
  error?: string;
  code?: string;
  suggestedAction?: string;
}
