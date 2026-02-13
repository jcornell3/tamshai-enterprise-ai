import { useEffect, useCallback, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth, apiConfig } from '@tamshai/auth';
import { ApprovalCard } from '@tamshai/ui';
import OpportunityDetail from './OpportunityDetail';
import type { Customer, Opportunity, APIResponse, Contact } from '../types';

/**
 * Customer Detail Modal
 *
 * Features:
 * - Display company information (name, industry, website, address)
 * - Contact information section (primary + additional contacts)
 * - Opportunities list for the customer
 * - Revenue and pipeline metrics
 * - Delete customer with v1.4 confirmation flow
 * - Modal behavior (close on X, backdrop click, ESC)
 */

interface CustomerDetailProps {
  customer: Customer;
  onClose: () => void;
  canWrite: boolean;
}

export default function CustomerDetail({
  customer,
  onClose,
  canWrite,
}: CustomerDetailProps) {
  const { getAccessToken } = useAuth();
  const queryClient = useQueryClient();
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    confirmationId: string;
    message: string;
  } | null>(null);

  // Fetch customer opportunities
  const {
    data: opportunitiesResponse,
    isLoading: opportunitiesLoading,
    error: opportunitiesError,
    refetch: refetchOpportunities,
  } = useQuery({
    queryKey: ['customer-opportunities', customer._id],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/sales/list_opportunities?customerId=${customer._id}`
        : `/api/mcp/sales/list_opportunities?customerId=${customer._id}`;

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch opportunities');
      }

      return response.json() as Promise<APIResponse<Opportunity[]>>;
    },
  });

  // Delete customer mutation
  const deleteCustomerMutation = useMutation({
    mutationFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/mcp/sales/delete_customer`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ customerId: customer._id }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to delete customer');
      }

      return response.json() as Promise<APIResponse<any>>;
    },
    onSuccess: (data) => {
      if (data.status === 'pending_confirmation') {
        setPendingConfirmation({
          confirmationId: data.confirmationId!,
          message: data.message || `Delete customer ${customer.company_name}?`,
        });
      } else {
        queryClient.invalidateQueries({ queryKey: ['customers'] });
        onClose();
      }
    },
  });

  const opportunities = opportunitiesResponse?.data || [];

  // Calculate metrics
  const totalDeals = opportunities.length;
  const wonDeals = opportunities.filter(o => o.stage === 'CLOSED_WON');
  const totalRevenue = wonDeals.reduce((sum, o) => sum + (o.value || 0), 0);
  const activeDeals = opportunities.filter(
    o => !['CLOSED_WON', 'CLOSED_LOST'].includes(o.stage)
  );
  const pipelineValue = activeDeals.reduce((sum, o) => sum + (o.value || 0), 0);

  // Handle ESC key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleConfirmationComplete = (success: boolean) => {
    setPendingConfirmation(null);
    if (success) {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      onClose();
    }
  };

  // Format customer since date
  const formatCustomerSince = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
    });
  };

  // Get stage style for opportunity badges
  const getStageStyle = (stage: string) => {
    switch (stage) {
      case 'CLOSED_WON':
        return 'bg-green-100 text-green-800';
      case 'CLOSED_LOST':
        return 'bg-red-100 text-red-800';
      case 'NEGOTIATION':
        return 'bg-orange-100 text-orange-800';
      case 'PROPOSAL':
        return 'bg-yellow-100 text-yellow-800';
      case 'QUALIFIED':
        return 'bg-blue-100 text-blue-800';
      case 'LEAD':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Get all contacts (primary + additional)
  const allContacts: Contact[] = [];
  if (customer.primary_contact) {
    allContacts.push({
      name: customer.primary_contact.name,
      email: customer.primary_contact.email,
      phone: customer.primary_contact.phone,
      role: 'Primary Contact',
    });
  }
  if (customer.contacts) {
    allContacts.push(...customer.contacts);
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
        onClick={handleBackdropClick}
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-title"
        data-testid="customer-detail-modal"
      >
        {/* Modal */}
        <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="px-6 py-4 border-b border-secondary-200 flex justify-between items-start">
            <div>
              <h2
                id="customer-title"
                className="text-xl font-semibold text-secondary-900"
              >
                {customer.company_name}
              </h2>
              <span className="inline-block mt-2 px-3 py-1 rounded-full text-sm font-medium bg-secondary-100 text-secondary-800">
                {customer.industry}
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-secondary-400 hover:text-secondary-600"
              aria-label="Close"
              data-testid="close-button"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Pending Confirmation */}
          {pendingConfirmation && (
            <div className="px-6 py-4">
              <ApprovalCard
                confirmationId={pendingConfirmation.confirmationId}
                message={pendingConfirmation.message}
                confirmationData={{
                  action: 'delete_customer',
                  companyName: customer.company_name,
                  industry: customer.industry,
                  activeOpportunities: activeDeals.length,
                }}
                onComplete={handleConfirmationComplete}
              />
            </div>
          )}

          {/* Content */}
          <div className="px-6 py-4">
            {/* Company Information */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-secondary-700 mb-3">
                Company Information
              </h3>
              <div className="bg-secondary-50 p-4 rounded-lg space-y-2">
                {customer.website && (
                  <p>
                    <span className="text-secondary-600">Website: </span>
                    <a
                      href={customer.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 hover:underline"
                      data-testid="website-link"
                    >
                      {customer.website}
                    </a>
                  </p>
                )}
                {customer.address && customer.address.city && (
                  <p className="text-secondary-700">
                    <span className="text-secondary-600">Address: </span>
                    {customer.address.city}, {customer.address.state},{' '}
                    {customer.address.country}
                  </p>
                )}
                <p className="text-secondary-700">
                  <span className="text-secondary-600">Customer since: </span>
                  {formatCustomerSince(customer.created_at)}
                </p>
              </div>
            </div>

            {/* Contact Information */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-secondary-700 mb-3">
                Contact Information
              </h3>
              {allContacts.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th className="table-header">Name</th>
                        <th className="table-header">Role</th>
                        <th className="table-header">Email</th>
                        <th className="table-header">Phone</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-secondary-200">
                      {allContacts.map((contact, index) => (
                        <tr key={index} className="table-row">
                          <td className="table-cell font-medium">
                            {contact.name}
                          </td>
                          <td className="table-cell text-secondary-600">
                            {contact.role || '-'}
                          </td>
                          <td className="table-cell">
                            <a
                              href={`mailto:${contact.email}`}
                              className="text-primary-600 hover:underline"
                            >
                              {contact.email}
                            </a>
                          </td>
                          <td className="table-cell">
                            {contact.phone ? (
                              <a
                                href={`tel:${contact.phone}`}
                                className="text-primary-600 hover:underline"
                              >
                                {contact.phone}
                              </a>
                            ) : (
                              <span className="text-secondary-400">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-secondary-600 bg-secondary-50 p-4 rounded-lg">
                  No contact information available
                </p>
              )}
            </div>

            {/* Opportunities Section */}
            <div className="border-t border-secondary-200 pt-4">
              <h3 className="text-sm font-medium text-secondary-700 mb-3">
                Opportunities
              </h3>

              {/* Metrics */}
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="bg-secondary-50 p-3 rounded-lg text-center">
                  <p className="text-2xl font-bold text-secondary-900">
                    {totalDeals} Deals
                  </p>
                  <p className="text-sm text-secondary-600">Total</p>
                </div>
                <div className="bg-green-50 p-3 rounded-lg text-center" data-testid="total-revenue-card">
                  <p className="text-2xl font-bold text-green-600">
                    ${totalRevenue.toLocaleString()}
                  </p>
                  <p className="text-sm text-secondary-600">Total Revenue</p>
                </div>
                <div className="bg-blue-50 p-3 rounded-lg text-center" data-testid="pipeline-card">
                  <p className="text-2xl font-bold text-blue-600">
                    ${pipelineValue.toLocaleString()}
                  </p>
                  <p className="text-sm text-secondary-600">in Pipeline</p>
                </div>
              </div>

              {/* Opportunities List */}
              {opportunitiesLoading ? (
                <div
                  className="flex items-center gap-2 py-4"
                  data-testid="opportunities-loading"
                >
                  <div className="spinner w-4 h-4"></div>
                  <span className="text-secondary-600">
                    Loading opportunities...
                  </span>
                </div>
              ) : opportunitiesError ? (
                <div className="alert-danger" data-testid="opportunities-error">
                  <p className="font-medium">
                    Failed to load opportunities
                  </p>
                  <button
                    onClick={() => refetchOpportunities()}
                    className="btn-primary mt-2 text-sm"
                  >
                    Retry
                  </button>
                </div>
              ) : opportunities.length === 0 ? (
                <div
                  className="text-center py-6 text-secondary-600 bg-secondary-50 rounded-lg"
                  data-testid="no-opportunities"
                >
                  <p className="mb-2">No deals yet</p>
                  <p className="text-sm">
                    Create an opportunity to start tracking deals with this
                    customer.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th className="table-header">Title</th>
                        <th className="table-header">Value</th>
                        <th className="table-header">Stage</th>
                        <th className="table-header">Owner</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-secondary-200">
                      {opportunities.map((opp) => (
                        <tr
                          key={opp._id}
                          className="table-row cursor-pointer hover:bg-secondary-50"
                          onClick={() => setSelectedOpportunity(opp)}
                          data-testid={`opportunity-${opp._id}`}
                        >
                          <td className="table-cell font-medium text-primary-600 hover:underline">
                            {opp.title}
                          </td>
                          <td className="table-cell font-medium text-green-600">
                            ${opp.value?.toLocaleString()}
                          </td>
                          <td className="table-cell">
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium ${getStageStyle(
                                opp.stage
                              )}`}
                            >
                              {opp.stage.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="table-cell text-secondary-600">
                            {opp.owner_name || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="px-6 py-4 border-t border-secondary-200 flex justify-between items-center bg-secondary-50">
            <div>
              {canWrite && activeDeals.length > 0 && (
                <span className="text-sm text-warning-600">
                  Customer has {activeDeals.length} active deal
                  {activeDeals.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              {canWrite && (
                <button
                  onClick={() => deleteCustomerMutation.mutate()}
                  disabled={deleteCustomerMutation.isPending}
                  className="btn-danger text-sm"
                  data-testid="delete-button"
                >
                  Delete Customer
                </button>
              )}
              <button onClick={onClose} className="btn-outline text-sm">
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Opportunity Detail Modal */}
      {selectedOpportunity && (
        <OpportunityDetail
          opportunity={selectedOpportunity}
          onClose={() => setSelectedOpportunity(null)}
          canWrite={canWrite}
          onCustomerClick={() => {
            // Already on customer detail, just close opportunity
            setSelectedOpportunity(null);
          }}
        />
      )}
    </>
  );
}
