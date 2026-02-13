import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useAuth, canModifyFinance, apiConfig } from '@tamshai/auth';
import { ApprovalCard, TruncationWarning } from '@tamshai/ui';
import type { Budget } from '../types';

/**
 * Budgets Page
 *
 * Features:
 * - Budget table with filtering
 * - v1.4 confirmation flow for approval/rejection
 * - RBAC-aware actions (finance-write only)
 * - Status badges with colors
 * - Truncation warnings
 */

interface APIResponse<T> {
  status: 'success' | 'error' | 'pending_confirmation';
  data?: T;
  confirmationId?: string;
  message?: string;
  metadata?: {
    truncated?: boolean;
    totalCount?: string;
    warning?: string;
  };
}

export function BudgetsPage() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const { userContext, getAccessToken } = useAuth();
  const canWrite = canModifyFinance(userContext);

  // Filters
  const [yearFilter, setYearFilter] = useState<number | null>(2025); // Default to current fiscal year
  const [categoryFilter, setCategoryFilter] = useState<string>(''); // Changed from quarterFilter since we now have categories
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('status') || '');
  const [departmentFilter, setDepartmentFilter] = useState<string>('');

  // Confirmation state
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    confirmationId: string;
    message: string;
    budget: Budget;
    action: 'approve' | 'reject';
  } | null>(null);

  // Rejection reason
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectDialog, setShowRejectDialog] = useState<Budget | null>(null);

  // Department detail modal
  const [selectedDepartment, setSelectedDepartment] = useState<{ code: string; year: number } | null>(null);

  // Fetch budgets
  const {
    data: budgetsResponse,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['budgets', yearFilter],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      // Build URL with fiscal year filter
      const params = new URLSearchParams();
      if (yearFilter) params.append('fiscalYear', yearFilter);

      const baseUrl = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/finance/list_budgets`
        : '/api/mcp/finance/list_budgets';
      const url = params.toString() ? `${baseUrl}?${params}` : baseUrl;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch budgets');
      }
      return response.json() as Promise<APIResponse<Budget[]>>;
    },
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (budgetId: string) => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/finance/approve_budget`
        : '/api/mcp/finance/approve_budget';

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ budgetId }),
      });
      if (!response.ok) {
        throw new Error('Failed to approve budget');
      }
      return response.json() as Promise<APIResponse<Budget>>;
    },
    onSuccess: (data, budgetId) => {
      if (data.status === 'pending_confirmation') {
        // budgetId format is "DEPT-YEAR-CATEGORY-INDEX", need to match without the index
        const budgetIdWithoutIndex = budgetId.replace(/-\d+$/, '');
        const budget = budgets.find((b) => `${b.department_code}-${b.fiscal_year}-${b.category_name}` === budgetIdWithoutIndex);
        if (budget) {
          setPendingConfirmation({
            confirmationId: data.confirmationId!,
            message: data.message || `Approve ${budget.department_code} FY${budget.fiscal_year} ${budget.category_name} budget for ${formatCurrency(budget.budgeted_amount)}?`,
            budget,
            action: 'approve',
          });
        }
      } else {
        queryClient.invalidateQueries({ queryKey: ['budgets'] });
      }
    },
  });

  // Reject mutation - Note: reject_budget MCP tool may not exist yet
  const rejectMutation = useMutation({
    mutationFn: async ({ budgetId, reason }: { budgetId: string; reason: string }) => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/finance/reject_budget`
        : '/api/mcp/finance/reject_budget';

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ budgetId, reason }),
      });
      if (!response.ok) {
        throw new Error('Failed to reject budget');
      }
      return response.json() as Promise<APIResponse<Budget>>;
    },
    onSuccess: () => {
      setShowRejectDialog(null);
      setRejectionReason('');
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
    },
  });

  // Delete mutation - Note: delete_budget MCP tool may not exist yet
  const deleteMutation = useMutation({
    mutationFn: async (budgetId: string) => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/finance/delete_budget`
        : '/api/mcp/finance/delete_budget';

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ budgetId }),
      });
      if (!response.ok) {
        throw new Error('Failed to delete budget');
      }
      return response.json() as Promise<APIResponse<void>>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
    },
  });

  // Fetch department budget details when selected
  const { data: departmentDetail, isLoading: loadingDepartment } = useQuery({
    queryKey: ['department-budget', selectedDepartment?.code, selectedDepartment?.year],
    queryFn: async () => {
      if (!selectedDepartment) return null;
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const params = new URLSearchParams({
        department: selectedDepartment.code,
        year: selectedDepartment.year.toString(),
      });

      const baseUrl = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/finance/get_budget`
        : '/api/mcp/finance/get_budget';

      const response = await fetch(`${baseUrl}?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch department budget');
      return response.json();
    },
    enabled: !!selectedDepartment,
  });

  const budgets = budgetsResponse?.data || [];
  const isTruncated = budgetsResponse?.metadata?.truncated;

  // Apply filters
  const filteredBudgets = useMemo(() => {
    return budgets.filter((budget) => {
      if (yearFilter && budget.fiscal_year !== yearFilter) return false;
      if (categoryFilter && !budget.category_name.toLowerCase().includes(categoryFilter.toLowerCase())) return false;
      if (statusFilter && budget.status !== statusFilter) return false;
      if (departmentFilter && !budget.department_code.toLowerCase().includes(departmentFilter.toLowerCase())) return false;
      return true;
    });
  }, [budgets, yearFilter, categoryFilter, statusFilter, departmentFilter]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalAllocated = filteredBudgets.reduce((sum, b) => sum + (Number(b.budgeted_amount) || 0), 0);
    const pendingCount = filteredBudgets.filter((b) => b.status === 'PENDING_APPROVAL').length;
    return { totalCount: filteredBudgets.length, totalAllocated, pendingCount };
  }, [filteredBudgets]);

  // Get unique years for filter
  const years = useMemo(() => {
    const uniqueYears = [...new Set(budgets.map((b) => b.fiscal_year))];
    return uniqueYears.sort().reverse();
  }, [budgets]);

  // Clear all filters
  const clearFilters = () => {
    setYearFilter(null);
    setCategoryFilter('');
    setStatusFilter('');
    setDepartmentFilter('');
  };

  // Format currency
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Get status badge class
  const getStatusBadgeClass = (status: string): string => {
    switch (status) {
      case 'APPROVED':
        return 'badge-success';
      case 'PENDING_APPROVAL':
        return 'badge-warning';
      case 'DRAFT':
        return 'badge-secondary';
      case 'CLOSED':
        return 'badge-primary';
      case 'REJECTED':
        return 'badge-danger';
      default:
        return 'badge-secondary';
    }
  };

  // Handle confirmation complete
  const handleConfirmationComplete = (success: boolean) => {
    setPendingConfirmation(null);
    if (success) {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="page-container" data-testid="budgets-loading">
        <div className="page-header">
          <div className="h-8 w-48 bg-secondary-200 rounded animate-pulse"></div>
        </div>
        <div className="card">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 bg-secondary-100 rounded animate-pulse mb-2" data-testid="loading-skeleton"></div>
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
          <h3 className="font-semibold mb-2">Error Loading Budgets</h3>
          <p className="text-sm mb-4">{String(error)}</p>
          <button onClick={() => refetch()} className="btn-primary" data-testid="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Empty state
  if (budgets.length === 0) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h2 className="page-title">Budgets</h2>
        </div>
        <div className="card text-center py-12" data-testid="empty-state">
          <p className="text-secondary-600 mb-4">No budgets found</p>
          {canWrite && (
            <button className="btn-primary">Create Budget</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">Budgets</h2>
        <p className="page-subtitle">Manage departmental budgets</p>
      </div>

      {/* Pending Confirmation */}
      {pendingConfirmation && (
        <div className="mb-6" data-testid="confirmation-dialog">
          <ApprovalCard
            confirmationId={pendingConfirmation.confirmationId}
            message={pendingConfirmation.message}
            confirmationData={{
              action: pendingConfirmation.action,
              department: pendingConfirmation.budget.department_code,
              amount: formatCurrency(pendingConfirmation.budget.budgeted_amount),
              fiscalPeriod: `FY${pendingConfirmation.budget.fiscal_year} - ${pendingConfirmation.budget.category_name}`,
            }}
            onComplete={handleConfirmationComplete}
          />
        </div>
      )}

      {/* Truncation Warning */}
      {isTruncated && budgetsResponse?.metadata && (
        <div className="mb-6" data-testid="truncation-warning">
          <TruncationWarning
            message={budgetsResponse.metadata.warning || 'Only 50 of 50+ budgets returned'}
            returnedCount={50}
            totalEstimate={budgetsResponse.metadata.totalCount || '50+'}
          />
        </div>
      )}

      {/* Reject Dialog */}
      {showRejectDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" data-testid="reject-dialog">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Reject Budget</h3>
            <p className="text-secondary-600 mb-4">
              Reject {showRejectDialog.department_code} FY{showRejectDialog.fiscal_year} {showRejectDialog.category_name} budget?
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Enter rejection reason (required)"
              className="input w-full mb-4"
              rows={3}
              required
              data-testid="rejection-reason"
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowRejectDialog(null);
                  setRejectionReason('');
                }}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (rejectionReason.trim()) {
                    rejectMutation.mutate({
                      budgetId: `${showRejectDialog.department_code}-${showRejectDialog.fiscal_year}-${showRejectDialog.category_name}`,
                      reason: rejectionReason,
                    });
                  }
                }}
                disabled={!rejectionReason.trim() || rejectMutation.isPending}
                className="btn-danger flex-1"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Department Detail Modal */}
      {selectedDepartment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" data-testid="department-detail-modal">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold">
                {selectedDepartment.code} Budget - FY{selectedDepartment.year}
              </h3>
              <button
                onClick={() => setSelectedDepartment(null)}
                className="text-secondary-500 hover:text-secondary-700"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {loadingDepartment ? (
              <div className="py-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
                <p className="mt-2 text-secondary-600">Loading department budget...</p>
              </div>
            ) : departmentDetail?.data ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="card bg-primary-50">
                    <h4 className="text-sm font-medium text-secondary-600">Total Budgeted</h4>
                    <p className="text-xl font-bold text-primary-700">
                      {formatCurrency(departmentDetail.data.total_budgeted || 0)}
                    </p>
                  </div>
                  <div className="card bg-success-50">
                    <h4 className="text-sm font-medium text-secondary-600">Total Spent</h4>
                    <p className="text-xl font-bold text-success-700">
                      {formatCurrency(departmentDetail.data.total_actual || 0)}
                    </p>
                  </div>
                </div>

                {departmentDetail.data.budgets && departmentDetail.data.budgets.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="table">
                      <thead>
                        <tr>
                          <th className="table-header">Category</th>
                          <th className="table-header text-right">Budgeted</th>
                          <th className="table-header text-right">Actual</th>
                          <th className="table-header text-right">Remaining</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-secondary-200">
                        {departmentDetail.data.budgets.map((b: any, idx: number) => (
                          <tr key={idx} className="table-row">
                            <td className="table-cell">{b.category_id || 'General'}</td>
                            <td className="table-cell text-right">{formatCurrency(Number(b.budgeted_amount) || 0)}</td>
                            <td className="table-cell text-right">{formatCurrency(Number(b.actual_amount) || 0)}</td>
                            <td className="table-cell text-right">
                              {formatCurrency((Number(b.budgeted_amount) || 0) - (Number(b.actual_amount) || 0))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-secondary-600 text-center py-4">No budget categories found</p>
                )}
              </div>
            ) : (
              <p className="text-secondary-600 text-center py-4">No budget data available</p>
            )}

            <div className="mt-6 flex justify-end">
              <button onClick={() => setSelectedDepartment(null)} className="btn-secondary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="card" data-testid="budget-count">
          <h3 className="text-sm font-medium text-secondary-600">Total Budgets</h3>
          <p className="text-2xl font-bold">{stats.totalCount} Budgets</p>
        </div>
        <div className="card" data-testid="total-allocated">
          <h3 className="text-sm font-medium text-secondary-600">Total Allocated</h3>
          <p className="text-2xl font-bold">{formatCurrency(stats.totalAllocated)}</p>
        </div>
        <div className="card" data-testid="pending-count">
          <h3 className="text-sm font-medium text-secondary-600">Pending Approval</h3>
          <p className="text-2xl font-bold text-warning-600">{stats.pendingCount} Pending Approval</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-1">Fiscal Year</label>
            <select
              value={yearFilter || ''}
              onChange={(e) => setYearFilter(e.target.value ? parseInt(e.target.value) : null)}
              className="input"
              data-testid="year-filter"
            >
              <option value="">All Years</option>
              {years.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-1">Category</label>
            <input
              type="text"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              placeholder="Filter by category"
              className="input"
              data-testid="category-filter"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input"
              data-testid="status-filter"
            >
              <option value="">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="PENDING_APPROVAL">Pending Approval</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-1">Department</label>
            <input
              type="text"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              placeholder="Filter by department"
              className="input"
              data-testid="department-filter"
            />
          </div>
          <div className="flex items-end">
            <button onClick={clearFilters} className="btn-secondary" data-testid="clear-filters">
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Budget Table */}
      <div className="card overflow-hidden">
        {filteredBudgets.length === 0 ? (
          <div className="py-12 text-center" data-testid="no-results">
            <p className="text-secondary-600">No budgets found matching your filters</p>
            <button onClick={clearFilters} className="btn-primary mt-4">
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table" data-testid="budget-table">
              <thead>
                <tr>
                  <th className="table-header">Department</th>
                  <th className="table-header">Category</th>
                  <th className="table-header">Fiscal Year</th>
                  <th className="table-header">Allocated</th>
                  <th className="table-header">Spent</th>
                  <th className="table-header">Remaining</th>
                  <th className="table-header">Utilization</th>
                  <th className="table-header">Status</th>
                  {canWrite && <th className="table-header">Actions</th>}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-secondary-200">
                {filteredBudgets.map((budget, index) => {
                  const budgeted = Number(budget.budgeted_amount) || 0;
                  const actual = Number(budget.actual_amount) || 0;
                  const utilization = budgeted > 0
                    ? Math.round((actual / budgeted) * 100)
                    : 0;
                  const budgetKey = `${budget.department_code}-${budget.fiscal_year}-${budget.category_name}-${index}`;

                  return (
                    <tr key={budgetKey} className="table-row" data-testid="budget-row">
                      <td className="table-cell">
                        <button
                          onClick={() => setSelectedDepartment({ code: budget.department_code, year: budget.fiscal_year })}
                          className="text-primary-600 hover:underline font-medium"
                          data-testid="department-link"
                        >
                          {budget.department_code}
                        </button>
                      </td>
                      <td className="table-cell" data-testid="category">
                        {budget.category_name}
                      </td>
                      <td className="table-cell" data-testid="fiscal-year">
                        FY{budget.fiscal_year}
                      </td>
                      <td className="table-cell" data-testid="allocated-amount">
                        {formatCurrency(budgeted)}
                      </td>
                      <td className="table-cell">{formatCurrency(actual)}</td>
                      <td className="table-cell">{formatCurrency(budgeted - actual)}</td>
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-2 bg-secondary-200 rounded-full overflow-hidden" data-testid="utilization-bar">
                            <div
                              className={`h-full ${utilization > 90 ? 'bg-danger-500' : utilization > 80 ? 'bg-warning-500' : 'bg-success-500'}`}
                              style={{ width: `${Math.min(utilization, 100)}%` }}
                            ></div>
                          </div>
                          <span className="text-sm">{utilization}%</span>
                        </div>
                      </td>
                      <td className="table-cell">
                        <span className={getStatusBadgeClass(budget.status)} data-testid="status-badge">
                          {budget.status.replace('_', ' ')}
                        </span>
                      </td>
                      {canWrite && (
                        <td className="table-cell">
                          <div className="flex gap-2">
                            {budget.status === 'PENDING_APPROVAL' && (
                              <>
                                <button
                                  onClick={() => approveMutation.mutate(budgetKey)}
                                  disabled={approveMutation.isPending}
                                  className="text-success-600 hover:text-success-700 text-sm font-medium"
                                  data-testid="approve-button"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => setShowRejectDialog(budget)}
                                  className="text-danger-600 hover:text-danger-700 text-sm font-medium"
                                  data-testid="reject-button"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            {budget.status === 'DRAFT' && (
                              <button
                                onClick={() => deleteMutation.mutate(budgetKey)}
                                disabled={deleteMutation.isPending}
                                className="text-danger-600 hover:text-danger-700 text-sm font-medium"
                                data-testid="delete-button"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default BudgetsPage;
