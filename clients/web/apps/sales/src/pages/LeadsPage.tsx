import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth, canModifySales, apiConfig } from '@tamshai/auth';
import { ApprovalCard, TruncationWarning, DataTable, ConfirmDialog } from '@tamshai/ui';
import type { ColumnDef, BulkAction } from '@tamshai/ui';
import LeadConversionWizard from '../components/LeadConversionWizard';
import type { Lead, APIResponse } from '../types';

/**
 * Leads Page
 *
 * Features:
 * - Lead list with scoring visualization
 * - Status filtering and search
 * - Bulk actions: Convert, Update Status, Export (Enterprise UX)
 * - Convert to Opportunity action (sales-write)
 * - v1.4 confirmation flow
 * - Truncation warnings
 */

const LEAD_STATUSES = [
  { value: 'NEW', label: 'New', color: 'badge-primary' },
  { value: 'CONTACTED', label: 'Contacted', color: 'badge-info' },
  { value: 'QUALIFIED', label: 'Qualified', color: 'badge-success' },
  { value: 'CONVERTED', label: 'Converted', color: 'badge-secondary' },
  { value: 'DISQUALIFIED', label: 'Disqualified', color: 'badge-danger' },
];

export default function LeadsPage() {
  const queryClient = useQueryClient();
  const { userContext, getAccessToken } = useAuth();
  const canWrite = canModifySales(userContext);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [scoreFilter, setScoreFilter] = useState<string>('');

  // Selection state for DataTable
  const [selectedRows, setSelectedRows] = useState<string[]>([]);

  // Confirmation states
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    confirmationId: string;
    message: string;
    lead: Lead;
  } | null>(null);

  // Bulk action confirmation dialog
  const [bulkActionDialog, setBulkActionDialog] = useState<{
    isOpen: boolean;
    actionId: string;
    selectedLeads: Lead[];
    title: string;
    message: string;
  }>({ isOpen: false, actionId: '', selectedLeads: [], title: '', message: '' });

  // Lead conversion wizard state
  const [convertingLead, setConvertingLead] = useState<Lead | null>(null);

  // Fetch leads
  const { data: leadsResponse, isLoading, error, refetch } = useQuery({
    queryKey: ['leads'],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/sales/list_leads`
        : '/api/mcp/sales/list_leads';

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch leads');
      return response.json() as Promise<APIResponse<Lead[]>>;
    },
  });

  // Convert lead mutation
  const convertMutation = useMutation({
    mutationFn: async (leadId: string) => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/sales/convert_lead`
        : '/api/mcp/sales/convert_lead';

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ leadId }),
      });
      if (!response.ok) throw new Error('Failed to convert lead');
      return response.json() as Promise<APIResponse<Lead>>;
    },
    onSuccess: (data, leadId) => {
      if (data.status === 'pending_confirmation') {
        const lead = leads.find((l) => l._id === leadId);
        if (lead) {
          setPendingConfirmation({
            confirmationId: data.confirmationId!,
            message: data.message || `Convert ${lead.company_name} lead to opportunity?`,
            lead,
          });
        }
      } else {
        queryClient.invalidateQueries({ queryKey: ['leads'] });
      }
    },
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ leadId, status }: { leadId: string; status: string }) => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/sales/update_lead`
        : '/api/mcp/sales/update_lead';

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ leadId, status }),
      });
      if (!response.ok) throw new Error('Failed to update lead');
      return response.json() as Promise<APIResponse<Lead>>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });

  // Bulk update status mutation
  const bulkUpdateStatusMutation = useMutation({
    mutationFn: async ({ leadIds, status }: { leadIds: string[]; status: string }) => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      // Execute sequentially for now (could be parallelized with Promise.all)
      for (const leadId of leadIds) {
        const url = apiConfig.mcpGatewayUrl
          ? `${apiConfig.mcpGatewayUrl}/api/mcp/sales/update_lead`
          : '/api/mcp/sales/update_lead';

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ leadId, status }),
        });
        if (!response.ok) throw new Error(`Failed to update lead ${leadId}`);
      }
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setSelectedRows([]);
    },
  });

  const leads = leadsResponse?.data || [];
  const isTruncated = leadsResponse?.metadata?.truncated;

  // Filter leads
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      if (statusFilter && lead.status !== statusFilter) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (
          !lead.company_name.toLowerCase().includes(query) &&
          !lead.contact_name.toLowerCase().includes(query) &&
          !lead.contact_email.toLowerCase().includes(query)
        ) {
          return false;
        }
      }
      if (scoreFilter) {
        if (scoreFilter === 'high' && lead.score.total < 70) return false;
        if (scoreFilter === 'medium' && (lead.score.total < 40 || lead.score.total >= 70)) return false;
        if (scoreFilter === 'low' && lead.score.total >= 40) return false;
      }
      return true;
    });
  }, [leads, statusFilter, searchQuery, scoreFilter]);

  // Calculate stats
  const stats = useMemo(() => {
    const total = filteredLeads.length;
    const byStatus = LEAD_STATUSES.reduce((acc, status) => {
      acc[status.value] = filteredLeads.filter((l) => l.status === status.value).length;
      return acc;
    }, {} as Record<string, number>);
    const avgScore = total > 0
      ? Math.round(filteredLeads.reduce((sum, l) => sum + l.score.total, 0) / total)
      : 0;
    return { total, byStatus, avgScore };
  }, [filteredLeads]);

  // Get score color
  const getScoreColor = (score: number): string => {
    if (score >= 70) return 'text-success-600';
    if (score >= 40) return 'text-warning-600';
    return 'text-danger-600';
  };

  const getScoreBarColor = (score: number): string => {
    if (score >= 70) return 'bg-success-500';
    if (score >= 40) return 'bg-warning-500';
    return 'bg-danger-500';
  };

  // Format date
  const formatDate = (dateString: string): string => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Handle confirmation complete
  const handleConfirmationComplete = (success: boolean) => {
    setPendingConfirmation(null);
    if (success) {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    }
  };

  // Clear filters
  const clearFilters = () => {
    setStatusFilter('');
    setSearchQuery('');
    setScoreFilter('');
  };

  // DataTable columns
  const columns: ColumnDef<Lead>[] = [
    {
      id: 'company',
      header: 'Company',
      accessor: 'company_name',
      sortable: true,
      cell: (value, row) => (
        <div>
          <p className="font-medium text-secondary-900">{String(value)}</p>
          {row.industry && (
            <p className="text-sm text-secondary-500">{row.industry}</p>
          )}
        </div>
      ),
    },
    {
      id: 'contact',
      header: 'Contact',
      accessor: 'contact_name',
      sortable: true,
      cell: (value, row) => (
        <div>
          <p className="font-medium">{String(value)}</p>
          <a
            href={`mailto:${row.contact_email}`}
            className="text-sm text-primary-600 hover:underline"
          >
            {row.contact_email}
          </a>
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      accessor: 'status',
      sortable: true,
      cell: (value, row) => {
        const status = LEAD_STATUSES.find((s) => s.value === value);
        if (canWrite && value !== 'CONVERTED' && value !== 'DISQUALIFIED') {
          return (
            <select
              value={String(value)}
              onChange={(e) => updateStatusMutation.mutate({ leadId: row._id, status: e.target.value })}
              className={`text-sm px-2 py-1 rounded ${status?.color || 'badge-secondary'}`}
              data-testid="status-select"
            >
              {LEAD_STATUSES.filter((s) => s.value !== 'CONVERTED').map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          );
        }
        return (
          <span className={status?.color || 'badge-secondary'} data-testid="status-badge">
            {status?.label || String(value)}
          </span>
        );
      },
    },
    {
      id: 'score',
      header: 'Score',
      accessor: (row) => row.score.total,
      sortable: true,
      cell: (value, row) => (
        <div className="flex items-center gap-2">
          <div className="w-16">
            <div className="h-2 bg-secondary-200 rounded-full overflow-hidden">
              <div
                className={`h-full ${getScoreBarColor(row.score.total)} transition-all`}
                style={{ width: `${row.score.total}%` }}
              />
            </div>
          </div>
          <span className={`text-sm font-medium ${getScoreColor(row.score.total)}`}>
            {row.score.total}
          </span>
        </div>
      ),
    },
    {
      id: 'source',
      header: 'Source',
      accessor: 'source',
      sortable: true,
      cell: (value) => <span className="text-sm text-secondary-600">{String(value)}</span>,
    },
    {
      id: 'owner',
      header: 'Owner',
      accessor: 'owner_name',
      sortable: true,
      cell: (value) => <span className="text-sm">{String(value || '-')}</span>,
    },
    {
      id: 'last_activity',
      header: 'Last Activity',
      accessor: (row) => row.last_activity_date || row.updated_at,
      sortable: true,
      cell: (value) => (
        <span className="text-sm text-secondary-600">{formatDate(String(value))}</span>
      ),
    },
  ];

  // Bulk actions
  const bulkActions: BulkAction[] = [
    {
      id: 'bulk_qualify',
      label: 'Mark Qualified',
      variant: 'primary',
      requiresConfirmation: true,
    },
    {
      id: 'bulk_disqualify',
      label: 'Disqualify',
      variant: 'danger',
      requiresConfirmation: true,
    },
    {
      id: 'export',
      label: 'Export CSV',
      variant: 'neutral',
    },
  ];

  // Handle bulk actions
  const handleBulkAction = (actionId: string, selectedLeads: Lead[]) => {
    if (actionId === 'bulk_qualify') {
      setBulkActionDialog({
        isOpen: true,
        actionId,
        selectedLeads,
        title: 'Mark Leads as Qualified',
        message: `Are you sure you want to mark ${selectedLeads.length} lead(s) as Qualified? This will update their status and make them eligible for conversion.`,
      });
    } else if (actionId === 'bulk_disqualify') {
      setBulkActionDialog({
        isOpen: true,
        actionId,
        selectedLeads,
        title: 'Disqualify Leads',
        message: `Are you sure you want to disqualify ${selectedLeads.length} lead(s)? This action indicates these leads are not a good fit.`,
      });
    } else if (actionId === 'export') {
      // Export to CSV
      const headers = ['Company', 'Contact', 'Email', 'Status', 'Score', 'Source', 'Owner'];
      const rows = selectedLeads.map((lead) => [
        lead.company_name,
        lead.contact_name,
        lead.contact_email,
        lead.status,
        lead.score.total.toString(),
        lead.source,
        lead.owner_name || '',
      ]);
      const csvContent = [headers, ...rows].map((row) => row.join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leads-export-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setSelectedRows([]);
    }
  };

  // Confirm bulk action
  const confirmBulkAction = () => {
    const { actionId, selectedLeads } = bulkActionDialog;
    if (actionId === 'bulk_qualify') {
      bulkUpdateStatusMutation.mutate({
        leadIds: selectedLeads.map((l) => l._id),
        status: 'QUALIFIED',
      });
    } else if (actionId === 'bulk_disqualify') {
      bulkUpdateStatusMutation.mutate({
        leadIds: selectedLeads.map((l) => l._id),
        status: 'DISQUALIFIED',
      });
    }
    setBulkActionDialog({ isOpen: false, actionId: '', selectedLeads: [], title: '', message: '' });
  };

  // Row actions renderer
  const renderRowActions = (lead: Lead) => {
    if (lead.status === 'QUALIFIED') {
      return (
        <button
          onClick={() => setConvertingLead(lead)}
          className="text-success-600 hover:text-success-700 text-sm font-medium"
          data-testid="convert-button"
        >
          Convert
        </button>
      );
    }
    return null;
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="page-container" data-testid="leads-loading">
        <div className="page-header">
          <div className="h-8 w-48 bg-secondary-200 rounded animate-pulse"></div>
        </div>
        <div className="card">
          {[1, 2, 3, 4, 5].map((i) => (
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
          <h3 className="font-semibold mb-2">Error Loading Leads</h3>
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
            <h2 className="page-title">Lead Management</h2>
            <p className="page-subtitle">Track and qualify sales leads</p>
          </div>
          {canWrite && (
            <button className="btn-primary">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Lead
            </button>
          )}
        </div>
      </div>

      {/* Pending Confirmation */}
      {pendingConfirmation && (
        <div className="mb-6" data-testid="confirmation-dialog">
          <ApprovalCard
            confirmationId={pendingConfirmation.confirmationId}
            message={pendingConfirmation.message}
            confirmationData={{
              action: 'convert',
              companyName: pendingConfirmation.lead.company_name,
              contactName: pendingConfirmation.lead.contact_name,
              score: pendingConfirmation.lead.score.total,
            }}
            onComplete={handleConfirmationComplete}
          />
        </div>
      )}

      {/* Truncation Warning */}
      {isTruncated && leadsResponse?.metadata && (
        <div className="mb-6" data-testid="truncation-warning">
          <TruncationWarning
            message={leadsResponse.metadata.warning || 'Results truncated to 50 records'}
            returnedCount={50}
            totalEstimate={leadsResponse.metadata.totalCount || '50+'}
          />
        </div>
      )}

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div className="card" data-testid="total-leads">
          <h3 className="text-sm font-medium text-secondary-600">Total Leads</h3>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="card" data-testid="new-leads">
          <h3 className="text-sm font-medium text-secondary-600">New</h3>
          <p className="text-2xl font-bold text-primary-600">{stats.byStatus['NEW'] || 0}</p>
        </div>
        <div className="card" data-testid="qualified-leads">
          <h3 className="text-sm font-medium text-secondary-600">Qualified</h3>
          <p className="text-2xl font-bold text-success-600">{stats.byStatus['QUALIFIED'] || 0}</p>
        </div>
        <div className="card" data-testid="converted-leads">
          <h3 className="text-sm font-medium text-secondary-600">Converted</h3>
          <p className="text-2xl font-bold text-secondary-600">{stats.byStatus['CONVERTED'] || 0}</p>
        </div>
        <div className="card" data-testid="avg-score">
          <h3 className="text-sm font-medium text-secondary-600">Avg Score</h3>
          <p className={`text-2xl font-bold ${getScoreColor(stats.avgScore)}`}>{stats.avgScore}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-1">Search</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Company, contact, or email..."
              className="input"
              data-testid="search-filter"
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
              {LEAD_STATUSES.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-1">Score</label>
            <select
              value={scoreFilter}
              onChange={(e) => setScoreFilter(e.target.value)}
              className="input"
              data-testid="score-filter"
            >
              <option value="">All Scores</option>
              <option value="high">High (70+)</option>
              <option value="medium">Medium (40-69)</option>
              <option value="low">Low (&lt;40)</option>
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={clearFilters} className="btn-secondary w-full">
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Leads Table with DataTable */}
      <div className="card overflow-hidden">
        {filteredLeads.length === 0 ? (
          <div className="py-12 text-center" data-testid="empty-state">
            <svg className="w-12 h-12 mx-auto text-secondary-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p className="text-secondary-600">No leads found matching your filters</p>
            <button onClick={clearFilters} className="btn-primary mt-4">
              Clear Filters
            </button>
          </div>
        ) : (
          <DataTable<Lead>
            data={filteredLeads}
            columns={columns}
            keyField="_id"
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

      {/* Score Legend */}
      <div className="mt-6 text-sm text-secondary-600">
        <p className="font-medium mb-2">Lead Score Legend:</p>
        <div className="flex gap-6">
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-success-500"></span>
            High (70+): Strong fit, ready to convert
          </span>
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-warning-500"></span>
            Medium (40-69): Needs nurturing
          </span>
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-danger-500"></span>
            Low (&lt;40): May not be qualified
          </span>
        </div>
      </div>

      {/* Bulk Action Confirmation Dialog */}
      <ConfirmDialog
        isOpen={bulkActionDialog.isOpen}
        title={bulkActionDialog.title}
        message={bulkActionDialog.message}
        confirmLabel={bulkActionDialog.actionId === 'bulk_disqualify' ? 'Disqualify' : 'Confirm'}
        cancelLabel="Cancel"
        isLoading={bulkUpdateStatusMutation.isPending}
        onConfirm={confirmBulkAction}
        onCancel={() => setBulkActionDialog({ isOpen: false, actionId: '', selectedLeads: [], title: '', message: '' })}
        details={{
          'Selected Leads': bulkActionDialog.selectedLeads.length,
          'Action': bulkActionDialog.actionId === 'bulk_qualify' ? 'Mark as Qualified' : 'Disqualify',
        }}
      />

      {/* Lead Conversion Wizard */}
      {convertingLead && (
        <LeadConversionWizard
          lead={convertingLead}
          onClose={() => setConvertingLead(null)}
          onComplete={() => {
            setConvertingLead(null);
            queryClient.invalidateQueries({ queryKey: ['leads'] });
            queryClient.invalidateQueries({ queryKey: ['opportunities'] });
            queryClient.invalidateQueries({ queryKey: ['customers'] });
          }}
        />
      )}
    </div>
  );
}
