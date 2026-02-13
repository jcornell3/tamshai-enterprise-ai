import { useState, Fragment } from 'react';
import { useAuth, apiConfig } from '@tamshai/auth';

/**
 * Approval Card Component (Architecture v1.4 - Section 5.6)
 *
 * Displays pending human-in-the-loop confirmation requests
 *
 * Features:
 * - Yellow warning styling (border-2 border-warning-500)
 * - Approve/Reject buttons
 * - POST /api/confirm/:confirmationId with { approved: true/false }
 * - Error handling for expired (404), wrong user (403)
 * - Toast notifications on completion
 * - Auto-remove after approval/rejection
 *
 * Usage:
 * ```tsx
 * <ApprovalCard
 *   confirmationId="uuid-here"
 *   message="Delete employee Alice Chen?"
 *   confirmationData={{
 *     action: 'delete_employee',
 *     employeeName: 'Alice Chen',
 *     employeeEmail: 'alice.chen@tamshai.com',
 *     department: 'Engineering'
 *   }}
 *   onComplete={(success) => console.log('Complete:', success)}
 * />
 * ```
 */

export interface ConfirmationData {
  action: string;
  [key: string]: any;  // Flexible for different action types
}

interface ApprovalCardProps {
  confirmationId: string;
  message: string;
  confirmationData: ConfirmationData;
  onComplete: (success: boolean) => void;
}

export function ApprovalCard({
  confirmationId,
  message,
  confirmationData,
  onComplete,
}: ApprovalCardProps) {
  const { getAccessToken } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApprove = async () => {
    await handleConfirmation(true);
  };

  const handleReject = async () => {
    await handleConfirmation(false);
  };

  const handleConfirmation = async (approved: boolean) => {
    setIsProcessing(true);
    setError(null);

    try {
      const token = getAccessToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/confirm/${confirmationId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ approved }),
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Confirmation expired (5-minute timeout)');
        } else if (response.status === 403) {
          throw new Error('This confirmation belongs to a different user');
        } else {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Confirmation failed');
        }
      }

      const result = await response.json();

      // Success - notify parent and show success toast
      onComplete(true);

      // Could show a toast notification here
      console.log(
        `Confirmation ${approved ? 'approved' : 'rejected'}:`,
        result
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Confirmation error:', errorMessage);

      // Still notify parent even on error (so card can be removed)
      setTimeout(() => onComplete(false), 3000);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="approval-card">
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className="flex-shrink-0">
          <div className="w-10 h-10 bg-warning-100 rounded-full flex items-center justify-center">
            <svg
              className="w-6 h-6 text-warning-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-warning-900 mb-1">
            Approval Required
          </h3>
          <p className="text-sm text-warning-700 whitespace-pre-line">
            {message}
          </p>
        </div>
      </div>

      {/* Confirmation Details */}
      <div className="bg-white rounded-md p-4 mb-4">
        <h4 className="text-sm font-medium text-secondary-700 mb-2">
          Action Details:
        </h4>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          {Object.entries(confirmationData).map(([key, value]) => (
            <Fragment key={key}>
              <dt className="font-medium text-secondary-600 capitalize">
                {key.replace(/([A-Z])/g, ' $1').trim()}:
              </dt>
              <dd className="text-secondary-900">{String(value)}</dd>
            </Fragment>
          ))}
        </dl>
      </div>

      {/* Error Message */}
      {error && (
        <div className="alert-danger mb-4">
          <p className="text-sm font-medium">Error: {error}</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleApprove}
          disabled={isProcessing}
          className="btn-success flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isProcessing ? (
            <span className="flex items-center justify-center gap-2">
              <span className="spinner w-4 h-4"></span>
              Processing...
            </span>
          ) : (
            'Approve'
          )}
        </button>
        <button
          onClick={handleReject}
          disabled={isProcessing}
          className="btn-danger flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Reject
        </button>
      </div>

      {/* Timeout Indicator */}
      <p className="text-xs text-warning-600 mt-3 text-center">
        This confirmation will expire in 5 minutes
      </p>
    </div>
  );
}
