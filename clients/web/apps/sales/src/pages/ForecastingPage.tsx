import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth, canModifySales, apiConfig } from '@tamshai/auth';
import { TruncationWarning } from '@tamshai/ui';
import type { ForecastSummary, ForecastEntry, RepForecast, APIResponse } from '../types';

/**
 * Forecasting Page
 *
 * Features:
 * - Forecast grid with Commit/Best Case/Pipeline categories
 * - Per-rep breakdown with quotas
 * - Drill-down to individual opportunities
 * - Forecast category updates (sales-write)
 * - v1.4 truncation warnings
 */

const FORECAST_CATEGORIES = [
  { value: 'COMMIT', label: 'Commit', color: 'bg-success-500', textColor: 'text-success-600' },
  { value: 'BEST_CASE', label: 'Best Case', color: 'bg-primary-500', textColor: 'text-primary-600' },
  { value: 'PIPELINE', label: 'Pipeline', color: 'bg-warning-500', textColor: 'text-warning-600' },
  { value: 'OMITTED', label: 'Omitted', color: 'bg-secondary-400', textColor: 'text-secondary-600' },
];

export default function ForecastingPage() {
  const queryClient = useQueryClient();
  const { userContext, getAccessToken } = useAuth();
  const canWrite = canModifySales(userContext);

  // State
  const [selectedPeriod, setSelectedPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [expandedReps, setExpandedReps] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'summary' | 'detailed'>('summary');

  // Fetch forecast data
  const { data: forecastResponse, isLoading, error, refetch } = useQuery({
    queryKey: ['forecast', selectedPeriod],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/sales/get_forecast?period=${selectedPeriod}`
        : `/api/mcp/sales/get_forecast?period=${selectedPeriod}`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch forecast');
      return response.json() as Promise<APIResponse<ForecastSummary>>;
    },
  });

  // Update forecast category mutation
  const updateCategoryMutation = useMutation({
    mutationFn: async ({ opportunityId, category }: { opportunityId: string; category: string }) => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/sales/update_forecast`
        : '/api/mcp/sales/update_forecast';

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ opportunityId, forecastCategory: category }),
      });
      if (!response.ok) throw new Error('Failed to update forecast');
      return response.json() as Promise<APIResponse<ForecastEntry>>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forecast'] });
    },
  });

  const forecast = forecastResponse?.data;
  const isTruncated = forecastResponse?.metadata?.truncated;

  // Toggle rep expansion
  const toggleRepExpansion = (repId: string) => {
    const newExpanded = new Set(expandedReps);
    if (newExpanded.has(repId)) {
      newExpanded.delete(repId);
    } else {
      newExpanded.add(repId);
    }
    setExpandedReps(newExpanded);
  };

  // Calculate attainment percentage
  const getAttainment = (closed: number, quota: number): number => {
    if (quota <= 0) return 0;
    return Math.round((closed / quota) * 100);
  };

  // Get attainment color
  const getAttainmentColor = (percent: number): string => {
    if (percent >= 100) return 'text-success-600';
    if (percent >= 80) return 'text-primary-600';
    if (percent >= 50) return 'text-warning-600';
    return 'text-danger-600';
  };

  // Format currency
  const formatCurrency = (amount: number, compact = false): string => {
    if (compact) {
      if (amount >= 1000000) {
        return `$${(amount / 1000000).toFixed(1)}M`;
      }
      if (amount >= 1000) {
        return `$${Math.round(amount / 1000)}K`;
      }
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Format date
  const formatDate = (dateString: string): string => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  // Generate period options (last 6 months + next 3)
  const periodOptions = useMemo(() => {
    const options = [];
    const now = new Date();
    for (let i = -6; i <= 3; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      options.push({ value, label });
    }
    return options;
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div className="page-container" data-testid="forecast-loading">
        <div className="page-header">
          <div className="h-8 w-48 bg-secondary-200 rounded animate-pulse"></div>
        </div>
        <div className="card">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-secondary-100 rounded animate-pulse mb-2"></div>
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
          <h3 className="font-semibold mb-2">Error Loading Forecast</h3>
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
            <h2 className="page-title">Sales Forecast</h2>
            <p className="page-subtitle">
              {forecast?.period_label || 'Track and manage deal forecasts'}
            </p>
          </div>
          <div className="flex items-center gap-4">
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
            <div className="flex gap-1 bg-secondary-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('summary')}
                className={`px-3 py-1 rounded ${viewMode === 'summary' ? 'bg-white shadow-sm' : ''}`}
              >
                Summary
              </button>
              <button
                onClick={() => setViewMode('detailed')}
                className={`px-3 py-1 rounded ${viewMode === 'detailed' ? 'bg-white shadow-sm' : ''}`}
              >
                Detailed
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Truncation Warning */}
      {isTruncated && forecastResponse?.metadata && (
        <div className="mb-6" data-testid="truncation-warning">
          <TruncationWarning
            message={forecastResponse.metadata.warning || 'Results truncated to 50 records'}
            returnedCount={50}
            totalEstimate={forecastResponse.metadata.totalCount || '50+'}
          />
        </div>
      )}

      {/* Team Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6">
        <div className="card" data-testid="team-quota">
          <h3 className="text-sm font-medium text-secondary-600">Team Quota</h3>
          <p className="text-2xl font-bold">{formatCurrency(forecast?.team_quota || 0, true)}</p>
        </div>
        <div className="card" data-testid="team-closed">
          <h3 className="text-sm font-medium text-secondary-600">Closed</h3>
          <p className="text-2xl font-bold text-success-600">
            {formatCurrency(forecast?.team_closed || 0, true)}
          </p>
          <p className={`text-sm ${getAttainmentColor(getAttainment(forecast?.team_closed || 0, forecast?.team_quota || 0))}`}>
            {getAttainment(forecast?.team_closed || 0, forecast?.team_quota || 0)}% attainment
          </p>
        </div>
        <div className="card" data-testid="team-commit">
          <h3 className="text-sm font-medium text-secondary-600">Commit</h3>
          <p className="text-2xl font-bold text-success-600">
            {formatCurrency(forecast?.team_commit || 0, true)}
          </p>
        </div>
        <div className="card" data-testid="team-best-case">
          <h3 className="text-sm font-medium text-secondary-600">Best Case</h3>
          <p className="text-2xl font-bold text-primary-600">
            {formatCurrency(forecast?.team_best_case || 0, true)}
          </p>
        </div>
        <div className="card" data-testid="team-pipeline">
          <h3 className="text-sm font-medium text-secondary-600">Pipeline</h3>
          <p className="text-2xl font-bold text-warning-600">
            {formatCurrency(forecast?.team_pipeline || 0, true)}
          </p>
        </div>
        <div className="card" data-testid="team-gap">
          <h3 className="text-sm font-medium text-secondary-600">Gap to Quota</h3>
          <p className={`text-2xl font-bold ${(forecast?.team_gap || 0) > 0 ? 'text-danger-600' : 'text-success-600'}`}>
            {formatCurrency(forecast?.team_gap || 0, true)}
          </p>
        </div>
      </div>

      {/* Forecast Grid */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table" data-testid="forecast-table">
            <thead>
              <tr>
                <th className="table-header w-8"></th>
                <th className="table-header">Rep</th>
                <th className="table-header text-right">Quota</th>
                <th className="table-header text-right">Closed</th>
                <th className="table-header text-right">Commit</th>
                <th className="table-header text-right">Best Case</th>
                <th className="table-header text-right">Pipeline</th>
                <th className="table-header text-right">Gap</th>
                <th className="table-header text-center">Attainment</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-secondary-200">
              {(forecast?.reps || []).map((rep: RepForecast) => {
                const isExpanded = expandedReps.has(rep.owner_id);
                const attainment = getAttainment(rep.closed, rep.quota);

                return (
                  <>
                    <tr
                      key={rep.owner_id}
                      className="table-row cursor-pointer hover:bg-secondary-50"
                      onClick={() => toggleRepExpansion(rep.owner_id)}
                      data-testid="rep-row"
                    >
                      <td className="table-cell">
                        <button className="text-secondary-500">
                          <svg
                            className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </td>
                      <td className="table-cell font-medium">{rep.owner_name}</td>
                      <td className="table-cell text-right">{formatCurrency(rep.quota)}</td>
                      <td className="table-cell text-right font-medium text-success-600">
                        {formatCurrency(rep.closed)}
                      </td>
                      <td className="table-cell text-right">{formatCurrency(rep.commit)}</td>
                      <td className="table-cell text-right">{formatCurrency(rep.best_case)}</td>
                      <td className="table-cell text-right">{formatCurrency(rep.pipeline)}</td>
                      <td className={`table-cell text-right font-medium ${rep.gap > 0 ? 'text-danger-600' : 'text-success-600'}`}>
                        {formatCurrency(rep.gap)}
                      </td>
                      <td className="table-cell text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-20 h-2 bg-secondary-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${attainment >= 100 ? 'bg-success-500' : attainment >= 80 ? 'bg-primary-500' : attainment >= 50 ? 'bg-warning-500' : 'bg-danger-500'}`}
                              style={{ width: `${Math.min(attainment, 100)}%` }}
                            />
                          </div>
                          <span className={`text-sm font-medium ${getAttainmentColor(attainment)}`}>
                            {attainment}%
                          </span>
                        </div>
                      </td>
                    </tr>
                    {/* Expanded Opportunities */}
                    {isExpanded && viewMode === 'detailed' && (
                      <tr key={`${rep.owner_id}-expanded`}>
                        <td colSpan={9} className="p-0 bg-secondary-50">
                          <div className="p-4">
                            <h4 className="font-medium text-secondary-900 mb-3">Opportunities</h4>
                            <table className="w-full text-sm" data-testid="opportunities-table">
                              <thead>
                                <tr className="border-b">
                                  <th className="text-left py-2">Opportunity</th>
                                  <th className="text-left py-2">Customer</th>
                                  <th className="text-right py-2">Value</th>
                                  <th className="text-left py-2">Stage</th>
                                  <th className="text-left py-2">Close Date</th>
                                  <th className="text-left py-2">Category</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rep.opportunities.map((opp: ForecastEntry) => (
                                  <tr key={opp.opportunity_id} className="border-b" data-testid="opportunity-row">
                                    <td className="py-2 font-medium">{opp.opportunity_name}</td>
                                    <td className="py-2">{opp.customer_name}</td>
                                    <td className="py-2 text-right">{formatCurrency(opp.value)}</td>
                                    <td className="py-2">
                                      <span className="badge-secondary text-xs">{opp.stage}</span>
                                    </td>
                                    <td className="py-2">{formatDate(opp.close_date)}</td>
                                    <td className="py-2">
                                      {canWrite ? (
                                        <select
                                          value={opp.forecast_category}
                                          onChange={(e) => updateCategoryMutation.mutate({
                                            opportunityId: opp.opportunity_id,
                                            category: e.target.value,
                                          })}
                                          className={`text-xs px-2 py-1 rounded ${FORECAST_CATEGORIES.find((c) => c.value === opp.forecast_category)?.color || 'bg-secondary-400'} text-white`}
                                          data-testid="category-select"
                                        >
                                          {FORECAST_CATEGORIES.map((cat) => (
                                            <option key={cat.value} value={cat.value}>
                                              {cat.label}
                                            </option>
                                          ))}
                                        </select>
                                      ) : (
                                        <span
                                          className={`text-xs px-2 py-1 rounded ${FORECAST_CATEGORIES.find((c) => c.value === opp.forecast_category)?.color || 'bg-secondary-400'} text-white`}
                                        >
                                          {FORECAST_CATEGORIES.find((c) => c.value === opp.forecast_category)?.label || opp.forecast_category}
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
              {/* Team Totals Row */}
              {forecast && (
                <tr className="bg-secondary-100 font-semibold" data-testid="team-totals-row">
                  <td className="table-cell"></td>
                  <td className="table-cell">Team Total</td>
                  <td className="table-cell text-right">{formatCurrency(forecast.team_quota)}</td>
                  <td className="table-cell text-right text-success-600">{formatCurrency(forecast.team_closed)}</td>
                  <td className="table-cell text-right">{formatCurrency(forecast.team_commit)}</td>
                  <td className="table-cell text-right">{formatCurrency(forecast.team_best_case)}</td>
                  <td className="table-cell text-right">{formatCurrency(forecast.team_pipeline)}</td>
                  <td className={`table-cell text-right ${forecast.team_gap > 0 ? 'text-danger-600' : 'text-success-600'}`}>
                    {formatCurrency(forecast.team_gap)}
                  </td>
                  <td className="table-cell text-center">
                    <span className={`font-medium ${getAttainmentColor(getAttainment(forecast.team_closed, forecast.team_quota))}`}>
                      {getAttainment(forecast.team_closed, forecast.team_quota)}%
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-6 text-sm text-secondary-600">
        <p className="font-medium mb-2">Forecast Categories:</p>
        <div className="flex gap-6">
          {FORECAST_CATEGORIES.map((cat) => (
            <span key={cat.value} className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${cat.color}`}></span>
              {cat.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
