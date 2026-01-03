import { useState, useEffect, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth, apiConfig } from '@tamshai/auth';
import { ApprovalCard } from '@tamshai/ui';
import type { Opportunity, APIResponse } from '../types';

/**
 * Close Opportunity Modal
 *
 * Features:
 * - Radio buttons for Won/Lost selection
 * - Optional reason/notes textarea
 * - v1.4 confirmation flow (pending_confirmation -> approve/reject)
 * - Confirm button disabled until Won/Lost selected
 * - Modal behavior (close on X, backdrop click, ESC)
 * - Loading and error states
 * - Accessibility (ARIA, keyboard navigation)
 */

interface CloseOpportunityModalProps {
  opportunity: Opportunity;
  onClose: () => void;
  onSuccess: () => void;
}

type CloseType = 'won' | 'lost' | null;

export default function CloseOpportunityModal({
  opportunity,
  onClose,
  onSuccess,
}: CloseOpportunityModalProps) {
  const { getAccessToken } = useAuth();
  const queryClient = useQueryClient();
  const [closeType, setCloseType] = useState<CloseType>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    confirmationId: string;
    message: string;
  } | null>(null);

  // Close opportunity mutation
  const closeOpportunityMutation = useMutation({
    mutationFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const stage = closeType === 'won' ? 'CLOSED_WON' : 'CLOSED_LOST';
      const probability = closeType === 'won' ? 100 : 0;

      const response = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/mcp/sales/update_opportunity`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            opportunityId: opportunity._id,
            stage,
            probability,
            closeReason: reason || undefined,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to close opportunity');
      }

      return response.json() as Promise<APIResponse<Opportunity>>;
    },
    onSuccess: (data) => {
      if (data.status === 'pending_confirmation') {
        setPendingConfirmation({
          confirmationId: data.confirmationId!,
          message:
            data.message ||
            `Mark "${opportunity.title}" as ${closeType === 'won' ? 'WON' : 'LOST'}?`,
        });
      } else if (data.status === 'success') {
        queryClient.invalidateQueries({ queryKey: ['opportunities'] });
        onSuccess();
      } else if (data.status === 'error') {
        setError(data.message || 'Failed to close opportunity');
      }
    },
    onError: (err: Error) => {
      if (err.message === 'CONFIRMATION_EXPIRED') {
        setError('Confirmation expired. Please try again.');
      } else {
        setError(err.message);
      }
    },
  });

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
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      onSuccess();
    }
    // If rejected, user can try again (modal stays open)
  };

  const handleSubmit = () => {
    setError(null);
    closeOpportunityMutation.mutate();
  };

  const isSubmitDisabled =
    closeType === null || closeOpportunityMutation.isPending;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="close-opportunity-title"
      data-testid="close-opportunity-modal"
    >
      {/* Modal */}
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="px-6 py-4 border-b border-secondary-200 flex justify-between items-start">
          <div>
            <h2
              id="close-opportunity-title"
              className="text-xl font-semibold text-secondary-900"
            >
              Close Deal
            </h2>
            <p className="text-sm text-secondary-600 mt-1">
              {opportunity.title}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-secondary-400 hover:text-secondary-600"
            aria-label="Close"
            data-testid="close-modal-button"
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
                action: closeType === 'won' ? 'close_as_won' : 'close_as_lost',
                title: opportunity.title,
                value: `$${opportunity.value?.toLocaleString() || 0}`,
                customer: opportunity.customer_name || 'Unknown',
                newStage: closeType === 'won' ? 'CLOSED_WON' : 'CLOSED_LOST',
              }}
              onComplete={handleConfirmationComplete}
            />
          </div>
        )}

        {/* Content */}
        {!pendingConfirmation && (
          <div className="px-6 py-4">
            {/* Opportunity Summary */}
            <div className="bg-secondary-50 p-4 rounded-lg mb-6">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-medium text-secondary-900">
                    {opportunity.customer_name}
                  </p>
                  <p className="text-sm text-secondary-600">
                    Current stage: {opportunity.stage.replace('_', ' ')}
                  </p>
                </div>
                <p className="text-xl font-bold text-green-600">
                  ${opportunity.value?.toLocaleString()}
                </p>
              </div>
            </div>

            {/* Won/Lost Selection */}
            <fieldset className="mb-6">
              <legend className="text-sm font-medium text-secondary-700 mb-3">
                How did this deal close?
              </legend>
              <div className="space-y-3">
                <label
                  className={`flex items-center p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                    closeType === 'won'
                      ? 'border-green-500 bg-green-50'
                      : 'border-secondary-200 hover:border-secondary-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="closeType"
                    value="won"
                    checked={closeType === 'won'}
                    onChange={() => setCloseType('won')}
                    className="w-4 h-4 text-green-600 border-secondary-300 focus:ring-green-500"
                    data-testid="radio-won"
                  />
                  <div className="ml-3">
                    <span className="text-sm font-medium text-secondary-900">
                      Mark as Won
                    </span>
                    <p className="text-sm text-secondary-600">
                      Deal was successfully closed
                    </p>
                  </div>
                  <svg
                    className={`ml-auto w-6 h-6 ${
                      closeType === 'won' ? 'text-green-500' : 'text-secondary-300'
                    }`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                </label>

                <label
                  className={`flex items-center p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                    closeType === 'lost'
                      ? 'border-red-500 bg-red-50'
                      : 'border-secondary-200 hover:border-secondary-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="closeType"
                    value="lost"
                    checked={closeType === 'lost'}
                    onChange={() => setCloseType('lost')}
                    className="w-4 h-4 text-red-600 border-secondary-300 focus:ring-red-500"
                    data-testid="radio-lost"
                  />
                  <div className="ml-3">
                    <span className="text-sm font-medium text-secondary-900">
                      Mark as Lost
                    </span>
                    <p className="text-sm text-secondary-600">
                      Deal was not closed
                    </p>
                  </div>
                  <svg
                    className={`ml-auto w-6 h-6 ${
                      closeType === 'lost' ? 'text-red-500' : 'text-secondary-300'
                    }`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                </label>
              </div>
            </fieldset>

            {/* Reason/Notes */}
            <div className="mb-6">
              <label
                htmlFor="closeReason"
                className="block text-sm font-medium text-secondary-700 mb-1"
              >
                Notes (optional)
              </label>
              <textarea
                id="closeReason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={
                  closeType === 'lost'
                    ? 'Why was this deal lost?'
                    : 'Any additional notes about this deal?'
                }
                rows={3}
                className="input"
                data-testid="close-reason"
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="alert-danger mb-4" data-testid="error-message">
                <p className="text-sm font-medium">{error}</p>
              </div>
            )}
          </div>
        )}

        {/* Footer Actions */}
        {!pendingConfirmation && (
          <div className="px-6 py-4 border-t border-secondary-200 flex justify-end gap-2 bg-secondary-50">
            <button
              onClick={onClose}
              className="btn-outline text-sm"
              data-testid="cancel-button"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitDisabled}
              className={`text-sm ${
                closeType === 'won'
                  ? 'btn-success'
                  : closeType === 'lost'
                  ? 'btn-danger'
                  : 'btn-primary'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              data-testid="confirm-button"
            >
              {closeOpportunityMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <span className="spinner w-4 h-4"></span>
                  Processing...
                </span>
              ) : closeType === 'won' ? (
                'Confirm Won'
              ) : closeType === 'lost' ? (
                'Confirm Lost'
              ) : (
                'Select an option'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
