/**
 * OrgChartComponent - Organizational Chart Display
 *
 * Displays hierarchical employee relationships in a 3-row layout:
 * - Top row: Manager (if present)
 * - Middle row: Self and peers
 * - Bottom row: Direct reports
 *
 * Features:
 * - EmployeeCard sub-component with name, title, avatar
 * - Self card highlighting with "You" badge
 * - Click handling for navigation
 * - Loading, error, and empty states
 * - Full keyboard accessibility
 */
import { useCallback, KeyboardEvent } from 'react';

/**
 * Employee data structure
 */
export interface Employee {
  /** Unique employee identifier */
  id: string;
  /** Employee full name */
  name: string;
  /** Job title */
  title: string;
  /** Email address (optional) */
  email?: string;
  /** Avatar image URL (optional) */
  avatarUrl?: string;
}

/**
 * Props for OrgChartComponent
 */
export interface OrgChartComponentProps {
  /** The manager employee (optional) */
  manager?: Employee;
  /** The current user (self) */
  self: Employee;
  /** Peer employees at the same level */
  peers: Employee[];
  /** Direct reports under the current user */
  directReports: Employee[];
  /** Callback when an employee card is clicked */
  onEmployeeClick?: (employee: Employee) => void;
  /** Loading state */
  loading?: boolean;
  /** Error message */
  error?: string;
  /** Show empty state messages */
  showEmptyStates?: boolean;
  /** Additional CSS class name */
  className?: string;
  /** Compact display mode */
  compact?: boolean;
}

/**
 * Props for EmployeeCard sub-component
 */
interface EmployeeCardProps {
  employee: Employee;
  isSelf?: boolean;
  isClickable?: boolean;
  onClick?: (employee: Employee) => void;
}

/**
 * EmployeeCard - Individual employee display card
 */
function EmployeeCard({
  employee,
  isSelf = false,
  isClickable = false,
  onClick,
}: EmployeeCardProps): JSX.Element {
  const handleClick = useCallback(() => {
    if (onClick) {
      onClick(employee);
    }
  }, [onClick, employee]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if ((event.key === 'Enter' || event.key === ' ') && onClick) {
        event.preventDefault();
        onClick(employee);
      }
    },
    [onClick, employee]
  );

  const cardClasses = [
    'flex items-center gap-3 p-4 rounded-lg border-2 min-w-[200px] transition-all',
    isSelf ? 'border-primary-500 bg-primary-50 shadow-md' : 'border-secondary-200 bg-white hover:border-secondary-300 hover:shadow-sm',
    isClickable ? 'cursor-pointer' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      data-testid={`employee-card-${employee.id}`}
      className={cardClasses}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`${employee.name}, ${employee.title}`}
      aria-current={isSelf ? 'true' : undefined}
    >
      {/* Avatar */}
      {employee.avatarUrl ? (
        <img
          src={employee.avatarUrl}
          alt={employee.name}
          className="w-16 h-16 rounded-full object-cover flex-shrink-0"
        />
      ) : (
        <div
          data-testid="default-avatar"
          className="w-16 h-16 rounded-full bg-secondary-200 flex items-center justify-center font-bold text-2xl text-secondary-400 flex-shrink-0"
        >
          {employee.name.charAt(0).toUpperCase()}
        </div>
      )}

      {/* Employee Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-secondary-900 truncate">{employee.name}</span>
          {isSelf && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary-100 text-primary-800">
              You
            </span>
          )}
        </div>
        <div className="text-sm text-secondary-600 truncate">{employee.title}</div>
        {employee.email && (
          <div className="text-xs text-secondary-500 truncate mt-0.5">{employee.email}</div>
        )}
      </div>
    </div>
  );
}

/**
 * Skeleton loader for loading state
 */
function OrgChartSkeleton(): JSX.Element {
  return (
    <div data-testid="org-chart-skeleton" className="space-y-6">
      <div className="flex justify-center">
        <div className="w-64 h-20 bg-gray-200 rounded-lg animate-pulse" />
      </div>
      <div className="flex justify-center gap-4">
        <div className="w-64 h-20 bg-gray-200 rounded-lg animate-pulse" />
        <div className="w-64 h-20 bg-gray-200 rounded-lg animate-pulse" />
        <div className="w-64 h-20 bg-gray-200 rounded-lg animate-pulse" />
      </div>
      <div className="flex justify-center gap-4">
        <div className="w-64 h-20 bg-gray-200 rounded-lg animate-pulse" />
        <div className="w-64 h-20 bg-gray-200 rounded-lg animate-pulse" />
      </div>
    </div>
  );
}

/**
 * Error display component
 */
function OrgChartError({ message }: { message: string }): JSX.Element {
  return (
    <div data-testid="org-chart-error" className="flex flex-col items-center justify-center p-8 bg-red-50 border-2 border-red-200 rounded-lg">
      <div className="w-12 h-12 flex items-center justify-center bg-red-500 text-white rounded-full text-2xl font-bold mb-4">
        !
      </div>
      <div className="text-red-700 text-center">{message}</div>
    </div>
  );
}

/**
 * OrgChartComponent - Main component
 */
export function OrgChartComponent({
  manager,
  self,
  peers,
  directReports,
  onEmployeeClick,
  loading = false,
  error,
  showEmptyStates = false,
  className = '',
  compact = false,
}: OrgChartComponentProps): JSX.Element {
  const containerClasses = ['space-y-6', className, compact ? 'text-sm' : '']
    .filter(Boolean)
    .join(' ');

  const isClickable = !!onEmployeeClick;
  const teamCount = 1 + peers.length; // self + peers

  // Loading state
  if (loading) {
    return (
      <div data-testid="org-chart" className={containerClasses}>
        <h2 className="text-2xl font-bold text-secondary-900 mb-4">Organization Chart</h2>
        <OrgChartSkeleton />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div data-testid="org-chart" className={containerClasses}>
        <h2 className="text-2xl font-bold text-secondary-900 mb-4">Organization Chart</h2>
        <OrgChartError message={error} />
      </div>
    );
  }

  // Determine which rows to show
  const showManagerRow = manager || showEmptyStates;
  const showReportsRow = directReports.length > 0 || showEmptyStates;

  return (
    <div data-testid="org-chart" className={containerClasses}>
      <h2 className="text-2xl font-bold text-secondary-900 mb-4">Organization Chart</h2>

      {/* Manager Row */}
      {showManagerRow && (
        <section
          data-testid="org-chart-manager-row"
          className="flex flex-col items-center"
          role="region"
          aria-label="Manager"
        >
          {manager ? (
            <>
              <EmployeeCard
                employee={manager}
                isClickable={isClickable}
                onClick={onEmployeeClick}
              />
              {/* Connection line to self row */}
              <div
                data-testid="connection-line-manager-self"
                className="w-px h-4 bg-secondary-300"
              />
            </>
          ) : (
            <div className="text-secondary-600 text-sm italic">No manager assigned</div>
          )}
        </section>
      )}

      {/* Self and Peers Row */}
      <section
        data-testid="org-chart-self-row"
        className="flex flex-col items-center"
        role="region"
        aria-label="Team members"
      >
        <div className="text-sm font-semibold text-secondary-700 uppercase tracking-wide mb-3">
          Team ({teamCount})
        </div>
        <div className="flex flex-wrap justify-center gap-4">
          {/* Self card first */}
          <EmployeeCard
            employee={self}
            isSelf={true}
            isClickable={isClickable}
            onClick={onEmployeeClick}
          />

          {/* Peer cards */}
          {peers.map((peer) => (
            <EmployeeCard
              key={peer.id}
              employee={peer}
              isClickable={isClickable}
              onClick={onEmployeeClick}
            />
          ))}

          {/* Empty state for no peers */}
          {peers.length === 0 && showEmptyStates && (
            <div className="text-secondary-600 text-sm italic">No peers</div>
          )}
        </div>
      </section>

      {/* Direct Reports Row */}
      {showReportsRow && (
        <section
          data-testid="org-chart-reports-row"
          className="flex flex-col items-center"
          role="region"
          aria-label="Direct reports"
        >
          {directReports.length > 0 ? (
            <>
              {/* Connection line from self */}
              <div
                data-testid="connection-line-self-reports"
                className="w-px h-4 bg-secondary-300"
              />
              <div className="text-sm font-semibold text-secondary-700 uppercase tracking-wide mb-3">
                Direct Reports ({directReports.length})
              </div>
              <div className="flex flex-wrap justify-center gap-4">
                {directReports.map((report) => (
                  <EmployeeCard
                    key={report.id}
                    employee={report}
                    isClickable={isClickable}
                    onClick={onEmployeeClick}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="text-secondary-600 text-sm italic">No direct reports</div>
          )}
        </section>
      )}
    </div>
  );
}

export default OrgChartComponent;
