import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth, canModifyFinance, apiConfig } from '@tamshai/auth';
import { TruncationWarning } from '@tamshai/ui';
import type { DashboardMetrics, Budget, Invoice } from '../types';

/**
 * Finance Dashboard Page
 *
 * Displays:
 * - Budget summary cards (total, spent, remaining, utilization)
 * - Pending approvals section
 * - Department budget breakdown table
 * - Recent activity
 * - RBAC-aware approve actions (finance-write only)
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

export function DashboardPage() {
  const navigate = useNavigate();
  const { userContext } = useAuth();
  const canWrite = canModifyFinance(userContext);

  const { getAccessToken } = useAuth();

  // Fetch budgets for metrics computation
  const currentFiscalYear = 2025; // TODO: Get from fiscal year table or config

  const {
    data: budgetsResponse,
    isLoading: budgetsLoading,
    error: budgetsError,
    refetch: refetchBudgets,
  } = useQuery({
    queryKey: ['dashboard-budgets', currentFiscalYear],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/finance/list_budgets?fiscalYear=${currentFiscalYear}`
        : `/api/mcp/finance/list_budgets?fiscalYear=${currentFiscalYear}`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch budgets');
      }
      return response.json() as Promise<APIResponse<Budget[]>>;
    },
  });

  // Fetch invoices for activity
  const { data: invoicesResponse, isLoading: invoicesLoading } = useQuery({
    queryKey: ['dashboard-invoices'],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/finance/list_invoices`
        : '/api/mcp/finance/list_invoices';

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch invoices');
      }
      return response.json() as Promise<APIResponse<Invoice[]>>;
    },
  });

  const budgets = budgetsResponse?.data || [];
  const invoices = invoicesResponse?.data || [];
  const isTruncated = budgetsResponse?.metadata?.truncated || invoicesResponse?.metadata?.truncated;
  const isLoading = budgetsLoading || invoicesLoading;
  const error = budgetsError;

  // Compute dashboard metrics from budget data
  // Note: API returns budgeted_amount/actual_amount as strings (PostgreSQL DECIMAL → JSON)
  // Must convert to Number to avoid NaN from string concatenation
  const totalBudget = budgets.reduce((sum, b) => sum + (Number(b.budgeted_amount) || 0), 0);
  const totalSpent = budgets.reduce((sum, b) => sum + (Number(b.actual_amount) || 0), 0);

  const metrics: DashboardMetrics | undefined = budgets.length > 0 ? {
    total_budget: totalBudget,
    total_spent: totalSpent,
    remaining_budget: totalBudget - totalSpent,
    budget_utilization_percent: totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0,
    pending_approvals: budgets.filter(b => b.status === 'PENDING_APPROVAL').length,
    pending_invoices: invoices.filter(i => i.status === 'PENDING').length,
    pending_expense_reports: 0, // Would need separate API call
    departments: [...new Set(budgets.map(b => b.department_code))].map(deptCode => {
      const deptBudgets = budgets.filter(b => b.department_code === deptCode);
      const allocated = deptBudgets.reduce((sum, b) => sum + (Number(b.budgeted_amount) || 0), 0);
      const spent = deptBudgets.reduce((sum, b) => sum + (Number(b.actual_amount) || 0), 0);
      return {
        department: deptCode,  // Using department code for now (ENG, FIN, etc.)
        allocated,
        spent,
        remaining: allocated - spent,
        utilization_percent: allocated > 0 ? Math.round((spent / allocated) * 100) : 0,
      };
    }),
  } : undefined;

  const recentInvoices = invoices.slice(0, 5);
  const recentBudgets = budgets.slice(0, 5);

  // Format currency
  const formatCurrency = (amount: number, compact = false): string => {
    if (compact) {
      if (amount >= 1000000) {
        return `$${(amount / 1000000).toFixed(1)}M`;
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

  // Handle navigation to pending items
  const handlePendingApprovalsClick = () => {
    navigate('/budgets?status=PENDING_APPROVAL');
  };

  const handlePendingInvoicesClick = () => {
    navigate('/invoices?status=PENDING');
  };

  const handleActivityClick = (type: 'invoice' | 'budget', id: string) => {
    if (type === 'invoice') {
      navigate(`/invoices?id=${id}`);
    } else {
      navigate(`/budgets?id=${id}`);
    }
  };

  // Get utilization color based on percentage
  const getUtilizationColor = (percent: number): string => {
    if (percent >= 90) return 'bg-danger-500';
    if (percent >= 80) return 'bg-warning-500';
    return 'bg-success-500';
  };

  const getUtilizationTextColor = (percent: number): string => {
    if (percent >= 90) return 'text-danger-600';
    if (percent >= 80) return 'text-warning-600';
    return 'text-success-600';
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="page-container" data-testid="dashboard-loading">
        <div className="page-header">
          <div className="h-8 w-48 bg-secondary-200 rounded animate-pulse"></div>
          <div className="h-4 w-64 bg-secondary-200 rounded animate-pulse mt-2"></div>
        </div>

        {/* Skeleton for summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card" data-testid="loading-skeleton">
              <div className="h-4 w-24 bg-secondary-200 rounded animate-pulse mb-2"></div>
              <div className="h-8 w-32 bg-secondary-200 rounded animate-pulse"></div>
            </div>
          ))}
        </div>

        {/* Skeleton for table */}
        <div className="card">
          <div className="h-6 w-48 bg-secondary-200 rounded animate-pulse mb-4"></div>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 bg-secondary-100 rounded animate-pulse mb-2"></div>
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
          <h3 className="font-semibold mb-2">Error Loading Dashboard</h3>
          <p className="text-sm mb-4">{String(error)}</p>
          <button
            onClick={() => refetchBudgets()}
            className="btn-primary"
            data-testid="retry-button"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">Finance Dashboard</h2>
        <p className="page-subtitle">Budget overview and financial reports</p>
      </div>

      {/* Truncation Warning */}
      {isTruncated && (budgetsResponse?.metadata || invoicesResponse?.metadata) && (
        <div className="mb-6" data-testid="truncation-warning">
          <TruncationWarning
            message={budgetsResponse?.metadata?.warning || invoicesResponse?.metadata?.warning || 'Results truncated to 50 records'}
            returnedCount={50}
            totalEstimate={budgetsResponse?.metadata?.totalCount || invoicesResponse?.metadata?.totalCount || '50+'}
          />
        </div>
      )}

      {/* Budget Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="card" data-testid="total-budget-card">
          <h3 className="text-sm font-medium text-secondary-600 mb-1">Total Budget</h3>
          <p className="text-3xl font-bold text-secondary-900" data-testid="total-budget">
            {formatCurrency(metrics?.total_budget || 0, true)}
          </p>
        </div>

        <div className="card" data-testid="total-spent-card">
          <h3 className="text-sm font-medium text-secondary-600 mb-1">Total Spent</h3>
          <p className="text-3xl font-bold text-secondary-900" data-testid="total-spent">
            {formatCurrency(metrics?.total_spent || 0, true)}
          </p>
        </div>

        <div className="card" data-testid="remaining-budget-card">
          <h3 className="text-sm font-medium text-secondary-600 mb-1">Remaining Budget</h3>
          <p className="text-3xl font-bold text-secondary-900" data-testid="remaining-budget">
            {formatCurrency(metrics?.remaining_budget || 0, true)}
          </p>
        </div>

        <div className="card" data-testid="utilization-card">
          <h3 className="text-sm font-medium text-secondary-600 mb-1">Budget Utilization</h3>
          <p
            className={`text-3xl font-bold ${getUtilizationTextColor(metrics?.budget_utilization_percent || 0)}`}
            data-testid="budget-utilization"
          >
            {metrics?.budget_utilization_percent || 0}%
          </p>
          {(metrics?.budget_utilization_percent || 0) > 80 && (
            <p className="text-sm text-warning-600 mt-1" data-testid="utilization-warning">
              Warning: High budget utilization
            </p>
          )}
        </div>
      </div>

      {/* Pending Approvals Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <button
          onClick={handlePendingApprovalsClick}
          className="card hover:shadow-md transition-shadow cursor-pointer text-left"
          data-testid="pending-approvals"
        >
          <h3 className="text-sm font-medium text-secondary-600 mb-1">Pending Approvals</h3>
          <p className="text-2xl font-bold text-primary-600">
            {metrics?.pending_approvals || 0}
          </p>
          <p className="text-sm text-secondary-500 mt-1">Budget requests awaiting approval</p>
        </button>

        <button
          onClick={handlePendingInvoicesClick}
          className="card hover:shadow-md transition-shadow cursor-pointer text-left"
          data-testid="pending-invoices"
        >
          <h3 className="text-sm font-medium text-secondary-600 mb-1">Pending Invoices</h3>
          <p className="text-2xl font-bold text-warning-600">
            {metrics?.pending_invoices || 0}
          </p>
          <p className="text-sm text-secondary-500 mt-1">Invoices awaiting processing</p>
        </button>

        <div className="card" data-testid="pending-expense-reports">
          <h3 className="text-sm font-medium text-secondary-600 mb-1">Pending Expense Reports</h3>
          <p className="text-2xl font-bold text-secondary-600">
            {metrics?.pending_expense_reports || 0}
          </p>
          <p className="text-sm text-secondary-500 mt-1">Reports awaiting review</p>
        </div>
      </div>

      {/* Department Budget Breakdown */}
      <div className="card mb-6">
        <h3 className="text-lg font-semibold text-secondary-900 mb-4">Department Budget Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="table" data-testid="department-table">
            <thead>
              <tr>
                <th className="table-header">Department</th>
                <th className="table-header">Allocated</th>
                <th className="table-header">Spent</th>
                <th className="table-header">Remaining</th>
                <th className="table-header">Utilization</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-secondary-200">
              {metrics?.departments?.map((dept) => (
                <tr key={dept.department} className="table-row" data-testid="department-row">
                  <td className="table-cell font-medium">{dept.department}</td>
                  <td className="table-cell">{formatCurrency(dept.allocated)}</td>
                  <td className="table-cell">{formatCurrency(dept.spent)}</td>
                  <td className="table-cell">{formatCurrency(dept.remaining)}</td>
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-secondary-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${getUtilizationColor(dept.utilization_percent)} rounded-full transition-all`}
                          style={{ width: `${Math.min(dept.utilization_percent, 100)}%` }}
                          data-testid="progress-bar"
                        ></div>
                      </div>
                      <span
                        className={`text-sm font-medium ${dept.utilization_percent > 90 ? 'text-danger-600' : ''}`}
                      >
                        {dept.utilization_percent}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recent Invoices */}
        <div className="card">
          <h3 className="text-lg font-semibold text-secondary-900 mb-4">Recent Invoices</h3>
          {recentInvoices.length > 0 ? (
            <ul className="space-y-3" data-testid="recent-invoices">
              {recentInvoices.map((invoice) => (
                <li key={invoice.id}>
                  <button
                    onClick={() => handleActivityClick('invoice', invoice.id)}
                    className="w-full text-left p-3 rounded-lg hover:bg-secondary-50 transition-colors"
                    data-testid="activity-item"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-secondary-900">{invoice.invoice_number}</p>
                        <p className="text-sm text-secondary-600">{invoice.vendor_name}</p>
                      </div>
                      <span
                        className={`badge-${invoice.status === 'PAID' ? 'success' : invoice.status === 'PENDING' ? 'warning' : 'secondary'}`}
                      >
                        {invoice.status}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-secondary-500">No recent invoices</p>
          )}
        </div>

        {/* Recent Budget Changes */}
        <div className="card">
          <h3 className="text-lg font-semibold text-secondary-900 mb-4">Recent Budget Changes</h3>
          {recentBudgets.length > 0 ? (
            <ul className="space-y-3" data-testid="recent-budgets">
              {recentBudgets.map((budget, index) => (
                <li key={`${budget.department_code}-${budget.fiscal_year}-${budget.category_name}-${index}`}>
                  <div
                    className="w-full text-left p-3 rounded-lg hover:bg-secondary-50 transition-colors"
                    data-testid="activity-item"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-secondary-900">{budget.department_code}</p>
                        <p className="text-sm text-secondary-600">
                          FY{budget.fiscal_year} - {budget.category_name}
                        </p>
                      </div>
                      <span
                        className={`badge-${budget.status === 'APPROVED' ? 'success' : budget.status === 'PENDING_APPROVAL' ? 'warning' : 'secondary'}`}
                      >
                        {budget.status}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-secondary-500">No recent budget changes</p>
          )}
        </div>
      </div>

      {/* RBAC: Quick Approve Actions (finance-write only) */}
      {canWrite && (
        <div className="mt-6" data-testid="approve-actions">
          <button className="btn-primary" data-testid="approve-button">
            Quick Approve Pending Items
          </button>
        </div>
      )}
    </div>
  );
}

export default DashboardPage;
