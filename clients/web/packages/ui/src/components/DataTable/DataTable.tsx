import React, { useCallback, useMemo, useRef, useEffect } from 'react';

// Types
export interface ColumnDef<T> {
  id: string;
  header: string;
  accessor: keyof T | ((row: T) => unknown);
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: string;
  cell?: (value: unknown, row: T) => React.ReactNode;
}

export interface BulkAction {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  variant?: 'primary' | 'destructive' | 'neutral';
  requiresConfirmation?: boolean;
  minSelection?: number;
  maxSelection?: number;
}

export interface PaginationConfig {
  pageSize: number;
  currentPage: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}

export interface DataTableProps<T> {
  // Data
  data: T[];
  columns: ColumnDef<T>[];
  keyField: keyof T;

  // Selection
  selectable?: boolean;
  selectedRows?: string[];
  onSelectionChange?: (selectedIds: string[]) => void;

  // Bulk Actions
  bulkActions?: BulkAction[];
  onBulkAction?: (action: string, selectedItems: T[]) => void;

  // Sorting
  sortable?: boolean;
  sortedBy?: string;
  sortDirection?: 'asc' | 'desc';
  onSort?: (field: string, direction: 'asc' | 'desc') => void;

  // States
  loading?: boolean;
  emptyState?: React.ReactNode;

  // Pagination
  pagination?: PaginationConfig;

  // Header behavior
  stickyHeader?: boolean;

  // Row actions
  rowActions?: (row: T) => React.ReactNode;
}

function getAccessorValue<T>(row: T, accessor: keyof T | ((row: T) => unknown)): unknown {
  if (typeof accessor === 'function') {
    return accessor(row);
  }
  return row[accessor];
}

export function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  keyField,
  selectable = false,
  selectedRows = [],
  onSelectionChange,
  bulkActions = [],
  onBulkAction,
  sortable = false,
  sortedBy,
  sortDirection,
  onSort,
  loading = false,
  emptyState,
  pagination,
  stickyHeader = false,
  rowActions,
}: DataTableProps<T>) {
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  // Compute selection state
  const selectedSet = useMemo(() => new Set(selectedRows), [selectedRows]);
  const allSelected = data.length > 0 && data.every((row) => selectedSet.has(String(row[keyField])));
  const someSelected = selectedRows.length > 0 && !allSelected;

  // Update indeterminate state for header checkbox
  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  // Selection handlers
  const handleHeaderCheckboxChange = useCallback(() => {
    if (!onSelectionChange) return;

    if (allSelected) {
      onSelectionChange([]);
    } else {
      onSelectionChange(data.map((row) => String(row[keyField])));
    }
  }, [data, keyField, allSelected, onSelectionChange]);

  const handleRowCheckboxChange = useCallback(
    (rowId: string) => {
      if (!onSelectionChange) return;

      if (selectedSet.has(rowId)) {
        onSelectionChange(selectedRows.filter((id) => id !== rowId));
      } else {
        onSelectionChange([...selectedRows, rowId]);
      }
    },
    [selectedRows, selectedSet, onSelectionChange]
  );

  const handleClearSelection = useCallback(() => {
    onSelectionChange?.([]);
  }, [onSelectionChange]);

  // Sort handler
  const handleSort = useCallback(
    (columnId: string) => {
      if (!onSort) return;

      if (sortedBy === columnId) {
        const newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        onSort(columnId, newDirection);
      } else {
        onSort(columnId, 'asc');
      }
    },
    [sortedBy, sortDirection, onSort]
  );

  // Bulk action handler
  const handleBulkAction = useCallback(
    (actionId: string) => {
      if (!onBulkAction) return;

      const selectedItems = data.filter((row) => selectedSet.has(String(row[keyField])));
      onBulkAction(actionId, selectedItems);
    },
    [data, keyField, selectedSet, onBulkAction]
  );

  // Get sort aria attribute
  const getSortAriaSort = (columnId: string): 'none' | 'ascending' | 'descending' => {
    if (sortedBy !== columnId) return 'none';
    return sortDirection === 'asc' ? 'ascending' : 'descending';
  };

  // Render loading skeleton
  if (loading) {
    return (
      <div data-testid="table-skeleton" className="animate-pulse">
        <div className="h-10 bg-secondary-200 rounded mb-2" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 bg-secondary-100 rounded mb-1" />
        ))}
      </div>
    );
  }

  // Render empty state
  if (data.length === 0) {
    return (
      <div className="overflow-x-auto" data-testid="data-table">
        <div className="flex flex-col items-center justify-center py-12 text-secondary-500">
          {emptyState || <span>No data available</span>}
        </div>
      </div>
    );
  }

  // Calculate columns to render (including selection column)
  const hasActionColumn = !!rowActions;
  const totalColumns = columns.length + (selectable ? 1 : 0) + (hasActionColumn ? 1 : 0);

  return (
    <div className="overflow-x-auto" data-testid="data-table">
      {/* Bulk Action Toolbar */}
      {selectable && selectedRows.length > 0 && bulkActions.length > 0 && (
        <div
          data-testid="bulk-action-toolbar"
          role="toolbar"
          aria-label="Bulk actions"
          className="flex items-center justify-between px-4 py-3 bg-primary-50 border-b border-primary-200 animate-fade-in"
        >
          <div className="flex items-center gap-4">
            <span data-testid="selected-count" className="text-sm font-medium text-primary-700" role="status" aria-live="polite">
              {selectedRows.length} {selectedRows.length === 1 ? 'item' : 'items'} selected
            </span>
            <button
              type="button"
              onClick={handleClearSelection}
              className="text-sm text-primary-600 hover:text-primary-700 underline"
            >
              Clear
            </button>
          </div>
          <div className="flex items-center gap-2">
            {bulkActions.map((action) => (
              <button
                key={action.id}
                type="button"
                data-testid={`bulk-action-${action.id}`}
                onClick={() => handleBulkAction(action.id)}
                className={getBulkActionClassName(action.variant)}
              >
                {action.icon && <action.icon className="w-4 h-4 mr-1.5" />}
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <table
        role="grid"
        aria-multiselectable={selectable ? 'true' : undefined}
        className="w-full"
      >
        <thead
          role="rowgroup"
          aria-label="table header"
          className={`bg-secondary-50 border-b border-secondary-200 ${
            stickyHeader ? 'sticky top-0 z-10' : ''
          }`}
        >
          <tr>
            {/* Selection checkbox column */}
            {selectable && (
              <th scope="col" className="w-12 px-4 py-3">
                <input
                  ref={headerCheckboxRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={handleHeaderCheckboxChange}
                  aria-label="Select all rows"
                  data-testid="select-all-checkbox"
                  data-indeterminate={someSelected ? 'true' : undefined}
                  className="w-4 h-4 rounded border-secondary-300 text-primary-500
                           focus:ring-2 focus:ring-primary-500"
                />
              </th>
            )}

            {/* Data columns */}
            {columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                role="columnheader"
                aria-sort={sortable && column.sortable ? getSortAriaSort(column.id) : undefined}
                onClick={
                  sortable && column.sortable ? () => handleSort(column.id) : undefined
                }
                className={`px-4 py-3 text-xs font-semibold text-secondary-600 uppercase tracking-wider
                           ${getAlignClass(column.align)}
                           ${sortable && column.sortable ? 'cursor-pointer hover:bg-secondary-100' : ''}
                           ${column.width ? column.width : ''}`}
              >
                <div className="flex items-center gap-1">
                  {column.header}
                  {sortable && column.sortable && (
                    <SortIndicator columnId={column.id} sortedBy={sortedBy} sortDirection={sortDirection} />
                  )}
                </div>
              </th>
            ))}

            {/* Actions column */}
            {hasActionColumn && (
              <th scope="col" className="w-24 px-4 py-3 text-right text-xs font-semibold text-secondary-600 uppercase">
                Actions
              </th>
            )}
          </tr>
        </thead>

        <tbody role="rowgroup" className="divide-y divide-secondary-100">
          {data.map((row) => {
            const rowId = String(row[keyField]);
            const isSelected = selectedSet.has(rowId);
            const displayName = columns[0] ? String(getAccessorValue(row, columns[0].accessor)) : rowId;

            return (
              <tr
                key={rowId}
                role="row"
                aria-selected={isSelected}
                data-selected={isSelected ? 'true' : undefined}
                className={`transition-colors hover:bg-secondary-50 ${
                  isSelected ? 'bg-primary-50 border-l-3 border-l-primary-500' : ''
                }`}
              >
                {/* Selection checkbox */}
                {selectable && (
                  <td role="gridcell" className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleRowCheckboxChange(rowId)}
                      aria-label={`Select row: ${displayName}`}
                      data-testid="row-checkbox"
                      className="w-4 h-4 rounded border-secondary-300 text-primary-500
                               focus:ring-2 focus:ring-primary-500"
                    />
                  </td>
                )}

                {/* Data cells */}
                {columns.map((column) => {
                  const value = getAccessorValue(row, column.accessor);
                  const content = column.cell ? column.cell(value, row) : String(value ?? '');

                  return (
                    <td
                      key={column.id}
                      role="gridcell"
                      className={`px-4 py-3 text-sm text-secondary-900 ${getAlignClass(column.align)}`}
                    >
                      {content}
                    </td>
                  );
                })}

                {/* Row actions */}
                {hasActionColumn && (
                  <td role="gridcell" className="px-4 py-3 text-right">
                    {rowActions(row)}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Pagination */}
      {pagination && (
        <div
          data-testid="pagination"
          className="flex items-center justify-between px-4 py-3 bg-white border-t border-secondary-200"
        >
          <span className="text-sm text-secondary-600">
            {getPaginationText(pagination)}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => pagination.onPageChange(pagination.currentPage - 1)}
              disabled={pagination.currentPage === 1}
              aria-label="Previous page"
              className="px-3 py-1 text-sm border border-secondary-300 rounded-lg
                       hover:bg-secondary-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => pagination.onPageChange(pagination.currentPage + 1)}
              disabled={pagination.currentPage >= Math.ceil(pagination.totalItems / pagination.pageSize)}
              aria-label="Next page"
              className="px-3 py-1 text-sm border border-secondary-300 rounded-lg
                       hover:bg-secondary-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper components
function SortIndicator({
  columnId,
  sortedBy,
  sortDirection,
}: {
  columnId: string;
  sortedBy?: string;
  sortDirection?: 'asc' | 'desc';
}) {
  if (sortedBy !== columnId) {
    return (
      <svg className="w-4 h-4 text-secondary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    );
  }

  if (sortDirection === 'asc') {
    return (
      <svg className="w-4 h-4 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    );
  }

  return (
    <svg className="w-4 h-4 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

// Helper functions
function getAlignClass(align?: 'left' | 'center' | 'right'): string {
  switch (align) {
    case 'right':
      return 'text-right';
    case 'center':
      return 'text-center';
    default:
      return 'text-left';
  }
}

function getBulkActionClassName(variant?: 'primary' | 'destructive' | 'neutral'): string {
  const base = 'inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg transition-colors';

  switch (variant) {
    case 'primary':
      return `${base} bg-primary-500 text-white hover:bg-primary-600`;
    case 'destructive':
      return `${base} bg-danger-500 text-white hover:bg-danger-600`;
    default:
      return `${base} border border-secondary-300 text-secondary-700 hover:bg-secondary-50`;
  }
}

function getPaginationText(pagination: PaginationConfig): string {
  const start = (pagination.currentPage - 1) * pagination.pageSize + 1;
  const end = Math.min(pagination.currentPage * pagination.pageSize, pagination.totalItems);
  return `${start}-${end} of ${pagination.totalItems}`;
}

export default DataTable;
