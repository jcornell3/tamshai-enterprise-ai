import React from 'react';

export interface AuditEntryData {
  id: string;
  timestamp: string;
  userEmail: string;
  userName?: string;
  action: string;
  resource: string;
  targetId?: string;
  details?: Record<string, unknown>;
  previousValue?: unknown;
  newValue?: unknown;
  accessDecision?: 'ALLOWED' | 'DENIED';
  ipAddress?: string;
}

export interface AuditEntryProps {
  entry: AuditEntryData;
  showDetails?: boolean;
}

const ACTION_ICONS: Record<string, string> = {
  SELECT: '🔍',
  INSERT: '➕',
  UPDATE: '✏️',
  DELETE: '🗑️',
  AI_QUERY: '🤖',
  APPROVE: '✅',
  REJECT: '❌',
  EXPORT: '📤',
  LOGIN: '🔐',
  LOGOUT: '🚪',
};

const ACTION_COLORS: Record<string, string> = {
  INSERT: 'text-success-600',
  UPDATE: 'text-warning-600',
  DELETE: 'text-danger-600',
  REJECT: 'text-danger-600',
  DENIED: 'text-danger-600',
  APPROVE: 'text-success-600',
  ALLOWED: 'text-success-600',
};

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatTimeAgo(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatTimestamp(timestamp);
}

export function AuditEntry({ entry, showDetails = false }: AuditEntryProps) {
  const icon = ACTION_ICONS[entry.action] || '📋';
  const colorClass = ACTION_COLORS[entry.action] || ACTION_COLORS[entry.accessDecision || ''] || 'text-secondary-600';

  return (
    <div
      data-testid={`audit-entry-${entry.id}`}
      className="flex items-start gap-3 py-3 px-4 hover:bg-secondary-50 border-b border-secondary-100 last:border-b-0"
    >
      {/* Timeline dot and icon */}
      <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-secondary-100">
        <span className="text-sm" role="img" aria-label={entry.action}>
          {icon}
        </span>
      </div>

      {/* Entry content */}
      <div className="flex-1 min-w-0">
        {/* Action and user */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`font-medium text-sm ${colorClass}`}>
            {entry.action}
          </span>
          <span className="text-secondary-400">•</span>
          <span className="text-sm text-secondary-700 truncate">
            {entry.userName || entry.userEmail}
          </span>
          {entry.accessDecision && (
            <>
              <span className="text-secondary-400">•</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  entry.accessDecision === 'ALLOWED'
                    ? 'bg-success-100 text-success-700'
                    : 'bg-danger-100 text-danger-700'
                }`}
              >
                {entry.accessDecision}
              </span>
            </>
          )}
        </div>

        {/* Resource and target */}
        <div className="text-sm text-secondary-600 mt-1">
          <span className="font-mono text-xs bg-secondary-100 px-1.5 py-0.5 rounded">
            {entry.resource}
          </span>
          {entry.targetId && (
            <span className="ml-2 text-secondary-500">
              ID: {entry.targetId.slice(0, 8)}...
            </span>
          )}
        </div>

        {/* Value changes (for updates) */}
        {showDetails && entry.previousValue !== undefined && entry.newValue !== undefined && (
          <div className="mt-2 text-xs">
            <div className="flex items-start gap-2">
              <span className="text-danger-600 line-through">
                {JSON.stringify(entry.previousValue)}
              </span>
              <span className="text-secondary-400">→</span>
              <span className="text-success-600">
                {JSON.stringify(entry.newValue)}
              </span>
            </div>
          </div>
        )}

        {/* Additional details */}
        {showDetails && entry.details && Object.keys(entry.details).length > 0 && (
          <div className="mt-2 text-xs text-secondary-500 font-mono bg-secondary-50 p-2 rounded">
            {JSON.stringify(entry.details, null, 2)}
          </div>
        )}
      </div>

      {/* Timestamp */}
      <div className="flex-shrink-0 text-right">
        <div className="text-xs text-secondary-500" title={formatTimestamp(entry.timestamp)}>
          {formatTimeAgo(entry.timestamp)}
        </div>
        {entry.ipAddress && (
          <div className="text-xs text-secondary-400 mt-1">
            {entry.ipAddress}
          </div>
        )}
      </div>
    </div>
  );
}

export default AuditEntry;
