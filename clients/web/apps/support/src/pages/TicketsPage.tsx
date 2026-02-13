import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth, canModifySupport, apiConfig } from '@tamshai/auth';
import { ApprovalCard, TruncationWarning, DataTable, ConfirmDialog } from '@tamshai/ui';
import type { ColumnDef, BulkAction } from '@tamshai/ui';
import type { Ticket, APIResponse } from '../types';

/**
 * Tickets Page
 *
 * Features:
 * - Support tickets table with status and priority filtering
 * - Bulk actions: Close, Export (Enterprise UX)
 * - Close ticket with v1.4 confirmation flow
 * - Truncation warnings for 50+ records
 * - Cursor-based pagination
 */
export default function TicketsPage() {
  const { userContext, getAccessToken } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [organizationFilter, setOrganizationFilter] = useState('');
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    confirmationId: string;
    message: string;
    ticket: Ticket;
  } | null>(null);
  const [resolutionInput, setResolutionInput] = useState('');

  // Selection state for DataTable
  const [selectedRows, setSelectedRows] = useState<string[]>([]);

  // Bulk action confirmation dialog
  const [bulkActionDialog, setBulkActionDialog] = useState<{
    isOpen: boolean;
    actionId: string;
    selectedTickets: Ticket[];
    title: string;
    message: string;
    showReasonInput?: boolean;
  }>({ isOpen: false, actionId: '', selectedTickets: [], title: '', message: '' });
  const [bulkResolution, setBulkResolution] = useState('');

  const canWrite = canModifySupport(userContext);

  // Fetch all tickets (auto-paginate to get complete results)
  const { data: ticketsResponse, isLoading, error } = useQuery({
    queryKey: ['tickets', statusFilter, priorityFilter, organizationFilter],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      // Helper to build URL with cursor support
      const buildUrl = (cursor?: string): string => {
        const params = new URLSearchParams();
        if (statusFilter) params.append('status', statusFilter);
        if (priorityFilter) params.append('priority', priorityFilter);
        if (organizationFilter) params.append('organization_id', organizationFilter);
        if (cursor) params.append('cursor', cursor);

        const queryString = params.toString();
        if (apiConfig.mcpGatewayUrl) {
          return `${apiConfig.mcpGatewayUrl}/api/mcp/support/search_tickets${queryString ? '?' + queryString : ''}`;
        } else {
          return `/api/mcp/support/search_tickets${queryString ? '?' + queryString : ''}`;
        }
      };

      // Fetch all pages automatically
      const allTickets: Ticket[] = [];
      let cursor: string | undefined = undefined;
      let pageCount = 0;
      const maxPages = 10; // Safety limit to prevent infinite loops

      do {
        const response = await fetch(buildUrl(cursor), {
          headers: { 'Authorization': `Bearer ${token}` },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch tickets');
        }

        const pageData = await response.json() as APIResponse<Ticket[]>;

        if (pageData.data) {
          allTickets.push(...pageData.data);
        }

        // Get next cursor if more pages exist
        cursor = pageData.metadata?.hasMore ? pageData.metadata.nextCursor : undefined;
        pageCount++;

      } while (cursor && pageCount < maxPages);

      // Return combined results
      return {
        status: 'success' as const,
        data: allTickets,
        metadata: {
          hasMore: false,
          returnedCount: allTickets.length,
          totalEstimate: allTickets.length.toString(),
        }
      } as APIResponse<Ticket[]>;
    },
  });

  // Close ticket mutation
  const closeTicketMutation = useMutation({
    mutationFn: async ({ ticketId, resolution }: { ticketId: string; resolution: string }) => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/mcp/support/close_ticket`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ ticketId, resolution }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to close ticket');
      }

      return response.json() as Promise<APIResponse<any>>;
    },
    onSuccess: (data) => {
      if (data.status === 'pending_confirmation') {
        // Show approval card
        const ticket = ticketsResponse?.data?.find(
          (t) => t.id === data.confirmationId
        );
        setPendingConfirmation({
          confirmationId: data.confirmationId!,
          message: data.message || 'Close ticket?',
          ticket: ticket!,
        });
      } else {
        // Success - refresh list
        queryClient.invalidateQueries({ queryKey: ['tickets'] });
      }
    },
  });

  // Bulk close tickets mutation
  const bulkCloseTicketsMutation = useMutation({
    mutationFn: async ({ ticketIds, resolution }: { ticketIds: string[]; resolution: string }) => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      // Execute sequentially
      for (const ticketId of ticketIds) {
        const response = await fetch(
          `${apiConfig.mcpGatewayUrl}/api/mcp/support/close_ticket`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ ticketId, resolution }),
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to close ticket ${ticketId}`);
        }
      }
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      setSelectedRows([]);
      setBulkResolution('');
    },
  });

  const handleCloseTicket = (ticket: Ticket) => {
    const resolution = prompt(`Enter resolution for ticket "${ticket.title}":`);
    if (resolution) {
      setResolutionInput(resolution);
      closeTicketMutation.mutate({ ticketId: ticket.id, resolution });
    }
  };

  const handleConfirmationComplete = (success: boolean) => {
    setPendingConfirmation(null);
    setResolutionInput('');
    if (success) {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    }
  };

  const tickets = ticketsResponse?.data || [];
  const isTruncated = ticketsResponse?.metadata?.hasMore || ticketsResponse?.metadata?.truncated || false;

  // Priority color mapping
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'bg-red-100 text-red-800';
      case 'high':
        return 'bg-orange-100 text-orange-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Status color mapping
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-blue-100 text-blue-800';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'resolved':
        return 'bg-green-100 text-green-800';
      case 'closed':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Calculate stats
  const openTickets = tickets.filter(t => t.status === 'open').length;
  const criticalTickets = tickets.filter(t => t.priority === 'critical' && t.status !== 'closed').length;

  // Get unique organizations for filter dropdown
  const uniqueOrganizations = Array.from(
    new Map(
      tickets
        .filter(t => t.organization_id && t.organization_name)
        .map(t => [t.organization_id, { id: t.organization_id!, name: t.organization_name! }])
    ).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

  // DataTable columns
  const columns: ColumnDef<Ticket>[] = [
    {
      id: 'title',
      header: 'Title',
      accessor: 'title',
      sortable: true,
      cell: (value, row) => (
        <Link to={`/tickets/${row.id}`} className="block hover:text-primary-600">
          <div className="font-medium">{String(value)}</div>
          <div className="text-xs text-secondary-500 truncate max-w-xs">
            {row.description}
          </div>
        </Link>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      accessor: 'status',
      sortable: true,
      cell: (value) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(String(value))}`}>
          {String(value).replace('_', ' ')}
        </span>
      ),
    },
    {
      id: 'priority',
      header: 'Priority',
      accessor: 'priority',
      sortable: true,
      cell: (value) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(String(value))}`}>
          {String(value)}
        </span>
      ),
    },
    {
      id: 'organization',
      header: 'Organization',
      accessor: 'organization_name',
      sortable: true,
      cell: (_value, row) => (
        <div>
          <div className="font-medium text-secondary-900">{String(row.organization_name || 'N/A')}</div>
          {row.contact_email && (
            <div className="text-xs text-secondary-500">{row.contact_email}</div>
          )}
        </div>
      ),
    },
    {
      id: 'created_at',
      header: 'Created',
      accessor: 'created_at',
      sortable: true,
      cell: (value) => (
        <span className="text-secondary-600">
          {new Date(String(value)).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: 'tags',
      header: 'Tags',
      accessor: 'tags',
      cell: (value, row) => (
        <div className="flex flex-wrap gap-1">
          {row.tags?.slice(0, 2).map((tag) => (
            <span key={tag} className="px-2 py-0.5 bg-secondary-100 text-secondary-700 rounded text-xs">
              {tag}
            </span>
          ))}
          {(row.tags?.length || 0) > 2 && (
            <span className="text-xs text-secondary-500">
              +{(row.tags?.length || 0) - 2}
            </span>
          )}
        </div>
      ),
    },
  ];

  // Bulk actions
  const bulkActions: BulkAction[] = [
    {
      id: 'bulk_close',
      label: 'Close Tickets',
      variant: 'primary',
      requiresConfirmation: true,
    },
    {
      id: 'export',
      label: 'Export CSV',
      variant: 'neutral',
    },
  ];

  // Handle bulk actions
  const handleBulkAction = (actionId: string, selectedTickets: Ticket[]) => {
    if (actionId === 'bulk_close') {
      // Filter out already closed/resolved tickets
      const closableTickets = selectedTickets.filter(
        (t) => !['closed', 'resolved'].includes(t.status)
      );
      if (closableTickets.length === 0) {
        alert('All selected tickets are already closed or resolved.');
        return;
      }
      setBulkActionDialog({
        isOpen: true,
        actionId,
        selectedTickets: closableTickets,
        title: 'Close Tickets',
        message: `Are you sure you want to close ${closableTickets.length} ticket(s)? Please provide a resolution note.`,
        showReasonInput: true,
      });
    } else if (actionId === 'export') {
      // Export to CSV
      const headers = ['ID', 'Title', 'Status', 'Priority', 'Created', 'Tags'];
      const rows = selectedTickets.map((ticket) => [
        ticket.id,
        ticket.title,
        ticket.status,
        ticket.priority,
        new Date(ticket.created_at).toLocaleDateString(),
        (ticket.tags || []).join('; '),
      ]);
      const csvContent = [headers, ...rows].map((row) => row.join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tickets-export-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setSelectedRows([]);
    }
  };

  // Confirm bulk action
  const confirmBulkAction = () => {
    const { actionId, selectedTickets } = bulkActionDialog;
    if (actionId === 'bulk_close') {
      if (!bulkResolution.trim()) {
        alert('Please provide a resolution note.');
        return;
      }
      bulkCloseTicketsMutation.mutate({
        ticketIds: selectedTickets.map((t) => t.id),
        resolution: bulkResolution,
      });
    }
    setBulkActionDialog({ isOpen: false, actionId: '', selectedTickets: [], title: '', message: '' });
  };

  // Row actions renderer
  const renderRowActions = (ticket: Ticket) => {
    if (['closed', 'resolved'].includes(ticket.status)) {
      return null;
    }
    return (
      <button
        onClick={() => handleCloseTicket(ticket)}
        disabled={closeTicketMutation.isPending}
        className="text-purple-600 hover:text-purple-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        title="Close ticket"
      >
        Close
      </button>
    );
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">Support Tickets</h2>
        <p className="page-subtitle">
          View and manage support tickets
          {!canWrite && ' (read-only access)'}
        </p>
      </div>

      {/* Pending Confirmation */}
      {pendingConfirmation && (
        <div className="mb-6">
          <ApprovalCard
            confirmationId={pendingConfirmation.confirmationId}
            message={pendingConfirmation.message}
            confirmationData={{
              action: 'close_ticket',
              ticketTitle: pendingConfirmation.ticket.title,
              currentStatus: pendingConfirmation.ticket.status,
              resolution: resolutionInput,
            }}
            onComplete={handleConfirmationComplete}
          />
        </div>
      )}

      {/* Truncation Warning */}
      {isTruncated && ticketsResponse?.metadata && (
        <div className="mb-6">
          <TruncationWarning
            message="More tickets exist in the database than can be shown on one page."
            returnedCount={ticketsResponse.metadata.returnedCount || 50}
            totalEstimate={ticketsResponse.metadata.totalEstimate || ticketsResponse.metadata.totalCount || '50+'}
          />
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="card">
          <h3 className="text-sm font-medium text-secondary-600">Total Tickets</h3>
          <p className="text-2xl font-bold text-secondary-900">{tickets.length}</p>
        </div>
        <div className="card">
          <h3 className="text-sm font-medium text-secondary-600">Open Tickets</h3>
          <p className="text-2xl font-bold text-blue-600">{openTickets}</p>
        </div>
        <div className="card">
          <h3 className="text-sm font-medium text-secondary-600">Critical</h3>
          <p className="text-2xl font-bold text-red-600">{criticalTickets}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex gap-4 items-end flex-wrap">
          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm font-medium text-secondary-700 mb-1">
              Filter by Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input"
            >
              <option value="">All Statuses</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm font-medium text-secondary-700 mb-1">
              Filter by Priority
            </label>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="input"
            >
              <option value="">All Priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm font-medium text-secondary-700 mb-1">
              Filter by Organization
            </label>
            <select
              value={organizationFilter}
              onChange={(e) => setOrganizationFilter(e.target.value)}
              className="input"
            >
              <option value="">All Organizations</option>
              {uniqueOrganizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['tickets'] })}
            className="btn-secondary"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Tickets Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center">
            <div className="spinner mb-4"></div>
            <p className="text-secondary-600">Loading tickets...</p>
          </div>
        ) : error ? (
          <div className="alert-danger">
            <p className="font-medium">Error loading tickets</p>
            <p className="text-sm">{String(error)}</p>
          </div>
        ) : tickets.length === 0 ? (
          <div className="py-12 text-center text-secondary-600">
            <p>No tickets found</p>
          </div>
        ) : (
          <DataTable<Ticket>
            data={tickets}
            columns={columns}
            keyField="id"
            selectable={canWrite}
            selectedRows={selectedRows}
            onSelectionChange={setSelectedRows}
            bulkActions={canWrite ? bulkActions : []}
            onBulkAction={handleBulkAction}
            sortable
            stickyHeader
            rowActions={canWrite ? renderRowActions : undefined}
          />
        )}
      </div>

      {/* Stats */}
      <div className="mt-6 text-sm text-secondary-600 text-center">
        Showing {tickets.length} ticket{tickets.length !== 1 ? 's' : ''}
        {(statusFilter || priorityFilter || organizationFilter) && ` (filtered)`}
      </div>

      {/* Bulk Action Confirmation Dialog */}
      <ConfirmDialog
        isOpen={bulkActionDialog.isOpen}
        title={bulkActionDialog.title}
        message={bulkActionDialog.message}
        confirmLabel="Close Tickets"
        cancelLabel="Cancel"
        isLoading={bulkCloseTicketsMutation.isPending}
        showReasonInput={bulkActionDialog.showReasonInput}
        onConfirm={confirmBulkAction}
        onCancel={() => {
          setBulkActionDialog({ isOpen: false, actionId: '', selectedTickets: [], title: '', message: '' });
          setBulkResolution('');
        }}
        details={{
          'Selected Tickets': bulkActionDialog.selectedTickets.length,
          'Action': 'Close with resolution',
        }}
      />
    </div>
  );
}
