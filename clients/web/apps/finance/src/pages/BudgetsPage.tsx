import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useAuth, canModifyFinance } from '@tamshai/auth';
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
  const { userContext } = useAuth();
  const canWrite = canModifyFinance(userContext);

  // Filters
  const [yearFilter, setYearFilter] = useState<string>('');
  const [quarterFilter, setQuarterFilter] = useState<string>('');
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

  // Fetch budgets
  const {
    data: budgetsResponse,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['budgets'],
    queryFn: async () => {
      const response = await fetch('/api/finance/budgets');
      if (!response.ok) {
        throw new Error('Failed to fetch budgets');
      }
      return response.json() as Promise<APIResponse<Budget[]>>;
    },
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (budgetId: string) => {
      const response = await fetch(`/api/finance/budgets/${budgetId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        throw new Error('Failed to approve budget');
      }
      return response.json() as Promise<APIResponse<Budget>>;
    },
    onSuccess: (data, budgetId) => {
      if (data.status === 'pending_confirmation') {
        const budget = budgets.find((b) => b._id === budgetId);
        if (budget) {
          setPendingConfirmation({
            confirmationId: data.confirmationId!,
            message: data.message || `Approve ${budget.department} ${budget.fiscal_quarter} ${budget.fiscal_year} budget for ${formatCurrency(budget.budgeted_amount)}?`,
            budget,
            action: 'approve',
          });
        }
      } else {
        queryClient.invalidateQueries({ queryKey: ['budgets'] });
      }
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ budgetId, reason }: { budgetId: string; reason: string }) => {
      const response = await fetch(`/api/finance/budgets/${budgetId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
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

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (budgetId: string) => {
      const response = await fetch(`/api/finance/budgets/${budgetId}`, {
        method: 'DELETE',
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

  const budgets = budgetsResponse?.data || [];
  const isTruncated = budgetsResponse?.metadata?.truncated;

  // Apply filters
  const filteredBudgets = useMemo(() => {
    return budgets.filter((budget) => {
      if (yearFilter && budget.fiscal_year !== yearFilter) return false;
      if (quarterFilter && budget.fiscal_quarter !== quarterFilter) return false;
      if (statusFilter && budget.status !== statusFilter) return false;
      if (departmentFilter && !budget.department.toLowerCase().includes(departmentFilter.toLowerCase())) return false;
      return true;
    });
  }, [budgets, yearFilter, quarterFilter, statusFilter, departmentFilter]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalAllocated = filteredBudgets.reduce((sum, b) => sum + b.budgeted_amount, 0);
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
    setYearFilter('');
    setQuarterFilter('');
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
              department: pendingConfirmation.budget.department,
              amount: formatCurrency(pendingConfirmation.budget.budgeted_amount),
              fiscalPeriod: `${pendingConfirmation.budget.fiscal_year} ${pendingConfirmation.budget.fiscal_quarter}`,
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
              Reject {showRejectDialog.department} {showRejectDialog.fiscal_quarter} {showRejectDialog.fiscal_year} budget?
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
                      budgetId: showRejectDialog._id,
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
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
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
            <label className="block text-sm font-medium text-secondary-700 mb-1">Quarter</label>
            <select
              value={quarterFilter}
              onChange={(e) => setQuarterFilter(e.target.value)}
              className="input"
              data-testid="quarter-filter"
            >
              <option value="">All Quarters</option>
              <option value="Q1">Q1</option>
              <option value="Q2">Q2</option>
              <option value="Q3">Q3</option>
              <option value="Q4">Q4</option>
            </select>
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
                  <th className="table-header">Fiscal Period</th>
                  <th className="table-header">Allocated</th>
                  <th className="table-header">Spent</th>
                  <th className="table-header">Remaining</th>
                  <th className="table-header">Utilization</th>
                  <th className="table-header">Status</th>
                  {canWrite && <th className="table-header">Actions</th>}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-secondary-200">
                {filteredBudgets.map((budget) => {
                  const utilization = budget.budgeted_amount > 0
                    ? Math.round((budget.actual_amount / budget.budgeted_amount) * 100)
                    : 0;

                  return (
                    <tr key={budget._id} className="table-row" data-testid="budget-row">
                      <td className="table-cell">
                        <button className="text-primary-600 hover:underline font-medium" data-testid="department-link">
                          {budget.department}
                        </button>
                      </td>
                      <td className="table-cell" data-testid="fiscal-period">
                        {budget.fiscal_year} {budget.fiscal_quarter}
                      </td>
                      <td className="table-cell" data-testid="allocated-amount">
                        {formatCurrency(budget.budgeted_amount)}
                      </td>
                      <td className="table-cell">{formatCurrency(budget.actual_amount)}</td>
                      <td className="table-cell">{formatCurrency(budget.remaining_amount)}</td>
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
                                  onClick={() => approveMutation.mutate(budget._id)}
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
                                onClick={() => deleteMutation.mutate(budget._id)}
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
