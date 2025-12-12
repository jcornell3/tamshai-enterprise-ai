import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth, canModifySales, apiConfig } from '@tamshai/auth';
import { ApprovalCard, TruncationWarning } from '@tamshai/ui';
import type { Opportunity, APIResponse } from '../types';

/**
 * Opportunities Page
 *
 * Features:
 * - Opportunities table with pipeline stage filtering
 * - Value column with currency formatting
 * - Delete opportunity with v1.4 confirmation flow
 * - Truncation warnings for 50+ records
 * - Cursor-based pagination
 */
export default function OpportunitiesPage() {
  const { userContext, getAccessToken } = useAuth();
  const queryClient = useQueryClient();
  const [stageFilter, setStageFilter] = useState('');
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    confirmationId: string;
    message: string;
    opportunity: Opportunity;
  } | null>(null);

  const canWrite = canModifySales(userContext);

  // Fetch all opportunities (auto-paginate to get complete results)
  const { data: opportunitiesResponse, isLoading, error } = useQuery({
    queryKey: ['opportunities', stageFilter],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      // Helper to build URL with cursor support
      const buildUrl = (cursor?: string): string => {
        const params = new URLSearchParams();
        if (stageFilter) params.append('status', stageFilter.toLowerCase());
        if (cursor) params.append('cursor', cursor);

        const queryString = params.toString();
        if (apiConfig.mcpGatewayUrl) {
          return `${apiConfig.mcpGatewayUrl}/api/mcp/sales/list_opportunities${queryString ? '?' + queryString : ''}`;
        } else {
          return `/api/mcp/sales/list_opportunities${queryString ? '?' + queryString : ''}`;
        }
      };

      // Fetch all pages automatically
      const allOpportunities: Opportunity[] = [];
      let cursor: string | undefined = undefined;
      let pageCount = 0;
      const maxPages = 10; // Safety limit to prevent infinite loops

      do {
        const response = await fetch(buildUrl(cursor), {
          headers: { 'Authorization': `Bearer ${token}` },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch opportunities');
        }

        const pageData = await response.json() as APIResponse<Opportunity[]>;

        if (pageData.data) {
          allOpportunities.push(...pageData.data);
        }

        // Get next cursor if more pages exist
        cursor = pageData.metadata?.hasMore ? pageData.metadata.nextCursor : undefined;
        pageCount++;

      } while (cursor && pageCount < maxPages);

      // Return combined results
      return {
        status: 'success' as const,
        data: allOpportunities,
        metadata: {
          hasMore: false,
          returnedCount: allOpportunities.length,
          totalEstimate: allOpportunities.length.toString(),
        }
      } as APIResponse<Opportunity[]>;
    },
  });

  // Delete opportunity mutation
  const deleteOpportunityMutation = useMutation({
    mutationFn: async (opportunityId: string) => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/mcp/sales/delete_opportunity`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ opportunityId }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to delete opportunity');
      }

      return response.json() as Promise<APIResponse<any>>;
    },
    onSuccess: (data) => {
      if (data.status === 'pending_confirmation') {
        // Show approval card
        const opportunity = opportunitiesResponse?.data?.find(
          (o) => o._id === data.confirmationId
        );
        setPendingConfirmation({
          confirmationId: data.confirmationId!,
          message: data.message || 'Delete opportunity?',
          opportunity: opportunity!,
        });
      } else {
        // Success - refresh list
        queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      }
    },
  });

  const handleDelete = (opportunity: Opportunity) => {
    if (confirm(`Delete opportunity "${opportunity.title}"?`)) {
      deleteOpportunityMutation.mutate(opportunity._id);
    }
  };

  const handleConfirmationComplete = (success: boolean) => {
    setPendingConfirmation(null);
    if (success) {
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
    }
  };

  const opportunities = opportunitiesResponse?.data || [];
  const isTruncated = opportunitiesResponse?.metadata?.hasMore || opportunitiesResponse?.metadata?.truncated || false;

  // Stage color mapping
  const getStageColor = (stage: string) => {
    switch (stage) {
      case 'LEAD':
        return 'bg-gray-100 text-gray-800';
      case 'QUALIFIED':
        return 'bg-blue-100 text-blue-800';
      case 'PROPOSAL':
        return 'bg-yellow-100 text-yellow-800';
      case 'NEGOTIATION':
        return 'bg-orange-100 text-orange-800';
      case 'CLOSED_WON':
        return 'bg-green-100 text-green-800';
      case 'CLOSED_LOST':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Calculate totals
  const totalPipelineValue = opportunities
    .filter(o => !['CLOSED_WON', 'CLOSED_LOST'].includes(o.stage))
    .reduce((sum, o) => sum + (o.value || 0), 0);

  const totalWonValue = opportunities
    .filter(o => o.stage === 'CLOSED_WON')
    .reduce((sum, o) => sum + (o.value || 0), 0);

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">Sales Opportunities</h2>
        <p className="page-subtitle">
          Manage and track your sales pipeline
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
              action: 'delete_opportunity',
              customerName: pendingConfirmation.opportunity.customer_name || 'Unknown',
              value: `$${pendingConfirmation.opportunity.value?.toLocaleString() || 0}`,
              stage: pendingConfirmation.opportunity.stage,
            }}
            onComplete={handleConfirmationComplete}
          />
        </div>
      )}

      {/* Truncation Warning */}
      {isTruncated && opportunitiesResponse?.metadata && (
        <div className="mb-6">
          <TruncationWarning
            message="More opportunities exist in the database than can be shown on one page."
            returnedCount={opportunitiesResponse.metadata.returnedCount || 50}
            totalEstimate={opportunitiesResponse.metadata.totalEstimate || opportunitiesResponse.metadata.totalCount || '50+'}
          />
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="card">
          <h3 className="text-sm font-medium text-secondary-600">Total Opportunities</h3>
          <p className="text-2xl font-bold text-secondary-900">{opportunities.length}</p>
        </div>
        <div className="card">
          <h3 className="text-sm font-medium text-secondary-600">Pipeline Value</h3>
          <p className="text-2xl font-bold text-green-600">${totalPipelineValue.toLocaleString()}</p>
        </div>
        <div className="card">
          <h3 className="text-sm font-medium text-secondary-600">Won Value</h3>
          <p className="text-2xl font-bold text-primary-600">${totalWonValue.toLocaleString()}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-secondary-700 mb-1">
              Filter by Stage
            </label>
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="input"
            >
              <option value="">All Stages</option>
              <option value="LEAD">Lead</option>
              <option value="QUALIFIED">Qualified</option>
              <option value="PROPOSAL">Proposal</option>
              <option value="NEGOTIATION">Negotiation</option>
              <option value="CLOSED_WON">Closed Won</option>
              <option value="CLOSED_LOST">Closed Lost</option>
            </select>
          </div>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['opportunities'] })}
            className="btn-secondary"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Opportunities Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center">
            <div className="spinner mb-4"></div>
            <p className="text-secondary-600">Loading opportunities...</p>
          </div>
        ) : error ? (
          <div className="alert-danger">
            <p className="font-medium">Error loading opportunities</p>
            <p className="text-sm">{String(error)}</p>
          </div>
        ) : opportunities.length === 0 ? (
          <div className="py-12 text-center text-secondary-600">
            <p>No opportunities found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="table-header">Title</th>
                  <th className="table-header">Customer</th>
                  <th className="table-header">Value</th>
                  <th className="table-header">Stage</th>
                  <th className="table-header">Probability</th>
                  <th className="table-header">Expected Close</th>
                  {canWrite && <th className="table-header">Actions</th>}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-secondary-200">
                {opportunities.map((opportunity) => (
                  <tr key={opportunity._id} className="table-row">
                    <td className="table-cell font-medium">
                      {opportunity.title}
                    </td>
                    <td className="table-cell text-secondary-600">
                      {opportunity.customer_name || '-'}
                    </td>
                    <td className="table-cell font-medium text-green-600">
                      ${opportunity.value?.toLocaleString() || 0}
                    </td>
                    <td className="table-cell">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStageColor(opportunity.stage)}`}>
                        {opportunity.stage.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="table-cell text-secondary-600">
                      {opportunity.probability}%
                    </td>
                    <td className="table-cell text-secondary-600">
                      {opportunity.expected_close_date
                        ? new Date(opportunity.expected_close_date).toLocaleDateString()
                        : '-'}
                    </td>
                    {canWrite && (
                      <td className="table-cell">
                        <button
                          onClick={() => handleDelete(opportunity)}
                          disabled={deleteOpportunityMutation.isPending || ['CLOSED_WON', 'CLOSED_LOST'].includes(opportunity.stage)}
                          className="text-danger-600 hover:text-danger-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                          title={['CLOSED_WON', 'CLOSED_LOST'].includes(opportunity.stage) ? 'Cannot delete closed opportunities' : 'Delete opportunity'}
                        >
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="mt-6 text-sm text-secondary-600 text-center">
        Showing {opportunities.length} opportunit{opportunities.length !== 1 ? 'ies' : 'y'}
        {stageFilter && ` in ${stageFilter.replace('_', ' ')} stage`}
      </div>
    </div>
  );
}
