import React from 'react';

/**
 * Truncation Warning Component (Architecture v1.4 - Section 5.3)
 *
 * Displays warning when AI query results are truncated due to 50-record limit
 * (Article III.2: Constitutional limit enforcement)
 *
 * Features:
 * - Yellow left border (border-l-4 border-warning-500)
 * - Yellow background (bg-warning-50)
 * - Warning icon
 * - AI-generated warning message from MCP server
 *
 * Usage:
 * ```tsx
 * <TruncationWarning
 *   message="Only showing 50 of 50+ employees. Please refine your search."
 *   returnedCount={50}
 *   totalEstimate="50+"
 * />
 * ```
 */

interface TruncationWarningProps {
  message: string;         // AI-visible warning from MCP server
  returnedCount: number;   // Number of records returned
  totalEstimate?: string;  // Total record count estimate (e.g., "50+", "100+")
}

export function TruncationWarning({
  message,
  returnedCount,
  totalEstimate,
}: TruncationWarningProps) {
  return (
    <div className="truncation-warning">
      <div className="flex items-start gap-3">
        {/* Warning Icon */}
        <div className="flex-shrink-0">
          <svg
            className="w-5 h-5 text-warning-600"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </div>

        {/* Content */}
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-warning-900 mb-1">
            Results Truncated
          </h3>
          <p className="text-sm text-warning-800 mb-2">{message}</p>

          {/* Stats */}
          <div className="flex items-center gap-4 text-xs text-warning-700">
            <span>
              <strong>Shown:</strong> {returnedCount} records
            </span>
            {totalEstimate && (
              <span>
                <strong>Total:</strong> {totalEstimate} records
              </span>
            )}
          </div>

          {/* Action Suggestion */}
          <p className="text-xs text-warning-700 mt-2 italic">
            Try narrowing your search with filters (department, date range,
            status, etc.)
          </p>
        </div>
      </div>
    </div>
  );
}
