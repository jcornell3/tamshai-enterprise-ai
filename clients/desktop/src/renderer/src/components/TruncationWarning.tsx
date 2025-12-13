/**
 * Truncation Warning Component (Architecture v1.4 - Section 5.3)
 *
 * Displays warning when AI query results are truncated due to 50-record limit
 * (Article III.2: Constitutional limit enforcement)
 *
 * Adapted from web client for Electron desktop app
 */

interface TruncationWarningProps {
  message: string;
  returnedCount?: number;
  totalEstimate?: string;
}

export function TruncationWarning({
  message,
  returnedCount,
  totalEstimate,
}: TruncationWarningProps) {
  return (
    <div style={styles.container}>
      <div style={styles.content}>
        {/* Warning Icon */}
        <div style={styles.iconContainer}>
          <svg
            style={styles.icon}
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

        {/* Text Content */}
        <div style={styles.textContainer}>
          <h3 style={styles.title}>⚠️ Results Truncated</h3>
          <p style={styles.message}>{message}</p>

          {/* Stats */}
          {(returnedCount || totalEstimate) && (
            <div style={styles.stats}>
              {returnedCount && (
                <span style={styles.stat}>
                  <strong>Shown:</strong> {returnedCount} records
                </span>
              )}
              {totalEstimate && (
                <span style={styles.stat}>
                  <strong>Total:</strong> {totalEstimate} records
                </span>
              )}
            </div>
          )}

          {/* Action Suggestion */}
          <p style={styles.suggestion}>
            Try narrowing your search with filters (department, date range, status, etc.)
          </p>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    borderLeft: '4px solid #f59e0b',
    background: '#fffbeb',
    borderRadius: '6px',
    padding: '12px 16px',
    margin: '12px 0',
  },
  content: {
    display: 'flex',
    gap: '12px',
  },
  iconContainer: {
    flexShrink: 0,
    paddingTop: '2px',
  },
  icon: {
    width: '20px',
    height: '20px',
    color: '#d97706',
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#78350f',
    margin: '0 0 6px 0',
  },
  message: {
    fontSize: '13px',
    color: '#92400e',
    margin: '0 0 8px 0',
  },
  stats: {
    display: 'flex',
    gap: '16px',
    fontSize: '11px',
    color: '#b45309',
    marginBottom: '8px',
  },
  stat: {
    display: 'inline',
  },
  suggestion: {
    fontSize: '11px',
    color: '#b45309',
    fontStyle: 'italic',
    margin: 0,
  },
};
