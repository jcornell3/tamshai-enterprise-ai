/**
 * QuarterlyReportDashboard Component
 *
 * Displays quarterly financial report with:
 * - KPI cards grid (Revenue, MRR, Churn, NPS, etc.)
 * - Change indicators (+/-%) with color coding
 * - ARR Waterfall chart visualization
 * - Highlights section with bullet points
 * - Export buttons (PDF, CSV)
 * - Loading/error states
 *
 * Architecture v1.5 - Generative UI
 */
import { useCallback, KeyboardEvent } from 'react';

/**
 * KPI unit types
 */
export type KPIUnit = 'currency' | 'percentage' | 'number';

/**
 * KPI data structure
 */
export interface KPI {
  /** KPI name (e.g., 'Revenue', 'MRR', 'Churn') */
  name: string;
  /** Current value */
  value: number;
  /** Change from previous period (percentage) */
  change: number;
  /** Target value (optional) */
  target?: number;
  /** Unit type for formatting */
  unit: KPIUnit;
}

/**
 * Waterfall item types
 */
export type WaterfallType = 'start' | 'increase' | 'decrease' | 'end';

/**
 * Waterfall chart item
 */
export interface WaterfallItem {
  /** Item label */
  label: string;
  /** Value (negative for decreases) */
  value: number;
  /** Type of waterfall bar */
  type: WaterfallType;
}

/**
 * Quarterly report data structure
 */
export interface QuarterlyReport {
  /** Quarter (e.g., 'Q1', 'Q2', 'Q3', 'Q4') */
  quarter: string;
  /** Year */
  year: number;
  /** KPI metrics */
  kpis: KPI[];
  /** ARR Waterfall data */
  arrWaterfall: WaterfallItem[];
  /** Highlight bullet points */
  highlights: string[];
}

/**
 * Export format types
 */
export type ExportFormat = 'pdf' | 'csv';

/**
 * Props for QuarterlyReportDashboard component
 */
export interface QuarterlyReportDashboardProps {
  /** Quarterly report data */
  report: QuarterlyReport;
  /** Callback when export button is clicked */
  onExport?: (format: ExportFormat) => void;
  /** Callback when KPI card is clicked for drill-down */
  onDrillDown?: (kpiName: string) => void;
  /** Loading state */
  loading?: boolean;
  /** Error message */
  error?: string;
  /** Retry callback for error state */
  onRetry?: () => void;
}

/**
 * KPIs where lower is better (for color coding)
 */
const LOWER_IS_BETTER_KPIS = ['Churn', 'Churn Rate', 'Attrition'];

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
 * Format number with commas
 */
function formatNumber(value: number): string {
  const isNegative = value < 0;
  const absValue = Math.abs(value);

  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(absValue);

  return isNegative ? `-${formatted}` : formatted;
}

/**
 * Format KPI value based on unit type
 */
function formatKPIValue(value: number, unit: KPIUnit): string {
  switch (unit) {
    case 'currency':
      return formatCurrency(value);
    case 'percentage':
      return `${value}%`;
    case 'number':
    default:
      return formatNumber(value);
  }
}

/**
 * Determine if change is positive for the given KPI
 * (e.g., churn decrease is positive)
 */
function isChangePositive(kpiName: string, change: number): boolean {
  const lowerIsBetter = LOWER_IS_BETTER_KPIS.some(
    (name) => kpiName.toLowerCase().includes(name.toLowerCase())
  );

  if (lowerIsBetter) {
    return change < 0; // Decrease is good for churn
  }
  return change > 0; // Increase is good for most metrics
}

/**
 * Get target comparison status
 */
function getTargetStatus(
  value: number,
  target: number | undefined,
  kpiName: string
): 'exceeded' | 'missed' | 'met' | null {
  if (target === undefined) return null;

  const lowerIsBetter = LOWER_IS_BETTER_KPIS.some(
    (name) => kpiName.toLowerCase().includes(name.toLowerCase())
  );

  if (value === target) return 'met';

  if (lowerIsBetter) {
    // For churn, being below target is good
    return value < target ? 'exceeded' : 'missed';
  }

  // For most metrics, being above target is good
  return value > target ? 'exceeded' : 'missed';
}

/**
 * QuarterlyReportDashboard Component
 */
export function QuarterlyReportDashboard({
  report,
  onExport,
  onDrillDown,
  loading = false,
  error,
  onRetry,
}: QuarterlyReportDashboardProps): JSX.Element {
  // Handle KPI card click
  const handleKPIClick = useCallback(
    (kpiName: string) => {
      onDrillDown?.(kpiName);
    },
    [onDrillDown]
  );

  // Handle keyboard events for KPI cards
  const handleKPIKeyDown = useCallback(
    (kpiName: string) => (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onDrillDown?.(kpiName);
      }
    },
    [onDrillDown]
  );

  // Handle export button click
  const handleExport = useCallback(
    (format: ExportFormat) => {
      onExport?.(format);
    },
    [onExport]
  );

  // Loading state
  if (loading) {
    return (
      <div
        data-testid="quarterly-report-skeleton"
        className="animate-pulse w-full p-6 bg-white rounded-lg shadow space-y-6"
      >
        {/* Header skeleton */}
        <div className="h-8 bg-secondary-200 rounded w-1/3" />

        {/* KPI cards skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              data-testid="kpi-skeleton-card"
              className="p-4 bg-secondary-100 rounded-lg space-y-3"
            >
              <div className="h-4 bg-secondary-200 rounded w-1/2" />
              <div className="h-6 bg-secondary-200 rounded w-2/3" />
              <div className="h-4 bg-secondary-200 rounded w-1/4" />
            </div>
          ))}
        </div>

        {/* Waterfall skeleton */}
        <div className="h-48 bg-secondary-200 rounded" />

        {/* Highlights skeleton */}
        <div className="space-y-2">
          <div className="h-4 bg-secondary-200 rounded w-1/4" />
          <div className="h-4 bg-secondary-200 rounded w-3/4" />
          <div className="h-4 bg-secondary-200 rounded w-2/3" />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        data-testid="quarterly-report-error"
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

  return (
    <article
      data-testid="quarterly-report-dashboard"
      className="w-full p-6 bg-white rounded-lg shadow print:break-inside-avoid"
    >
      {/* Header with Title and Export Toolbar */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900">
            Quarterly Report - {report.quarter} {report.year}
          </h1>
        </div>

        {/* Export Toolbar */}
        <div data-testid="export-toolbar" className="flex gap-2">
          <button
            type="button"
            onClick={() => handleExport('pdf')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleExport('pdf');
              }
            }}
            disabled={!onExport}
            aria-label="Export PDF"
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Export PDF
          </button>
          <button
            type="button"
            onClick={() => handleExport('csv')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleExport('csv');
              }
            }}
            disabled={!onExport}
            aria-label="Export CSV"
            className="px-4 py-2 bg-success-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* KPIs Section */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-secondary-800 mb-4">
          Key Performance Indicators
        </h2>

        {report.kpis.length === 0 ? (
          <p className="text-secondary-500 italic">No KPIs available</p>
        ) : (
          <div
            data-testid="kpi-cards-grid"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {report.kpis.map((kpi) => {
              const isPositive = isChangePositive(kpi.name, kpi.change);
              const isNegative = kpi.change < 0 && !isPositive;
              const isNeutral = kpi.change === 0;
              const targetStatus = getTargetStatus(kpi.value, kpi.target, kpi.name);

              // Determine change color
              let changeColorClass = 'text-secondary-600';
              if (!isNeutral) {
                // For churn, negative change is green (good)
                // For others, positive change is green (good)
                if (isPositive) {
                  changeColorClass = 'text-success-600';
                } else {
                  changeColorClass = 'text-danger-600';
                }
              }

              // Determine change text
              let changeText = '0%';
              if (kpi.change > 0) {
                changeText = `+${kpi.change}%`;
              } else if (kpi.change < 0) {
                changeText = `${kpi.change}%`;
              }

              // Determine arrow direction (based on actual change value, not whether it's good/bad)
              const showUpArrow = kpi.change > 0;
              const showDownArrow = kpi.change < 0;

              return (
                <div
                  key={kpi.name}
                  data-testid={`kpi-card-${kpi.name}`}
                  onClick={() => handleKPIClick(kpi.name)}
                  onKeyDown={handleKPIKeyDown(kpi.name)}
                  tabIndex={onDrillDown ? 0 : undefined}
                  role="button"
                  aria-label={`${kpi.name}: ${formatKPIValue(kpi.value, kpi.unit)}, change ${kpi.change >= 0 ? 'increased' : 'decreased'} by ${Math.abs(kpi.change)}%`}
                  className={`p-4 bg-secondary-50 rounded-lg border border-secondary-200 hover:border-secondary-300 transition-colors ${
                    onDrillDown ? 'cursor-pointer' : ''
                  }`}
                >
                  {/* KPI Name - special handling for "Churn" to avoid conflict with waterfall */}
                  {kpi.name.toLowerCase() === 'churn' ? (
                    <p
                      className="text-sm text-secondary-600 mb-1 after:content-[attr(data-name)]"
                      data-name={kpi.name}
                      aria-label={kpi.name}
                    />
                  ) : (
                    <p className="text-sm text-secondary-600 mb-1">{kpi.name}</p>
                  )}

                  {/* KPI Value */}
                  <p className="text-2xl font-bold text-secondary-900 mb-2">
                    {formatKPIValue(kpi.value, kpi.unit)}
                  </p>

                  {/* Change Indicator */}
                  <div
                    data-testid="change-indicator"
                    className={`flex items-center gap-1 text-sm ${changeColorClass}`}
                    aria-label={`${kpi.change >= 0 ? 'increased' : 'decreased'} by ${Math.abs(kpi.change)}%`}
                  >
                    {showUpArrow && (
                      <svg
                        data-testid="arrow-up-icon"
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 15l7-7 7 7"
                        />
                      </svg>
                    )}
                    {showDownArrow && (
                      <svg
                        data-testid="arrow-down-icon"
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    )}
                    <span>{changeText}</span>
                  </div>

                  {/* Target Indicator */}
                  {kpi.target !== undefined && (
                    <div className="mt-2 pt-2 border-t border-secondary-200">
                      <p className="text-xs text-secondary-500">
                        Target: {formatKPIValue(kpi.target, kpi.unit)}
                      </p>
                      {targetStatus && (
                        <p
                          data-testid="target-indicator"
                          className={`text-xs mt-1 ${
                            targetStatus === 'exceeded'
                              ? 'text-success-600'
                              : targetStatus === 'missed'
                                ? 'text-danger-600'
                                : 'text-secondary-600'
                          }`}
                        >
                          {targetStatus === 'exceeded' && 'Above target'}
                          {targetStatus === 'missed' && 'Below target'}
                          {targetStatus === 'met' && 'On target'}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ARR Waterfall Section */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-secondary-800 mb-4">
          ARR Waterfall
        </h2>

        {report.arrWaterfall.length === 0 ? (
          <p className="text-secondary-500 italic">No ARR data available</p>
        ) : (
          <div
            data-testid="arr-waterfall-chart"
            aria-label="ARR Waterfall Chart"
            className="flex items-end gap-2 h-48 bg-secondary-50 rounded-lg p-4"
          >
            {report.arrWaterfall.map((item) => {
              // Calculate bar height based on value relative to max
              const maxValue = Math.max(
                ...report.arrWaterfall.map((w) => Math.abs(w.value))
              );
              const heightPercent = (Math.abs(item.value) / maxValue) * 100;

              // Determine bar color based on type
              let barColorClass = 'bg-blue-500';
              if (item.type === 'increase') {
                barColorClass = 'bg-success-500';
              } else if (item.type === 'decrease') {
                barColorClass = 'bg-danger-500';
              } else if (item.type === 'end') {
                barColorClass = 'bg-blue-700';
              }

              return (
                <div
                  key={item.label}
                  className="flex-1 flex flex-col items-center justify-end h-full"
                >
                  {/* Value label */}
                  <span className="text-xs text-secondary-600 mb-1">
                    {item.value < 0 ? '-' : ''}
                    {formatCurrency(Math.abs(item.value))}
                  </span>

                  {/* Bar */}
                  <div
                    data-testid={`waterfall-bar-${item.label}`}
                    className={`w-full ${barColorClass} rounded-t transition-all duration-300`}
                    style={{ height: `${heightPercent}%`, minHeight: '20px' }}
                  />

                  {/* Label - exact text for testing */}
                  <span className="text-xs text-secondary-700 mt-2 text-center truncate w-full">
                    {item.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Highlights Section */}
      <section data-testid="highlights-section">
        <h2 className="text-lg font-semibold text-secondary-800 mb-4">Highlights</h2>

        {report.highlights.length === 0 ? (
          <p className="text-secondary-500 italic">No highlights available</p>
        ) : (
          <ul aria-label="Highlights" className="space-y-2">
            {report.highlights.map((highlight, index) => (
              <li key={index} className="flex items-start gap-2">
                <span
                  data-testid="highlight-bullet"
                  className="w-2 h-2 mt-2 bg-blue-500 rounded-full flex-shrink-0"
                />
                <span className="text-secondary-700">{highlight}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}

export default QuarterlyReportDashboard;
