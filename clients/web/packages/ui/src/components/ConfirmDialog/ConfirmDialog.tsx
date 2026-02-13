/**
 * Confirm Dialog Component
 *
 * Modal dialog for confirming bulk actions and destructive operations.
 * Matches E2E test selectors for enterprise UX hardening.
 *
 * Architecture v1.5 - Enterprise UX Hardening
 */
import { useEffect, useRef } from 'react';

export interface ConfirmDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Dialog title */
  title: string;
  /** Dialog message/description */
  message: string;
  /** Label for the confirm button */
  confirmLabel?: string;
  /** Label for the cancel button */
  cancelLabel?: string;
  /** Variant affects confirm button styling */
  variant?: 'primary' | 'destructive' | 'warning';
  /** Whether confirmation is in progress */
  isLoading?: boolean;
  /** Optional reason input for rejection flows */
  showReasonInput?: boolean;
  /** Placeholder for reason input */
  reasonPlaceholder?: string;
  /** Called when confirm is clicked, with optional reason */
  onConfirm: (reason?: string) => void;
  /** Called when cancel is clicked or dialog is dismissed */
  onCancel: () => void;
  /** Additional details to display */
  details?: Record<string, string | number>;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  isLoading = false,
  showReasonInput = false,
  reasonPlaceholder = 'Enter reason...',
  onConfirm,
  onCancel,
  details,
}: ConfirmDialogProps) {
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onCancel]);

  // Focus management
  useEffect(() => {
    if (isOpen) {
      // Focus the confirm button or reason input when dialog opens
      if (showReasonInput && reasonRef.current) {
        reasonRef.current.focus();
      } else if (confirmButtonRef.current) {
        confirmButtonRef.current.focus();
      }
    }
  }, [isOpen, showReasonInput]);

  // Don't render if not open
  if (!isOpen) return null;

  const handleConfirm = () => {
    const reason = reasonRef.current?.value;
    onConfirm(reason);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isLoading) {
      onCancel();
    }
  };

  const getConfirmButtonClass = () => {
    const base = 'px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
    switch (variant) {
      case 'destructive':
        return `${base} bg-danger-500 text-white hover:bg-danger-600`;
      case 'warning':
        return `${base} bg-warning-500 text-white hover:bg-warning-600`;
      default:
        return `${base} bg-primary-500 text-white hover:bg-primary-600`;
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        data-testid="confirm-dialog"
        className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-secondary-200">
          <h2
            id="confirm-dialog-title"
            className="text-lg font-semibold text-secondary-900"
          >
            {title}
          </h2>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          <p
            id="confirm-dialog-message"
            className="text-secondary-700 mb-4"
          >
            {message}
          </p>

          {/* Details grid */}
          {details && Object.keys(details).length > 0 && (
            <div className="bg-secondary-50 rounded-lg p-4 mb-4">
              <dl className="grid grid-cols-2 gap-2 text-sm">
                {Object.entries(details).map(([key, value]) => (
                  <div key={key} className="contents">
                    <dt className="font-medium text-secondary-600 capitalize">
                      {key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim()}:
                    </dt>
                    <dd className="text-secondary-900">{String(value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {/* Reason input */}
          {showReasonInput && (
            <div className="mb-4">
              <label
                htmlFor="confirm-reason"
                className="block text-sm font-medium text-secondary-700 mb-1"
              >
                Reason
              </label>
              <textarea
                ref={reasonRef}
                id="confirm-reason"
                name="reason"
                rows={3}
                placeholder={reasonPlaceholder}
                className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                data-testid="reason-input"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-secondary-50 border-t border-secondary-200 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 rounded-lg font-medium border border-secondary-300 text-secondary-700 hover:bg-secondary-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="cancel-action"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={handleConfirm}
            disabled={isLoading}
            className={getConfirmButtonClass()}
            data-testid="confirm-action"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Processing...
              </span>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
