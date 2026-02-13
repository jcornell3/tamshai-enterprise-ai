/**
 * BudgetSummaryCard Component
 *
 * Displays department budget status with:
 * - Progress bar showing spent/allocated with color coding
 * - Warning indicator when over 90% spent
 * - Category breakdown table with individual progress bars
 * - Request Amendment button when remaining < 10%
 * - Trend indicator comparing to last period
 *
 * Architecture v1.5 - Generative UI
 */
import { useCallback, KeyboardEvent } from 'react';

/**
 * Category spending data
 */
export interface CategorySpend {
  /** Category name */
  name: string;
  /** Amount allocated to this category */
  allocated: number;
  /** Amount spent in this category */
  spent: number;
  /** Percentage of allocation spent */
  percentage: number;
}

/**
 * Budget data for a department
 */
export interface BudgetData {
  /** Department name */
  departmentName: string;
  /** Fiscal year */
  fiscalYear: number;
  /** Total budget allocated */
  allocated: number;
  /** Total amount spent */
  spent: number;
  /** Remaining budget (allocated - spent) */
  remaining: number;
  /** Breakdown by category */
  categories: CategorySpend[];
  /** Spending from last period for trend comparison */
  lastPeriodSpent?: number;
  /** Allocation from last period for trend comparison */
  lastPeriodAllocated?: number;
}

/**
 * Props for BudgetSummaryCard component
 */
export interface BudgetSummaryCardProps {
  /** Budget data to display */
  budget: BudgetData;
  /** Callback when View Details is clicked */
  onViewDetails?: (params: { departmentName: string; fiscalYear: number }) => void;
  /** Callback when Request Amendment is clicked */
  onRequestAmendment?: (budget: BudgetData) => void;
  /** Loading state */
  loading?: boolean;
  /** Error message */
  error?: string;
  /** Retry callback for error state */
  onRetry?: () => void;
}

/**
 * Format currency for display
 */
function formatCurrency(amount: number): string {
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);

  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(absAmount);

  return isNegative ? `-${formatted}` : formatted;
}

/**
 * Get the progress bar color class based on percentage
 */
function getProgressBarColor(percentage: number): string {
  if (percentage > 95) {
    return 'bg-danger-500';
  }
  if (percentage >= 80) {
    return 'bg-yellow-500';
  }
  return 'bg-success-500';
}

/**
 * BudgetSummaryCard Component
 */
export function BudgetSummaryCard({
  budget,
  onViewDetails,
  onRequestAmendment,
  loading = false,
  error,
  onRetry,
}: BudgetSummaryCardProps): JSX.Element {
  // Calculate percentage spent (handle zero allocation)
  const percentSpent = budget.allocated > 0
    ? Math.round((budget.spent / budget.allocated) * 100)
    : 0;

  // Calculate remaining percentage
  const remainingPercentage = budget.allocated > 0
    ? (budget.remaining / budget.allocated) * 100
    : 0;

  // Determine if warning should be shown (over 90% spent)
  const showWarning = percentSpent >= 90;

  // Determine if over budget
  const isOverBudget = budget.remaining < 0;

  // Determine if request amendment button should be shown (remaining < 10%)
  const showAmendmentButton = remainingPercentage < 10;

  // Handle View Details click
  const handleViewDetails = useCallback(() => {
    onViewDetails?.({
      departmentName: budget.departmentName,
      fiscalYear: budget.fiscalYear,
    });
  }, [onViewDetails, budget.departmentName, budget.fiscalYear]);

  // Handle keyboard events for buttons
  const handleKeyDown = useCallback((callback: () => void) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      callback();
    }
  }, []);

  // Calculate trend if last period data is available
  const hasTrend = budget.lastPeriodSpent !== undefined && budget.lastPeriodAllocated !== undefined;
  let trendDirection: 'up' | 'down' | 'stable' = 'stable';
  let trendPercentage = 0;

  if (hasTrend && budget.lastPeriodAllocated! > 0 && budget.allocated > 0) {
    const currentRate = (budget.spent / budget.allocated) * 100;
    const lastRate = (budget.lastPeriodSpent! / budget.lastPeriodAllocated!) * 100;
    trendPercentage = Math.round((currentRate - lastRate) * 100) / 100;

    if (Math.abs(trendPercentage) < 0.5) {
      trendDirection = 'stable';
    } else if (trendPercentage > 0) {
      trendDirection = 'up';
    } else {
      trendDirection = 'down';
    }
  }

  // Loading state
  if (loading) {
    return (
      <div
        data-testid="budget-summary-skeleton"
        className="animate-pulse w-full p-6 bg-white rounded-lg shadow space-y-4"
      >
        <div className="h-6 bg-secondary-200 rounded w-1/3" />
        <div className="h-4 bg-secondary-200 rounded w-1/4" />
        <div className="h-8 bg-secondary-200 rounded w-full" />
        <div className="space-y-2">
          <div className="h-4 bg-secondary-200 rounded w-1/2" />
          <div className="h-4 bg-secondary-200 rounded w-2/3" />
          <div className="h-4 bg-secondary-200 rounded w-1/3" />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        data-testid="budget-summary-error"
        className="w-full p-6 bg-white rounded-lg shadow"
      >
        <div className="flex flex-col items-center justify-center text-center py-8">
          <svg
            role="img"
            aria-label="Error"
            className="w-12 h-12 text-red-500 mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <p className="text-secondary-700 mb-4">{error}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  const progressBarColor = getProgressBarColor(percentSpent);

  return (
    <article
      data-testid="budget-summary-card"
      className="w-full p-6 bg-white rounded-lg shadow"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold text-secondary-900">
            {budget.departmentName}
          </h2>
          <p className="text-sm text-secondary-600">FY {budget.fiscalYear}</p>
        </div>

        {/* Trend Indicator */}
        {hasTrend && (
          <div
            data-testid="trend-indicator"
            className={`flex items-center gap-1 text-sm ${
              trendDirection === 'down' ? 'text-success-600' :
              trendDirection === 'up' ? 'text-danger-600' : 'text-secondary-600'
            }`}
            aria-label={`spending rate ${trendDirection === 'up' ? 'increased' : trendDirection === 'down' ? 'decreased' : 'stable'} by ${Math.abs(trendPercentage)}% compared to last period`}
          >
            {trendDirection === 'up' && (
              <svg
                role="img"
                aria-label="Increase"
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            )}
            {trendDirection === 'down' && (
              <svg
                role="img"
                aria-label="Decrease"
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
            {trendDirection === 'stable' && (
              <svg
                role="img"
                aria-label="Stable, no change"
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
              </svg>
            )}
            <span>
              {trendDirection === 'up' ? '+' : trendDirection === 'down' ? '' : ''}
              {Math.round(Math.abs(trendPercentage) * 10) / 10}%
            </span>
          </div>
        )}
      </div>

      {/* Warning Indicator */}
      {showWarning && (
        <div
          data-testid="budget-warning-indicator"
          role="alert"
          aria-live="polite"
          className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2"
        >
          <svg
            role="img"
            aria-label="Warning"
            className="w-5 h-5 text-yellow-600 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <span className="text-sm text-yellow-800">
            {isOverBudget
              ? 'Budget exceeded! Department is over budget.'
              : 'Budget nearing limit. Consider reviewing expenditures.'}
          </span>
        </div>
      )}

      {/* Budget Summary */}
      {budget.allocated === 0 ? (
        <div className="mb-4">
          <p className="text-sm text-secondary-600">Budget</p>
          <p className="text-lg font-semibold text-secondary-900">$0</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <p className="text-sm text-secondary-600">Allocated</p>
            <p className="text-lg font-semibold text-secondary-900">
              {formatCurrency(budget.allocated)}
            </p>
          </div>
          <div>
            <p className="text-sm text-secondary-600">Spent</p>
            <p className="text-lg font-semibold text-secondary-900">
              {formatCurrency(budget.spent)}
            </p>
          </div>
          <div>
            <p className="text-sm text-secondary-600">Remaining</p>
            <p className={`text-lg font-semibold ${isOverBudget ? 'text-danger-600' : 'text-secondary-900'}`}>
              {formatCurrency(budget.remaining)}
            </p>
          </div>
        </div>
      )}

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-secondary-600">Budget Used</span>
          <span className="text-sm font-medium text-secondary-900">{percentSpent}%</span>
        </div>
        <div className="w-full h-3 bg-secondary-200 rounded-full overflow-hidden">
          <div
            role="progressbar"
            aria-valuenow={percentSpent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${budget.departmentName} budget: ${percentSpent}% spent`}
            className={`h-full ${progressBarColor} transition-all duration-300`}
            style={{ width: `${Math.min(percentSpent, 100)}%` }}
          />
        </div>
      </div>

      {/* Category Breakdown */}
      <div data-testid="category-breakdown" className="mb-4">
        <h3 className="text-lg font-medium text-gray-800 mb-3">Category Breakdown</h3>

        {budget.categories.length === 0 ? (
          <p className="text-sm text-secondary-500 italic">No categories available</p>
        ) : (
          <table
            className="w-full"
            aria-label="Budget category breakdown"
          >
            <thead>
              <tr className="border-b border-secondary-200">
                <th
                  scope="col"
                  className="text-left text-sm font-medium text-secondary-600 py-2"
                >
                  Category
                </th>
                <th
                  scope="col"
                  className="text-right text-sm font-medium text-secondary-600 py-2"
                >
                  Allocated
                </th>
                <th
                  scope="col"
                  className="text-right text-sm font-medium text-secondary-600 py-2"
                >
                  Spent
                </th>
                <th
                  scope="col"
                  className="text-right text-sm font-medium text-secondary-600 py-2 w-32"
                >
                  Progress
                </th>
              </tr>
            </thead>
            <tbody>
              {budget.categories.map((category) => {
                const categoryColor = getProgressBarColor(category.percentage);
                return (
                  <tr
                    key={category.name}
                    data-testid={`category-row-${category.name}`}
                    tabIndex={0}
                    className="border-b border-gray-100 last:border-0"
                  >
                    <td className="py-2 text-sm text-secondary-900">{category.name}</td>
                    <td className="py-2 text-sm text-secondary-700 text-right">
                      {formatCurrency(category.allocated)}
                    </td>
                    <td className="py-2 text-sm text-secondary-700 text-right">
                      {formatCurrency(category.spent)}
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-2 bg-secondary-200 rounded-full overflow-hidden">
                          <div
                            data-testid="category-progress"
                            className={`h-full ${categoryColor}`}
                            style={{ width: `${Math.min(category.percentage, 100)}%` }}
                          />
                        </div>
                        <span className="text-sm text-secondary-700 w-10 text-right">
                          {Math.round(category.percentage)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-secondary-200">
        {showAmendmentButton && (
          <button
            type="button"
            onClick={() => onRequestAmendment?.(budget)}
            onKeyDown={onRequestAmendment ? handleKeyDown(() => onRequestAmendment(budget)) : undefined}
            disabled={!onRequestAmendment}
            aria-label={`Request amendment for ${budget.departmentName} budget`}
            className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Request Amendment
          </button>
        )}
        <button
          type="button"
          onClick={handleViewDetails}
          onKeyDown={onViewDetails ? handleKeyDown(handleViewDetails) : undefined}
          disabled={!onViewDetails}
          aria-label={`View details for ${budget.departmentName} budget`}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          View Details
        </button>
      </div>
    </article>
  );
}

export default BudgetSummaryCard;
