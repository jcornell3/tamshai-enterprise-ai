/**
 * SLA Countdown Component
 *
 * Visual indicator showing time remaining until SLA breach.
 * Displays urgency levels with appropriate styling.
 */
import { useState, useEffect } from 'react';

interface SLACountdownProps {
  timeRemainingMinutes: number;
  isAtRisk?: boolean;
  isBreached?: boolean;
  liveUpdate?: boolean;
  compact?: boolean;
}

export default function SLACountdown({
  timeRemainingMinutes: initialMinutes,
  isAtRisk = false,
  isBreached = false,
  liveUpdate = false,
  compact = false,
}: SLACountdownProps) {
  const [minutes, setMinutes] = useState(initialMinutes);

  // Live countdown update
  useEffect(() => {
    if (!liveUpdate) return;

    const interval = setInterval(() => {
      setMinutes((prev) => prev - 1);
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [liveUpdate]);

  // Update when prop changes
  useEffect(() => {
    setMinutes(initialMinutes);
  }, [initialMinutes]);

  // Format time display
  const formatTime = (totalMinutes: number): string => {
    const absMinutes = Math.abs(totalMinutes);
    const sign = totalMinutes < 0 ? '-' : '';

    if (absMinutes >= 1440) {
      const days = Math.floor(absMinutes / 1440);
      const hours = Math.floor((absMinutes % 1440) / 60);
      return `${sign}${days}d ${hours}h`;
    }

    if (absMinutes >= 60) {
      const hours = Math.floor(absMinutes / 60);
      const mins = absMinutes % 60;
      return `${sign}${hours}h ${mins}m`;
    }

    return `${sign}${absMinutes}m`;
  };

  // Determine urgency level
  const getUrgencyClass = (): string => {
    if (isBreached) return 'sla-breached';
    if (minutes <= 30) return 'sla-critical';
    if (isAtRisk || minutes <= 120) return 'sla-warning';
    return 'sla-normal';
  };

  // Determine aria label
  const getAriaLabel = (): string => {
    if (isBreached) {
      return `SLA breached by ${Math.abs(minutes)} minutes`;
    }
    if (isAtRisk) {
      return `SLA at risk, ${minutes} minutes remaining`;
    }
    return `SLA: ${minutes} minutes remaining`;
  };

  // Get icon based on status
  const renderIcon = () => {
    if (compact) return null;

    if (isBreached) {
      return (
        <svg
          data-testid="sla-icon-alert"
          className="w-4 h-4"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
            clipRule="evenodd"
          />
        </svg>
      );
    }

    if (isAtRisk || minutes <= 120) {
      return (
        <svg
          data-testid="sla-icon-warning"
          className="w-4 h-4"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
            clipRule="evenodd"
          />
        </svg>
      );
    }

    return (
      <svg
        data-testid="sla-icon-clock"
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    );
  };

  // Get styling classes
  const getContainerClasses = (): string => {
    const baseClasses = 'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-sm font-medium';
    const urgencyClass = getUrgencyClass();
    const compactClass = compact ? 'compact text-xs px-1.5 py-0.5' : '';

    const colorClasses = {
      'sla-normal': 'bg-secondary-100 text-secondary-700',
      'sla-warning': 'bg-warning-100 text-warning-800',
      'sla-critical': 'bg-danger-100 text-danger-800 animate-pulse',
      'sla-breached': 'bg-danger-500 text-white',
    }[urgencyClass];

    return `${baseClasses} ${urgencyClass} ${compactClass} ${colorClasses}`;
  };

  return (
    <div
      data-testid="sla-countdown"
      className={getContainerClasses()}
      aria-label={getAriaLabel()}
      role="status"
    >
      {renderIcon()}
      <span>{formatTime(minutes)}</span>
    </div>
  );
}
