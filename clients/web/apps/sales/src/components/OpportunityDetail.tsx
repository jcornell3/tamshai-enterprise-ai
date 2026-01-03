import { useEffect, useCallback, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth, apiConfig } from '@tamshai/auth';
import { ApprovalCard } from '@tamshai/ui';
import CloseOpportunityModal from './CloseOpportunityModal';
import type { Opportunity, Customer, APIResponse } from '../types';

/**
 * Opportunity Detail Modal
 *
 * Features:
 * - Display opportunity details (title, value, stage, probability)
 * - Stage timeline visualization
 * - Customer information section
 * - Close as Won/Lost buttons (for open opportunities, sales-write only)
 * - Delete button (sales-write only)
 * - Modal behavior (close on X, backdrop click, ESC)
 */

interface OpportunityDetailProps {
  opportunity: Opportunity;
  onClose: () => void;
  canWrite: boolean;
  onCustomerClick?: (customerId: string) => void;
}

const STAGE_ORDER = ['LEAD', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST'] as const;

export default function OpportunityDetail({
  opportunity,
  onClose,
  canWrite,
  onCustomerClick,
}: OpportunityDetailProps) {
  const { getAccessToken } = useAuth();
  const queryClient = useQueryClient();
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    confirmationId: string;
    message: string;
  } | null>(null);

  // Fetch customer details
  const { data: customerResponse, isLoading: customerLoading, error: customerError } = useQuery({
    queryKey: ['customer', opportunity.customer_id],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/sales/get_customer/${opportunity.customer_id}`
        : `/api/mcp/sales/get_customer/${opportunity.customer_id}`;

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch customer');
      }

      return response.json() as Promise<APIResponse<Customer>>;
    },
    enabled: !!opportunity.customer_id,
  });

  // Delete opportunity mutation
  const deleteOpportunityMutation = useMutation({
    mutationFn: async () => {
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
          body: JSON.stringify({ opportunityId: opportunity._id }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to delete opportunity');
      }

      return response.json() as Promise<APIResponse<any>>;
    },
    onSuccess: (data) => {
      if (data.status === 'pending_confirmation') {
        setPendingConfirmation({
          confirmationId: data.confirmationId!,
          message: data.message || 'Delete opportunity?',
        });
      } else {
        queryClient.invalidateQueries({ queryKey: ['opportunities'] });
        onClose();
      }
    },
  });

  const customer = customerResponse?.data;

  // Handle ESC key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

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
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      onClose();
    }
  };

  const handleCloseSuccess = () => {
    setShowCloseModal(false);
    queryClient.invalidateQueries({ queryKey: ['opportunities'] });
    onClose();
  };

  const isOpen = !['CLOSED_WON', 'CLOSED_LOST'].includes(opportunity.stage);
  const weightedValue = Math.round((opportunity.value || 0) * (opportunity.probability || 0) / 100);

  // Stage colors and labels
  const getStageStyle = (stage: string) => {
    switch (stage) {
      case 'CLOSED_WON':
        return 'bg-green-100 text-green-800 border-green-500';
      case 'CLOSED_LOST':
        return 'bg-red-100 text-red-800 border-red-500';
      case 'NEGOTIATION':
        return 'bg-orange-100 text-orange-800 border-orange-500';
      case 'PROPOSAL':
        return 'bg-yellow-100 text-yellow-800 border-yellow-500';
      case 'QUALIFIED':
        return 'bg-blue-100 text-blue-800 border-blue-500';
      case 'LEAD':
        return 'bg-gray-100 text-gray-800 border-gray-500';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-500';
    }
  };

  // Format date
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Current stage index for timeline
  const currentStageIndex = STAGE_ORDER.indexOf(opportunity.stage as typeof STAGE_ORDER[number]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
        onClick={handleBackdropClick}
        role="dialog"
        aria-modal="true"
        aria-labelledby="opportunity-title"
        data-testid="opportunity-detail-modal"
      >
        {/* Modal */}
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="px-6 py-4 border-b border-secondary-200 flex justify-between items-start">
            <div>
              <h2
                id="opportunity-title"
                className="text-xl font-semibold text-secondary-900"
              >
                {opportunity.title}
              </h2>
              <span className={`inline-block mt-2 px-3 py-1 rounded-full text-sm font-medium ${getStageStyle(opportunity.stage)}`}>
                {opportunity.stage.replace('_', ' ')}
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-secondary-400 hover:text-secondary-600"
              aria-label="Close"
              data-testid="close-button"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
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
                  action: 'delete_opportunity',
                  title: opportunity.title,
                  value: `$${opportunity.value?.toLocaleString() || 0}`,
                  stage: opportunity.stage,
                }}
                onComplete={handleConfirmationComplete}
              />
            </div>
          )}

          {/* Content */}
          <div className="px-6 py-4">
            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div>
                <p className="text-sm text-secondary-600">Deal Value</p>
                <p className="text-xl font-bold text-green-600">
                  ${opportunity.value?.toLocaleString() || 0}
                </p>
              </div>
              <div>
                <p className="text-sm text-secondary-600">Probability</p>
                <p className="text-xl font-bold text-secondary-900">
                  {opportunity.probability}%
                </p>
              </div>
              <div>
                <p className="text-sm text-secondary-600">Weighted Value</p>
                <p className="text-xl font-bold text-blue-600">
                  ${weightedValue.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-secondary-600">Owner</p>
                <p className="text-lg font-medium text-secondary-900">
                  {opportunity.owner_name || '-'}
                </p>
              </div>
            </div>

            {/* Expected/Actual Close Date */}
            <div className="mb-6">
              {isOpen ? (
                opportunity.expected_close_date && (
                  <p className="text-secondary-600">
                    <span className="font-medium">Expected Close:</span>{' '}
                    {formatDate(opportunity.expected_close_date)}
                  </p>
                )
              ) : (
                <p className="text-secondary-600">
                  <span className="font-medium">Closed:</span>{' '}
                  {formatDate(opportunity.updated_at)}
                </p>
              )}
            </div>

            {/* Stage Timeline */}
            <div className="mb-6" data-testid="stage-timeline">
              <h3 className="text-sm font-medium text-secondary-700 mb-3">Stage Progression</h3>
              <div className="flex items-center justify-between">
                {STAGE_ORDER.slice(0, 4).map((stage, index) => {
                  const isCompleted = index < currentStageIndex || opportunity.stage === 'CLOSED_WON';
                  const isCurrent = stage === opportunity.stage;
                  return (
                    <div key={stage} className="flex-1 flex items-center">
                      <div className="flex flex-col items-center">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                            isCurrent
                              ? 'bg-primary-600 text-white'
                              : isCompleted
                              ? 'bg-green-600 text-white'
                              : 'bg-secondary-200 text-secondary-600'
                          }`}
                          data-testid={`timeline-${stage.toLowerCase()}`}
                        >
                          {isCompleted && !isCurrent ? (
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          ) : (
                            index + 1
                          )}
                        </div>
                        <span className="text-xs mt-1 text-secondary-600">{stage}</span>
                      </div>
                      {index < 3 && (
                        <div className={`flex-1 h-1 mx-2 ${
                          isCompleted ? 'bg-green-600' : 'bg-secondary-200'
                        }`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Customer Information */}
            <div className="border-t border-secondary-200 pt-4">
              <h3 className="text-sm font-medium text-secondary-700 mb-3">Customer Information</h3>
              {customerLoading ? (
                <div className="flex items-center gap-2" data-testid="customer-loading">
                  <div className="spinner w-4 h-4"></div>
                  <span className="text-secondary-600">Loading customer...</span>
                </div>
              ) : customerError ? (
                <div className="text-red-600" data-testid="customer-error">
                  Failed to load customer information
                </div>
              ) : customer ? (
                <div className="bg-secondary-50 p-4 rounded-lg">
                  <p className="font-medium text-secondary-900">
                    <button
                      onClick={() => onCustomerClick?.(customer._id)}
                      className="text-primary-600 hover:text-primary-700 hover:underline"
                      data-testid="customer-link"
                    >
                      {customer.company_name}
                    </button>
                  </p>
                  {customer.primary_contact && (
                    <div className="mt-2 text-sm text-secondary-600">
                      <p>{customer.primary_contact.name}</p>
                      <p>
                        <a
                          href={`mailto:${customer.primary_contact.email}`}
                          className="text-primary-600 hover:underline"
                        >
                          {customer.primary_contact.email}
                        </a>
                      </p>
                      {customer.primary_contact.phone && (
                        <p>
                          <a
                            href={`tel:${customer.primary_contact.phone}`}
                            className="text-primary-600 hover:underline"
                          >
                            {customer.primary_contact.phone}
                          </a>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-secondary-600">
                  {opportunity.customer_name || 'No customer information'}
                </p>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="px-6 py-4 border-t border-secondary-200 flex justify-between items-center bg-secondary-50">
            <div>
              {canWrite && !isOpen && (
                <span className="text-sm text-secondary-500">
                  This opportunity is closed
                </span>
              )}
            </div>
            <div className="flex gap-2">
              {canWrite && (
                <button
                  onClick={() => deleteOpportunityMutation.mutate()}
                  disabled={deleteOpportunityMutation.isPending}
                  className="btn-danger text-sm"
                  data-testid="delete-button"
                >
                  Delete
                </button>
              )}
              {canWrite && isOpen && (
                <>
                  <button
                    onClick={() => setShowCloseModal(true)}
                    className="btn-primary text-sm"
                    data-testid="close-as-won-button"
                  >
                    Close as Won
                  </button>
                  <button
                    onClick={() => setShowCloseModal(true)}
                    className="btn-secondary text-sm"
                    data-testid="close-as-lost-button"
                  >
                    Close as Lost
                  </button>
                </>
              )}
              <button
                onClick={onClose}
                className="btn-outline text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Close Opportunity Modal */}
      {showCloseModal && (
        <CloseOpportunityModal
          opportunity={opportunity}
          onClose={() => setShowCloseModal(false)}
          onSuccess={handleCloseSuccess}
        />
      )}
    </>
  );
}
