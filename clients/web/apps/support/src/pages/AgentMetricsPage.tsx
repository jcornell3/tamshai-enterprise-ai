import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth, apiConfig } from '@tamshai/auth';
import { TruncationWarning } from '@tamshai/ui';
import type { AgentPerformanceSummary, AgentMetrics, APIResponse } from '../types';

/**
 * Agent Metrics Page
 *
 * Features:
 * - Agent performance leaderboard
 * - Team summary metrics
 * - Individual agent stats
 * - CSAT scores
 * - Sortable columns
 */

type SortField = 'tickets_resolved' | 'avg_resolution_minutes' | 'sla_compliance_percent' | 'csat_score';
type SortDirection = 'asc' | 'desc';

export default function AgentMetricsPage() {
  const { getAccessToken } = useAuth();

  // State
  const [selectedPeriod, setSelectedPeriod] = useState('30d');
  const [sortField, setSortField] = useState<SortField>('tickets_resolved');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Fetch agent performance data
  const { data: performanceResponse, isLoading, error, refetch } = useQuery({
    queryKey: ['agent-performance', selectedPeriod],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/support/get_agent_metrics?period=${selectedPeriod}`
        : `/api/mcp/support/get_agent_metrics?period=${selectedPeriod}`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch agent metrics');
      return response.json() as Promise<APIResponse<AgentPerformanceSummary>>;
    },
  });

  const performance = performanceResponse?.data;
  const isTruncated = performanceResponse?.metadata?.truncated;

  // Sort agents
  const sortedAgents = useMemo(() => {
    if (!performance?.agents) return [];

    return [...performance.agents].sort((a, b) => {
      const aVal = a[sortField] ?? 0;
      const bVal = b[sortField] ?? 0;
      const multiplier = sortDirection === 'desc' ? -1 : 1;
      return (aVal - bVal) * multiplier;
    });
  }, [performance?.agents, sortField, sortDirection]);

  // Handle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Format time duration
  const formatDuration = (minutes: number): string => {
    if (minutes < 60) return `${Math.round(minutes)}m`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  // Get rank badge
  const getRankBadge = (rank: number): string => {
    if (rank === 1) return 'bg-yellow-500 text-white';
    if (rank === 2) return 'bg-gray-400 text-white';
    if (rank === 3) return 'bg-amber-600 text-white';
    return 'bg-secondary-200 text-secondary-700';
  };

  // Get CSAT color
  const getCSATColor = (score: number): string => {
    if (score >= 4.5) return 'text-success-600';
    if (score >= 4.0) return 'text-primary-600';
    if (score >= 3.5) return 'text-warning-600';
    return 'text-danger-600';
  };

  // Get compliance color
  const getComplianceColor = (percent: number): string => {
    if (percent >= 95) return 'text-success-600';
    if (percent >= 85) return 'text-warning-600';
    return 'text-danger-600';
  };

  // Period options
  const periodOptions = [
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' },
    { value: '90d', label: 'Last 90 Days' },
    { value: 'mtd', label: 'Month to Date' },
    { value: 'qtd', label: 'Quarter to Date' },
  ];

  // Loading state
  if (isLoading) {
    return (
      <div className="page-container" data-testid="metrics-loading">
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
  if (error) {
    return (
      <div className="page-container">
        <div className="alert-danger" data-testid="error-state">
          <h3 className="font-semibold mb-2">Error Loading Agent Metrics</h3>
          <p className="text-sm mb-4">{String(error)}</p>
          <button onClick={() => refetch()} className="btn-primary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="page-title">Agent Performance</h2>
            <p className="page-subtitle">{performance?.period_label || 'Support team metrics and leaderboard'}</p>
          </div>
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="input"
            data-testid="period-select"
          >
            {periodOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Truncation Warning */}
      {isTruncated && performanceResponse?.metadata && (
        <div className="mb-6" data-testid="truncation-warning">
          <TruncationWarning
            message={performanceResponse.metadata.warning || 'Results truncated to 50 records'}
            returnedCount={50}
            totalEstimate={performanceResponse.metadata.totalCount || '50+'}
          />
        </div>
      )}

      {/* Team Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="card" data-testid="team-resolved">
          <h3 className="text-sm font-medium text-secondary-600">Team Resolved</h3>
          <p className="text-3xl font-bold text-secondary-900">{performance?.team_resolved || 0}</p>
          <p className="text-sm text-secondary-500">tickets closed</p>
        </div>
        <div className="card" data-testid="team-avg-resolution">
          <h3 className="text-sm font-medium text-secondary-600">Avg Resolution Time</h3>
          <p className="text-3xl font-bold text-secondary-900">
            {formatDuration(performance?.team_avg_resolution_minutes || 0)}
          </p>
          <p className="text-sm text-secondary-500">across all agents</p>
        </div>
        <div className="card" data-testid="team-sla">
          <h3 className="text-sm font-medium text-secondary-600">Team SLA Compliance</h3>
          <p className={`text-3xl font-bold ${getComplianceColor(performance?.team_sla_compliance || 0)}`}>
            {performance?.team_sla_compliance || 0}%
          </p>
          <p className="text-sm text-secondary-500">within SLA targets</p>
        </div>
        <div className="card" data-testid="team-csat">
          <h3 className="text-sm font-medium text-secondary-600">Team CSAT</h3>
          <div className="flex items-baseline gap-1">
            <p className={`text-3xl font-bold ${getCSATColor(performance?.team_csat || 0)}`}>
              {(performance?.team_csat || 0).toFixed(1)}
            </p>
            <span className="text-secondary-500">/ 5.0</span>
          </div>
          <p className="text-sm text-secondary-500">customer satisfaction</p>
        </div>
      </div>

      {/* Agent Leaderboard */}
      <div className="card">
        <h3 className="text-lg font-semibold text-secondary-900 mb-4">Agent Leaderboard</h3>

        {sortedAgents.length === 0 ? (
          <div className="py-12 text-center" data-testid="empty-state">
            <svg className="w-12 h-12 mx-auto text-secondary-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p className="text-secondary-600">No agent data available for this period</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table" data-testid="agent-table">
              <thead>
                <tr>
                  <th className="table-header w-16">Rank</th>
                  <th className="table-header">Agent</th>
                  <th
                    className="table-header text-right cursor-pointer hover:bg-secondary-100"
                    onClick={() => handleSort('tickets_resolved')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Resolved
                      {sortField === 'tickets_resolved' && (
                        <svg className={`w-4 h-4 ${sortDirection === 'asc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
                    </div>
                  </th>
                  <th
                    className="table-header text-right cursor-pointer hover:bg-secondary-100"
                    onClick={() => handleSort('avg_resolution_minutes')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Avg Time
                      {sortField === 'avg_resolution_minutes' && (
                        <svg className={`w-4 h-4 ${sortDirection === 'asc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
                    </div>
                  </th>
                  <th className="table-header text-right">First Response</th>
                  <th
                    className="table-header text-right cursor-pointer hover:bg-secondary-100"
                    onClick={() => handleSort('sla_compliance_percent')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      SLA %
                      {sortField === 'sla_compliance_percent' && (
                        <svg className={`w-4 h-4 ${sortDirection === 'asc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
                    </div>
                  </th>
                  <th
                    className="table-header text-right cursor-pointer hover:bg-secondary-100"
                    onClick={() => handleSort('csat_score')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      CSAT
                      {sortField === 'csat_score' && (
                        <svg className={`w-4 h-4 ${sortDirection === 'asc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
                    </div>
                  </th>
                  <th className="table-header text-right">Reopen Rate</th>
                  <th className="table-header text-right">Workload</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-secondary-200">
                {sortedAgents.map((agent, index) => {
                  const rank = index + 1;
                  return (
                    <tr key={agent.agent_id} className="table-row" data-testid="agent-row">
                      <td className="table-cell">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${getRankBadge(rank)}`}>
                          {rank}
                        </span>
                      </td>
                      <td className="table-cell font-medium">{agent.agent_name}</td>
                      <td className="table-cell text-right font-semibold">{agent.tickets_resolved}</td>
                      <td className="table-cell text-right">{formatDuration(agent.avg_resolution_minutes)}</td>
                      <td className="table-cell text-right">{formatDuration(agent.avg_first_response_minutes)}</td>
                      <td className="table-cell text-right">
                        <span className={`font-medium ${getComplianceColor(agent.sla_compliance_percent)}`}>
                          {agent.sla_compliance_percent}%
                        </span>
                      </td>
                      <td className="table-cell text-right">
                        <div className="flex items-center justify-end gap-1">
                          <span className={`font-medium ${getCSATColor(agent.csat_score ?? 0)}`}>
                            {(agent.csat_score ?? 0).toFixed(1)}
                          </span>
                          <span className="text-secondary-400 text-xs">({agent.csat_responses ?? 0})</span>
                        </div>
                      </td>
                      <td className="table-cell text-right">
                        <span className={(agent.reopen_rate ?? 0) > 5 ? 'text-danger-600' : 'text-secondary-600'}>
                          {(agent.reopen_rate ?? 0).toFixed(1)}%
                        </span>
                      </td>
                      <td className="table-cell text-right">
                        <span className={`badge-${agent.current_workload > 20 ? 'danger' : agent.current_workload > 10 ? 'warning' : 'success'}`}>
                          {agent.current_workload} active
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-6 text-sm text-secondary-600">
        <p className="font-medium mb-2">Metrics Guide:</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="font-medium">CSAT Score</p>
            <p>1-5 rating from customer satisfaction surveys</p>
          </div>
          <div>
            <p className="font-medium">SLA Compliance</p>
            <p>Percentage of tickets resolved within SLA targets</p>
          </div>
          <div>
            <p className="font-medium">Reopen Rate</p>
            <p>Percentage of tickets reopened after resolution</p>
          </div>
        </div>
      </div>
    </div>
  );
}
