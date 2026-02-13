import React, { useState, useMemo } from 'react';
import { AuditEntry, AuditEntryData } from './AuditEntry';

export type EntityType = 'invoice' | 'employee' | 'ticket' | 'pay_run' | 'budget' | 'expense';

export interface AuditTrailProps {
  /** Entity type being audited */
  entityType: EntityType;
  /** Entity identifier */
  entityId: string;
  /** Audit entries to display */
  entries: AuditEntryData[];
  /** Display mode: inline (sidebar) or modal */
  displayMode?: 'inline' | 'modal';
  /** Show detailed change information */
  showDetails?: boolean;
  /** Loading state */
  loading?: boolean;
  /** Error message */
  error?: string;
  /** Callback when more entries are requested */
  onLoadMore?: () => void;
  /** Whether more entries are available */
  hasMore?: boolean;
  /** Maximum height for scrollable container (inline mode) */
  maxHeight?: string;
  /** S-OX compliance: Show posted state indicator */
  isPosted?: boolean;
  /** S-OX compliance: Posted timestamp */
  postedAt?: string;
  /** Filter actions to display */
  actionFilter?: string[];
}

// Entity type labels for display
const ENTITY_LABELS: Record<EntityType, string> = {
  invoice: 'Invoice',
  employee: 'Employee',
  ticket: 'Ticket',
  pay_run: 'Pay Run',
  budget: 'Budget',
  expense: 'Expense',
};

export function AuditTrail({
  entityType,
  entityId,
  entries,
  displayMode = 'inline',
  showDetails = false,
  loading = false,
  error,
  onLoadMore,
  hasMore = false,
  maxHeight = '400px',
  isPosted = false,
  postedAt,
  actionFilter,
}: AuditTrailProps) {
  const [expandedDetails, setExpandedDetails] = useState(showDetails);

  // Filter entries by action if filter provided
  const filteredEntries = useMemo(() => {
    if (!actionFilter || actionFilter.length === 0) {
      return entries;
    }
    return entries.filter((entry) => actionFilter.includes(entry.action));
  }, [entries, actionFilter]);

  // Render loading skeleton
  if (loading && entries.length === 0) {
    return (
      <div data-testid="audit-trail-skeleton" className="animate-pulse">
        <div className="h-6 bg-secondary-200 rounded w-1/3 mb-4" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-start gap-3 py-3 px-4">
            <div className="w-8 h-8 bg-secondary-200 rounded-full" />
            <div className="flex-1">
              <div className="h-4 bg-secondary-200 rounded w-2/3 mb-2" />
              <div className="h-3 bg-secondary-100 rounded w-1/2" />
            </div>
            <div className="w-16 h-3 bg-secondary-100 rounded" />
          </div>
        ))}
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div
        data-testid="audit-trail-error"
        className="p-4 bg-danger-50 border border-danger-200 rounded-lg text-danger-700"
      >
        <div className="font-medium">Failed to load audit trail</div>
        <div className="text-sm mt-1">{error}</div>
      </div>
    );
  }

  // Render empty state
  if (filteredEntries.length === 0) {
    return (
      <div
        data-testid="audit-trail-empty"
        className="p-8 text-center text-secondary-500"
      >
        <div className="text-4xl mb-2">📋</div>
        <div className="font-medium">No audit history</div>
        <div className="text-sm">
          No changes have been recorded for this {ENTITY_LABELS[entityType].toLowerCase()}.
        </div>
      </div>
    );
  }

  const containerClass = displayMode === 'modal'
    ? 'bg-white rounded-lg shadow-lg overflow-hidden'
    : 'bg-white border border-secondary-200 rounded-lg overflow-hidden';

  return (
    <div data-testid="audit-trail" className={containerClass}>
      {/* Header */}
      <div className="px-4 py-3 bg-secondary-50 border-b border-secondary-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-secondary-900">
              {ENTITY_LABELS[entityType]} History
            </h3>
            <p className="text-xs text-secondary-500 mt-0.5">
              {filteredEntries.length} {filteredEntries.length === 1 ? 'entry' : 'entries'}
              {entityId && ` • ID: ${entityId.slice(0, 8)}...`}
            </p>
          </div>

          {/* S-OX Posted indicator */}
          {isPosted && (
            <div
              data-testid="posted-indicator"
              className="flex items-center gap-2 px-3 py-1.5 bg-warning-100 border border-warning-300 rounded-lg"
              title={postedAt ? `Posted at ${new Date(postedAt).toLocaleString()}` : 'This record is posted and read-only'}
            >
              <svg
                className="w-4 h-4 text-warning-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              <span className="text-xs font-medium text-warning-700">POSTED</span>
            </div>
          )}

          {/* Toggle details button */}
          <button
            type="button"
            onClick={() => setExpandedDetails(!expandedDetails)}
            className="text-xs text-primary-600 hover:text-primary-700 underline"
          >
            {expandedDetails ? 'Hide details' : 'Show details'}
          </button>
        </div>
      </div>

      {/* Entries list */}
      <div
        className="overflow-y-auto"
        style={{ maxHeight: displayMode === 'inline' ? maxHeight : '60vh' }}
      >
        {filteredEntries.map((entry) => (
          <AuditEntry
            key={entry.id}
            entry={entry}
            showDetails={expandedDetails}
          />
        ))}

        {/* Load more button */}
        {hasMore && onLoadMore && (
          <div className="p-4 text-center border-t border-secondary-100">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loading}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Load more'}
            </button>
          </div>
        )}
      </div>

      {/* Footer with export option */}
      <div className="px-4 py-2 bg-secondary-50 border-t border-secondary-200 flex justify-between items-center">
        <span className="text-xs text-secondary-500">
          Audit logs retained for 7 years (S-OX compliance)
        </span>
        <button
          type="button"
          className="text-xs text-primary-600 hover:text-primary-700"
        >
          Export CSV
        </button>
      </div>
    </div>
  );
}

export default AuditTrail;
