/**
 * Support Ticket data types
 */
export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  created_by: string;
  assigned_to?: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
  resolution?: string;
  closed_at?: string;
  closed_by?: string;
}

/**
 * Knowledge Base Article data types
 */
export interface KBArticle {
  id: string;
  title: string;
  content: string;
  category: string;
  tags?: string[];
  score?: number;
  author?: string;
  created_at: string;
  updated_at: string;
  views?: number;
}

/**
 * Support Metrics for Dashboard
 */
export interface SupportMetrics {
  openTickets: number;
  criticalTickets: number;
  avgResolutionTime: string;
  slaComplianceRate: number;
  ticketsByStatus: Record<string, number>;
  ticketsByPriority: Record<string, number>;
}

/**
 * Resolution Template for closing tickets
 */
export interface ResolutionTemplate {
  id: string;
  text: string;
}

/**
 * KB Article Summary (for suggestions)
 */
export interface KBArticleSummary {
  id: string;
  title: string;
  category: string;
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
