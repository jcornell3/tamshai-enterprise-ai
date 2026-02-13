import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useAuth, canModifyFinance, apiConfig } from '@tamshai/auth';
import { ApprovalCard, TruncationWarning } from '@tamshai/ui';
import type { ExpenseReport, Expense } from '../types';

/**
 * Expense Reports Page
 *
 * Features:
 * - Expense report table with expandable rows for details
 * - v1.4 confirmation flow for approval/reject/reimburse actions
 * - RBAC-aware actions (finance-write only)
 * - Status badges with colors
 * - Category badges for expenses
 * - Receipt links
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

export function ExpenseReportsPage() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const { userContext, getAccessToken } = useAuth();
  const canWrite = canModifyFinance(userContext);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('status') || '');
  const [employeeFilter, setEmployeeFilter] = useState<string>('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [minAmount, setMinAmount] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<string>('');

  // Expanded rows state
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Rejection dialog state
  const [showRejectDialog, setShowRejectDialog] = useState<ExpenseReport | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Confirmation state
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    confirmationId: string;
    message: string;
    report: ExpenseReport;
    action: 'approve' | 'reject' | 'reimburse';
  } | null>(null);

  // Fetch expense reports
  const {
    data: reportsResponse,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['expense-reports'],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/finance/list_expense_reports`
        : '/api/mcp/finance/list_expense_reports';

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch expense reports');
      }
      const data = await response.json() as APIResponse<ExpenseReport[]>;

      // If the response is an error with NOT_IMPLEMENTED code, throw it with the code
      if (data.status === 'error' && (data as any).code === 'NOT_IMPLEMENTED') {
        const error = new Error((data as any).message || 'Feature not implemented') as any;
        error.code = 'NOT_IMPLEMENTED';
        error.details = (data as any).details;
        throw error;
      }

      return data;
    },
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (reportId: string) => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/finance/approve_expense_report`
        : '/api/mcp/finance/approve_expense_report';

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reportId }),
      });
      if (!response.ok) {
        throw new Error('Failed to approve expense report');
      }
      return response.json() as Promise<APIResponse<ExpenseReport>>;
    },
    onSuccess: (data, reportId) => {
      if (data.status === 'pending_confirmation') {
        const report = reports.find((r) => r._id === reportId);
        if (report) {
          setPendingConfirmation({
            confirmationId: data.confirmationId!,
            message: data.message || `Approve expense report ${report.report_number} from ${report.employee_name} for ${formatCurrency(report.total_amount)}?`,
            report,
            action: 'approve',
          });
        }
      } else {
        queryClient.invalidateQueries({ queryKey: ['expense-reports'] });
      }
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ reportId, reason }: { reportId: string; reason: string }) => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/finance/reject_expense_report`
        : '/api/mcp/finance/reject_expense_report';

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reportId, reason }),
      });
      if (!response.ok) {
        throw new Error('Failed to reject expense report');
      }
      return response.json() as Promise<APIResponse<ExpenseReport>>;
    },
    onSuccess: () => {
      setShowRejectDialog(null);
      setRejectionReason('');
      queryClient.invalidateQueries({ queryKey: ['expense-reports'] });
    },
  });

  // Mark as reimbursed mutation
  const reimburseMutation = useMutation({
    mutationFn: async (reportId: string) => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/finance/reimburse_expense_report`
        : '/api/mcp/finance/reimburse_expense_report';

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reportId }),
      });
      if (!response.ok) {
        throw new Error('Failed to mark as reimbursed');
      }
      return response.json() as Promise<APIResponse<ExpenseReport>>;
    },
    onSuccess: (data, reportId) => {
      if (data.status === 'pending_confirmation') {
        const report = reports.find((r) => r._id === reportId);
        if (report) {
          setPendingConfirmation({
            confirmationId: data.confirmationId!,
            message: data.message || `Mark expense report ${report.report_number} as reimbursed for ${formatCurrency(report.total_amount)}?`,
            report,
            action: 'reimburse',
          });
        }
      } else {
        queryClient.invalidateQueries({ queryKey: ['expense-reports'] });
      }
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (reportId: string) => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/finance/delete_expense_report`
        : '/api/mcp/finance/delete_expense_report';

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reportId }),
      });
      if (!response.ok) {
        throw new Error('Failed to delete expense report');
      }
      return response.json() as Promise<APIResponse<void>>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-reports'] });
    },
  });

  const reports = reportsResponse?.data || [];
  const isTruncated = reportsResponse?.metadata?.truncated;

  // Toggle row expansion
  const toggleRowExpansion = (reportId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(reportId)) {
      newExpanded.delete(reportId);
    } else {
      newExpanded.add(reportId);
    }
    setExpandedRows(newExpanded);
  };

  // Apply filters
  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      if (statusFilter && report.status !== statusFilter) return false;
      if (employeeFilter && !report.employee_name.toLowerCase().includes(employeeFilter.toLowerCase())) return false;
      if (departmentFilter && report.department !== departmentFilter) return false;
      if (startDate && report.submission_date && new Date(report.submission_date) < new Date(startDate)) return false;
      if (endDate && report.submission_date && new Date(report.submission_date) > new Date(endDate)) return false;
      if (minAmount && report.total_amount < parseFloat(minAmount)) return false;
      if (maxAmount && report.total_amount > parseFloat(maxAmount)) return false;
      return true;
    });
  }, [reports, statusFilter, employeeFilter, departmentFilter, startDate, endDate, minAmount, maxAmount]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalCount = filteredReports.length;
    const pendingApproval = filteredReports
      .filter((r) => r.status === 'SUBMITTED')
      .reduce((sum, r) => sum + r.total_amount, 0);
    const pendingReimbursement = filteredReports
      .filter((r) => r.status === 'APPROVED')
      .reduce((sum, r) => sum + r.total_amount, 0);

    // Category breakdown
    const categoryTotals: Record<string, number> = {};
    filteredReports.forEach((report) => {
      (report.expenses || []).forEach((expense) => {
        categoryTotals[expense.category] = (categoryTotals[expense.category] || 0) + expense.amount;
      });
    });

    return { totalCount, pendingApproval, pendingReimbursement, categoryTotals };
  }, [filteredReports]);

  // Get unique departments for filter
  const departments = useMemo(() => {
    const uniqueDepts = [...new Set(reports.map((r) => r.department))];
    return uniqueDepts.sort();
  }, [reports]);

  // Clear all filters
  const clearFilters = () => {
    setStatusFilter('');
    setEmployeeFilter('');
    setDepartmentFilter('');
    setStartDate('');
    setEndDate('');
    setMinAmount('');
    setMaxAmount('');
  };

  // Format currency
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Format date
  const formatDate = (dateString: string): string => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Get status badge class
  const getStatusBadgeClass = (status: string): string => {
    switch (status) {
      case 'REIMBURSED':
        return 'badge-success';
      case 'SUBMITTED':
        return 'badge-warning';
      case 'APPROVED':
        return 'badge-primary';
      case 'DRAFT':
        return 'badge-secondary';
      case 'REJECTED':
        return 'badge-danger';
      case 'UNDER_REVIEW':
        return 'badge-info';
      default:
        return 'badge-secondary';
    }
  };

  // Get category badge class
  const getCategoryBadgeClass = (category: string): string => {
    switch (category) {
      case 'TRAVEL':
        return 'badge-primary';
      case 'MEALS':
        return 'badge-warning';
      case 'SUPPLIES':
        return 'badge-secondary';
      case 'EQUIPMENT':
        return 'badge-success';
      case 'SOFTWARE':
        return 'badge-info';
      default:
        return 'badge-secondary';
    }
  };

  // Handle confirmation complete
  const handleConfirmationComplete = (success: boolean) => {
    setPendingConfirmation(null);
    if (success) {
      queryClient.invalidateQueries({ queryKey: ['expense-reports'] });
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="page-container" data-testid="expense-reports-loading">
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

  // Error state - check if it's NOT_IMPLEMENTED
  if (error) {
    const isNotImplemented = (error as any)?.code === 'NOT_IMPLEMENTED';

    return (
      <div className="page-container">
        <div className="page-header">
          <h2 className="page-title">Expense Reports</h2>
          <p className="page-subtitle">Review and process employee expense reports</p>
        </div>
        {isNotImplemented ? (
          <div className="card text-center py-12" data-testid="not-implemented-state">
            <div className="mb-4">
              <svg className="w-16 h-16 mx-auto text-secondary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-secondary-900 mb-2">Expense Reports Coming Soon</h3>
            <p className="text-secondary-600 mb-4 max-w-md mx-auto">
              Employee expense report tracking is planned for v1.5. Currently, this feature is not available in the Finance module.
            </p>
            <p className="text-sm text-secondary-500">
              For vendor payments, please use the <a href="/invoices" className="text-primary-600 hover:underline">Invoices</a> page.
            </p>
          </div>
        ) : (
          <div className="alert-danger" data-testid="error-state">
            <h3 className="font-semibold mb-2">Error Loading Expense Reports</h3>
            <p className="text-sm mb-4">{String(error)}</p>
            <button onClick={() => refetch()} className="btn-primary" data-testid="retry-button">
              Retry
            </button>
          </div>
        )}
      </div>
    );
  }

  // Empty state
  if (reports.length === 0) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h2 className="page-title">Expense Reports</h2>
        </div>
        <div className="card text-center py-12" data-testid="empty-state">
          <p className="text-secondary-600 mb-4">No expense reports found</p>
          <button className="btn-primary">Create Report</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">Expense Reports</h2>
        <p className="page-subtitle">Review and process employee expense reports</p>
      </div>

      {/* Pending Confirmation */}
      {pendingConfirmation && (
        <div className="mb-6" data-testid="confirmation-dialog">
          <ApprovalCard
            confirmationId={pendingConfirmation.confirmationId}
            message={pendingConfirmation.message}
            confirmationData={{
              action: pendingConfirmation.action,
              reportNumber: pendingConfirmation.report.report_number,
              employeeName: pendingConfirmation.report.employee_name,
              amount: formatCurrency(pendingConfirmation.report.total_amount),
              expenseCount: (pendingConfirmation.report.expenses || []).length,
            }}
            onComplete={handleConfirmationComplete}
          />
        </div>
      )}

      {/* Truncation Warning */}
      {isTruncated && reportsResponse?.metadata && (
        <div className="mb-6" data-testid="truncation-warning">
          <TruncationWarning
            message={reportsResponse.metadata.warning || 'Only 50 of 50+ reports returned'}
            returnedCount={50}
            totalEstimate={reportsResponse.metadata.totalCount || '50+'}
          />
        </div>
      )}

      {/* Reject Dialog */}
      {showRejectDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" data-testid="reject-dialog">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Reject Expense Report</h3>
            <p className="text-secondary-600 mb-4">
              Reject {showRejectDialog.report_number} from {showRejectDialog.employee_name}?
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
                      reportId: showRejectDialog._id,
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="card" data-testid="report-count">
          <h3 className="text-sm font-medium text-secondary-600">Total Reports</h3>
          <p className="text-2xl font-bold">{stats.totalCount} Reports</p>
        </div>
        <div className="card" data-testid="pending-approval-amount">
          <h3 className="text-sm font-medium text-secondary-600">Pending Approval</h3>
          <p className="text-2xl font-bold text-warning-600">{formatCurrency(stats.pendingApproval)}</p>
        </div>
        <div className="card" data-testid="pending-reimbursement-amount">
          <h3 className="text-sm font-medium text-secondary-600">Pending Reimbursement</h3>
          <p className="text-2xl font-bold text-primary-600">{formatCurrency(stats.pendingReimbursement)}</p>
        </div>
        <div className="card" data-testid="category-breakdown">
          <h3 className="text-sm font-medium text-secondary-600 mb-2">By Category</h3>
          <div className="space-y-1 text-sm">
            {Object.entries(stats.categoryTotals).slice(0, 3).map(([category, amount]) => (
              <div key={category} className="flex justify-between">
                <span className="text-secondary-600">{category}</span>
                <span className="font-medium">{formatCurrency(amount)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
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
              <option value="SUBMITTED">Submitted</option>
              <option value="UNDER_REVIEW">Under Review</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="REIMBURSED">Reimbursed</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-1">Employee</label>
            <input
              type="text"
              value={employeeFilter}
              onChange={(e) => setEmployeeFilter(e.target.value)}
              placeholder="Filter by employee"
              className="input"
              data-testid="employee-filter"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-1">Department</label>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="input"
              data-testid="department-filter"
            >
              <option value="">All Departments</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-1">From Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="input"
              data-testid="start-date-filter"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-1">To Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="input"
              data-testid="end-date-filter"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-1">Amount Range</label>
            <div className="flex gap-1">
              <input
                type="number"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
                placeholder="Min"
                className="input w-1/2"
                data-testid="min-amount-filter"
              />
              <input
                type="number"
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
                placeholder="Max"
                className="input w-1/2"
                data-testid="max-amount-filter"
              />
            </div>
          </div>
          <div className="flex items-end">
            <button onClick={clearFilters} className="btn-secondary w-full" data-testid="clear-filters">
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Expense Reports Table */}
      <div className="card overflow-hidden">
        {filteredReports.length === 0 ? (
          <div className="py-12 text-center" data-testid="no-results">
            <p className="text-secondary-600">No expense reports found matching your filters</p>
            <button onClick={clearFilters} className="btn-primary mt-4">
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table" data-testid="expense-reports-table">
              <thead>
                <tr>
                  <th className="table-header w-8"></th>
                  <th className="table-header">Report #</th>
                  <th className="table-header">Employee</th>
                  <th className="table-header">Department</th>
                  <th className="table-header">Amount</th>
                  <th className="table-header">Expenses</th>
                  <th className="table-header">Submitted</th>
                  <th className="table-header">Status</th>
                  {canWrite && <th className="table-header">Actions</th>}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-secondary-200">
                {filteredReports.map((report) => {
                  const isExpanded = expandedRows.has(report._id);

                  return (
                    <>
                      <tr
                        key={report._id}
                        className="table-row cursor-pointer hover:bg-secondary-50"
                        onClick={() => toggleRowExpansion(report._id)}
                        data-testid="report-row"
                      >
                        <td className="table-cell">
                          <button
                            className="text-secondary-500"
                            data-testid="expand-button"
                          >
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
                        <td className="table-cell font-medium" data-testid="report-number">
                          {report.report_number}
                        </td>
                        <td className="table-cell" data-testid="employee-name">{report.employee_name}</td>
                        <td className="table-cell">{report.department}</td>
                        <td className="table-cell font-medium" data-testid="total-amount">
                          {formatCurrency(report.total_amount)}
                        </td>
                        <td className="table-cell" data-testid="expense-count">
                          {(report.expenses || []).length} expenses
                        </td>
                        <td className="table-cell" data-testid="submission-date">
                          {formatDate(report.submission_date)}
                        </td>
                        <td className="table-cell">
                          <span className={getStatusBadgeClass(report.status)} data-testid="status-badge">
                            {report.status}
                          </span>
                        </td>
                        {canWrite && (
                          <td className="table-cell" onClick={(e) => e.stopPropagation()}>
                            <div className="flex gap-2">
                              {report.status === 'SUBMITTED' && (
                                <>
                                  <button
                                    onClick={() => approveMutation.mutate(report._id)}
                                    disabled={approveMutation.isPending}
                                    className="text-success-600 hover:text-success-700 text-sm font-medium"
                                    data-testid="approve-button"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => setShowRejectDialog(report)}
                                    className="text-danger-600 hover:text-danger-700 text-sm font-medium"
                                    data-testid="reject-button"
                                  >
                                    Reject
                                  </button>
                                </>
                              )}
                              {report.status === 'APPROVED' && (
                                <button
                                  onClick={() => reimburseMutation.mutate(report._id)}
                                  disabled={reimburseMutation.isPending}
                                  className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                                  data-testid="reimburse-button"
                                >
                                  Reimburse
                                </button>
                              )}
                              {report.status === 'DRAFT' && (
                                <button
                                  onClick={() => deleteMutation.mutate(report._id)}
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
                      {/* Expanded Row with Expense Details */}
                      {isExpanded && (
                        <tr key={`${report._id}-expanded`} data-testid="expanded-row">
                          <td colSpan={canWrite ? 9 : 8} className="p-0 bg-secondary-50">
                            <div className="p-4">
                              <h4 className="font-medium text-secondary-900 mb-3">Expense Details</h4>
                              <table className="w-full text-sm" data-testid="expenses-table">
                                <thead>
                                  <tr className="border-b">
                                    <th className="text-left py-2">Description</th>
                                    <th className="text-left py-2">Category</th>
                                    <th className="text-right py-2">Amount</th>
                                    <th className="text-left py-2">Date</th>
                                    <th className="text-left py-2">Receipt</th>
                                    <th className="text-left py-2">Notes</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(report.expenses || []).map((expense) => (
                                    <tr key={expense._id} className="border-b" data-testid="expense-row">
                                      <td className="py-2" data-testid="expense-description">
                                        {expense.description}
                                      </td>
                                      <td className="py-2">
                                        <span
                                          className={getCategoryBadgeClass(expense.category)}
                                          data-testid="expense-category"
                                        >
                                          {expense.category}
                                        </span>
                                      </td>
                                      <td className="text-right py-2" data-testid="expense-amount">
                                        {formatCurrency(expense.amount)}
                                      </td>
                                      <td className="py-2" data-testid="expense-date">
                                        {formatDate(expense.date)}
                                      </td>
                                      <td className="py-2" data-testid="expense-receipt">
                                        {expense.receipt_url ? (
                                          <a
                                            href={expense.receipt_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-primary-600 hover:underline"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            View Receipt
                                          </a>
                                        ) : (
                                          <span className="text-secondary-400">No receipt</span>
                                        )}
                                      </td>
                                      <td className="py-2 text-secondary-600" data-testid="expense-notes">
                                        {expense.notes || '-'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr className="font-semibold">
                                    <td colSpan={2} className="py-2">Total</td>
                                    <td className="text-right py-2">{formatCurrency(report.total_amount)}</td>
                                    <td colSpan={3}></td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
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

export default ExpenseReportsPage;
