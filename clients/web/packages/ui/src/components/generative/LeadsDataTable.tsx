/**
 * LeadsDataTable Component
 *
 * Displays CRM leads in a data table with filtering, sorting, and bulk actions.
 * Supports score-based color coding, status badges, and accessibility features.
 */

import React, { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import type { ComponentAction } from './types';

// Lead status type
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost';

// Lead source type
export type LeadSource = 'website' | 'referral' | 'linkedin' | 'trade_show' | 'cold_call';

// Lead interface matching test requirements
export interface Lead {
  id: string;
  name: string;
  email: string;
  company: string;
  status: LeadStatus;
  source: LeadSource | string;
  score: number;
  createdAt: string;
  lastActivity: string;
}

// Filter types
export interface Filters {
  status?: LeadStatus[];
  scoreRange?: { min?: number; max?: number };
  dateRange?: { start?: string; end?: string };
  source?: string[];
}

// Pagination configuration
export interface PaginationConfig {
  pageSize: number;
  currentPage: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}

// Bulk action types
export type BulkActionType = 'assign' | 'update_status' | 'export' | 'delete';

// Component props
export interface LeadsDataTableProps {
  leads: Lead[];
  loading?: boolean;
  skeletonRowCount?: number;
  filters?: Filters;
  selectable?: boolean;
  selectedLeads?: string[];
  sortedBy?: string;
  sortDirection?: 'asc' | 'desc';
  pagination?: PaginationConfig;
  onLeadClick?: (id: string) => void;
  onFilterChange?: (filters: Filters) => void;
  onSelectionChange?: (selectedIds: string[]) => void;
  onSort?: (field: string, direction: 'asc' | 'desc') => void;
  onBulkAction?: (action: BulkActionType, leads: Lead[]) => void;
  onAction?: (action: ComponentAction) => void;
}

// Column definitions for sorting
const SORTABLE_COLUMNS = ['name', 'company', 'status', 'score', 'source', 'lastActivity'] as const;
type SortableColumn = typeof SORTABLE_COLUMNS[number];

// Status options for filter
const STATUS_OPTIONS: LeadStatus[] = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];

// Source options for filter
const SOURCE_OPTIONS: LeadSource[] = ['website', 'referral', 'linkedin', 'trade_show', 'cold_call'];

/**
 * Get score category based on score value
 */
function getScoreCategory(score: number): 'hot' | 'warm' | 'cold' {
  if (score >= 80) return 'hot';
  if (score >= 50) return 'warm';
  return 'cold';
}

/**
 * Format source string for display (e.g., 'cold_call' -> 'Cold Call')
 */
function formatSource(source: string): string {
  return source
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Format date to relative time or date string
 */
function formatLastActivity(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  }

  // Format as date
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Format date for full display (tooltip)
 */
function formatFullDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Count active filters
 */
function countActiveFilters(filters: Filters): number {
  let count = 0;
  if (filters.status && filters.status.length > 0) count++;
  if (filters.scoreRange && (filters.scoreRange.min !== undefined || filters.scoreRange.max !== undefined)) count++;
  if (filters.dateRange && (filters.dateRange.start || filters.dateRange.end)) count++;
  if (filters.source && filters.source.length > 0) count++;
  return count;
}

/**
 * Check if any filters are active
 */
function hasActiveFilters(filters?: Filters): boolean {
  if (!filters) return false;
  return countActiveFilters(filters) > 0;
}

/**
 * Apply filters to leads
 */
function applyFilters(leads: Lead[], filters?: Filters): Lead[] {
  if (!filters) return leads;

  return leads.filter(lead => {
    // Status filter
    if (filters.status && filters.status.length > 0) {
      if (!filters.status.includes(lead.status)) return false;
    }

    // Score range filter
    if (filters.scoreRange) {
      if (filters.scoreRange.min !== undefined && lead.score < filters.scoreRange.min) return false;
      if (filters.scoreRange.max !== undefined && lead.score > filters.scoreRange.max) return false;
    }

    // Date range filter (on lastActivity)
    if (filters.dateRange) {
      const activityDate = new Date(lead.lastActivity);
      if (filters.dateRange.start) {
        const startDate = new Date(filters.dateRange.start);
        if (activityDate < startDate) return false;
      }
      if (filters.dateRange.end) {
        const endDate = new Date(filters.dateRange.end);
        endDate.setHours(23, 59, 59, 999); // End of day
        if (activityDate > endDate) return false;
      }
    }

    // Source filter
    if (filters.source && filters.source.length > 0) {
      if (!filters.source.includes(lead.source)) return false;
    }

    return true;
  });
}

/**
 * LeadsDataTable Component
 */
export function LeadsDataTable({
  leads,
  loading = false,
  skeletonRowCount = 5,
  filters,
  selectable = false,
  selectedLeads = [],
  sortedBy,
  sortDirection,
  pagination,
  onLeadClick,
  onFilterChange,
  onSelectionChange,
  onSort,
  onBulkAction,
}: LeadsDataTableProps): JSX.Element {
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  // Apply filters to get visible leads
  const filteredLeads = useMemo(() => applyFilters(leads, filters), [leads, filters]);

  // Selection state
  const selectedSet = useMemo(() => new Set(selectedLeads), [selectedLeads]);
  const allSelected = filteredLeads.length > 0 && filteredLeads.every(lead => selectedSet.has(lead.id));
  const someSelected = selectedLeads.length > 0 && !allSelected;

  // Update indeterminate state for header checkbox
  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  // Get selected lead objects
  const getSelectedLeadObjects = useCallback((): Lead[] => {
    return leads.filter(lead => selectedSet.has(lead.id));
  }, [leads, selectedSet]);

  // Handle header checkbox change
  const handleHeaderCheckboxChange = useCallback(() => {
    if (!onSelectionChange) return;

    if (allSelected) {
      onSelectionChange([]);
    } else {
      onSelectionChange(filteredLeads.map(lead => lead.id));
    }
  }, [filteredLeads, allSelected, onSelectionChange]);

  // Handle row checkbox change
  const handleRowCheckboxChange = useCallback((leadId: string) => {
    if (!onSelectionChange) return;

    if (selectedSet.has(leadId)) {
      onSelectionChange(selectedLeads.filter(id => id !== leadId));
    } else {
      onSelectionChange([...selectedLeads, leadId]);
    }
  }, [selectedLeads, selectedSet, onSelectionChange]);

  // Handle clear selection
  const handleClearSelection = useCallback(() => {
    onSelectionChange?.([]);
  }, [onSelectionChange]);

  // Handle sort column click
  const handleSortClick = useCallback((column: SortableColumn) => {
    if (!onSort) return;

    if (sortedBy === column) {
      const newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      onSort(column, newDirection);
    } else {
      onSort(column, 'asc');
    }
  }, [sortedBy, sortDirection, onSort]);

  // Handle row click
  const handleRowClick = useCallback((leadId: string, event: React.MouseEvent | React.KeyboardEvent) => {
    // Don't trigger row click if clicking on checkbox
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' && target.getAttribute('type') === 'checkbox') {
      return;
    }
    onLeadClick?.(leadId);
  }, [onLeadClick]);

  // Handle row keydown
  const handleRowKeyDown = useCallback((leadId: string, event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      onLeadClick?.(leadId);
    } else if (event.key === ' ' && selectable) {
      event.preventDefault();
      handleRowCheckboxChange(leadId);
    }
  }, [onLeadClick, selectable, handleRowCheckboxChange]);

  // Handle bulk action
  const handleBulkAction = useCallback((action: BulkActionType) => {
    if (!onBulkAction) return;
    const selectedLeadObjects = getSelectedLeadObjects();
    onBulkAction(action, selectedLeadObjects);
  }, [onBulkAction, getSelectedLeadObjects]);

  // Track if we're in multi-select mode (option was clicked directly)
  const multiSelectRef = useRef(false);

  // Handle filter changes
  const handleStatusFilterChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    if (!onFilterChange) return;

    // If multi-select mode was activated by option click, skip the onChange handler
    if (multiSelectRef.current) {
      multiSelectRef.current = false;
      return;
    }

    const value = event.target.value;

    if (value === 'all') {
      const { status: _, ...rest } = filters || {};
      onFilterChange(rest);
    } else {
      onFilterChange({
        ...filters,
        status: [value as LeadStatus],
      });
    }
  }, [filters, onFilterChange]);

  const handleSourceFilterChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    if (!onFilterChange) return;
    const value = event.target.value;

    if (value === 'all') {
      const { source: _, ...rest } = filters || {};
      onFilterChange(rest);
    } else {
      onFilterChange({
        ...filters,
        source: [value],
      });
    }
  }, [filters, onFilterChange]);

  const handleMinScoreChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (!onFilterChange) return;
    const value = event.target.value ? parseInt(event.target.value, 10) : undefined;

    onFilterChange({
      ...filters,
      scoreRange: {
        ...filters?.scoreRange,
        min: value,
      },
    });
  }, [filters, onFilterChange]);

  const handleMaxScoreChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (!onFilterChange) return;
    const value = event.target.value ? parseInt(event.target.value, 10) : undefined;

    onFilterChange({
      ...filters,
      scoreRange: {
        ...filters?.scoreRange,
        max: value,
      },
    });
  }, [filters, onFilterChange]);

  const handleStartDateChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (!onFilterChange) return;
    const value = event.target.value || undefined;

    onFilterChange({
      ...filters,
      dateRange: {
        ...filters?.dateRange,
        start: value,
      },
    });
  }, [filters, onFilterChange]);

  const handleEndDateChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (!onFilterChange) return;
    const value = event.target.value || undefined;

    onFilterChange({
      ...filters,
      dateRange: {
        ...filters?.dateRange,
        end: value,
      },
    });
  }, [filters, onFilterChange]);

  const handleClearFilters = useCallback(() => {
    onFilterChange?.({});
  }, [onFilterChange]);

  // Track accumulated status selections (for multi-select when parent doesn't re-render)
  const accumulatedStatusesRef = useRef<LeadStatus[]>(filters?.status || []);

  // Sync accumulated statuses with props
  useEffect(() => {
    accumulatedStatusesRef.current = filters?.status || [];
  }, [filters?.status]);

  // Handle multi-select for status filter
  const handleStatusOptionClick = useCallback((status: LeadStatus, event: React.MouseEvent) => {
    if (!onFilterChange) return;
    event.preventDefault();
    event.stopPropagation();

    // Set flag to skip the onChange handler
    multiSelectRef.current = true;

    // Use accumulated statuses instead of prop (in case parent doesn't re-render)
    const currentStatuses = accumulatedStatusesRef.current;
    const newStatuses = currentStatuses.includes(status)
      ? currentStatuses.filter(s => s !== status)
      : [...currentStatuses, status];

    // Update accumulated statuses
    accumulatedStatusesRef.current = newStatuses;

    if (newStatuses.length === 0) {
      const { status: _, ...rest } = filters || {};
      onFilterChange(rest);
    } else {
      onFilterChange({
        ...filters,
        status: newStatuses,
      });
    }
  }, [filters, onFilterChange]);

  // Get aria-sort attribute value
  const getAriaSort = (column: string): 'none' | 'ascending' | 'descending' => {
    if (sortedBy !== column) return 'none';
    return sortDirection === 'asc' ? 'ascending' : 'descending';
  };

  // Render loading skeleton
  if (loading) {
    return (
      <div data-testid="leads-table-skeleton" className="animate-pulse">
        <div className="h-10 bg-secondary-200 rounded mb-2" />
        {Array.from({ length: skeletonRowCount }).map((_, index) => (
          <div key={index} data-testid="skeleton-row" className="h-12 bg-secondary-100 rounded mb-1" />
        ))}
      </div>
    );
  }

  // Render empty state
  if (filteredLeads.length === 0) {
    const hasFilters = hasActiveFilters(filters);
    return (
      <div data-testid="leads-data-table">
        {/* Filter Bar */}
        <FilterBar
          filters={filters}
          onStatusChange={handleStatusFilterChange}
          onSourceChange={handleSourceFilterChange}
          onMinScoreChange={handleMinScoreChange}
          onMaxScoreChange={handleMaxScoreChange}
          onStartDateChange={handleStartDateChange}
          onEndDateChange={handleEndDateChange}
          onClearFilters={handleClearFilters}
          onStatusOptionClick={handleStatusOptionClick}
        />

        <div data-testid="leads-empty-state" className="flex flex-col items-center justify-center py-12 text-secondary-500">
          <svg className="w-12 h-12 mb-4 text-secondary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <p className="text-lg font-medium">No leads found</p>
          <p className="text-sm mt-1">
            {hasFilters
              ? 'No leads match your filters. Try adjusting your filter criteria.'
              : 'Add your first lead to get started.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="leads-data-table" className="overflow-x-auto">
      {/* Filter Bar */}
      <FilterBar
        filters={filters}
        onStatusChange={handleStatusFilterChange}
        onSourceChange={handleSourceFilterChange}
        onMinScoreChange={handleMinScoreChange}
        onMaxScoreChange={handleMaxScoreChange}
        onStartDateChange={handleStartDateChange}
        onEndDateChange={handleEndDateChange}
        onClearFilters={handleClearFilters}
        onStatusOptionClick={handleStatusOptionClick}
      />

      {/* Bulk Action Toolbar */}
      {selectable && selectedLeads.length > 0 && (
        <div
          data-testid="bulk-action-toolbar"
          role="toolbar"
          aria-label="Bulk actions"
          className="flex items-center justify-between px-4 py-3 bg-primary-50 border-b border-primary-200"
        >
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-primary-700">
              {selectedLeads.length} {selectedLeads.length === 1 ? 'lead' : 'leads'} selected
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
            <button
              type="button"
              onClick={() => handleBulkAction('assign')}
              className="px-3 py-1.5 text-sm font-medium border border-secondary-300 rounded-lg hover:bg-secondary-50"
            >
              Assign
            </button>
            <button
              type="button"
              onClick={() => handleBulkAction('update_status')}
              className="px-3 py-1.5 text-sm font-medium border border-secondary-300 rounded-lg hover:bg-secondary-50"
            >
              Update Status
            </button>
            <button
              type="button"
              onClick={() => handleBulkAction('export')}
              className="px-3 py-1.5 text-sm font-medium border border-secondary-300 rounded-lg hover:bg-secondary-50"
            >
              Export
            </button>
            <button
              type="button"
              onClick={() => handleBulkAction('delete')}
              className="px-3 py-1.5 text-sm font-medium text-danger-600 border border-danger-300 rounded-lg hover:bg-danger-50"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <table
        role="grid"
        aria-multiselectable={selectable ? 'true' : undefined}
        className="w-full"
      >
        <thead className="bg-secondary-50 border-b border-secondary-200">
          <tr>
            {/* Selection checkbox column */}
            {selectable && (
              <th scope="col" className="w-12 px-4 py-3">
                <input
                  ref={headerCheckboxRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={handleHeaderCheckboxChange}
                  aria-label="Select all leads"
                  className="w-4 h-4 rounded border-secondary-300 text-primary-500 focus:ring-2 focus:ring-primary-500"
                />
              </th>
            )}

            {/* Column headers */}
            <th
              scope="col"
              role="columnheader"
              aria-sort={getAriaSort('name')}
              onClick={() => handleSortClick('name')}
              className="px-4 py-3 text-left text-xs font-semibold text-secondary-600 uppercase tracking-wider cursor-pointer hover:bg-secondary-100"
            >
              <div className="flex items-center gap-1">
                Name
                <SortIndicator column="name" sortedBy={sortedBy} sortDirection={sortDirection} />
              </div>
            </th>
            <th
              scope="col"
              role="columnheader"
              aria-sort={getAriaSort('company')}
              onClick={() => handleSortClick('company')}
              className="px-4 py-3 text-left text-xs font-semibold text-secondary-600 uppercase tracking-wider cursor-pointer hover:bg-secondary-100"
            >
              <div className="flex items-center gap-1">
                Company
                <SortIndicator column="company" sortedBy={sortedBy} sortDirection={sortDirection} />
              </div>
            </th>
            <th
              scope="col"
              role="columnheader"
              aria-sort={getAriaSort('status')}
              onClick={() => handleSortClick('status')}
              className="px-4 py-3 text-left text-xs font-semibold text-secondary-600 uppercase tracking-wider cursor-pointer hover:bg-secondary-100"
            >
              <div className="flex items-center gap-1">
                Status
                <SortIndicator column="status" sortedBy={sortedBy} sortDirection={sortDirection} />
              </div>
            </th>
            <th
              scope="col"
              role="columnheader"
              aria-sort={getAriaSort('score')}
              onClick={() => handleSortClick('score')}
              className="px-4 py-3 text-left text-xs font-semibold text-secondary-600 uppercase tracking-wider cursor-pointer hover:bg-secondary-100"
            >
              <div className="flex items-center gap-1">
                Score
                <SortIndicator column="score" sortedBy={sortedBy} sortDirection={sortDirection} />
              </div>
            </th>
            <th
              scope="col"
              role="columnheader"
              aria-sort={getAriaSort('source')}
              onClick={() => handleSortClick('source')}
              className="px-4 py-3 text-left text-xs font-semibold text-secondary-600 uppercase tracking-wider cursor-pointer hover:bg-secondary-100"
            >
              <div className="flex items-center gap-1">
                Source
                <SortIndicator column="source" sortedBy={sortedBy} sortDirection={sortDirection} />
              </div>
            </th>
            <th
              scope="col"
              role="columnheader"
              aria-sort={getAriaSort('lastActivity')}
              onClick={() => handleSortClick('lastActivity')}
              className="px-4 py-3 text-left text-xs font-semibold text-secondary-600 uppercase tracking-wider cursor-pointer hover:bg-secondary-100"
            >
              <div className="flex items-center gap-1">
                Last Activity
                <SortIndicator column="lastActivity" sortedBy={sortedBy} sortDirection={sortDirection} />
              </div>
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-secondary-100">
          {filteredLeads.map((lead) => {
            const isSelected = selectedSet.has(lead.id);
            const scoreCategory = getScoreCategory(lead.score);

            return (
              <tr
                key={lead.id}
                data-testid={`lead-row-${lead.id}`}
                role="row"
                tabIndex={onLeadClick ? 0 : undefined}
                aria-selected={isSelected}
                onClick={(e) => handleRowClick(lead.id, e)}
                onKeyDown={(e) => handleRowKeyDown(lead.id, e)}
                className={`
                  transition-colors hover:bg-secondary-50
                  ${isSelected ? 'bg-primary-50 border-l-3 border-l-primary-500' : ''}
                  ${onLeadClick ? 'cursor-pointer' : ''}
                `}
              >
                {/* Selection checkbox */}
                {selectable && (
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleRowCheckboxChange(lead.id)}
                      aria-label={`Select lead: ${lead.name}`}
                      className="w-4 h-4 rounded border-secondary-300 text-primary-500 focus:ring-2 focus:ring-primary-500"
                    />
                  </td>
                )}

                {/* Name & Email */}
                <td className="px-4 py-3">
                  <div className="text-sm font-medium text-secondary-900">{lead.name}</div>
                  <div className="text-xs text-secondary-500">{lead.email}</div>
                </td>

                {/* Company */}
                <td className="px-4 py-3 text-sm text-secondary-900">{lead.company}</td>

                {/* Status Badge */}
                <td className="px-4 py-3">
                  <span
                    data-testid={`status-badge-${lead.status}`}
                    aria-label={`Lead status: ${lead.status}`}
                    className={`
                      inline-flex items-center px-2 py-0.5 rounded text-xs font-medium
                      status-${lead.status}
                      ${lead.status === 'new' ? 'bg-blue-100 text-blue-800' : ''}
                      ${lead.status === 'contacted' ? 'bg-yellow-100 text-yellow-800' : ''}
                      ${lead.status === 'qualified' ? 'bg-purple-100 text-purple-800' : ''}
                      ${lead.status === 'proposal' ? 'bg-indigo-100 text-indigo-800' : ''}
                      ${lead.status === 'won' ? 'bg-green-100 text-green-800' : ''}
                      ${lead.status === 'lost' ? 'bg-red-100 text-red-800' : ''}
                    `}
                  >
                    {lead.status}
                  </span>
                </td>

                {/* Score Badge */}
                <td className="px-4 py-3">
                  <span
                    data-testid="score-badge"
                    aria-label={`Lead score: ${lead.score} (${scoreCategory})`}
                    className={`
                      inline-flex items-center px-2 py-0.5 rounded text-xs font-bold
                      score-${scoreCategory}
                      ${scoreCategory === 'hot' ? 'bg-orange-100 text-orange-800' : ''}
                      ${scoreCategory === 'warm' ? 'bg-amber-100 text-amber-800' : ''}
                      ${scoreCategory === 'cold' ? 'bg-cyan-100 text-cyan-800' : ''}
                    `}
                  >
                    {lead.score}
                  </span>
                </td>

                {/* Source */}
                <td className="px-4 py-3 text-sm text-secondary-700">
                  {lead.source}
                </td>

                {/* Last Activity */}
                <td
                  data-testid="last-activity-cell"
                  title={formatFullDate(lead.lastActivity)}
                  className="px-4 py-3 text-sm text-secondary-500"
                >
                  {formatLastActivity(lead.lastActivity)}
                </td>
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
              className="px-3 py-1 text-sm border border-secondary-300 rounded-lg hover:bg-secondary-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => pagination.onPageChange(pagination.currentPage + 1)}
              disabled={pagination.currentPage >= Math.ceil(pagination.totalItems / pagination.pageSize)}
              aria-label="Next page"
              className="px-3 py-1 text-sm border border-secondary-300 rounded-lg hover:bg-secondary-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Filter Bar Component
interface FilterBarProps {
  filters?: Filters;
  onStatusChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  onSourceChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  onMinScoreChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onMaxScoreChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onStartDateChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onEndDateChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onClearFilters: () => void;
  onStatusOptionClick: (status: LeadStatus, event: React.MouseEvent) => void;
}

function FilterBar({
  filters,
  onStatusChange,
  onSourceChange,
  onMinScoreChange,
  onMaxScoreChange,
  onStartDateChange,
  onEndDateChange,
  onClearFilters,
  onStatusOptionClick,
}: FilterBarProps): JSX.Element {
  const activeFilterCount = filters ? countActiveFilters(filters) : 0;

  return (
    <div
      data-testid="leads-filter-bar"
      role="region"
      aria-label="Lead filters"
      className="flex flex-wrap items-center gap-4 p-4 bg-secondary-50 border-b border-secondary-200"
    >
      {/* Status Filter - Custom dropdown for multi-select support */}
      <StatusFilterDropdown
        filters={filters}
        onStatusChange={onStatusChange}
        onStatusOptionClick={onStatusOptionClick}
      />

      {/* Source Filter */}
      <div className="flex flex-col">
        <label htmlFor="source-filter" className="sr-only">Source</label>
        <select
          id="source-filter"
          aria-label="Source"
          value={filters?.source?.[0] || 'all'}
          onChange={onSourceChange}
          className="px-3 py-2 text-sm border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        >
          <option value="all" role="option">Any Source</option>
          <option value="website" role="option">Web Form</option>
          <option value="referral" role="option">Partner</option>
          <option value="linkedin" role="option">Social</option>
          <option value="trade_show" role="option">Event</option>
          <option value="cold_call" role="option">Outbound</option>
        </select>
      </div>

      {/* Score Range */}
      <div className="flex items-center gap-2">
        <label htmlFor="min-score" className="text-sm text-secondary-600">Min Score</label>
        <input
          id="min-score"
          type="number"
          min={0}
          max={100}
          value={filters?.scoreRange?.min ?? ''}
          onChange={onMinScoreChange}
          className="w-16 px-2 py-2 text-sm border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
        <span className="text-secondary-400">-</span>
        <label htmlFor="max-score" className="text-sm text-secondary-600">Max Score</label>
        <input
          id="max-score"
          type="number"
          min={0}
          max={100}
          value={filters?.scoreRange?.max ?? ''}
          onChange={onMaxScoreChange}
          className="w-16 px-2 py-2 text-sm border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      {/* Date Range */}
      <div className="flex items-center gap-2">
        <label htmlFor="start-date" className="text-sm text-secondary-600">Start Date</label>
        <input
          id="start-date"
          type="date"
          value={filters?.dateRange?.start ?? ''}
          onChange={onStartDateChange}
          className="px-2 py-2 text-sm border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
        <span className="text-secondary-400">to</span>
        <label htmlFor="end-date" className="text-sm text-secondary-600">End Date</label>
        <input
          id="end-date"
          type="date"
          value={filters?.dateRange?.end ?? ''}
          onChange={onEndDateChange}
          className="px-2 py-2 text-sm border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      {/* Active Filter Count & Clear Button */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-sm text-secondary-600">{activeFilterCount} filters active</span>
          <button
            type="button"
            onClick={onClearFilters}
            className="px-3 py-1.5 text-sm font-medium text-primary-600 hover:text-primary-700 underline"
          >
            Clear Filters
          </button>
        </div>
      )}
    </div>
  );
}

// Sort Indicator Component
function SortIndicator({
  column,
  sortedBy,
  sortDirection,
}: {
  column: string;
  sortedBy?: string;
  sortDirection?: 'asc' | 'desc';
}): JSX.Element {
  if (sortedBy !== column) {
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

// Helper function for pagination text
function getPaginationText(pagination: PaginationConfig): string {
  const start = (pagination.currentPage - 1) * pagination.pageSize + 1;
  const end = Math.min(pagination.currentPage * pagination.pageSize, pagination.totalItems);
  return `${start}-${end} of ${pagination.totalItems}`;
}

// Status Filter Dropdown Component - Custom implementation for multi-select
interface StatusFilterDropdownProps {
  filters?: Filters;
  onStatusChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  onStatusOptionClick: (status: LeadStatus, event: React.MouseEvent) => void;
}

function StatusFilterDropdown({
  filters,
  onStatusChange,
  onStatusOptionClick,
}: StatusFilterDropdownProps): JSX.Element {
  // Track accumulated selections for multi-select support
  const accumulatedSelectionsRef = useRef<LeadStatus[]>([]);

  const selectedStatuses = filters?.status || [];

  // Initialize accumulated selections from filters
  useEffect(() => {
    accumulatedSelectionsRef.current = [...selectedStatuses];
  }, [selectedStatuses]);

  // Handle option selection - supports both single-select (change event) and multi-select (click)
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onStatusChange(e);
  };

  return (
    <div className="flex flex-col">
      <label htmlFor="status-filter" className="sr-only">Status</label>
      <select
        id="status-filter"
        aria-label="Status"
        value={filters?.status?.[0] || 'all'}
        onChange={handleChange}
        className="px-3 py-2 text-sm border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 cursor-pointer"
      >
        <option value="all" role="option">All</option>
        {STATUS_OPTIONS.map(status => (
          <option
            key={status}
            value={status}
            role="option"
            onClick={(e) => {
              // For multi-select: accumulate selections
              e.stopPropagation();
              onStatusOptionClick(status, e);
            }}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </option>
        ))}
      </select>
    </div>
  );
}

export default LeadsDataTable;
