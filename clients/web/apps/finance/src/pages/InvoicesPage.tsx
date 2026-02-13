import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useAuth, canModifyFinance, apiConfig } from '@tamshai/auth';
import { ApprovalCard, TruncationWarning, DataTable, ConfirmDialog } from '@tamshai/ui';
import type { ColumnDef, BulkAction } from '@tamshai/ui';
import type { Invoice } from '../types';

/**
 * Invoices Page
 *
 * Features:
 * - Invoice table with filtering (status, vendor, department, date range, overdue)
 * - v1.4 confirmation flow for approval/delete actions
 * - RBAC-aware actions (finance-write only)
 * - Status badges with colors
 * - Truncation warnings
 * - Invoice detail modal with line items
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

export function InvoicesPage() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const { userContext, getAccessToken } = useAuth();
  const canWrite = canModifyFinance(userContext);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('status') || '');
  const [vendorFilter, setVendorFilter] = useState<string>('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [showOverdueOnly, setShowOverdueOnly] = useState<boolean>(false);

  // Modal state
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  // Selection state for bulk operations
  const [selectedRows, setSelectedRows] = useState<string[]>([]);

  // Confirmation state (API-based human-in-the-loop)
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    confirmationId: string;
    message: string;
    invoice?: Invoice;
    invoices?: Invoice[];
    action: 'approve' | 'delete' | 'pay' | 'bulk_approve' | 'bulk_reject';
  } | null>(null);

  // Local bulk action confirmation dialog state
  const [bulkConfirmDialog, setBulkConfirmDialog] = useState<{
    isOpen: boolean;
    action: string;
    invoices: Invoice[];
    isProcessing: boolean;
  }>({ isOpen: false, action: '', invoices: [], isProcessing: false });

  // Helper functions (defined early for use in callbacks)
  const formatCurrency = useCallback((amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }, []);

  const formatDate = useCallback((dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  const getStatusBadgeClass = useCallback((status: string): string => {
    switch (status) {
      case 'PAID':
        return 'badge-success';
      case 'PENDING':
        return 'badge-warning';
      case 'APPROVED':
        return 'badge-primary';
      case 'DRAFT':
        return 'badge-secondary';
      case 'REJECTED':
      case 'CANCELLED':
        return 'badge-danger';
      default:
        return 'badge-secondary';
    }
  }, []);

  const isOverdue = useCallback((invoice: Invoice): boolean => {
    if (invoice.status === 'PAID' || invoice.status === 'CANCELLED') return false;
    const dueDate = new Date(invoice.due_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return dueDate < today;
  }, []);

  // Fetch invoices
  const {
    data: invoicesResponse,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['invoices'],
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

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/finance/approve_invoice`
        : '/api/mcp/finance/approve_invoice';

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ invoiceId }),
      });
      if (!response.ok) {
        throw new Error('Failed to approve invoice');
      }
      return response.json() as Promise<APIResponse<Invoice>>;
    },
    onSuccess: (data, invoiceId) => {
      if (data.status === 'pending_confirmation') {
        const invoice = invoices.find((i) => i.id === invoiceId);
        if (invoice) {
          setPendingConfirmation({
            confirmationId: data.confirmationId!,
            message: data.message || `Approve invoice ${invoice.invoice_number} from ${invoice.vendor_name} for ${formatCurrency(invoice.amount)}?`,
            invoice,
            action: 'approve',
          });
        }
      } else {
        queryClient.invalidateQueries({ queryKey: ['invoices'] });
      }
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/finance/delete_invoice`
        : '/api/mcp/finance/delete_invoice';

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ invoiceId }),
      });
      if (!response.ok) {
        throw new Error('Failed to delete invoice');
      }
      return response.json() as Promise<APIResponse<void>>;
    },
    onSuccess: (data, invoiceId) => {
      if (data.status === 'pending_confirmation') {
        const invoice = invoices.find((i) => i.id === invoiceId);
        if (invoice) {
          setPendingConfirmation({
            confirmationId: data.confirmationId!,
            message: data.message || `Delete invoice ${invoice.invoice_number}? This action cannot be undone.`,
            invoice,
            action: 'delete',
          });
        }
      } else {
        queryClient.invalidateQueries({ queryKey: ['invoices'] });
      }
    },
  });

  // Mark as paid mutation
  const payMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/finance/pay_invoice`
        : '/api/mcp/finance/pay_invoice';

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ invoiceId }),
      });
      if (!response.ok) {
        throw new Error('Failed to mark invoice as paid');
      }
      return response.json() as Promise<APIResponse<Invoice>>;
    },
    onSuccess: (data, invoiceId) => {
      if (data.status === 'pending_confirmation') {
        const invoice = invoices.find((i) => i.id === invoiceId);
        if (invoice) {
          setPendingConfirmation({
            confirmationId: data.confirmationId!,
            message: data.message || `Mark invoice ${invoice.invoice_number} as paid for ${formatCurrency(invoice.amount)}?`,
            invoice,
            action: 'pay',
          });
        }
      } else {
        queryClient.invalidateQueries({ queryKey: ['invoices'] });
      }
    },
  });

  const invoices = invoicesResponse?.data || [];
  const isTruncated = invoicesResponse?.metadata?.truncated;

  // Bulk approve mutation
  const bulkApproveMutation = useMutation({
    mutationFn: async (invoiceIds: string[]) => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/finance/bulk_approve_invoices`
        : '/api/mcp/finance/bulk_approve_invoices';

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ invoiceIds }),
      });
      if (!response.ok) {
        throw new Error('Failed to bulk approve invoices');
      }
      return response.json() as Promise<APIResponse<{ approved: number }>>;
    },
    onSuccess: (data, invoiceIds) => {
      if (data.status === 'pending_confirmation') {
        const selectedInvoices = invoices.filter((i) => invoiceIds.includes(i.id));
        const totalAmount = selectedInvoices.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
        setPendingConfirmation({
          confirmationId: data.confirmationId!,
          message: data.message || `Approve ${selectedInvoices.length} invoices totaling ${formatCurrency(totalAmount)}?`,
          invoices: selectedInvoices,
          action: 'bulk_approve',
        });
      } else {
        setSelectedRows([]);
        queryClient.invalidateQueries({ queryKey: ['invoices'] });
      }
    },
  });

  // Handle bulk actions - show confirmation dialog first
  const handleBulkAction = useCallback((actionId: string, selectedItems: Invoice[]) => {
    if (actionId === 'export') {
      // Export doesn't need confirmation
      handleExportInvoices(selectedItems);
      return;
    }

    // Show confirmation dialog for approve/reject actions
    setBulkConfirmDialog({
      isOpen: true,
      action: actionId,
      invoices: selectedItems,
      isProcessing: false,
    });
  }, []);

  // Execute bulk action after confirmation
  const handleBulkConfirm = useCallback(async (reason?: string) => {
    const { action, invoices: selectedInvoices } = bulkConfirmDialog;
    const selectedIds = selectedInvoices.map((i) => i.id);

    setBulkConfirmDialog((prev) => ({ ...prev, isProcessing: true }));

    try {
      switch (action) {
        case 'approve':
          await bulkApproveMutation.mutateAsync(selectedIds);
          break;
        case 'reject':
          // TODO: Implement bulk reject with reason
          console.log('Bulk reject with reason:', reason);
          break;
        default:
          console.warn('Unknown bulk action:', action);
      }
      setSelectedRows([]);
    } finally {
      setBulkConfirmDialog({ isOpen: false, action: '', invoices: [], isProcessing: false });
    }
  }, [bulkConfirmDialog, bulkApproveMutation]);

  // Cancel bulk action
  const handleBulkCancel = useCallback(() => {
    setBulkConfirmDialog({ isOpen: false, action: '', invoices: [], isProcessing: false });
  }, []);

  // Export invoices as CSV
  const handleExportInvoices = (invoicesToExport: Invoice[]) => {
    const headers = ['Invoice #', 'Vendor', 'Amount', 'Due Date', 'Department', 'Status'];
    const rows = invoicesToExport.map((i) => [
      i.invoice_number,
      i.vendor_name,
      i.amount.toString(),
      i.due_date,
      i.department_code || '',
      i.status,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `invoices-export-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Define table columns
  const columns: ColumnDef<Invoice>[] = useMemo(() => [
    {
      id: 'invoice_number',
      header: 'Invoice #',
      accessor: 'invoice_number',
      sortable: true,
      cell: (value, row) => (
        <button
          onClick={() => setSelectedInvoice(row)}
          className="text-primary-600 hover:underline font-medium"
          data-testid="invoice-link"
        >
          {String(value)}
        </button>
      ),
    },
    {
      id: 'vendor_name',
      header: 'Vendor',
      accessor: 'vendor_name',
      sortable: true,
    },
    {
      id: 'amount',
      header: 'Amount',
      accessor: 'amount',
      sortable: true,
      align: 'right',
      cell: (value) => formatCurrency(Number(value)),
    },
    {
      id: 'due_date',
      header: 'Due Date',
      accessor: 'due_date',
      sortable: true,
      cell: (value, row) => {
        const overdue = isOverdue(row);
        return (
          <span className={overdue ? 'text-danger-600 font-medium' : ''}>
            {formatDate(String(value))}
            {overdue && <span className="ml-1 text-xs">(Overdue)</span>}
          </span>
        );
      },
    },
    {
      id: 'department_code',
      header: 'Department',
      accessor: (row) => row.department_code || 'N/A',
      sortable: true,
    },
    {
      id: 'status',
      header: 'Status',
      accessor: 'status',
      sortable: true,
      cell: (value) => (
        <span className={getStatusBadgeClass(String(value))} data-testid="status-badge">
          {String(value)}
        </span>
      ),
    },
  ], []);

  // Define bulk actions
  const bulkActions: BulkAction[] = useMemo(() => {
    if (!canWrite) return [];

    return [
      {
        id: 'approve',
        label: 'Approve',
        variant: 'primary',
        requiresConfirmation: true,
      },
      {
        id: 'reject',
        label: 'Reject',
        variant: 'destructive',
        requiresConfirmation: true,
      },
      {
        id: 'export',
        label: 'Export',
        variant: 'neutral',
      },
    ];
  }, [canWrite]);

  // Row actions renderer
  const renderRowActions = useCallback((invoice: Invoice) => {
    if (!canWrite) return null;

    return (
      <div className="flex gap-2">
        {invoice.status === 'PENDING' && (
          <button
            onClick={() => approveMutation.mutate(invoice.id)}
            disabled={approveMutation.isPending}
            className="text-success-600 hover:text-success-700 text-sm font-medium"
            data-testid="approve-button"
          >
            Approve
          </button>
        )}
        {invoice.status === 'APPROVED' && (
          <button
            onClick={() => payMutation.mutate(invoice.id)}
            disabled={payMutation.isPending}
            className="text-primary-600 hover:text-primary-700 text-sm font-medium"
            data-testid="pay-button"
          >
            Mark Paid
          </button>
        )}
        {invoice.status === 'DRAFT' && (
          <button
            onClick={() => deleteMutation.mutate(invoice.id)}
            disabled={deleteMutation.isPending}
            className="text-danger-600 hover:text-danger-700 text-sm font-medium"
            data-testid="delete-button"
          >
            Delete
          </button>
        )}
      </div>
    );
  }, [canWrite, approveMutation, payMutation, deleteMutation]);

  // Apply filters
  const filteredInvoices = useMemo(() => {
    return invoices.filter((invoice) => {
      if (statusFilter && invoice.status.toUpperCase() !== statusFilter.toUpperCase()) return false;
      if (vendorFilter && !invoice.vendor_name.toLowerCase().includes(vendorFilter.toLowerCase())) return false;
      if (departmentFilter && invoice.department_code !== departmentFilter) return false;
      if (startDate && new Date(invoice.due_date) < new Date(startDate)) return false;
      if (endDate && new Date(invoice.due_date) > new Date(endDate)) return false;
      if (showOverdueOnly && !isOverdue(invoice)) return false;
      return true;
    });
  }, [invoices, statusFilter, vendorFilter, departmentFilter, startDate, endDate, showOverdueOnly]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalCount = filteredInvoices.length;
    const pendingAmount = filteredInvoices
      .filter((i) => i.status === 'PENDING')
      .reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    const overdueCount = filteredInvoices.filter((i) => isOverdue(i)).length;
    return { totalCount, pendingAmount, overdueCount };
  }, [filteredInvoices]);

  // Get unique departments for filter
  const departments = useMemo(() => {
    const uniqueDepts = [...new Set(invoices.map((i) => i.department_code).filter((d): d is string => d !== null))];
    return uniqueDepts.sort();
  }, [invoices]);

  // Clear all filters
  const clearFilters = () => {
    setStatusFilter('');
    setVendorFilter('');
    setDepartmentFilter('');
    setStartDate('');
    setEndDate('');
    setShowOverdueOnly(false);
  };

  // Handle confirmation complete
  const handleConfirmationComplete = (success: boolean) => {
    setPendingConfirmation(null);
    if (success) {
      // Clear selection on successful bulk operations
      if (pendingConfirmation?.action?.startsWith('bulk_')) {
        setSelectedRows([]);
      }
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    }
  };

  // Handle escape key for modal
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setSelectedInvoice(null);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="page-container" data-testid="invoices-loading">
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
          <h3 className="font-semibold mb-2">Error Loading Invoices</h3>
          <p className="text-sm mb-4">{String(error)}</p>
          <button onClick={() => refetch()} className="btn-primary" data-testid="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Empty state
  if (invoices.length === 0) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h2 className="page-title">Invoices</h2>
        </div>
        <div className="card text-center py-12" data-testid="empty-state">
          <p className="text-secondary-600 mb-4">No invoices found</p>
          {canWrite && (
            <button className="btn-primary">Create Invoice</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="page-container" onKeyDown={handleKeyDown}>
      <div className="page-header">
        <h2 className="page-title">Invoices</h2>
        <p className="page-subtitle">Manage vendor invoices and payments</p>
      </div>

      {/* Bulk Action Confirmation Dialog */}
      <ConfirmDialog
        isOpen={bulkConfirmDialog.isOpen}
        title={`${bulkConfirmDialog.action === 'approve' ? 'Approve' : 'Reject'} Invoices`}
        message={`Are you sure you want to ${bulkConfirmDialog.action} ${bulkConfirmDialog.invoices.length} invoice${bulkConfirmDialog.invoices.length !== 1 ? 's' : ''}?`}
        confirmLabel={bulkConfirmDialog.action === 'approve' ? 'Approve' : 'Reject'}
        variant={bulkConfirmDialog.action === 'reject' ? 'destructive' : 'primary'}
        isLoading={bulkConfirmDialog.isProcessing}
        showReasonInput={bulkConfirmDialog.action === 'reject'}
        reasonPlaceholder="Enter reason for rejection..."
        onConfirm={handleBulkConfirm}
        onCancel={handleBulkCancel}
        details={{
          count: bulkConfirmDialog.invoices.length,
          totalAmount: formatCurrency(
            bulkConfirmDialog.invoices.reduce((sum, i) => sum + (Number(i.amount) || 0), 0)
          ),
        }}
      />

      {/* Pending Confirmation (API-based human-in-the-loop) */}
      {pendingConfirmation && (
        <div className="mb-6" data-testid="api-confirmation">
          <ApprovalCard
            confirmationId={pendingConfirmation.confirmationId}
            message={pendingConfirmation.message}
            confirmationData={
              pendingConfirmation.invoices
                ? {
                    action: pendingConfirmation.action,
                    count: pendingConfirmation.invoices.length,
                    totalAmount: formatCurrency(
                      pendingConfirmation.invoices.reduce((sum, i) => sum + (Number(i.amount) || 0), 0)
                    ),
                  }
                : {
                    action: pendingConfirmation.action,
                    invoiceNumber: pendingConfirmation.invoice?.invoice_number || '',
                    vendorName: pendingConfirmation.invoice?.vendor_name || '',
                    amount: formatCurrency(pendingConfirmation.invoice?.amount || 0),
                  }
            }
            onComplete={handleConfirmationComplete}
          />
        </div>
      )}

      {/* Truncation Warning */}
      {isTruncated && invoicesResponse?.metadata && (
        <div className="mb-6" data-testid="truncation-warning">
          <TruncationWarning
            message={invoicesResponse.metadata.warning || 'Only 50 of 50+ invoices returned'}
            returnedCount={50}
            totalEstimate={invoicesResponse.metadata.totalCount || '50+'}
          />
        </div>
      )}

      {/* Invoice Detail Modal */}
      {selectedInvoice && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          data-testid="invoice-modal"
          onClick={() => setSelectedInvoice(null)}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold" data-testid="modal-title">
                Invoice {selectedInvoice.invoice_number}
              </h3>
              <button
                onClick={() => setSelectedInvoice(null)}
                className="text-secondary-500 hover:text-secondary-700"
                data-testid="close-modal"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Vendor Information */}
            <div className="mb-4 p-4 bg-secondary-50 rounded-lg" data-testid="vendor-info">
              <h4 className="font-medium text-secondary-900 mb-2">Vendor Information</h4>
              <p className="text-secondary-700">{selectedInvoice.vendor_name}</p>
            </div>

            {/* Invoice Details */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-sm text-secondary-600">Status</p>
                <span className={getStatusBadgeClass(selectedInvoice.status)}>
                  {selectedInvoice.status}
                </span>
              </div>
              <div>
                <p className="text-sm text-secondary-600">Department</p>
                <p className="font-medium">{selectedInvoice.department_code || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-secondary-600">Invoice Date</p>
                <p className="font-medium">{formatDate(selectedInvoice.invoice_date)}</p>
              </div>
              <div>
                <p className="text-sm text-secondary-600">Due Date</p>
                <p className={`font-medium ${isOverdue(selectedInvoice) ? 'text-danger-600' : ''}`}>
                  {formatDate(selectedInvoice.due_date)}
                  {isOverdue(selectedInvoice) && ' (Overdue)'}
                </p>
              </div>
            </div>

            {/* Invoice Summary */}
            <div className="mb-4">
              <h4 className="font-medium text-secondary-900 mb-2">Invoice Summary</h4>
              <div className="p-4 bg-secondary-50 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-secondary-700">{selectedInvoice.description || 'Invoice Total'}</span>
                  <span className="text-xl font-semibold">{formatCurrency(selectedInvoice.amount)}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setSelectedInvoice(null)} className="btn-secondary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="card" data-testid="invoice-count">
          <h3 className="text-sm font-medium text-secondary-600">Total Invoices</h3>
          <p className="text-2xl font-bold">{stats.totalCount} Invoices</p>
        </div>
        <div className="card" data-testid="pending-amount">
          <h3 className="text-sm font-medium text-secondary-600">Pending Amount</h3>
          <p className="text-2xl font-bold text-warning-600">{formatCurrency(stats.pendingAmount)}</p>
        </div>
        <div className="card" data-testid="overdue-count">
          <h3 className="text-sm font-medium text-secondary-600">Overdue Invoices</h3>
          <p className={`text-2xl font-bold ${stats.overdueCount > 0 ? 'text-danger-600' : ''}`}>
            {stats.overdueCount} Overdue
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
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
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="PAID">Paid</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-1">Vendor</label>
            <input
              type="text"
              value={vendorFilter}
              onChange={(e) => setVendorFilter(e.target.value)}
              placeholder="Filter by vendor"
              className="input"
              data-testid="vendor-filter"
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
          <div className="flex flex-col justify-end gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showOverdueOnly}
                onChange={(e) => setShowOverdueOnly(e.target.checked)}
                className="rounded"
                data-testid="overdue-filter"
              />
              Show Overdue Only
            </label>
            <button onClick={clearFilters} className="btn-secondary text-sm" data-testid="clear-filters">
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Invoice Table with Bulk Actions */}
      <div className="card overflow-hidden" data-testid="invoice-table">
        <DataTable<Invoice>
          data={filteredInvoices}
          columns={columns}
          keyField="id"
          selectable={canWrite}
          selectedRows={selectedRows}
          onSelectionChange={setSelectedRows}
          bulkActions={bulkActions}
          onBulkAction={handleBulkAction}
          sortable
          stickyHeader
          rowActions={canWrite ? renderRowActions : undefined}
          emptyState={
            <div className="py-12 text-center" data-testid="no-results">
              <p className="text-secondary-600">No invoices found matching your filters</p>
              <button onClick={clearFilters} className="btn-primary mt-4">
                Clear Filters
              </button>
            </div>
          }
        />
      </div>
    </div>
  );
}

export default InvoicesPage;
