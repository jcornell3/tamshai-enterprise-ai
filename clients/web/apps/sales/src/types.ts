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
 * Lead data types
 */
export interface Lead {
  _id: string;
  company_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone?: string;
  status: 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'CONVERTED' | 'DISQUALIFIED';
  source: string;
  score: LeadScore;
  owner_id: string;
  owner_name?: string;
  industry?: string;
  company_size?: string;
  notes?: string;
  last_activity_date?: string;
  created_at: string;
  updated_at: string;
}

export interface LeadScore {
  total: number;
  factors: {
    company_size: number;
    industry_fit: number;
    engagement: number;
    timing: number;
  };
}

/**
 * Forecast data types
 */
export interface ForecastEntry {
  opportunity_id: string;
  opportunity_name: string;
  customer_name: string;
  value: number;
  stage: string;
  close_date: string;
  forecast_category: 'COMMIT' | 'BEST_CASE' | 'PIPELINE' | 'OMITTED';
  probability: number;
  owner_id: string;
  owner_name?: string;
}

export interface RepForecast {
  owner_id: string;
  owner_name: string;
  quota: number;
  commit: number;
  best_case: number;
  pipeline: number;
  closed: number;
  gap: number;
  opportunities: ForecastEntry[];
}

export interface ForecastSummary {
  period: string;
  period_label: string;
  team_quota: number;
  team_commit: number;
  team_best_case: number;
  team_pipeline: number;
  team_closed: number;
  team_gap: number;
  reps: RepForecast[];
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
