/**
 * SLA Countdown Component Tests
 *
 * Visual indicator showing time remaining until SLA breach.
 * Follows ServiceNow-style SLA urgency display.
 */
import { render, screen, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import SLACountdown from './SLACountdown';

describe('SLACountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Time Display', () => {
    it('displays hours and minutes when more than 1 hour remaining', () => {
      render(<SLACountdown timeRemainingMinutes={150} />);

      // 150 minutes = 2h 30m
      expect(screen.getByText(/2h 30m/)).toBeInTheDocument();
    });

    it('displays only minutes when less than 1 hour remaining', () => {
      render(<SLACountdown timeRemainingMinutes={45} />);

      expect(screen.getByText(/45m/)).toBeInTheDocument();
    });

    it('displays days when more than 24 hours remaining', () => {
      render(<SLACountdown timeRemainingMinutes={2880} />);

      // 2880 minutes = 2 days
      expect(screen.getByText(/2d/)).toBeInTheDocument();
    });

    it('displays negative time when breached', () => {
      render(<SLACountdown timeRemainingMinutes={-30} isBreached />);

      // 30 minutes past due
      expect(screen.getByText(/-30m/)).toBeInTheDocument();
    });
  });

  describe('Urgency Styling', () => {
    it('shows normal styling when more than 2 hours remaining', () => {
      render(<SLACountdown timeRemainingMinutes={180} />);

      const countdown = screen.getByTestId('sla-countdown');
      expect(countdown).toHaveClass('sla-normal');
    });

    it('shows warning styling when at risk (less than 2 hours)', () => {
      render(<SLACountdown timeRemainingMinutes={90} isAtRisk />);

      const countdown = screen.getByTestId('sla-countdown');
      expect(countdown).toHaveClass('sla-warning');
    });

    it('shows danger styling when critical (less than 30 minutes)', () => {
      render(<SLACountdown timeRemainingMinutes={20} isAtRisk />);

      const countdown = screen.getByTestId('sla-countdown');
      expect(countdown).toHaveClass('sla-critical');
    });

    it('shows breached styling when SLA is breached', () => {
      render(<SLACountdown timeRemainingMinutes={-10} isBreached />);

      const countdown = screen.getByTestId('sla-countdown');
      expect(countdown).toHaveClass('sla-breached');
    });
  });

  describe('Icon Display', () => {
    it('shows clock icon for normal status', () => {
      render(<SLACountdown timeRemainingMinutes={180} />);

      expect(screen.getByTestId('sla-icon-clock')).toBeInTheDocument();
    });

    it('shows warning icon when at risk', () => {
      render(<SLACountdown timeRemainingMinutes={60} isAtRisk />);

      expect(screen.getByTestId('sla-icon-warning')).toBeInTheDocument();
    });

    it('shows alert icon when breached', () => {
      render(<SLACountdown timeRemainingMinutes={-10} isBreached />);

      expect(screen.getByTestId('sla-icon-alert')).toBeInTheDocument();
    });
  });

  describe('Live Updates', () => {
    it('decrements time every minute when enabled', () => {
      render(<SLACountdown timeRemainingMinutes={65} liveUpdate />);

      expect(screen.getByText(/1h 5m/)).toBeInTheDocument();

      // Advance timer by 1 minute
      act(() => {
        vi.advanceTimersByTime(60000);
      });

      expect(screen.getByText(/1h 4m/)).toBeInTheDocument();
    });

    it('does not update when liveUpdate is false', () => {
      render(<SLACountdown timeRemainingMinutes={65} liveUpdate={false} />);

      expect(screen.getByText(/1h 5m/)).toBeInTheDocument();

      // Advance timer by 1 minute
      act(() => {
        vi.advanceTimersByTime(60000);
      });

      // Should still show original time
      expect(screen.getByText(/1h 5m/)).toBeInTheDocument();
    });
  });

  describe('Compact Mode', () => {
    it('shows minimal display in compact mode', () => {
      render(<SLACountdown timeRemainingMinutes={90} compact />);

      const countdown = screen.getByTestId('sla-countdown');
      expect(countdown).toHaveClass('compact');
    });

    it('hides icon in compact mode', () => {
      render(<SLACountdown timeRemainingMinutes={90} compact />);

      expect(screen.queryByTestId('sla-icon-clock')).not.toBeInTheDocument();
      expect(screen.queryByTestId('sla-icon-warning')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has appropriate aria-label describing SLA status', () => {
      render(<SLACountdown timeRemainingMinutes={90} isAtRisk />);

      const countdown = screen.getByTestId('sla-countdown');
      expect(countdown).toHaveAttribute('aria-label', expect.stringContaining('SLA'));
    });

    it('indicates breached status in aria-label', () => {
      render(<SLACountdown timeRemainingMinutes={-10} isBreached />);

      const countdown = screen.getByTestId('sla-countdown');
      expect(countdown).toHaveAttribute('aria-label', expect.stringContaining('breached'));
    });
  });
});
