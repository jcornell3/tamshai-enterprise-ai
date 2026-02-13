import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth, canModifySupport, apiConfig } from '@tamshai/auth';
import { TruncationWarning } from '@tamshai/ui';
import SLACountdown from '../components/SLACountdown';
import EscalationFlowModal from '../components/EscalationFlowModal';
import type { SLASummary, SLAStatus, SLAPolicy, EscalationTarget, APIResponse } from '../types';

/**
 * SLA Tracking Page
 *
 * Features:
 * - SLA compliance dashboard
 * - At-risk tickets list
 * - Compliance by tier breakdown
 * - Breach analysis
 * - Quick assign/escalate actions
 */

const SLA_POLICIES: SLAPolicy[] = [
  { tier: 'starter', tier_label: 'Starter', first_response_hours: 48, resolution_hours: 168, business_hours: 'M-F 9am-5pm PT' },
  { tier: 'professional', tier_label: 'Professional', first_response_hours: 24, resolution_hours: 72, business_hours: 'M-F 6am-8pm PT' },
  { tier: 'enterprise', tier_label: 'Enterprise', first_response_hours: 4, resolution_hours: 24, business_hours: '24/7' },
];

export default function SLAPage() {
  const queryClient = useQueryClient();
  const { userContext, getAccessToken } = useAuth();
  const canWrite = canModifySupport(userContext);

  // State
  const [tierFilter, setTierFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'at_risk' | 'breached' | 'all'>('all');
  const [escalationTicket, setEscalationTicket] = useState<SLAStatus | null>(null);
  const [escalationTargets, setEscalationTargets] = useState<EscalationTarget[]>([]);

  // Fetch SLA summary
  const { data: summaryResponse, isLoading: summaryLoading, error: summaryError } = useQuery({
    queryKey: ['sla-summary'],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/support/get_sla_summary`
        : '/api/mcp/support/get_sla_summary';

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch SLA summary');
      return response.json() as Promise<APIResponse<SLASummary>>;
    },
  });

  // Fetch at-risk tickets
  const { data: ticketsResponse, isLoading: ticketsLoading } = useQuery({
    queryKey: ['sla-tickets', statusFilter, tierFilter],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (tierFilter) params.set('tier', tierFilter);

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/support/get_sla_tickets?${params}`
        : `/api/mcp/support/get_sla_tickets?${params}`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch SLA tickets');
      return response.json() as Promise<APIResponse<SLAStatus[]>>;
    },
  });

  // Assign ticket mutation
  const assignMutation = useMutation({
    mutationFn: async (ticketId: string) => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/support/assign_ticket`
        : '/api/mcp/support/assign_ticket';

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ticketId, assignTo: 'me' }),
      });
      if (!response.ok) throw new Error('Failed to assign ticket');
      return response.json() as Promise<APIResponse<void>>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sla-tickets'] });
    },
  });

  // Open escalation modal with targets
  const handleOpenEscalation = async (ticket: SLAStatus) => {
    const token = await getAccessToken();
    if (!token) return;

    try {
      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/support/get_escalation_targets`
        : '/api/mcp/support/get_escalation_targets';

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const result = await response.json() as APIResponse<EscalationTarget[]>;
        setEscalationTargets(result.data || []);
      } else {
        setEscalationTargets([]);
      }
    } catch {
      setEscalationTargets([]);
    }

    setEscalationTicket(ticket);
  };

  // Handle escalation completion
  const handleEscalationComplete = () => {
    setEscalationTicket(null);
    setEscalationTargets([]);
    queryClient.invalidateQueries({ queryKey: ['sla-tickets'] });
    queryClient.invalidateQueries({ queryKey: ['sla-summary'] });
  };

  const summary = summaryResponse?.data || null;
  const tickets = ticketsResponse?.data || [];
  const isTruncated = ticketsResponse?.metadata?.truncated;
  const isLoading = summaryLoading || ticketsLoading;

  // Get compliance color
  const getComplianceColor = (percent: number): string => {
    if (percent >= 95) return 'text-success-600';
    if (percent >= 80) return 'text-warning-600';
    return 'text-danger-600';
  };

  const getComplianceBarColor = (percent: number): string => {
    if (percent >= 95) return 'bg-success-500';
    if (percent >= 80) return 'bg-warning-500';
    return 'bg-danger-500';
  };

  // Format date
  const formatDate = (dateString: string): string => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  // Loading state
  if (isLoading && !summary) {
    return (
      <div className="page-container" data-testid="sla-loading">
        <div className="page-header">
          <div className="h-8 w-48 bg-secondary-200 rounded animate-pulse"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card">
              <div className="h-8 bg-secondary-200 rounded animate-pulse"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (summaryError && !summary) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h2 className="page-title">SLA Tracking</h2>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4" data-testid="error-state">
          <h3 className="font-semibold text-red-800 mb-2">Error Loading SLA Data</h3>
          <p className="text-sm text-red-700">{(summaryError as Error).message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">SLA Tracking</h2>
        <p className="page-subtitle">Monitor service level agreement compliance</p>
      </div>

      {/* Truncation Warning */}
      {isTruncated && ticketsResponse?.metadata && (
        <div className="mb-6" data-testid="truncation-warning">
          <TruncationWarning
            message={ticketsResponse.metadata.warning || 'Results truncated to 50 records'}
            returnedCount={50}
            totalEstimate={ticketsResponse.metadata.totalCount || '50+'}
          />
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="card" data-testid="overall-compliance">
          <h3 className="text-sm font-medium text-secondary-600">Overall Compliance</h3>
          <p className={`text-3xl font-bold ${getComplianceColor(summary?.overall_compliance || 0)}`}>
            {summary?.overall_compliance || 0}%
          </p>
          <div className="w-full h-2 bg-secondary-200 rounded-full mt-2 overflow-hidden">
            <div
              className={`h-full ${getComplianceBarColor(summary?.overall_compliance || 0)}`}
              style={{ width: `${summary?.overall_compliance || 0}%` }}
            />
          </div>
        </div>
        <div className="card" data-testid="tickets-within-sla">
          <h3 className="text-sm font-medium text-secondary-600">Within SLA</h3>
          <p className="text-3xl font-bold text-success-600">{summary?.tickets_within_sla || 0}</p>
          <p className="text-sm text-secondary-500">tickets on track</p>
        </div>
        <div className="card" data-testid="tickets-at-risk">
          <h3 className="text-sm font-medium text-secondary-600">At Risk</h3>
          <p className="text-3xl font-bold text-warning-600">{summary?.tickets_at_risk || 0}</p>
          <p className="text-sm text-secondary-500">within 25% of deadline</p>
        </div>
        <div className="card" data-testid="tickets-breached">
          <h3 className="text-sm font-medium text-secondary-600">Breached</h3>
          <p className="text-3xl font-bold text-danger-600">{summary?.tickets_breached || 0}</p>
          <p className="text-sm text-secondary-500">past SLA deadline</p>
        </div>
      </div>

      {/* SLA Policies Reference */}
      <div className="card mb-6">
        <h3 className="text-lg font-semibold text-secondary-900 mb-4">SLA Policies by Tier</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {SLA_POLICIES.map((policy) => {
            const tierData = summary?.by_tier?.find((t) => t.tier === policy.tier);
            return (
              <div key={policy.tier} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-secondary-900">{policy.tier_label}</h4>
                  {tierData && (
                    <span className={`text-sm font-medium ${getComplianceColor(tierData.compliance)}`}>
                      {tierData.compliance}% compliant
                    </span>
                  )}
                </div>
                <div className="space-y-1 text-sm text-secondary-600">
                  <p>First Response: {policy.first_response_hours}h</p>
                  <p>Resolution: {policy.resolution_hours}h</p>
                  <p>Hours: {policy.business_hours}</p>
                </div>
                {tierData && (
                  <p className="text-xs text-secondary-500 mt-2">
                    {tierData.total} tickets ({tierData.breached} breached)
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Compliance by Tier Chart */}
      {summary?.by_tier && summary.by_tier.length > 0 && (
        <div className="card mb-6">
          <h3 className="text-lg font-semibold text-secondary-900 mb-4">Compliance by Tier</h3>
          <div className="space-y-3">
            {summary.by_tier.map((tier) => (
              <div key={tier.tier} className="flex items-center gap-4">
                <div className="w-24 text-sm font-medium capitalize">{tier.tier}</div>
                <div className="flex-1">
                  <div className="h-4 bg-secondary-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${getComplianceBarColor(tier.compliance)}`}
                      style={{ width: `${tier.compliance}%` }}
                    />
                  </div>
                </div>
                <div className={`w-16 text-right font-medium ${getComplianceColor(tier.compliance)}`}>
                  {tier.compliance}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* At-Risk Tickets */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-secondary-900">Tickets Requiring Attention</h3>
          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'at_risk' | 'breached' | 'all')}
              className="input text-sm"
              data-testid="status-filter"
            >
              <option value="all">All Status</option>
              <option value="at_risk">At Risk</option>
              <option value="breached">Breached</option>
            </select>
            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
              className="input text-sm"
              data-testid="tier-filter"
            >
              <option value="">All Tiers</option>
              {SLA_POLICIES.map((policy) => (
                <option key={policy.tier} value={policy.tier}>
                  {policy.tier_label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {tickets.length === 0 ? (
          <div className="py-12 text-center" data-testid="empty-state">
            <svg className="w-12 h-12 mx-auto text-success-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="font-medium text-secondary-900">All tickets are on track</p>
            <p className="text-sm text-secondary-500">No at-risk or breached tickets</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table" data-testid="sla-tickets-table">
              <thead>
                <tr>
                  <th className="table-header">Ticket</th>
                  <th className="table-header">Customer</th>
                  <th className="table-header">Priority</th>
                  <th className="table-header">SLA Status</th>
                  <th className="table-header">Assigned</th>
                  <th className="table-header">Created</th>
                  {canWrite && <th className="table-header">Actions</th>}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-secondary-200">
                {tickets.map((ticket) => (
                  <tr key={ticket.ticket_id} className="table-row" data-testid="sla-ticket-row">
                    <td className="table-cell">
                      <div>
                        <p className="font-medium">{ticket.ticket_id}</p>
                        <p className="text-sm text-secondary-600 truncate max-w-xs">{ticket.ticket_title}</p>
                      </div>
                    </td>
                    <td className="table-cell">
                      <div>
                        <p className="font-medium">{ticket.customer_name}</p>
                        <span className="badge-secondary text-xs capitalize">{ticket.customer_tier}</span>
                      </div>
                    </td>
                    <td className="table-cell">
                      <span className={`badge-${ticket.priority === 'critical' ? 'danger' : ticket.priority === 'high' ? 'warning' : 'secondary'}`}>
                        {ticket.priority}
                      </span>
                    </td>
                    <td className="table-cell">
                      <SLACountdown
                        timeRemainingMinutes={ticket.time_remaining_minutes}
                        isAtRisk={ticket.is_at_risk}
                        isBreached={ticket.is_breached}
                        liveUpdate
                      />
                    </td>
                    <td className="table-cell text-sm">{ticket.assigned_to || 'Unassigned'}</td>
                    <td className="table-cell text-sm">{formatDate(ticket.created_at)}</td>
                    {canWrite && (
                      <td className="table-cell">
                        <div className="flex gap-2">
                          {!ticket.assigned_to && (
                            <button
                              onClick={() => assignMutation.mutate(ticket.ticket_id)}
                              disabled={assignMutation.isPending}
                              className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                              data-testid="assign-button"
                            >
                              Assign
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenEscalation(ticket)}
                            className="text-warning-600 hover:text-warning-700 text-sm font-medium"
                            data-testid="escalate-button"
                          >
                            Escalate
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Breach Analysis */}
      {summary?.breach_reasons && summary.breach_reasons.length > 0 && (
        <div className="card mt-6">
          <h3 className="text-lg font-semibold text-secondary-900 mb-4">Breach Analysis</h3>
          <div className="space-y-2">
            {summary.breach_reasons.map((reason) => (
              <div key={reason.reason} className="flex items-center justify-between py-2 border-b last:border-b-0">
                <span className="text-secondary-700">{reason.reason}</span>
                <span className="font-medium text-danger-600">{reason.count} breaches</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Escalation Flow Modal */}
      {escalationTicket && (
        <EscalationFlowModal
          ticket={escalationTicket}
          targets={escalationTargets}
          onClose={() => {
            setEscalationTicket(null);
            setEscalationTargets([]);
          }}
          onComplete={handleEscalationComplete}
        />
      )}
    </div>
  );
}
