/**
 * ForecastChart Component Tests - TDD RED Phase
 *
 * Tests for the sales forecast visualization component that displays
 * actual vs forecast performance as a bar chart with summary metrics.
 *
 * These tests are written BEFORE the component implementation (TDD RED phase).
 * All tests should FAIL until the component is implemented.
 *
 * Component Structure:
 * - Bar chart with actual vs forecast bars per period
 * - Target line overlay on chart
 * - Summary cards: Target, Achieved, Projected, Gap
 * - Period selector (Q1-Q4, Monthly)
 * - Legend with actual/forecast/target indicators
 */
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ForecastChart } from '../ForecastChart';
import type { ForecastData, Period } from '../ForecastChart';

// Test data for forecast periods
const mockPeriods: Period[] = [
  {
    label: 'Jan',
    actual: 85000,
    forecast: 100000,
    percentage: 85,
  },
  {
    label: 'Feb',
    actual: 92000,
    forecast: 100000,
    percentage: 92,
  },
  {
    label: 'Mar',
    actual: 110000,
    forecast: 100000,
    percentage: 110,
  },
  {
    label: 'Apr',
    actual: 78000,
    forecast: 105000,
    percentage: 74,
  },
];

const mockForecastData: ForecastData = {
  periods: mockPeriods,
  target: 1200000,
  achieved: 365000,
  projected: 1150000,
};

// Quarterly periods for quarterly view testing
const mockQuarterlyPeriods: Period[] = [
  {
    label: 'Q1',
    actual: 287000,
    forecast: 300000,
    percentage: 96,
  },
  {
    label: 'Q2',
    actual: 0,
    forecast: 300000,
    percentage: 0,
  },
  {
    label: 'Q3',
    actual: 0,
    forecast: 300000,
    percentage: 0,
  },
  {
    label: 'Q4',
    actual: 0,
    forecast: 300000,
    percentage: 0,
  },
];

describe('ForecastChart Component', () => {
  describe('Basic Rendering', () => {
    it('renders the forecast chart container', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      expect(screen.getByTestId('forecast-chart')).toBeInTheDocument();
    });

    it('renders chart title', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      expect(screen.getByRole('heading', { name: /sales forecast/i })).toBeInTheDocument();
    });

    it('renders the bar chart area', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      expect(screen.getByTestId('chart-area')).toBeInTheDocument();
    });

    it('renders y-axis with value labels', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      const yAxis = screen.getByTestId('y-axis');
      expect(yAxis).toBeInTheDocument();
    });

    it('renders x-axis with period labels', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      expect(screen.getByText('Jan')).toBeInTheDocument();
      expect(screen.getByText('Feb')).toBeInTheDocument();
      expect(screen.getByText('Mar')).toBeInTheDocument();
      expect(screen.getByText('Apr')).toBeInTheDocument();
    });
  });

  describe('Bar Chart Rendering', () => {
    it('renders actual bar for each period', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      expect(screen.getByTestId('actual-bar-Jan')).toBeInTheDocument();
      expect(screen.getByTestId('actual-bar-Feb')).toBeInTheDocument();
      expect(screen.getByTestId('actual-bar-Mar')).toBeInTheDocument();
      expect(screen.getByTestId('actual-bar-Apr')).toBeInTheDocument();
    });

    it('renders forecast bar for each period', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      expect(screen.getByTestId('forecast-bar-Jan')).toBeInTheDocument();
      expect(screen.getByTestId('forecast-bar-Feb')).toBeInTheDocument();
      expect(screen.getByTestId('forecast-bar-Mar')).toBeInTheDocument();
      expect(screen.getByTestId('forecast-bar-Apr')).toBeInTheDocument();
    });

    it('applies correct styling to actual bars', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      const actualBar = screen.getByTestId('actual-bar-Jan');
      expect(actualBar).toHaveClass('bg-blue-500');
    });

    it('applies correct styling to forecast bars', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      const forecastBar = screen.getByTestId('forecast-bar-Jan');
      expect(forecastBar).toHaveClass('bg-gray-300');
    });

    it('applies success styling when actual exceeds forecast', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      // March: actual 110000 > forecast 100000
      const actualBar = screen.getByTestId('actual-bar-Mar');
      expect(actualBar).toHaveClass('bg-green-500');
    });

    it('applies warning styling when actual is significantly below forecast', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      // April: actual 78000, forecast 105000 (74% - below 80% threshold)
      const actualBar = screen.getByTestId('actual-bar-Apr');
      expect(actualBar).toHaveClass('bg-red-500');
    });

    it('renders bars with proportional heights based on values', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      const janActual = screen.getByTestId('actual-bar-Jan');
      const marActual = screen.getByTestId('actual-bar-Mar');

      // March bar should be taller than January bar
      const janHeight = parseInt(janActual.style.height || '0');
      const marHeight = parseInt(marActual.style.height || '0');
      expect(marHeight).toBeGreaterThan(janHeight);
    });
  });

  describe('Target Line Overlay', () => {
    it('renders target line on chart', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      expect(screen.getByTestId('target-line')).toBeInTheDocument();
    });

    it('target line has correct styling', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      const targetLine = screen.getByTestId('target-line');
      expect(targetLine).toHaveClass('border-dashed', 'border-orange-500');
    });

    it('target line shows target value label', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      const targetLine = screen.getByTestId('target-line');
      expect(within(targetLine).getByText(/target/i)).toBeInTheDocument();
    });
  });

  describe('Summary Cards', () => {
    it('renders target summary card', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      const targetCard = screen.getByTestId('summary-card-target');
      expect(targetCard).toBeInTheDocument();
      expect(within(targetCard).getByText('Target')).toBeInTheDocument();
      expect(within(targetCard).getByText('$1,200,000')).toBeInTheDocument();
    });

    it('renders achieved summary card', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      const achievedCard = screen.getByTestId('summary-card-achieved');
      expect(achievedCard).toBeInTheDocument();
      expect(within(achievedCard).getByText('Achieved')).toBeInTheDocument();
      expect(within(achievedCard).getByText('$365,000')).toBeInTheDocument();
    });

    it('renders projected summary card', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      const projectedCard = screen.getByTestId('summary-card-projected');
      expect(projectedCard).toBeInTheDocument();
      expect(within(projectedCard).getByText('Projected')).toBeInTheDocument();
      expect(within(projectedCard).getByText('$1,150,000')).toBeInTheDocument();
    });

    it('renders gap summary card with calculated value', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      const gapCard = screen.getByTestId('summary-card-gap');
      expect(gapCard).toBeInTheDocument();
      expect(within(gapCard).getByText('Gap')).toBeInTheDocument();
      // Gap = Target - Projected = 1,200,000 - 1,150,000 = 50,000
      expect(within(gapCard).getByText('-$50,000')).toBeInTheDocument();
    });

    it('shows percentage of target achieved', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      const achievedCard = screen.getByTestId('summary-card-achieved');
      // 365,000 / 1,200,000 = 30.4%
      expect(within(achievedCard).getByText(/30\.4%/)).toBeInTheDocument();
    });

    it('applies success styling when projected meets or exceeds target', () => {
      const onTrackData: ForecastData = {
        periods: mockPeriods,
        target: 1000000,
        achieved: 400000,
        projected: 1050000, // Exceeds target
      };

      render(<ForecastChart forecast={onTrackData} />);

      const projectedCard = screen.getByTestId('summary-card-projected');
      expect(projectedCard).toHaveClass('bg-green-50', 'border-green-200');
    });

    it('applies warning styling when projected is below target', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      const projectedCard = screen.getByTestId('summary-card-projected');
      expect(projectedCard).toHaveClass('bg-amber-50', 'border-amber-200');
    });

    it('applies danger styling when gap is significant', () => {
      const significantGapData: ForecastData = {
        periods: mockPeriods,
        target: 1500000,
        achieved: 200000,
        projected: 900000, // 60% of target
      };

      render(<ForecastChart forecast={significantGapData} />);

      const gapCard = screen.getByTestId('summary-card-gap');
      expect(gapCard).toHaveClass('bg-red-50', 'border-red-200');
    });
  });

  describe('Period Selector', () => {
    it('renders period selector', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      expect(screen.getByTestId('period-selector')).toBeInTheDocument();
    });

    it('renders Monthly option', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      expect(screen.getByRole('button', { name: /monthly/i })).toBeInTheDocument();
    });

    it('renders quarterly options (Q1-Q4)', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      expect(screen.getByRole('button', { name: /quarterly/i })).toBeInTheDocument();
    });

    it('Monthly is selected by default', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      const monthlyButton = screen.getByRole('button', { name: /monthly/i });
      expect(monthlyButton).toHaveAttribute('aria-pressed', 'true');
    });

    it('calls onPeriodChange when period option clicked', () => {
      const handlePeriodChange = jest.fn();
      render(
        <ForecastChart forecast={mockForecastData} onPeriodChange={handlePeriodChange} />
      );

      const quarterlyButton = screen.getByRole('button', { name: /quarterly/i });
      fireEvent.click(quarterlyButton);

      expect(handlePeriodChange).toHaveBeenCalledWith('quarterly');
    });

    it('updates selected period visual state on click', () => {
      const handlePeriodChange = jest.fn();
      render(
        <ForecastChart forecast={mockForecastData} onPeriodChange={handlePeriodChange} />
      );

      const quarterlyButton = screen.getByRole('button', { name: /quarterly/i });
      fireEvent.click(quarterlyButton);

      expect(quarterlyButton).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: /monthly/i })).toHaveAttribute(
        'aria-pressed',
        'false'
      );
    });

    it('does not throw when onPeriodChange is not provided', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      const quarterlyButton = screen.getByRole('button', { name: /quarterly/i });
      expect(() => fireEvent.click(quarterlyButton)).not.toThrow();
    });

    it('can click Monthly button to switch back from quarterly', () => {
      const handlePeriodChange = jest.fn();
      render(
        <ForecastChart forecast={mockForecastData} onPeriodChange={handlePeriodChange} />
      );

      // First switch to quarterly
      const quarterlyButton = screen.getByRole('button', { name: /quarterly/i });
      fireEvent.click(quarterlyButton);
      expect(handlePeriodChange).toHaveBeenCalledWith('quarterly');

      // Then click back to monthly
      const monthlyButton = screen.getByRole('button', { name: /monthly/i });
      fireEvent.click(monthlyButton);
      expect(handlePeriodChange).toHaveBeenCalledWith('monthly');
    });
  });

  describe('Bar Click Interactions (Drill Down)', () => {
    it('calls onDrillDown when clicking a bar', () => {
      const handleDrillDown = jest.fn();
      render(<ForecastChart forecast={mockForecastData} onDrillDown={handleDrillDown} />);

      const janBar = screen.getByTestId('actual-bar-Jan');
      fireEvent.click(janBar);

      expect(handleDrillDown).toHaveBeenCalledWith(mockPeriods[0]);
    });

    it('calls onDrillDown with correct period data', () => {
      const handleDrillDown = jest.fn();
      render(<ForecastChart forecast={mockForecastData} onDrillDown={handleDrillDown} />);

      const marBar = screen.getByTestId('actual-bar-Mar');
      fireEvent.click(marBar);

      expect(handleDrillDown).toHaveBeenCalledWith({
        label: 'Mar',
        actual: 110000,
        forecast: 100000,
        percentage: 110,
      });
    });

    it('calls onDrillDown when clicking forecast bar', () => {
      const handleDrillDown = jest.fn();
      render(<ForecastChart forecast={mockForecastData} onDrillDown={handleDrillDown} />);

      const febForecastBar = screen.getByTestId('forecast-bar-Feb');
      fireEvent.click(febForecastBar);

      expect(handleDrillDown).toHaveBeenCalledWith(mockPeriods[1]);
    });

    it('applies hover styling to bars when onDrillDown provided', () => {
      const handleDrillDown = jest.fn();
      render(<ForecastChart forecast={mockForecastData} onDrillDown={handleDrillDown} />);

      const actualBar = screen.getByTestId('actual-bar-Jan');
      expect(actualBar).toHaveClass('cursor-pointer', 'hover:opacity-80');
    });

    it('does not apply hover styling when onDrillDown not provided', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      const actualBar = screen.getByTestId('actual-bar-Jan');
      expect(actualBar).not.toHaveClass('cursor-pointer');
    });

    it('does not throw when onDrillDown is not provided', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      const janBar = screen.getByTestId('actual-bar-Jan');
      expect(() => fireEvent.click(janBar)).not.toThrow();
    });
  });

  describe('Legend', () => {
    it('renders legend container', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      expect(screen.getByTestId('chart-legend')).toBeInTheDocument();
    });

    it('renders actual indicator in legend', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      const legend = screen.getByTestId('chart-legend');
      expect(within(legend).getByTestId('legend-actual')).toBeInTheDocument();
      expect(within(legend).getByText('Actual')).toBeInTheDocument();
    });

    it('renders forecast indicator in legend', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      const legend = screen.getByTestId('chart-legend');
      expect(within(legend).getByTestId('legend-forecast')).toBeInTheDocument();
      expect(within(legend).getByText('Forecast')).toBeInTheDocument();
    });

    it('renders target indicator in legend', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      const legend = screen.getByTestId('chart-legend');
      expect(within(legend).getByTestId('legend-target')).toBeInTheDocument();
      expect(within(legend).getByText('Target')).toBeInTheDocument();
    });

    it('legend indicators have matching colors to chart elements', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      const legendActual = screen.getByTestId('legend-actual');
      const legendForecast = screen.getByTestId('legend-forecast');
      const legendTarget = screen.getByTestId('legend-target');

      expect(within(legendActual).getByTestId('legend-color-box')).toHaveClass('bg-blue-500');
      expect(within(legendForecast).getByTestId('legend-color-box')).toHaveClass('bg-gray-300');
      expect(within(legendTarget).getByTestId('legend-color-box')).toHaveClass(
        'border-orange-500',
        'border-dashed'
      );
    });
  });

  describe('Empty State', () => {
    it('shows empty state when no periods provided', () => {
      const emptyForecast: ForecastData = {
        periods: [],
        target: 0,
        achieved: 0,
        projected: 0,
      };

      render(<ForecastChart forecast={emptyForecast} />);

      expect(screen.getByTestId('forecast-chart-empty')).toBeInTheDocument();
      expect(screen.getByText(/no forecast data available/i)).toBeInTheDocument();
    });

    it('displays helpful message in empty state', () => {
      const emptyForecast: ForecastData = {
        periods: [],
        target: 0,
        achieved: 0,
        projected: 0,
      };

      render(<ForecastChart forecast={emptyForecast} />);

      expect(screen.getByText(/add sales data to see forecast/i)).toBeInTheDocument();
    });

    it('displays chart icon in empty state', () => {
      const emptyForecast: ForecastData = {
        periods: [],
        target: 0,
        achieved: 0,
        projected: 0,
      };

      render(<ForecastChart forecast={emptyForecast} />);

      expect(screen.getByTestId('empty-state-icon')).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('renders skeleton when loading', () => {
      render(<ForecastChart forecast={mockForecastData} loading={true} />);

      expect(screen.getByTestId('forecast-chart-skeleton')).toBeInTheDocument();
    });

    it('does not render chart when loading', () => {
      render(<ForecastChart forecast={mockForecastData} loading={true} />);

      expect(screen.queryByTestId('chart-area')).not.toBeInTheDocument();
      expect(screen.queryByText('Jan')).not.toBeInTheDocument();
    });

    it('renders skeleton bars matching period count', () => {
      render(<ForecastChart forecast={mockForecastData} loading={true} />);

      const skeletonBars = screen.getAllByTestId(/skeleton-bar-/);
      expect(skeletonBars.length).toBeGreaterThanOrEqual(4);
    });

    it('renders skeleton summary cards', () => {
      render(<ForecastChart forecast={mockForecastData} loading={true} />);

      expect(screen.getByTestId('skeleton-summary-cards')).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('renders error state when error provided', () => {
      render(
        <ForecastChart forecast={mockForecastData} error="Failed to load forecast data" />
      );

      expect(screen.getByTestId('forecast-chart-error')).toBeInTheDocument();
      expect(screen.getByText('Failed to load forecast data')).toBeInTheDocument();
    });

    it('renders retry button in error state', () => {
      const handleRetry = jest.fn();
      render(
        <ForecastChart
          forecast={mockForecastData}
          error="Network error"
          onRetry={handleRetry}
        />
      );

      const retryButton = screen.getByRole('button', { name: /retry/i });
      expect(retryButton).toBeInTheDocument();

      fireEvent.click(retryButton);
      expect(handleRetry).toHaveBeenCalledTimes(1);
    });

    it('does not render chart content when error', () => {
      render(
        <ForecastChart forecast={mockForecastData} error="Failed to load" />
      );

      expect(screen.queryByTestId('chart-area')).not.toBeInTheDocument();
      expect(screen.queryByText('$365,000')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper heading hierarchy', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      const mainHeading = screen.getByRole('heading', { name: /sales forecast/i });
      expect(mainHeading.tagName).toBe('H2');
    });

    it('chart has accessible role', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      expect(screen.getByRole('figure')).toBeInTheDocument();
    });

    it('chart has aria-label describing content', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      const figure = screen.getByRole('figure');
      expect(figure).toHaveAttribute(
        'aria-label',
        expect.stringContaining('Sales forecast')
      );
    });

    it('bars have aria-label with values', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      const janActualBar = screen.getByTestId('actual-bar-Jan');
      expect(janActualBar).toHaveAttribute(
        'aria-label',
        'January actual: $85,000'
      );
    });

    it('summary cards are in a labeled group', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      expect(screen.getByRole('group', { name: /summary metrics/i })).toBeInTheDocument();
    });

    it('period selector buttons are keyboard accessible', () => {
      const handlePeriodChange = jest.fn();
      render(
        <ForecastChart forecast={mockForecastData} onPeriodChange={handlePeriodChange} />
      );

      const quarterlyButton = screen.getByRole('button', { name: /quarterly/i });
      quarterlyButton.focus();
      fireEvent.keyDown(quarterlyButton, { key: 'Enter' });

      expect(handlePeriodChange).toHaveBeenCalledWith('quarterly');
    });

    it('Monthly button responds to Enter key', () => {
      const handlePeriodChange = jest.fn();
      render(
        <ForecastChart forecast={mockForecastData} onPeriodChange={handlePeriodChange} />
      );

      // First switch to quarterly
      const quarterlyButton = screen.getByRole('button', { name: /quarterly/i });
      fireEvent.click(quarterlyButton);

      // Then use keyboard to switch back to monthly
      const monthlyButton = screen.getByRole('button', { name: /monthly/i });
      monthlyButton.focus();
      fireEvent.keyDown(monthlyButton, { key: 'Enter' });

      expect(handlePeriodChange).toHaveBeenCalledWith('monthly');
    });

    it('bars are keyboard accessible when onDrillDown provided', () => {
      const handleDrillDown = jest.fn();
      render(<ForecastChart forecast={mockForecastData} onDrillDown={handleDrillDown} />);

      const janBar = screen.getByTestId('actual-bar-Jan');
      expect(janBar).toHaveAttribute('tabIndex', '0');
    });

    it('triggers drill down on Enter key press', () => {
      const handleDrillDown = jest.fn();
      render(<ForecastChart forecast={mockForecastData} onDrillDown={handleDrillDown} />);

      const janBar = screen.getByTestId('actual-bar-Jan');
      fireEvent.keyDown(janBar, { key: 'Enter' });

      expect(handleDrillDown).toHaveBeenCalledWith(mockPeriods[0]);
    });

    it('triggers drill down on Space key press', () => {
      const handleDrillDown = jest.fn();
      render(<ForecastChart forecast={mockForecastData} onDrillDown={handleDrillDown} />);

      const janBar = screen.getByTestId('actual-bar-Jan');
      fireEvent.keyDown(janBar, { key: ' ' });

      expect(handleDrillDown).toHaveBeenCalledWith(mockPeriods[0]);
    });

    it('legend has proper accessibility attributes', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      const legend = screen.getByTestId('chart-legend');
      expect(legend).toHaveAttribute('aria-label', 'Chart legend');
    });
  });

  describe('Value Formatting', () => {
    it('formats currency values correctly', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      expect(screen.getByText('$1,200,000')).toBeInTheDocument();
      expect(screen.getByText('$365,000')).toBeInTheDocument();
    });

    it('formats percentage values correctly', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      // Period percentages in tooltips or bar labels
      const janBar = screen.getByTestId('actual-bar-Jan');
      expect(within(janBar).getByText('85%')).toBeInTheDocument();
    });

    it('handles zero values gracefully', () => {
      const zeroData: ForecastData = {
        periods: [
          { label: 'Jan', actual: 0, forecast: 100000, percentage: 0 },
        ],
        target: 1000000,
        achieved: 0,
        projected: 0,
      };

      render(<ForecastChart forecast={zeroData} />);

      const achievedCard = screen.getByTestId('summary-card-achieved');
      expect(within(achievedCard).getByText('$0')).toBeInTheDocument();
    });

    it('handles large values with abbreviations', () => {
      const largeData: ForecastData = {
        periods: mockPeriods,
        target: 12000000,
        achieved: 3650000,
        projected: 11500000,
      };

      render(<ForecastChart forecast={largeData} />);

      // Should show abbreviated format like $12M or $12,000,000
      expect(screen.getByText(/\$12,000,000|\$12M/)).toBeInTheDocument();
    });
  });

  describe('Tooltips', () => {
    it('shows tooltip on bar hover', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      const janBar = screen.getByTestId('actual-bar-Jan');
      fireEvent.mouseEnter(janBar);

      expect(screen.getByTestId('bar-tooltip')).toBeInTheDocument();
    });

    it('tooltip shows period details', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      const janBar = screen.getByTestId('actual-bar-Jan');
      fireEvent.mouseEnter(janBar);

      const tooltip = screen.getByTestId('bar-tooltip');
      expect(within(tooltip).getByText('January')).toBeInTheDocument();
      expect(within(tooltip).getByText('Actual: $85,000')).toBeInTheDocument();
      expect(within(tooltip).getByText('Forecast: $100,000')).toBeInTheDocument();
    });

    it('hides tooltip on mouse leave', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      const janBar = screen.getByTestId('actual-bar-Jan');
      fireEvent.mouseEnter(janBar);
      expect(screen.getByTestId('bar-tooltip')).toBeInTheDocument();

      fireEvent.mouseLeave(janBar);
      expect(screen.queryByTestId('bar-tooltip')).not.toBeInTheDocument();
    });

    it('shows tooltip on forecast bar hover', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      const janForecastBar = screen.getByTestId('forecast-bar-Jan');
      fireEvent.mouseEnter(janForecastBar);

      expect(screen.getByTestId('bar-tooltip')).toBeInTheDocument();
    });

    it('hides tooltip on forecast bar mouse leave', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      const janForecastBar = screen.getByTestId('forecast-bar-Jan');
      fireEvent.mouseEnter(janForecastBar);
      expect(screen.getByTestId('bar-tooltip')).toBeInTheDocument();

      fireEvent.mouseLeave(janForecastBar);
      expect(screen.queryByTestId('bar-tooltip')).not.toBeInTheDocument();
    });
  });

  describe('Responsive Behavior', () => {
    it('applies compact mode on small viewports', () => {
      render(<ForecastChart forecast={mockForecastData} compact={true} />);

      const container = screen.getByTestId('forecast-chart');
      expect(container).toHaveClass('compact');
    });

    it('hides legend in compact mode', () => {
      render(<ForecastChart forecast={mockForecastData} compact={true} />);

      expect(screen.queryByTestId('chart-legend')).not.toBeInTheDocument();
    });

    it('shows condensed summary cards in compact mode', () => {
      render(<ForecastChart forecast={mockForecastData} compact={true} />);

      const summaryCards = screen.getByTestId('summary-cards');
      expect(summaryCards).toHaveClass('grid-cols-2');
    });
  });

  describe('Custom Styling', () => {
    it('applies custom className to container', () => {
      render(<ForecastChart forecast={mockForecastData} className="custom-forecast" />);

      const container = screen.getByTestId('forecast-chart');
      expect(container).toHaveClass('custom-forecast');
    });

    it('allows custom height', () => {
      render(<ForecastChart forecast={mockForecastData} height={400} />);

      const chartArea = screen.getByTestId('chart-area');
      expect(chartArea).toHaveStyle({ height: '400px' });
    });
  });

  describe('Performance Thresholds', () => {
    it('shows on-track indicator when percentage >= 100', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      const marBar = screen.getByTestId('actual-bar-Mar');
      const statusIndicator = within(marBar).getByTestId('status-indicator');
      expect(statusIndicator).toHaveClass('text-green-600');
    });

    it('shows warning indicator when percentage >= 80 and < 100', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      const janBar = screen.getByTestId('actual-bar-Jan');
      const statusIndicator = within(janBar).getByTestId('status-indicator');
      expect(statusIndicator).toHaveClass('text-amber-600');
    });

    it('shows critical indicator when percentage < 80', () => {
      render(<ForecastChart forecast={mockForecastData} />);

      const aprBar = screen.getByTestId('actual-bar-Apr');
      const statusIndicator = within(aprBar).getByTestId('status-indicator');
      expect(statusIndicator).toHaveClass('text-red-600');
    });
  });

  describe('Quarterly View', () => {
    it('renders quarterly periods when quarterly data provided', () => {
      const quarterlyForecast: ForecastData = {
        periods: mockQuarterlyPeriods,
        target: 1200000,
        achieved: 287000,
        projected: 1000000,
      };

      render(<ForecastChart forecast={quarterlyForecast} />);

      expect(screen.getByText('Q1')).toBeInTheDocument();
      expect(screen.getByText('Q2')).toBeInTheDocument();
      expect(screen.getByText('Q3')).toBeInTheDocument();
      expect(screen.getByText('Q4')).toBeInTheDocument();
    });

    it('shows future quarters with forecast-only display', () => {
      const quarterlyForecast: ForecastData = {
        periods: mockQuarterlyPeriods,
        target: 1200000,
        achieved: 287000,
        projected: 1000000,
      };

      render(<ForecastChart forecast={quarterlyForecast} />);

      // Q2, Q3, Q4 have 0 actual - should show as future/pending
      const q2Bar = screen.getByTestId('actual-bar-Q2');
      expect(q2Bar).toHaveClass('opacity-50');
    });
  });
});
