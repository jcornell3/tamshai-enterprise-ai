import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth, apiConfig } from '@tamshai/auth';
import { TruncationWarning } from '@tamshai/ui';
import type { ARRMetrics, ARRMovement, CustomerCohort, Subscription } from '../types';

/**
 * ARR Dashboard Page (SaaS-Specific)
 *
 * Displays:
 * - Key SaaS metrics (ARR, MRR, NRR, GRR, ARPU)
 * - ARR Movement table (monthly changes)
 * - Cohort retention analysis
 * - At-risk subscriptions
 * - v1.4 truncation warnings
 */

interface APIResponse<T> {
  status: 'success' | 'error';
  data: T;
  metadata?: {
    truncated?: boolean;
    totalCount?: string;
    warning?: string;
  };
}

export function ARRDashboardPage() {
  const { getAccessToken } = useAuth();
  const [selectedYear] = useState(new Date().getFullYear());
  const [cohortView, setCohortView] = useState<'customer' | 'revenue'>('customer');

  // Fetch ARR metrics
  const { data: arrMetricsResponse, isLoading: metricsLoading, error: metricsError } = useQuery({
    queryKey: ['arr-metrics'],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/finance/get_arr`
        : '/api/mcp/finance/get_arr';

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch ARR metrics');
      return response.json() as Promise<APIResponse<ARRMetrics>>;
    },
  });

  // Fetch ARR movement history
  const { data: arrMovementResponse, isLoading: movementLoading } = useQuery({
    queryKey: ['arr-movement', selectedYear],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/finance/get_arr_movement?year=${selectedYear}`
        : `/api/mcp/finance/get_arr_movement?year=${selectedYear}`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch ARR movement');
      return response.json() as Promise<APIResponse<ARRMovement[]>>;
    },
  });

  // Fetch cohort data
  const { data: cohortsResponse, isLoading: cohortsLoading } = useQuery({
    queryKey: ['cohorts'],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/finance/get_cohorts`
        : '/api/mcp/finance/get_cohorts';

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch cohorts');
      return response.json() as Promise<APIResponse<CustomerCohort[]>>;
    },
  });

  // Fetch at-risk subscriptions
  const { data: subscriptionsResponse, isLoading: subscriptionsLoading } = useQuery({
    queryKey: ['subscriptions-at-risk'],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/finance/list_subscriptions?status=at_risk`
        : '/api/mcp/finance/list_subscriptions?status=at_risk';

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch subscriptions');
      return response.json() as Promise<APIResponse<Subscription[]>>;
    },
  });

  const metrics = arrMetricsResponse?.data;
  const movements = arrMovementResponse?.data || [];
  const cohorts = cohortsResponse?.data || [];
  const atRiskSubscriptions = subscriptionsResponse?.data || [];
  const isTruncated = subscriptionsResponse?.metadata?.truncated;
  const isLoading = metricsLoading || movementLoading || cohortsLoading || subscriptionsLoading;

  // Calculate month-over-month change
  const momChange = useMemo(() => {
    if (movements.length >= 2) {
      const current = movements[movements.length - 1]?.ending_arr || 0;
      const previous = movements[movements.length - 2]?.ending_arr || 0;
      if (previous > 0) {
        return ((current - previous) / previous) * 100;
      }
    }
    return 0;
  }, [movements]);

  // Format currency
  const formatCurrency = (amount: number, compact = false): string => {
    if (compact) {
      if (amount >= 1000000) {
        return `$${(amount / 1000000).toFixed(2)}M`;
      }
      if (amount >= 1000) {
        return `$${(amount / 1000).toFixed(0)}K`;
      }
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Format percentage
  const formatPercent = (value: number, showSign = false): string => {
    const sign = showSign && value > 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  };

  // Get color based on value direction
  const getChangeColor = (value: number): string => {
    if (value > 0) return 'text-success-600';
    if (value < 0) return 'text-danger-600';
    return 'text-secondary-600';
  };

  // Get retention color
  const getRetentionColor = (percent: number): string => {
    if (percent >= 90) return 'bg-success-500';
    if (percent >= 70) return 'bg-warning-500';
    return 'bg-danger-500';
  };

  // Loading state
  if (isLoading && !metrics) {
    return (
      <div className="page-container" data-testid="arr-dashboard-loading">
        <div className="page-header">
          <div className="h-8 w-48 bg-secondary-200 rounded animate-pulse"></div>
          <div className="h-4 w-64 bg-secondary-200 rounded animate-pulse mt-2"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="card" data-testid="loading-skeleton">
              <div className="h-4 w-24 bg-secondary-200 rounded animate-pulse mb-2"></div>
              <div className="h-8 w-32 bg-secondary-200 rounded animate-pulse"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (metricsError) {
    return (
      <div className="page-container">
        <div className="alert-danger" data-testid="error-state">
          <h3 className="font-semibold mb-2">Error Loading ARR Dashboard</h3>
          <p className="text-sm">{String(metricsError)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">ARR Dashboard</h2>
        <p className="page-subtitle">SaaS metrics and recurring revenue analysis</p>
      </div>

      {/* Truncation Warning */}
      {isTruncated && subscriptionsResponse?.metadata && (
        <div className="mb-6" data-testid="truncation-warning">
          <TruncationWarning
            message={subscriptionsResponse.metadata.warning || 'Results truncated to 50 records'}
            returnedCount={50}
            totalEstimate={subscriptionsResponse.metadata.totalCount || '50+'}
          />
        </div>
      )}

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {/* ARR */}
        <div className="card" data-testid="arr-card">
          <h3 className="text-sm font-medium text-secondary-600 mb-1">Annual Recurring Revenue</h3>
          <p className="text-3xl font-bold text-secondary-900" data-testid="arr-value">
            {formatCurrency(metrics?.arr || 0, true)}
          </p>
          <p className={`text-sm mt-1 ${getChangeColor(momChange)}`}>
            {formatPercent(momChange, true)} MoM
          </p>
        </div>

        {/* MRR */}
        <div className="card" data-testid="mrr-card">
          <h3 className="text-sm font-medium text-secondary-600 mb-1">Monthly Recurring Revenue</h3>
          <p className="text-3xl font-bold text-secondary-900" data-testid="mrr-value">
            {formatCurrency(metrics?.mrr || 0, true)}
          </p>
          <p className="text-sm text-secondary-500 mt-1">
            {metrics?.active_subscriptions || 0} active subscriptions
          </p>
        </div>

        {/* Net New ARR */}
        <div className="card" data-testid="net-new-arr-card">
          <h3 className="text-sm font-medium text-secondary-600 mb-1">Net New ARR (MTD)</h3>
          <p className={`text-3xl font-bold ${getChangeColor(metrics?.net_new_arr || 0)}`} data-testid="net-new-arr-value">
            {formatCurrency(metrics?.net_new_arr || 0, true)}
          </p>
          <p className="text-sm text-secondary-500 mt-1">
            New + Expansion - Churn
          </p>
        </div>

        {/* Gross Revenue Retention */}
        <div className="card" data-testid="grr-card">
          <h3 className="text-sm font-medium text-secondary-600 mb-1">Gross Revenue Retention</h3>
          <p className="text-3xl font-bold text-secondary-900" data-testid="grr-value">
            {formatPercent(metrics?.gross_revenue_retention || 0)}
          </p>
          <p className="text-sm text-secondary-500 mt-1">
            Excluding expansion
          </p>
          {(metrics?.gross_revenue_retention || 0) < 90 && (
            <p className="text-sm text-warning-600 mt-1">Below benchmark (90%)</p>
          )}
        </div>

        {/* Net Revenue Retention */}
        <div className="card" data-testid="nrr-card">
          <h3 className="text-sm font-medium text-secondary-600 mb-1">Net Revenue Retention</h3>
          <p className={`text-3xl font-bold ${(metrics?.net_revenue_retention || 0) >= 100 ? 'text-success-600' : 'text-warning-600'}`} data-testid="nrr-value">
            {formatPercent(metrics?.net_revenue_retention || 0)}
          </p>
          <p className="text-sm text-secondary-500 mt-1">
            Including expansion
          </p>
          {(metrics?.net_revenue_retention || 0) >= 100 && (
            <p className="text-sm text-success-600 mt-1">Growing existing base</p>
          )}
        </div>

        {/* ARPU */}
        <div className="card" data-testid="arpu-card">
          <h3 className="text-sm font-medium text-secondary-600 mb-1">ARPU (Annual)</h3>
          <p className="text-3xl font-bold text-secondary-900" data-testid="arpu-value">
            {formatCurrency(metrics?.arpu || 0)}
          </p>
          <p className="text-sm text-secondary-500 mt-1">
            Avg revenue per customer
          </p>
        </div>
      </div>

      {/* ARR Movement Table */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-secondary-900">ARR Movement - {selectedYear}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="table" data-testid="arr-movement-table">
            <thead>
              <tr>
                <th className="table-header">Period</th>
                <th className="table-header text-right">Starting ARR</th>
                <th className="table-header text-right">New ARR</th>
                <th className="table-header text-right">Expansion</th>
                <th className="table-header text-right">Churn</th>
                <th className="table-header text-right">Net New</th>
                <th className="table-header text-right">Ending ARR</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-secondary-200">
              {movements.length > 0 ? (
                movements.map((movement) => (
                  <tr key={movement.period} className="table-row" data-testid="movement-row">
                    <td className="table-cell font-medium">{movement.period_label}</td>
                    <td className="table-cell text-right">{formatCurrency(movement.starting_arr)}</td>
                    <td className="table-cell text-right text-success-600">+{formatCurrency(movement.new_arr)}</td>
                    <td className="table-cell text-right text-success-600">+{formatCurrency(movement.expansion_arr)}</td>
                    <td className="table-cell text-right text-danger-600">-{formatCurrency(Math.abs(movement.churn_arr))}</td>
                    <td className={`table-cell text-right font-medium ${getChangeColor(movement.net_new_arr)}`}>
                      {movement.net_new_arr >= 0 ? '+' : ''}{formatCurrency(movement.net_new_arr)}
                    </td>
                    <td className="table-cell text-right font-semibold">{formatCurrency(movement.ending_arr)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="table-cell text-center text-secondary-500 py-8">
                    No ARR movement data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cohort Retention Analysis */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-secondary-900">Cohort Retention Analysis</h3>
          <div className="flex gap-2">
            <button
              onClick={() => setCohortView('customer')}
              className={`btn-sm ${cohortView === 'customer' ? 'btn-primary' : 'btn-secondary'}`}
            >
              Customer
            </button>
            <button
              onClick={() => setCohortView('revenue')}
              className={`btn-sm ${cohortView === 'revenue' ? 'btn-primary' : 'btn-secondary'}`}
            >
              Revenue
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="table" data-testid="cohort-table">
            <thead>
              <tr>
                <th className="table-header">Cohort</th>
                <th className="table-header text-center">Customers</th>
                {[1, 2, 3, 4, 5, 6].map((month) => (
                  <th key={month} className="table-header text-center">M{month}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-secondary-200">
              {cohorts.length > 0 ? (
                cohorts.map((cohort) => (
                  <tr key={cohort.cohort_month} className="table-row" data-testid="cohort-row">
                    <td className="table-cell font-medium">{cohort.cohort_label}</td>
                    <td className="table-cell text-center">{cohort.customer_count}</td>
                    {cohort.months.slice(0, 6).map((month) => {
                      const value = cohortView === 'customer'
                        ? month.retention_percent
                        : month.revenue_retention_percent;
                      return (
                        <td key={month.month_offset} className="table-cell text-center">
                          <div
                            className={`inline-block px-2 py-1 rounded text-xs font-medium text-white ${getRetentionColor(value)}`}
                          >
                            {formatPercent(value)}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="table-cell text-center text-secondary-500 py-8">
                    No cohort data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-secondary-500 mt-4">
          Green (&ge;90%), Yellow (70-89%), Red (&lt;70%). Higher retention indicates healthier customer base.
        </p>
      </div>

      {/* At-Risk Subscriptions */}
      <div className="card">
        <h3 className="text-lg font-semibold text-secondary-900 mb-4">At-Risk Subscriptions</h3>
        {atRiskSubscriptions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="table" data-testid="at-risk-table">
              <thead>
                <tr>
                  <th className="table-header">Customer</th>
                  <th className="table-header">Plan</th>
                  <th className="table-header text-right">ARR</th>
                  <th className="table-header">Renewal Date</th>
                  <th className="table-header">Risk Factor</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-secondary-200">
                {atRiskSubscriptions.map((sub) => (
                  <tr key={sub.subscription_id} className="table-row" data-testid="at-risk-row">
                    <td className="table-cell font-medium">{sub.customer_name}</td>
                    <td className="table-cell">
                      <span className={`badge-${sub.plan_tier === 'enterprise' ? 'primary' : sub.plan_tier === 'professional' ? 'secondary' : 'outline'}`}>
                        {sub.plan_name}
                      </span>
                    </td>
                    <td className="table-cell text-right">{formatCurrency(sub.arr)}</td>
                    <td className="table-cell">
                      {new Date(sub.renewal_date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="table-cell">
                      <span className="badge-danger">
                        {sub.churn_reason || 'Low engagement'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-secondary-500">
            <svg
              className="w-12 h-12 mx-auto mb-4 text-success-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="font-medium">No at-risk subscriptions</p>
            <p className="text-sm">All customers are in good standing</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default ARRDashboardPage;
