/**
 * Opportunity/Deal data types
 */
export interface Opportunity {
  _id: string;
  customer_id: string;
  customer_name?: string;
  title: string;
  value: number;
  stage: 'LEAD' | 'QUALIFIED' | 'PROPOSAL' | 'NEGOTIATION' | 'CLOSED_WON' | 'CLOSED_LOST';
  probability: number;
  expected_close_date?: string;
  owner_id: string;
  owner_name?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Contact data type for customers
 */
export interface Contact {
  name: string;
  email: string;
  phone?: string;
  role?: string;
}

/**
 * Customer data types
 */
export interface Customer {
  _id: string;
  company_name: string;
  industry: string;
  website?: string;
  primary_contact?: {
    name: string;
    email: string;
    phone?: string;
  };
  contacts?: Contact[];
  address?: {
    city: string;
    state: string;
    country: string;
  };
  created_at: string;
  updated_at: string;
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
    hasMore?: boolean;
    returnedCount?: number;
    totalEstimate?: string;
    nextCursor?: string;
    hint?: string;
    truncated?: boolean;
    totalCount?: string;
    warning?: string;
  };
  error?: string;
  code?: string;
  suggestedAction?: string;
}
