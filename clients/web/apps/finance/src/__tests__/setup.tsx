import '@testing-library/jest-dom';
import React from 'react';
import { vi } from 'vitest';

// Mock @tamshai/auth module
vi.mock('@tamshai/auth', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    userContext: {
      userId: 'test-user-001',
      username: 'test.user',
      email: 'test.user@tamshai.com',
      firstName: 'Test',
      lastName: 'User',
      roles: ['finance-read', 'finance-write'],
    },
    getAccessToken: () => 'mock-token',
    signIn: vi.fn(),
    signOut: vi.fn(),
    error: null,
  }),
  PrivateRoute: ({ children }: { children: React.ReactNode }) => children,
  getUserDisplayName: (ctx: any) => `${ctx?.firstName || ''} ${ctx?.lastName || ''}`.trim() || 'Unknown User',
  getRoleBadges: () => ['finance-read', 'finance-write'],
  canModifyFinance: () => true,
  apiConfig: {
    mcpGatewayUrl: 'http://localhost:3100',
  },
}));

// Mock @tamshai/ui module
vi.mock('@tamshai/ui', () => ({
  TruncationWarning: ({ message }: { message: string }) => (
    <div data-testid="truncation-warning">{message}</div>
  ),
  ApprovalCard: ({ message, onComplete }: { message: string; onComplete: (success: boolean) => void }) => (
    <div data-testid="approval-card">
      <p>{message}</p>
      <button onClick={() => onComplete(true)}>Approve</button>
      <button onClick={() => onComplete(false)}>Reject</button>
    </div>
  ),
  DataTable: ({
    data,
    columns,
    keyField,
    selectable,
    selectedRows = [],
    onSelectionChange,
    bulkActions = [],
    onBulkAction,
    rowActions,
  }: any) => (
    <div data-testid="data-table">
      {selectable && selectedRows.length > 0 && bulkActions.length > 0 && (
        <div data-testid="bulk-action-toolbar" role="toolbar" aria-label="Bulk actions">
          <span data-testid="selected-count" role="status" aria-live="polite">
            {selectedRows.length} {selectedRows.length === 1 ? 'item' : 'items'} selected
          </span>
          <button onClick={() => onSelectionChange?.([])}>
            Clear
          </button>
          {bulkActions.map((action: any) => (
            <button
              key={action.id}
              data-testid={`bulk-action-${action.id}`}
              onClick={() => {
                const selectedItems = data.filter((row: any) => selectedRows.includes(row[keyField]));
                onBulkAction?.(action.id, selectedItems);
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
      <table role="grid" aria-multiselectable={selectable ? 'true' : undefined}>
        <thead role="rowgroup" aria-label="table header">
          <tr>
            {selectable && (
              <th>
                <input
                  type="checkbox"
                  data-testid="select-all-checkbox"
                  aria-label="Select all rows"
                  checked={selectedRows.length === data.length && data.length > 0}
                  data-indeterminate={selectedRows.length > 0 && selectedRows.length < data.length ? 'true' : undefined}
                  ref={(el) => {
                    if (el) {
                      el.indeterminate = selectedRows.length > 0 && selectedRows.length < data.length;
                    }
                  }}
                  onChange={() => {
                    if (selectedRows.length === data.length) {
                      onSelectionChange?.([]);
                    } else {
                      onSelectionChange?.(data.map((row: any) => row[keyField]));
                    }
                  }}
                />
              </th>
            )}
            {columns.map((col: any) => (
              <th key={col.id} role="columnheader">{col.header}</th>
            ))}
            {rowActions && <th>Actions</th>}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {data.map((row: any) => {
            const rowId = row[keyField];
            const isSelected = selectedRows.includes(rowId);
            return (
              <tr key={rowId} role="row" aria-selected={isSelected} data-selected={isSelected ? 'true' : undefined}>
                {selectable && (
                  <td>
                    <input
                      type="checkbox"
                      data-testid="row-checkbox"
                      aria-label={`Select row: ${row[columns[0]?.accessor]}`}
                      checked={isSelected}
                      onChange={() => {
                        if (isSelected) {
                          onSelectionChange?.(selectedRows.filter((id: string) => id !== rowId));
                        } else {
                          onSelectionChange?.([...selectedRows, rowId]);
                        }
                      }}
                    />
                  </td>
                )}
                {columns.map((col: any) => {
                  const value = typeof col.accessor === 'function' ? col.accessor(row) : row[col.accessor];
                  const content = col.cell ? col.cell(value, row) : value;
                  return <td key={col.id} role="gridcell">{content}</td>;
                })}
                {rowActions && <td>{rowActions(row)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  ),
  ConfirmDialog: ({
    isOpen,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    isLoading,
    showReasonInput,
    onConfirm,
    onCancel,
    details,
  }: any) => isOpen ? (
    <div role="dialog" aria-modal="true" data-testid="confirm-dialog">
      <h2>{title}</h2>
      <p>{message}</p>
      {details && (
        <dl>
          {Object.entries(details).map(([key, value]) => (
            <div key={key}>
              <dt>{key}:</dt>
              <dd>{String(value)}</dd>
            </div>
          ))}
        </dl>
      )}
      {showReasonInput && (
        <textarea data-testid="reason-input" name="reason" />
      )}
      <button data-testid="cancel-action" onClick={onCancel} disabled={isLoading}>
        {cancelLabel}
      </button>
      <button data-testid="confirm-action" onClick={() => onConfirm()} disabled={isLoading}>
        {isLoading ? 'Processing...' : confirmLabel}
      </button>
    </div>
  ) : null,
}));

// Mock window.matchMedia for responsive components
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver for lazy loading components
class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver,
});

// Mock ResizeObserver for chart components
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: MockResizeObserver,
});

// Mock EventSource for SSE streaming tests
class MockEventSource {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;
  readyState = 0;
  url: string;

  constructor(url: string) {
    this.url = url;
    this.readyState = 1; // OPEN
  }

  close = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  dispatchEvent = vi.fn();
}
Object.defineProperty(window, 'EventSource', {
  writable: true,
  value: MockEventSource,
});
