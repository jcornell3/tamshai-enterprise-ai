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
    returnedCount?: number;
    totalCount?: string;
    warning?: string;
  };
  error?: string;
  code?: string;
  suggestedAction?: string;
}
