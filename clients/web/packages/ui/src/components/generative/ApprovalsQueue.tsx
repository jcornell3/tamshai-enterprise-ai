/**
 * ApprovalsQueue Component
 *
 * Displays pending approvals for time-off requests, expense reports, and budget amendments.
 * Generative UI component for enterprise AI-driven approval workflows.
 *
 * Architecture v1.5 - Generative UI
 */
import { useState, useCallback } from 'react';

/**
 * Time-off request data
 */
export interface TimeOffRequest {
  /** Unique identifier */
  id: string;
  /** Employee requesting time off */
  employeeName: string;
  /** Start date of time off */
  startDate: string;
  /** End date of time off */
  endDate: string;
  /** Type of time off */
  type: 'vacation' | 'sick' | 'personal' | 'bereavement' | 'other';
  /** Reason for request */
  reason: string;
}

/**
 * Expense report data
 */
export interface ExpenseReport {
  /** Unique identifier */
  id: string;
  /** Employee submitting expense */
  employeeName: string;
  /** Total amount */
  amount: number;
  /** Submission date */
  date: string;
  /** Description of expenses */
  description: string;
  /** Number of line items */
  itemCount: number;
}

/**
 * Budget amendment data
 */
export interface BudgetAmendment {
  /** Unique identifier */
  id: string;
  /** Department requesting amendment */
  department: string;
  /** Current budget amount */
  currentBudget: number;
  /** Requested new budget amount */
  requestedBudget: number;
  /** Reason for amendment */
  reason: string;
}

/** Approval type identifier */
export type ApprovalType = 'time-off' | 'expense' | 'budget';

/** Selection item for batch actions */
export interface SelectionItem {
  type: ApprovalType;
  id: string;
}

/**
 * Props for ApprovalsQueue component
 */
export interface ApprovalsQueueProps {
  /** Time-off requests pending approval */
  timeOffRequests: TimeOffRequest[];
  /** Expense reports pending approval */
  expenseReports: ExpenseReport[];
  /** Budget amendments pending approval */
  budgetAmendments: BudgetAmendment[];
  /** Loading state */
  loading?: boolean;
  /** Error message */
  error?: string;
  /** Callback when approve is clicked */
  onApprove?: (type: ApprovalType, id: string) => void;
  /** Callback when reject is clicked */
  onReject?: (type: ApprovalType, id: string, reason?: string) => void;
  /** Callback when view details is clicked */
  onViewDetails?: (type: ApprovalType, id: string) => void;
  /** Callback to retry on error */
  onRetry?: () => void;
  /** Enable selection for batch actions */
  selectable?: boolean;
  /** Callback for batch approve */
  onBatchApprove?: (items: SelectionItem[]) => void;
}

// Threshold constants
const URGENT_DAYS_THRESHOLD = 3;
const HIGH_EXPENSE_THRESHOLD = 5000;
const LARGE_INCREASE_THRESHOLD = 50; // percentage

/**
 * Format date for display (handles YYYY-MM-DD format correctly)
 */
function formatDate(dateStr: string): string {
  // Parse date string as local date to avoid timezone issues
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Format currency for display
 */
function formatCurrency(amount: number, forceDecimals = false): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: forceDecimals ? 2 : (amount % 1 === 0 ? 0 : 2),
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Check if a time-off request is urgent (starting soon)
 */
function isUrgentRequest(startDate: string): boolean {
  const start = new Date(startDate);
  const now = new Date();
  const diffDays = Math.ceil((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays <= URGENT_DAYS_THRESHOLD && diffDays >= 0;
}

/**
 * Check if expense report has high amount
 */
function isHighAmount(amount: number): boolean {
  return amount >= HIGH_EXPENSE_THRESHOLD;
}

/**
 * Check if budget amendment is a large increase
 */
function isLargeIncrease(current: number, requested: number): boolean {
  const percentIncrease = ((requested - current) / current) * 100;
  return percentIncrease >= LARGE_INCREASE_THRESHOLD;
}

/**
 * ApprovalsQueue Component
 */
export function ApprovalsQueue({
  timeOffRequests,
  expenseReports,
  budgetAmendments,
  loading = false,
  error,
  onApprove,
  onReject,
  onViewDetails,
  onRetry,
  selectable = false,
  onBatchApprove,
}: ApprovalsQueueProps): JSX.Element {
  // Section collapsed state
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  // Selection state
  const [selectedItems, setSelectedItems] = useState<SelectionItem[]>([]);

  // Rejection dialog state
  const [rejectionDialog, setRejectionDialog] = useState<{
    type: ApprovalType;
    id: string;
    open: boolean;
  } | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Calculate total pending
  const totalPending = timeOffRequests.length + expenseReports.length + budgetAmendments.length;
  const isEmpty = totalPending === 0;

  // Toggle section collapsed state
  const toggleSection = useCallback((sectionId: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  }, []);

  // Handle selection change
  const handleSelectionChange = useCallback((type: ApprovalType, id: string, selected: boolean) => {
    setSelectedItems(prev => {
      if (selected) {
        return [...prev, { type, id }];
      }
      return prev.filter(item => !(item.type === type && item.id === id));
    });
  }, []);

  // Check if item is selected
  const isItemSelected = useCallback((type: ApprovalType, id: string): boolean => {
    return selectedItems.some(item => item.type === type && item.id === id);
  }, [selectedItems]);

  // Handle reject button click
  const handleRejectClick = useCallback((type: ApprovalType, id: string) => {
    // First call onReject with undefined reason
    onReject?.(type, id, undefined);
    // Then show the dialog for providing a reason
    setRejectionDialog({ type, id, open: true });
    setRejectionReason('');
  }, [onReject]);

  // Handle rejection confirmation with reason
  const handleConfirmRejection = useCallback(() => {
    if (rejectionDialog) {
      onReject?.(rejectionDialog.type, rejectionDialog.id, rejectionReason);
      setRejectionDialog(null);
      setRejectionReason('');
    }
  }, [rejectionDialog, rejectionReason, onReject]);

  // Handle batch approve
  const handleBatchApprove = useCallback(() => {
    onBatchApprove?.(selectedItems);
    setSelectedItems([]);
  }, [selectedItems, onBatchApprove]);

  // Render loading skeleton
  if (loading) {
    return (
      <div data-testid="approvals-queue-skeleton" className="animate-pulse space-y-4">
        <div className="h-8 bg-secondary-200 rounded w-1/3" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <div className="h-6 bg-secondary-200 rounded w-1/4" />
            <div className="h-16 bg-secondary-100 rounded" />
            <div className="h-16 bg-secondary-100 rounded" />
          </div>
        ))}
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div data-testid="approvals-queue-error" className="text-center py-8">
        <div className="text-danger-500 mb-4">
          <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p className="text-secondary-700 mb-4">{error}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  // Render empty state
  if (isEmpty) {
    return (
      <div data-testid="approvals-empty-state" className="text-center py-12">
        <div
          role="img"
          aria-label="All caught up"
          className="w-16 h-16 mx-auto mb-4 text-success-500"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-secondary-900 mb-2">No pending approvals</h3>
        <p className="text-secondary-600">You're all caught up!</p>
      </div>
    );
  }

  return (
    <div data-testid="approvals-queue" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-secondary-900">Pending Approvals</h2>
        <div role="status" aria-live="polite" className="text-sm text-secondary-600">
          {totalPending} pending approvals
        </div>
      </div>

      {/* Batch action toolbar */}
      {selectable && selectedItems.length > 0 && (
        <div
          data-testid="batch-action-toolbar"
          className="flex items-center justify-between px-4 py-3 bg-primary-50 border border-primary-200 rounded-lg"
        >
          <span className="text-sm font-medium text-primary-700">
            {selectedItems.length} selected
          </span>
          <button
            type="button"
            onClick={handleBatchApprove}
            className="px-4 py-2 bg-success-500 text-white rounded-lg hover:bg-success-600 transition-colors"
          >
            Approve Selected
          </button>
        </div>
      )}

      {/* Time-Off Requests Section */}
      {timeOffRequests.length > 0 && (
        <section data-testid="time-off-requests-section" className="space-y-3">
          <button
            type="button"
            onClick={() => toggleSection('time-off')}
            aria-expanded={!collapsedSections['time-off']}
            className="flex items-center justify-between w-full text-left"
          >
            <h3 className="text-lg font-medium text-secondary-800">
              <span className="sr-only">Time-Off Requests</span>
              <span aria-hidden="true">Time-Off Requests ({timeOffRequests.length})</span>
            </h3>
            <svg
              className={`w-5 h-5 text-secondary-500 transition-transform ${collapsedSections['time-off'] ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <ul
            aria-label="Time-off requests"
            className={`space-y-2 ${collapsedSections['time-off'] ? 'hidden' : ''}`}
            style={{ visibility: collapsedSections['time-off'] ? 'hidden' : 'visible' }}
          >
            {timeOffRequests.map((request) => (
              <li
                key={request.id}
                data-testid={`time-off-request-${request.id}`}
                className={`p-4 bg-white border rounded-lg shadow-sm ${isUrgentRequest(request.startDate) ? 'urgent border-warning-400' : 'border-secondary-200'}`}
                style={{ visibility: collapsedSections['time-off'] ? 'hidden' : 'visible' }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {selectable && (
                      <input
                        type="checkbox"
                        checked={isItemSelected('time-off', request.id)}
                        onChange={(e) => handleSelectionChange('time-off', request.id, e.target.checked)}
                        className="mt-1 w-4 h-4 rounded border-secondary-300 text-primary-500"
                      />
                    )}
                    <div className="space-y-1">
                      <div className="font-medium text-secondary-900">{request.employeeName}</div>
                      <div className="text-sm text-secondary-600">
                        {formatDate(request.startDate)} - {formatDate(request.endDate)}
                      </div>
                      <div className="text-sm">
                        <span className="inline-block px-2 py-0.5 bg-secondary-100 rounded text-secondary-700">
                          {request.type}
                        </span>
                      </div>
                      <div className="text-sm text-secondary-600">{request.reason}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href="#"
                      role="link"
                      onClick={(e) => {
                        e.preventDefault();
                        onViewDetails?.('time-off', request.id);
                      }}
                      className="text-sm text-primary-600 hover:text-primary-700"
                    >
                      View Details
                    </a>
                    <button
                      type="button"
                      onClick={() => onApprove?.('time-off', request.id)}
                      aria-label={`Approve time-off request for ${request.employeeName}`}
                      className="px-3 py-1.5 bg-success-500 text-white text-sm rounded-lg hover:bg-success-600 transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRejectClick('time-off', request.id)}
                      aria-label={`Reject time-off request for ${request.employeeName}`}
                      className="px-3 py-1.5 bg-danger-500 text-white text-sm rounded-lg hover:bg-danger-600 transition-colors"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Expense Reports Section */}
      {expenseReports.length > 0 && (
        <section data-testid="expense-reports-section" className="space-y-3">
          <button
            type="button"
            onClick={() => toggleSection('expense')}
            aria-expanded={!collapsedSections['expense']}
            className="flex items-center justify-between w-full text-left"
          >
            <h3 className="text-lg font-medium text-secondary-800">
              <span className="sr-only">Expense Reports</span>
              <span aria-hidden="true">Expense Reports ({expenseReports.length})</span>
            </h3>
            <svg
              className={`w-5 h-5 text-secondary-500 transition-transform ${collapsedSections['expense'] ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <ul
            aria-label="Expense reports"
            className={`space-y-2 ${collapsedSections['expense'] ? 'hidden' : ''}`}
            style={{ visibility: collapsedSections['expense'] ? 'hidden' : 'visible' }}
          >
            {expenseReports.map((report) => (
              <li
                key={report.id}
                data-testid={`expense-report-${report.id}`}
                className="p-4 bg-white border border-secondary-200 rounded-lg shadow-sm"
                style={{ visibility: collapsedSections['expense'] ? 'hidden' : 'visible' }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {selectable && (
                      <input
                        type="checkbox"
                        checked={isItemSelected('expense', report.id)}
                        onChange={(e) => handleSelectionChange('expense', report.id, e.target.checked)}
                        className="mt-1 w-4 h-4 rounded border-secondary-300 text-primary-500"
                      />
                    )}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-secondary-900">{report.employeeName}</span>
                        {isHighAmount(report.amount) && (
                          <span
                            data-testid="high-amount-indicator"
                            className="px-2 py-0.5 bg-warning-100 text-warning-700 text-xs rounded"
                          >
                            High Amount
                          </span>
                        )}
                      </div>
                      <div className="text-lg font-semibold text-secondary-900">
                        {formatCurrency(report.amount, true)}
                      </div>
                      <div className="text-sm text-secondary-600">
                        <span>{formatDate(report.date)}</span>
                        <span> - </span>
                        <span>{report.itemCount} items</span>
                      </div>
                      <div className="text-sm text-secondary-600">{report.description}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href="#"
                      role="link"
                      onClick={(e) => {
                        e.preventDefault();
                        onViewDetails?.('expense', report.id);
                      }}
                      className="text-sm text-primary-600 hover:text-primary-700"
                    >
                      View Details
                    </a>
                    <button
                      type="button"
                      onClick={() => onApprove?.('expense', report.id)}
                      aria-label={`Approve expense report for ${report.employeeName}`}
                      className="px-3 py-1.5 bg-success-500 text-white text-sm rounded-lg hover:bg-success-600 transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRejectClick('expense', report.id)}
                      aria-label={`Reject expense report for ${report.employeeName}`}
                      className="px-3 py-1.5 bg-danger-500 text-white text-sm rounded-lg hover:bg-danger-600 transition-colors"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Budget Amendments Section */}
      {budgetAmendments.length > 0 && (
        <section data-testid="budget-amendments-section" className="space-y-3">
          <button
            type="button"
            onClick={() => toggleSection('budget')}
            aria-expanded={!collapsedSections['budget']}
            className="flex items-center justify-between w-full text-left"
          >
            <h3 className="text-lg font-medium text-secondary-800">
              <span className="sr-only">Budget Amendments</span>
              <span aria-hidden="true">Budget Amendments ({budgetAmendments.length})</span>
            </h3>
            <svg
              className={`w-5 h-5 text-secondary-500 transition-transform ${collapsedSections['budget'] ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <ul
            aria-label="Budget amendments"
            className={`space-y-2 ${collapsedSections['budget'] ? 'hidden' : ''}`}
            style={{ visibility: collapsedSections['budget'] ? 'hidden' : 'visible' }}
          >
            {budgetAmendments.map((amendment) => {
              const increase = amendment.requestedBudget - amendment.currentBudget;
              const percentIncrease = Math.round((increase / amendment.currentBudget) * 100);

              return (
                <li
                  key={amendment.id}
                  data-testid={`budget-amendment-${amendment.id}`}
                  className="p-4 bg-white border border-secondary-200 rounded-lg shadow-sm"
                  style={{ visibility: collapsedSections['budget'] ? 'hidden' : 'visible' }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      {selectable && (
                        <input
                          type="checkbox"
                          checked={isItemSelected('budget', amendment.id)}
                          onChange={(e) => handleSelectionChange('budget', amendment.id, e.target.checked)}
                          className="mt-1 w-4 h-4 rounded border-secondary-300 text-primary-500"
                        />
                      )}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-secondary-900">{amendment.department}</span>
                          {isLargeIncrease(amendment.currentBudget, amendment.requestedBudget) && (
                            <span
                              data-testid="large-increase-indicator"
                              className="px-2 py-0.5 bg-warning-100 text-warning-700 text-xs rounded"
                            >
                              Large Increase
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-secondary-600">
                            Current: <span className="font-medium text-secondary-900">{formatCurrency(amendment.currentBudget)}</span>
                          </span>
                          <span className="text-secondary-400">→</span>
                          <span className="text-secondary-600">
                            Requested: <span className="font-medium text-secondary-900">{formatCurrency(amendment.requestedBudget)}</span>
                          </span>
                        </div>
                        <div className="text-sm font-medium text-success-600">
                          +{formatCurrency(increase)} (+{percentIncrease}%)
                        </div>
                        <div className="text-sm text-secondary-600">{amendment.reason}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <a
                        href="#"
                        role="link"
                        onClick={(e) => {
                          e.preventDefault();
                          onViewDetails?.('budget', amendment.id);
                        }}
                        className="text-sm text-primary-600 hover:text-primary-700"
                      >
                        View Details
                      </a>
                      <button
                        type="button"
                        onClick={() => onApprove?.('budget', amendment.id)}
                        aria-label={`Approve budget amendment for ${amendment.department}`}
                        className="px-3 py-1.5 bg-success-500 text-white text-sm rounded-lg hover:bg-success-600 transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRejectClick('budget', amendment.id)}
                        aria-label={`Reject budget amendment for ${amendment.department}`}
                        className="px-3 py-1.5 bg-danger-500 text-white text-sm rounded-lg hover:bg-danger-600 transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Rejection Dialog */}
      {rejectionDialog?.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-secondary-900 mb-4">
              Provide Rejection Reason
            </h3>
            <input
              type="text"
              placeholder="Reason for rejection"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full px-3 py-2 border border-secondary-300 rounded-lg mb-4"
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setRejectionDialog(null)}
                className="px-4 py-2 border border-secondary-300 text-secondary-700 rounded-lg hover:bg-secondary-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRejection}
                className="px-4 py-2 bg-danger-500 text-white rounded-lg hover:bg-danger-600"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ApprovalsQueue;
