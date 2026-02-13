/**
 * ForecastChart Component
 *
 * Displays sales forecast chart with actual vs forecast bars per period.
 * Features:
 * - Bar chart with actual vs forecast bars per period
 * - Target line overlay on chart
 * - Summary cards: Target, Achieved, Projected, Gap
 * - Period selector (Monthly/Quarterly)
 * - Legend with actual/forecast/target indicators
 * - Drill down on bar click
 * - Loading, error, and empty states
 * - Full accessibility support
 */

import React, { useState } from 'react';

/**
 * Period data for a single time period
 */
export interface Period {
  /** Period label (e.g., 'Jan', 'Q1') */
  label: string;
  /** Actual value achieved */
  actual: number;
  /** Forecast value */
  forecast: number;
  /** Percentage of forecast achieved (actual/forecast * 100) */
  percentage: number;
}

/**
 * Forecast data for the chart
 */
export interface ForecastData {
  /** Array of period data */
  periods: Period[];
  /** Target value */
  target: number;
  /** Achieved value (sum of actuals) */
  achieved: number;
  /** Projected end value */
  projected: number;
}

/**
 * Period view type
 */
export type PeriodView = 'monthly' | 'quarterly';

/**
 * Props for ForecastChart component
 */
export interface ForecastChartProps {
  /** Forecast data to display */
  forecast: ForecastData;
  /** Callback when a period is drilled down */
  onDrillDown?: (period: Period) => void;
  /** Callback when period view changes */
  onPeriodChange?: (view: PeriodView) => void;
  /** Loading state */
  loading?: boolean;
  /** Error message */
  error?: string;
  /** Retry callback for error state */
  onRetry?: () => void;
  /** Compact mode for small viewports */
  compact?: boolean;
  /** Custom class name */
  className?: string;
  /** Custom height for chart area */
  height?: number;
}

/**
 * Format currency value
 */
function formatCurrency(value: number): string {
  if (value === 0) return '$0';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Get full month name from abbreviation
 */
function getFullMonthName(abbrev: string): string {
  const months: Record<string, string> = {
    Jan: 'January',
    Feb: 'February',
    Mar: 'March',
    Apr: 'April',
    May: 'May',
    Jun: 'June',
    Jul: 'July',
    Aug: 'August',
    Sep: 'September',
    Oct: 'October',
    Nov: 'November',
    Dec: 'December',
  };
  return months[abbrev] || abbrev;
}

/**
 * Get bar color based on percentage
 */
function getBarColor(percentage: number, isAboveForecast: boolean): string {
  if (isAboveForecast) return 'bg-success-500';
  if (percentage < 80) return 'bg-danger-500';
  return 'bg-primary-500';
}

/**
 * Get status indicator class based on percentage
 */
function getStatusIndicatorClass(percentage: number): string {
  if (percentage >= 100) return 'text-success-600';
  if (percentage >= 80) return 'text-warning-600';
  return 'text-danger-600';
}

/**
 * Chart Legend Component
 */
function ChartLegend(): JSX.Element {
  return (
    <div
      data-testid="chart-legend"
      className="flex items-center gap-6 mt-4"
      aria-label="Chart legend"
    >
      <div data-testid="legend-actual" className="flex items-center gap-2">
        <div data-testid="legend-color-box" className="w-4 h-4 bg-primary-500 rounded" />
        <span className="text-sm text-secondary-600">Actual</span>
      </div>
      <div data-testid="legend-forecast" className="flex items-center gap-2">
        <div data-testid="legend-color-box" className="w-4 h-4 bg-secondary-300 rounded" />
        <span className="text-sm text-secondary-600">Forecast</span>
      </div>
      <div data-testid="legend-target" className="flex items-center gap-2">
        <div
          data-testid="legend-color-box"
          className="w-4 h-1 border-2 border-warning-500 border-dashed"
        />
        <span className="text-sm text-secondary-600">Target</span>
      </div>
    </div>
  );
}

/**
 * Loading Skeleton Component
 */
function LoadingSkeleton(): JSX.Element {
  return (
    <div data-testid="forecast-chart-skeleton" className="animate-pulse">
      <div className="h-8 bg-secondary-200 rounded w-48 mb-4" />
      <div className="flex items-end gap-4 h-64 mb-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} data-testid={`skeleton-bar-${i}`} className="flex-1">
            <div
              className="bg-secondary-200 rounded"
              style={{ height: `${60 + Math.random() * 40}%` }}
            />
          </div>
        ))}
      </div>
      <div data-testid="skeleton-summary-cards" className="grid grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-secondary-200 rounded" />
        ))}
      </div>
    </div>
  );
}

/**
 * Error State Component
 */
function ErrorState({
  error,
  onRetry,
}: {
  error: string;
  onRetry?: () => void;
}): JSX.Element {
  return (
    <div
      data-testid="forecast-chart-error"
      className="flex flex-col items-center justify-center py-12 text-center"
    >
      <svg
        className="w-12 h-12 text-danger-500 mb-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
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
          onClick={onRetry}
          className="px-4 py-2 bg-primary-500 text-white rounded hover:bg-primary-600"
        >
          Retry
        </button>
      )}
    </div>
  );
}

/**
 * Empty State Component
 */
function EmptyState(): JSX.Element {
  return (
    <div
      data-testid="forecast-chart-empty"
      className="flex flex-col items-center justify-center py-12 text-center"
    >
      <svg
        data-testid="empty-state-icon"
        className="w-16 h-16 text-secondary-400 mb-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
      <p className="text-secondary-700 font-medium mb-2">No forecast data available</p>
      <p className="text-secondary-500 text-sm">Add sales data to see forecast</p>
    </div>
  );
}

/**
 * Tooltip Component
 */
function Tooltip({
  period,
  visible,
}: {
  period: Period | null;
  visible: boolean;
}): JSX.Element | null {
  if (!visible || !period) return null;

  return (
    <div
      data-testid="bar-tooltip"
      className="absolute z-10 bg-secondary-800 text-white text-sm rounded-lg p-3 shadow-lg pointer-events-none"
      style={{ transform: 'translateX(-50%)' }}
    >
      <p className="font-medium mb-1">{getFullMonthName(period.label)}</p>
      <p>Actual: {formatCurrency(period.actual)}</p>
      <p>Forecast: {formatCurrency(period.forecast)}</p>
    </div>
  );
}

/**
 * Summary Card Component
 */
function SummaryCard({
  testId,
  label,
  value,
  subtitle,
  variant = 'default',
}: {
  testId: string;
  label: string;
  value: string;
  subtitle?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}): JSX.Element {
  const variantClasses = {
    default: 'bg-white border-secondary-200',
    success: 'bg-success-50 border-success-200',
    warning: 'bg-warning-50 border-warning-200',
    danger: 'bg-danger-50 border-danger-200',
  };

  return (
    <div
      data-testid={testId}
      className={`p-4 rounded-lg border ${variantClasses[variant]}`}
    >
      <p className="text-sm text-secondary-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-secondary-900">{value}</p>
      {subtitle && <p className="text-sm text-secondary-500 mt-1">{subtitle}</p>}
    </div>
  );
}

/**
 * Bar Component
 */
function Bar({
  period,
  type,
  height,
  maxHeight,
  isClickable,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: {
  period: Period;
  type: 'actual' | 'forecast';
  height: number;
  maxHeight: number;
  isClickable: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}): JSX.Element {
  const isActual = type === 'actual';
  const isFuture = period.actual === 0 && isActual;
  const barColor = isActual
    ? getBarColor(period.percentage, period.actual > period.forecast)
    : 'bg-secondary-300';

  const heightPercent = Math.max(0, Math.min(100, (height / maxHeight) * 100));
  const clickableClasses = isClickable ? 'cursor-pointer hover:opacity-80' : '';
  const futureClasses = isFuture ? 'opacity-50' : '';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      data-testid={`${type}-bar-${period.label}`}
      className={`${barColor} ${clickableClasses} ${futureClasses} rounded-t relative transition-opacity`}
      style={{ height: `${heightPercent}%` }}
      onClick={isClickable ? onClick : undefined}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onKeyDown={handleKeyDown}
      tabIndex={isClickable ? 0 : undefined}
      role="button"
      aria-label={`${getFullMonthName(period.label)} ${type}: ${formatCurrency(isActual ? period.actual : period.forecast)}`}
    >
      {isActual && (
        <>
          <span
            data-testid="status-indicator"
            className={`absolute -top-6 left-1/2 transform -translate-x-1/2 text-xs font-medium ${getStatusIndicatorClass(period.percentage)}`}
          >
            {period.percentage}%
          </span>
        </>
      )}
    </div>
  );
}

/**
 * ForecastChart Component
 */
export function ForecastChart({
  forecast,
  onDrillDown,
  onPeriodChange,
  loading = false,
  error,
  onRetry,
  compact = false,
  className = '',
  height = 256,
}: ForecastChartProps): JSX.Element {
  const [periodView, setPeriodView] = useState<PeriodView>('monthly');
  const [hoveredPeriod, setHoveredPeriod] = useState<Period | null>(null);

  // Handle loading state
  if (loading) {
    return (
      <div
        data-testid="forecast-chart"
        className={`p-6 bg-white rounded-lg shadow ${className}`}
      >
        <LoadingSkeleton />
      </div>
    );
  }

  // Handle error state
  if (error) {
    return (
      <div
        data-testid="forecast-chart"
        className={`p-6 bg-white rounded-lg shadow ${className}`}
      >
        <ErrorState error={error} onRetry={onRetry} />
      </div>
    );
  }

  // Handle empty state
  if (forecast.periods.length === 0) {
    return (
      <div
        data-testid="forecast-chart"
        className={`p-6 bg-white rounded-lg shadow ${className}`}
      >
        <EmptyState />
      </div>
    );
  }

  // Calculate max value for scaling bars
  const maxValue = Math.max(
    ...forecast.periods.flatMap((p) => [p.actual, p.forecast])
  );

  // Calculate gap (negative means projected is below target)
  const gap = forecast.target - forecast.projected;
  const isOnTrack = forecast.projected >= forecast.target;
  const achievedPercent = ((forecast.achieved / forecast.target) * 100).toFixed(1);
  const gapPercent = (gap / forecast.target) * 100;
  const isSignificantGap = gapPercent > 30; // More than 30% gap is significant

  // Handle period view change
  const handlePeriodChange = (view: PeriodView) => {
    setPeriodView(view);
    onPeriodChange?.(view);
  };

  // Handle bar click
  const handleBarClick = (period: Period) => {
    onDrillDown?.(period);
  };

  return (
    <div
      data-testid="forecast-chart"
      className={`p-6 bg-white rounded-lg shadow ${compact ? 'compact' : ''} ${className}`}
    >
      {/* Header with title and period selector */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-secondary-900">Sales Forecast</h2>
        <div data-testid="period-selector" className="flex gap-2">
          <button
            onClick={() => handlePeriodChange('monthly')}
            onKeyDown={(e) => e.key === 'Enter' && handlePeriodChange('monthly')}
            aria-pressed={periodView === 'monthly'}
            className={`px-4 py-2 text-sm font-medium rounded ${
              periodView === 'monthly'
                ? 'bg-primary-500 text-white'
                : 'bg-secondary-100 text-secondary-700 hover:bg-secondary-200'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => handlePeriodChange('quarterly')}
            onKeyDown={(e) => e.key === 'Enter' && handlePeriodChange('quarterly')}
            aria-pressed={periodView === 'quarterly'}
            className={`px-4 py-2 text-sm font-medium rounded ${
              periodView === 'quarterly'
                ? 'bg-primary-500 text-white'
                : 'bg-secondary-100 text-secondary-700 hover:bg-secondary-200'
            }`}
          >
            Quarterly
          </button>
        </div>
      </div>

      {/* Chart Area */}
      <figure
        role="figure"
        aria-label="Sales forecast bar chart showing actual vs forecast values by period"
        className="relative"
      >
        <div
          data-testid="chart-area"
          className="relative flex items-end gap-4"
          style={{ height: `${height}px` }}
        >
          {/* Y-Axis */}
          <div data-testid="y-axis" className="absolute left-0 top-0 bottom-0 w-16 flex flex-col justify-between text-xs text-secondary-500">
            <span>{formatCurrency(maxValue)}</span>
            <span>{formatCurrency(maxValue / 2)}</span>
            <span>$0</span>
          </div>

          {/* Target Line */}
          <div
            data-testid="target-line"
            className="absolute left-16 right-0 border-t-2 border-dashed border-warning-500 z-10"
            style={{ bottom: `${(forecast.target / maxValue / forecast.periods.length) * 100}%` }}
          >
            <span className="absolute right-0 -top-5 text-xs font-medium text-warning-600 bg-white px-1">
              Target
            </span>
          </div>

          {/* Bars Container */}
          <div className="flex-1 ml-16 flex items-end gap-4 h-full pt-8">
            {forecast.periods.map((period) => (
              <div key={period.label} className="flex-1 flex flex-col items-center relative">
                {/* Tooltip */}
                {hoveredPeriod?.label === period.label && (
                  <Tooltip period={hoveredPeriod} visible={true} />
                )}

                {/* Bar Group */}
                <div className="flex gap-1 items-end h-full w-full">
                  <div className="flex-1 h-full flex items-end">
                    <Bar
                      period={period}
                      type="actual"
                      height={period.actual}
                      maxHeight={maxValue}
                      isClickable={!!onDrillDown}
                      onClick={() => handleBarClick(period)}
                      onMouseEnter={() => setHoveredPeriod(period)}
                      onMouseLeave={() => setHoveredPeriod(null)}
                    />
                  </div>
                  <div className="flex-1 h-full flex items-end">
                    <Bar
                      period={period}
                      type="forecast"
                      height={period.forecast}
                      maxHeight={maxValue}
                      isClickable={!!onDrillDown}
                      onClick={() => handleBarClick(period)}
                      onMouseEnter={() => setHoveredPeriod(period)}
                      onMouseLeave={() => setHoveredPeriod(null)}
                    />
                  </div>
                </div>

                {/* X-Axis Label */}
                <span className="mt-2 text-sm text-secondary-600">{period.label}</span>
              </div>
            ))}
          </div>
        </div>
      </figure>

      {/* Legend */}
      {!compact && <ChartLegend />}

      {/* Summary Cards */}
      <div
        role="group"
        aria-label="Summary metrics"
        data-testid="summary-cards"
        className={`mt-6 grid gap-4 ${compact ? 'grid-cols-2' : 'grid-cols-4'}`}
      >
        <SummaryCard
          testId="summary-card-target"
          label="Target"
          value={formatCurrency(forecast.target)}
        />
        <SummaryCard
          testId="summary-card-achieved"
          label="Achieved"
          value={formatCurrency(forecast.achieved)}
          subtitle={`${achievedPercent}%`}
        />
        <SummaryCard
          testId="summary-card-projected"
          label="Projected"
          value={formatCurrency(forecast.projected)}
          variant={isOnTrack ? 'success' : 'warning'}
        />
        <SummaryCard
          testId="summary-card-gap"
          label="Gap"
          value={`-${formatCurrency(gap)}`}
          variant={isSignificantGap ? 'danger' : 'default'}
        />
      </div>
    </div>
  );
}

export default ForecastChart;
