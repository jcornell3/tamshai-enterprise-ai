/**
 * Approval Card Component (Architecture v1.4 - Section 5.6)
 *
 * Displays pending human-in-the-loop confirmation requests
 * Adapted from web client for Electron desktop app
 */

import { useState } from 'react';

export interface ConfirmationData {
  action: string;
  [key: string]: any;
}

interface ApprovalCardProps {
  confirmationId: string;
  message: string;
  confirmationData?: ConfirmationData;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
}

export function ApprovalCard({
  confirmationId,
  message,
  confirmationData,
  onApprove,
  onReject,
}: ApprovalCardProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApprove = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      await onApprove(confirmationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      await onReject(confirmationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.iconContainer}>
          <svg
            style={styles.icon}
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
        <div style={styles.headerText}>
          <h3 style={styles.title}>⚠️ Approval Required</h3>
          <p style={styles.message}>{message}</p>
        </div>
      </div>

      {/* Confirmation Details */}
      {confirmationData && (
        <div style={styles.details}>
          <h4 style={styles.detailsTitle}>Action Details:</h4>
          <dl style={styles.detailsList}>
            {Object.entries(confirmationData).map(([key, value]) => (
              <div key={key} style={styles.detailRow}>
                <dt style={styles.detailKey}>
                  {key.replace(/([A-Z])/g, ' $1').trim()}:
                </dt>
                <dd style={styles.detailValue}>{String(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div style={styles.error}>
          <p style={styles.errorText}>Error: {error}</p>
        </div>
      )}

      {/* Action Buttons */}
      <div style={styles.buttonContainer}>
        <button
          onClick={handleApprove}
          disabled={isProcessing}
          style={{
            ...styles.button,
            ...styles.approveButton,
            ...(isProcessing ? styles.buttonDisabled : {}),
          }}
        >
          {isProcessing ? 'Processing...' : 'Approve'}
        </button>
        <button
          onClick={handleReject}
          disabled={isProcessing}
          style={{
            ...styles.button,
            ...styles.rejectButton,
            ...(isProcessing ? styles.buttonDisabled : {}),
          }}
        >
          Reject
        </button>
      </div>

      {/* Timeout Indicator */}
      <p style={styles.timeout}>
        This confirmation will expire in 5 minutes
      </p>
    </div>
  );
}

const styles = {
  container: {
    border: '2px solid #f59e0b',
    borderRadius: '8px',
    padding: '16px',
    background: '#fffbeb',
    margin: '16px 0',
  },
  header: {
    display: 'flex',
    gap: '12px',
    marginBottom: '16px',
  },
  iconContainer: {
    flexShrink: 0,
    width: '40px',
    height: '40px',
    background: '#fef3c7',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    width: '24px',
    height: '24px',
    color: '#d97706',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#78350f',
    margin: '0 0 8px 0',
  },
  message: {
    fontSize: '14px',
    color: '#92400e',
    whiteSpace: 'pre-line' as const,
    margin: 0,
  },
  details: {
    background: 'white',
    borderRadius: '6px',
    padding: '12px',
    marginBottom: '16px',
  },
  detailsTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#6b7280',
    marginBottom: '8px',
  },
  detailsList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '8px',
    fontSize: '12px',
    margin: 0,
  },
  detailRow: {
    display: 'contents',
  },
  detailKey: {
    fontWeight: 500,
    color: '#6b7280',
    textTransform: 'capitalize' as const,
  },
  detailValue: {
    color: '#1f2937',
  },
  error: {
    background: '#fee2e2',
    border: '1px solid #fca5a5',
    borderRadius: '6px',
    padding: '12px',
    marginBottom: '16px',
  },
  errorText: {
    fontSize: '12px',
    fontWeight: 500,
    color: '#991b1b',
    margin: 0,
  },
  buttonContainer: {
    display: 'flex',
    gap: '12px',
  },
  button: {
    flex: 1,
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: 600,
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  approveButton: {
    background: '#10b981',
    color: 'white',
  },
  rejectButton: {
    background: '#ef4444',
    color: 'white',
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  timeout: {
    fontSize: '11px',
    color: '#d97706',
    textAlign: 'center' as const,
    marginTop: '12px',
    marginBottom: 0,
  },
};
