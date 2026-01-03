import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth, apiConfig } from '@tamshai/auth';
import type { Opportunity, APIResponse } from '../types';

/**
 * Dashboard Page
 *
 * Features:
 * - Pipeline metrics (total value, won this quarter, win rate, average deal)
 * - Expected revenue calculation
 * - Stage-based visualization with counts and values
 * - Recent activity list (top 5 opportunities)
 * - Top customers by revenue
 * - Opportunities closing soon (30 days)
 * - Overdue opportunity highlighting
 * - Date range filtering
 */

type DateRange = 'this_quarter' | 'last_quarter' | 'ytd' | 'all_time';

const STAGES = ['LEAD', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST'] as const;

export default function DashboardPage() {
  const { getAccessToken } = useAuth();
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState<DateRange>('this_quarter');

  // Fetch opportunities
  const { data: opportunitiesResponse, isLoading, error, refetch } = useQuery({
    queryKey: ['opportunities', 'dashboard'],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/sales/list_opportunities`
        : '/api/mcp/sales/list_opportunities';

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch opportunities');
      }

      return response.json() as Promise<APIResponse<Opportunity[]>>;
    },
  });

  const opportunities = opportunitiesResponse?.data || [];

  // Calculate metrics
  const metrics = useMemo(() => {
    // Filter by date range
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentQuarter = Math.floor(now.getMonth() / 3);

    const getQuarterStart = (year: number, quarter: number) => {
      return new Date(year, quarter * 3, 1);
    };

    const getQuarterEnd = (year: number, quarter: number) => {
      return new Date(year, (quarter + 1) * 3, 0, 23, 59, 59);
    };

    const thisQuarterStart = getQuarterStart(currentYear, currentQuarter);
    const thisQuarterEnd = getQuarterEnd(currentYear, currentQuarter);
    const lastQuarterStart = getQuarterStart(
      currentQuarter === 0 ? currentYear - 1 : currentYear,
      currentQuarter === 0 ? 3 : currentQuarter - 1
    );
    const lastQuarterEnd = getQuarterEnd(
      currentQuarter === 0 ? currentYear - 1 : currentYear,
      currentQuarter === 0 ? 3 : currentQuarter - 1
    );
    const ytdStart = new Date(currentYear, 0, 1);

    const filterByDateRange = (opp: Opportunity) => {
      if (dateRange === 'all_time') return true;
      const oppDate = new Date(opp.updated_at);
      switch (dateRange) {
        case 'this_quarter':
          return oppDate >= thisQuarterStart && oppDate <= thisQuarterEnd;
        case 'last_quarter':
          return oppDate >= lastQuarterStart && oppDate <= lastQuarterEnd;
        case 'ytd':
          return oppDate >= ytdStart;
        default:
          return true;
      }
    };

    const filtered = opportunities.filter(filterByDateRange);

    // Open pipeline (not closed)
    const openOpps = filtered.filter(o => !['CLOSED_WON', 'CLOSED_LOST'].includes(o.stage));
    const totalPipelineValue = openOpps.reduce((sum, o) => sum + (o.value || 0), 0);

    // Won deals
    const wonOpps = filtered.filter(o => o.stage === 'CLOSED_WON');
    const wonCount = wonOpps.length;
    const wonValue = wonOpps.reduce((sum, o) => sum + (o.value || 0), 0);

    // Lost deals
    const lostOpps = filtered.filter(o => o.stage === 'CLOSED_LOST');
    const lostCount = lostOpps.length;

    // Win rate
    const closedCount = wonCount + lostCount;
    const winRate = closedCount > 0 ? Math.round((wonCount / closedCount) * 100) : 0;

    // Average deal size (all opportunities)
    const avgDealSize = filtered.length > 0
      ? Math.round(filtered.reduce((sum, o) => sum + (o.value || 0), 0) / filtered.length)
      : 0;

    // Expected revenue (weighted pipeline) - only for deals closing this quarter
    const expectedRevenue = openOpps
      .filter(o => {
        if (!o.expected_close_date) return false;
        const closeDate = new Date(o.expected_close_date);
        return closeDate >= thisQuarterStart && closeDate <= thisQuarterEnd;
      })
      .reduce((sum, o) => sum + ((o.value || 0) * (o.probability || 0) / 100), 0);

    // Stage breakdown
    const stageBreakdown = STAGES.map(stage => {
      const stageOpps = filtered.filter(o => o.stage === stage);
      return {
        stage,
        count: stageOpps.length,
        value: stageOpps.reduce((sum, o) => sum + (o.value || 0), 0),
      };
    });

    // Recent opportunities (top 5 by updated_at)
    const recentOpps = [...filtered]
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 5);

    // Top customers by revenue
    const customerRevenue = filtered.reduce((acc, opp) => {
      const name = opp.customer_name || 'Unknown';
      const id = opp.customer_id;
      if (!acc[id]) {
        acc[id] = { id, name, total: 0 };
      }
      acc[id].total += opp.value || 0;
      return acc;
    }, {} as Record<string, { id: string; name: string; total: number }>);

    const topCustomers = Object.values(customerRevenue)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    // Closing soon (within 30 days)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const closingSoon = openOpps
      .filter(o => {
        if (!o.expected_close_date) return false;
        const closeDate = new Date(o.expected_close_date);
        return closeDate <= thirtyDaysFromNow;
      })
      .sort((a, b) => {
        const dateA = new Date(a.expected_close_date!);
        const dateB = new Date(b.expected_close_date!);
        return dateA.getTime() - dateB.getTime();
      });

    return {
      totalPipelineValue,
      wonCount,
      wonValue,
      winRate,
      avgDealSize,
      expectedRevenue,
      stageBreakdown,
      recentOpps,
      topCustomers,
      closingSoon,
    };
  }, [opportunities, dateRange]);

  // Check if a date is overdue
  const isOverdue = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  // Stage color mapping
  const getStageColor = (stage: string) => {
    switch (stage) {
      case 'LEAD':
        return 'bg-gray-500';
      case 'QUALIFIED':
        return 'bg-blue-500';
      case 'PROPOSAL':
        return 'bg-yellow-500';
      case 'NEGOTIATION':
        return 'bg-orange-500';
      case 'CLOSED_WON':
        return 'bg-green-500';
      case 'CLOSED_LOST':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const handleStageClick = (stage: string) => {
    navigate(`/opportunities?stage=${stage}`);
  };

  const handleOpportunityClick = (opportunityId: string) => {
    navigate(`/opportunities/${opportunityId}`);
  };

  const handleCustomerClick = (customerId: string) => {
    navigate(`/customers/${customerId}`);
  };

  const handleRefresh = () => {
    refetch();
  };

  if (isLoading) {
    return (
      <div className="page-container">
        <div className="py-12 text-center" data-testid="loading">
          <div className="spinner mb-4"></div>
          <p className="text-secondary-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-container">
        <div className="alert-danger" data-testid="error">
          <p className="font-medium">Error loading dashboard</p>
          <p className="text-sm">{String(error)}</p>
          <button onClick={handleRefresh} className="btn-primary mt-4">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (opportunities.length === 0) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h2 className="page-title">Sales Dashboard</h2>
        </div>
        <div className="card py-12 text-center" data-testid="empty-state">
          <p className="text-secondary-600 mb-4">No opportunities found</p>
          <p className="text-sm text-secondary-500">
            Create your first deal to get started with the sales pipeline.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header flex justify-between items-start">
        <div>
          <h2 className="page-title">Sales Dashboard</h2>
          <p className="page-subtitle">Pipeline overview and key metrics</p>
        </div>
        <div className="flex gap-2">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRange)}
            className="input"
            data-testid="date-range-selector"
          >
            <option value="this_quarter">This Quarter</option>
            <option value="last_quarter">Last Quarter</option>
            <option value="ytd">Year to Date</option>
            <option value="all_time">All Time</option>
          </select>
          <button onClick={handleRefresh} className="btn-secondary" data-testid="refresh-button">
            Refresh
          </button>
        </div>
      </div>

      {/* Pipeline Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div className="card" data-testid="total-pipeline-card">
          <h3 className="text-sm font-medium text-secondary-600">Total Pipeline</h3>
          <p className="text-2xl font-bold text-green-600">
            ${metrics.totalPipelineValue.toLocaleString()}
          </p>
        </div>
        <div className="card" data-testid="won-this-quarter-card">
          <h3 className="text-sm font-medium text-secondary-600">Won This Quarter</h3>
          <p className="text-2xl font-bold text-primary-600">
            {metrics.wonCount} deals
          </p>
          <p className="text-sm text-secondary-500">${metrics.wonValue.toLocaleString()}</p>
        </div>
        <div className="card" data-testid="win-rate-card">
          <h3 className="text-sm font-medium text-secondary-600">Win Rate</h3>
          <p className="text-2xl font-bold text-secondary-900">{metrics.winRate}%</p>
        </div>
        <div className="card" data-testid="avg-deal-card">
          <h3 className="text-sm font-medium text-secondary-600">Average Deal Size</h3>
          <p className="text-2xl font-bold text-secondary-900">
            ${metrics.avgDealSize.toLocaleString()}
          </p>
        </div>
        <div className="card" data-testid="expected-revenue-card">
          <h3 className="text-sm font-medium text-secondary-600">Expected Revenue</h3>
          <p className="text-2xl font-bold text-blue-600">
            ${Math.round(metrics.expectedRevenue).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Pipeline Visualization */}
      <div className="card mb-6" data-testid="pipeline-chart">
        <h3 className="text-lg font-semibold text-secondary-900 mb-4">Pipeline by Stage</h3>
        <div className="space-y-3">
          {metrics.stageBreakdown.map(({ stage, count, value }) => (
            <div
              key={stage}
              className="cursor-pointer hover:bg-secondary-50 p-2 rounded-lg transition-colors"
              onClick={() => handleStageClick(stage)}
              data-testid={`stage-${stage.toLowerCase()}`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-medium text-secondary-700">
                  {stage.replace('_', ' ')}
                </span>
                <span className="text-sm text-secondary-600">
                  {count} deals - ${value.toLocaleString()}
                </span>
              </div>
              <div className="h-4 bg-secondary-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${getStageColor(stage)} rounded-full transition-all`}
                  style={{
                    width: `${Math.min(100, (value / (metrics.totalPipelineValue || 1)) * 100)}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Recent Activity */}
        <div className="card" data-testid="recent-activity">
          <h3 className="text-lg font-semibold text-secondary-900 mb-4">Recent Activity</h3>
          {metrics.recentOpps.length > 0 ? (
            <div className="space-y-3">
              {metrics.recentOpps.map((opp) => (
                <div
                  key={opp._id}
                  className="flex justify-between items-center p-3 bg-secondary-50 rounded-lg cursor-pointer hover:bg-secondary-100 transition-colors"
                  onClick={() => handleOpportunityClick(opp._id)}
                  data-testid={`recent-opp-${opp._id}`}
                >
                  <div>
                    <p className="font-medium text-secondary-900">{opp.title}</p>
                    <p
                      className="text-sm text-primary-600 cursor-pointer hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCustomerClick(opp.customer_id);
                      }}
                    >
                      {opp.customer_name}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-green-600">
                      ${opp.value?.toLocaleString()}
                    </p>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      opp.stage === 'CLOSED_WON' ? 'bg-green-100 text-green-800' :
                      opp.stage === 'CLOSED_LOST' ? 'bg-red-100 text-red-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {opp.stage.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-secondary-600">No recent activity</p>
          )}
        </div>

        {/* Top Customers */}
        <div className="card" data-testid="top-customers">
          <h3 className="text-lg font-semibold text-secondary-900 mb-4">Top Customers by Revenue</h3>
          {metrics.topCustomers.length > 0 ? (
            <div className="space-y-3">
              {metrics.topCustomers.map((customer, index) => (
                <div
                  key={customer.id}
                  className="flex justify-between items-center p-3 bg-secondary-50 rounded-lg cursor-pointer hover:bg-secondary-100 transition-colors"
                  onClick={() => handleCustomerClick(customer.id)}
                  data-testid={`top-customer-${customer.id}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 bg-primary-100 text-primary-800 rounded-full flex items-center justify-center text-sm font-medium">
                      {index + 1}
                    </span>
                    <span className="font-medium text-secondary-900">{customer.name}</span>
                  </div>
                  <span className="font-medium text-green-600">
                    ${customer.total.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-secondary-600">No customer data</p>
          )}
        </div>
      </div>

      {/* Closing Soon */}
      <div className="card" data-testid="closing-soon">
        <h3 className="text-lg font-semibold text-secondary-900 mb-4">Closing Soon (30 days)</h3>
        {metrics.closingSoon.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="table-header">Opportunity</th>
                  <th className="table-header">Customer</th>
                  <th className="table-header">Value</th>
                  <th className="table-header">Expected Close</th>
                  <th className="table-header">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-secondary-200">
                {metrics.closingSoon.map((opp) => {
                  const overdue = opp.expected_close_date ? isOverdue(opp.expected_close_date) : false;
                  return (
                    <tr
                      key={opp._id}
                      className={`table-row cursor-pointer hover:bg-secondary-50 ${overdue ? 'bg-red-50' : ''}`}
                      onClick={() => handleOpportunityClick(opp._id)}
                      data-testid={overdue ? `overdue-${opp._id}` : `closing-${opp._id}`}
                    >
                      <td className="table-cell font-medium">{opp.title}</td>
                      <td className="table-cell text-secondary-600">{opp.customer_name}</td>
                      <td className="table-cell font-medium text-green-600">
                        ${opp.value?.toLocaleString()}
                      </td>
                      <td className={`table-cell ${overdue ? 'text-red-600 font-medium' : 'text-secondary-600'}`}>
                        {opp.expected_close_date
                          ? new Date(opp.expected_close_date).toLocaleDateString()
                          : '-'}
                        {overdue && <span className="ml-2 text-xs">(Overdue)</span>}
                      </td>
                      <td className="table-cell">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          opp.stage === 'NEGOTIATION' ? 'bg-orange-100 text-orange-800' :
                          opp.stage === 'PROPOSAL' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {opp.stage.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-secondary-600">No deals closing within 30 days</p>
        )}
      </div>
    </div>
  );
}
