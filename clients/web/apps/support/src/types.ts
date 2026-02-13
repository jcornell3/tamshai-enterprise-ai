/**
 * Support Ticket data types
 */
export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  category?: string;
  created_by: string;
  assigned_to?: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
  resolution?: string;
  closed_at?: string;
  closed_by?: string;
  // Customer organization fields (for internal view)
  organization_id?: string;
  organization_name?: string;
  // Contact info
  contact_id?: string;
  contact_email?: string;
  contact_name?: string;
  // Internal notes (never shown to customers)
  internal_notes?: InternalNote[];
  // Comments visible to customers
  comments?: Comment[];
}

/**
 * Internal Note (staff-only, hidden from customers)
 */
export interface InternalNote {
  id: string;
  text: string;
  author_id: string;
  author_name: string;
  created_at: string;
}

/**
 * Comment (visible to customers)
 */
export interface Comment {
  id?: string;
  text: string;
  author?: string;
  author_id?: string;
  is_internal?: boolean;
  created_at: string;
}

/**
 * Customer Contact (for internal dashboard)
 */
export interface CustomerContact {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  organization_id: string;
  organization_name: string;
  role: 'lead' | 'basic';
  title?: string;
  phone?: string;
  created_at: string;
}

/**
 * Customer Organization
 */
export interface CustomerOrganization {
  id: string;
  name: string;
  domain?: string;
  subscription_tier: 'enterprise' | 'professional' | 'basic';
  sla_tier: 'premium' | 'standard' | 'basic';
  total_tickets?: number;
  open_tickets?: number;
  contacts_count?: number;
}

/**
 * Knowledge Base Article data types
 */
export interface KBArticle {
  id: string;
  kb_id?: string;
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
 * SLA Types
 */
export interface SLAPolicy {
  tier: 'starter' | 'professional' | 'enterprise';
  tier_label: string;
  first_response_hours: number;
  resolution_hours: number;
  business_hours: string;
}

export interface SLAStatus {
  ticket_id: string;
  ticket_title: string;
  customer_name: string;
  customer_tier: string;
  priority: string;
  status: string;
  assigned_to?: string;
  created_at: string;
  first_response_at?: string;
  first_response_met: boolean;
  resolution_deadline: string;
  time_remaining_minutes: number;
  is_breached: boolean;
  is_at_risk: boolean;
}

export interface SLASummary {
  overall_compliance: number;
  first_response_compliance: number;
  resolution_compliance: number;
  tickets_within_sla: number;
  tickets_breached: number;
  tickets_at_risk: number;
  by_tier: {
    tier: string;
    compliance: number;
    total: number;
    breached: number;
  }[];
  breach_reasons: {
    reason: string;
    count: number;
  }[];
}

/**
 * Agent Performance Types
 */
export interface AgentMetrics {
  agent_id: string;
  agent_name: string;
  period: string;
  tickets_resolved: number;
  tickets_assigned: number;
  avg_resolution_minutes: number;
  avg_first_response_minutes: number;
  sla_compliance_percent: number;
  csat_score: number;
  csat_responses: number;
  reopen_rate: number;
  current_workload: number;
}

export interface AgentPerformanceSummary {
  period: string;
  period_label: string;
  team_resolved: number;
  team_avg_resolution_minutes: number;
  team_sla_compliance: number;
  team_csat: number;
  agents: AgentMetrics[];
}

/**
 * Escalation Types
 */
export interface EscalationRecord {
  escalation_id: string;
  ticket_id: string;
  escalated_by: string;
  escalated_by_name: string;
  escalated_to?: string;
  escalated_to_name?: string;
  escalation_level: 'tier1' | 'tier2' | 'management';
  reason: string;
  notes?: string;
  sla_status_at_escalation: {
    time_remaining_minutes: number;
    is_breached: boolean;
    is_at_risk: boolean;
  };
  created_at: string;
}

export interface EscalationTarget {
  id: string;
  name: string;
  role: string;
  current_workload: number;
  avg_resolution_minutes: number;
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
