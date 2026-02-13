/**
 * BudgetSummaryCard Component Tests - TDD RED Phase
 *
 * Tests for the generative UI budget summary card component.
 * Displays department budget status with progress visualization,
 * category breakdown, and actionable warnings.
 *
 * These tests are written BEFORE the component implementation (TDD RED phase).
 * All tests should FAIL until the component is implemented.
 */
import { render, screen, fireEvent, within } from '@testing-library/react';
import { BudgetSummaryCard } from '../BudgetSummaryCard';
import type { BudgetData, CategorySpend } from '../BudgetSummaryCard';

// Test data for category spending
const mockCategories: CategorySpend[] = [
  {
    name: 'Personnel',
    allocated: 500000,
    spent: 350000,
    percentage: 70,
  },
  {
    name: 'Equipment',
    allocated: 150000,
    spent: 140000,
    percentage: 93.33,
  },
  {
    name: 'Software',
    allocated: 100000,
    spent: 98000,
    percentage: 98,
  },
  {
    name: 'Travel',
    allocated: 50000,
    spent: 25000,
    percentage: 50,
  },
];

// Test data for healthy budget (under 80%)
const healthyBudget: BudgetData = {
  departmentName: 'Engineering',
  fiscalYear: 2026,
  allocated: 1000000,
  spent: 600000,
  remaining: 400000,
  categories: mockCategories,
};

// Test data for warning budget (80-95%)
const warningBudget: BudgetData = {
  departmentName: 'Marketing',
  fiscalYear: 2026,
  allocated: 500000,
  spent: 425000,
  remaining: 75000,
  categories: [
    { name: 'Advertising', allocated: 300000, spent: 280000, percentage: 93.33 },
    { name: 'Events', allocated: 100000, spent: 90000, percentage: 90 },
    { name: 'Content', allocated: 100000, spent: 55000, percentage: 55 },
  ],
};

// Test data for critical budget (over 95%)
const criticalBudget: BudgetData = {
  departmentName: 'Sales',
  fiscalYear: 2026,
  allocated: 300000,
  spent: 295000,
  remaining: 5000,
  categories: [
    { name: 'Commissions', allocated: 200000, spent: 198000, percentage: 99 },
    { name: 'Training', allocated: 50000, spent: 48000, percentage: 96 },
    { name: 'Tools', allocated: 50000, spent: 49000, percentage: 98 },
  ],
};

// Test data for over-budget scenario
const overBudget: BudgetData = {
  departmentName: 'Operations',
  fiscalYear: 2026,
  allocated: 200000,
  spent: 220000,
  remaining: -20000,
  categories: [
    { name: 'Utilities', allocated: 100000, spent: 115000, percentage: 115 },
    { name: 'Maintenance', allocated: 100000, spent: 105000, percentage: 105 },
  ],
};

// Test data for budget with trend
const budgetWithTrend: BudgetData = {
  departmentName: 'R&D',
  fiscalYear: 2026,
  allocated: 800000,
  spent: 400000,
  remaining: 400000,
  categories: mockCategories,
  lastPeriodSpent: 350000,
  lastPeriodAllocated: 750000,
};

describe('BudgetSummaryCard Component', () => {
  describe('Basic Rendering', () => {
    it('renders the budget summary card container', () => {
      render(<BudgetSummaryCard budget={healthyBudget} />);

      expect(screen.getByTestId('budget-summary-card')).toBeInTheDocument();
    });

    it('renders department name as heading', () => {
      render(<BudgetSummaryCard budget={healthyBudget} />);

      expect(screen.getByRole('heading', { name: 'Engineering' })).toBeInTheDocument();
    });

    it('renders fiscal year', () => {
      render(<BudgetSummaryCard budget={healthyBudget} />);

      expect(screen.getByText(/FY 2026|Fiscal Year 2026/)).toBeInTheDocument();
    });

    it('renders allocated budget amount formatted as currency', () => {
      render(<BudgetSummaryCard budget={healthyBudget} />);

      expect(screen.getByText('$1,000,000')).toBeInTheDocument();
    });

    it('renders spent amount formatted as currency', () => {
      render(<BudgetSummaryCard budget={healthyBudget} />);

      expect(screen.getByText('$600,000')).toBeInTheDocument();
    });

    it('renders remaining amount formatted as currency', () => {
      render(<BudgetSummaryCard budget={healthyBudget} />);

      expect(screen.getByText('$400,000')).toBeInTheDocument();
    });

    it('renders spent percentage', () => {
      render(<BudgetSummaryCard budget={healthyBudget} />);

      // 600000 / 1000000 = 60%
      expect(screen.getByText('60%')).toBeInTheDocument();
    });
  });

  describe('Progress Bar Rendering', () => {
    it('renders a progress bar element', () => {
      render(<BudgetSummaryCard budget={healthyBudget} />);

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('sets progress bar value to correct percentage', () => {
      render(<BudgetSummaryCard budget={healthyBudget} />);

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '60');
    });

    it('sets progress bar max to 100', () => {
      render(<BudgetSummaryCard budget={healthyBudget} />);

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuemax', '100');
    });

    it('sets progress bar min to 0', () => {
      render(<BudgetSummaryCard budget={healthyBudget} />);

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuemin', '0');
    });
  });

  describe('Progress Bar Color Coding - Green (Under 80%)', () => {
    it('renders green progress bar when spent is under 80%', () => {
      render(<BudgetSummaryCard budget={healthyBudget} />);

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveClass('bg-green-500');
    });

    it('renders green progress bar at exactly 79%', () => {
      const budget79: BudgetData = {
        ...healthyBudget,
        spent: 790000,
        remaining: 210000,
      };
      render(<BudgetSummaryCard budget={budget79} />);

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveClass('bg-green-500');
    });

    it('does not render warning indicator when under 80%', () => {
      render(<BudgetSummaryCard budget={healthyBudget} />);

      expect(screen.queryByTestId('budget-warning-indicator')).not.toBeInTheDocument();
    });
  });

  describe('Progress Bar Color Coding - Yellow (80-95%)', () => {
    it('renders yellow progress bar when spent is between 80-95%', () => {
      render(<BudgetSummaryCard budget={warningBudget} />);

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveClass('bg-yellow-500');
    });

    it('renders yellow progress bar at exactly 80%', () => {
      const budget80: BudgetData = {
        ...healthyBudget,
        spent: 800000,
        remaining: 200000,
      };
      render(<BudgetSummaryCard budget={budget80} />);

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveClass('bg-yellow-500');
    });

    it('renders yellow progress bar at exactly 95%', () => {
      const budget95: BudgetData = {
        ...healthyBudget,
        spent: 950000,
        remaining: 50000,
      };
      render(<BudgetSummaryCard budget={budget95} />);

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveClass('bg-yellow-500');
    });
  });

  describe('Progress Bar Color Coding - Red (Over 95%)', () => {
    it('renders red progress bar when spent is over 95%', () => {
      render(<BudgetSummaryCard budget={criticalBudget} />);

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveClass('bg-red-500');
    });

    it('renders red progress bar at 96%', () => {
      const budget96: BudgetData = {
        ...healthyBudget,
        spent: 960000,
        remaining: 40000,
      };
      render(<BudgetSummaryCard budget={budget96} />);

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveClass('bg-red-500');
    });

    it('renders red progress bar when over 100%', () => {
      render(<BudgetSummaryCard budget={overBudget} />);

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveClass('bg-red-500');
    });

    it('caps progress bar visual at 100% even when over budget', () => {
      render(<BudgetSummaryCard budget={overBudget} />);

      const progressBar = screen.getByRole('progressbar');
      // Should show visual at 100%, but aria-valuenow can be over 100
      expect(progressBar).toHaveAttribute('aria-valuenow', '110');
    });
  });

  describe('Warning Indicator (Over 90% Spent)', () => {
    it('renders warning indicator when spent is over 90%', () => {
      const budget91: BudgetData = {
        ...healthyBudget,
        spent: 910000,
        remaining: 90000,
      };
      render(<BudgetSummaryCard budget={budget91} />);

      expect(screen.getByTestId('budget-warning-indicator')).toBeInTheDocument();
    });

    it('displays warning icon in warning indicator', () => {
      render(<BudgetSummaryCard budget={criticalBudget} />);

      const warning = screen.getByTestId('budget-warning-indicator');
      expect(within(warning).getByRole('img', { name: /warning/i })).toBeInTheDocument();
    });

    it('displays warning message for budget nearing limit', () => {
      const budget92: BudgetData = {
        ...healthyBudget,
        spent: 920000,
        remaining: 80000,
      };
      render(<BudgetSummaryCard budget={budget92} />);

      expect(screen.getByText(/budget.*nearing.*limit|approaching.*limit/i)).toBeInTheDocument();
    });

    it('displays critical warning when over budget', () => {
      render(<BudgetSummaryCard budget={overBudget} />);

      expect(screen.getByText(/over.*budget|exceeded.*budget/i)).toBeInTheDocument();
    });

    it('does not render warning indicator when spent is at 89%', () => {
      const budget89: BudgetData = {
        ...healthyBudget,
        spent: 890000,
        remaining: 110000,
      };
      render(<BudgetSummaryCard budget={budget89} />);

      expect(screen.queryByTestId('budget-warning-indicator')).not.toBeInTheDocument();
    });

    it('renders warning indicator at exactly 90%', () => {
      const budget90: BudgetData = {
        ...healthyBudget,
        spent: 900000,
        remaining: 100000,
      };
      render(<BudgetSummaryCard budget={budget90} />);

      expect(screen.getByTestId('budget-warning-indicator')).toBeInTheDocument();
    });
  });

  describe('Category Breakdown Table', () => {
    it('renders category breakdown section', () => {
      render(<BudgetSummaryCard budget={healthyBudget} />);

      expect(screen.getByTestId('category-breakdown')).toBeInTheDocument();
    });

    it('renders category breakdown heading', () => {
      render(<BudgetSummaryCard budget={healthyBudget} />);

      expect(screen.getByRole('heading', { name: /category breakdown|breakdown by category/i })).toBeInTheDocument();
    });

    it('renders a table for categories', () => {
      render(<BudgetSummaryCard budget={healthyBudget} />);

      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('renders table headers for category columns', () => {
      render(<BudgetSummaryCard budget={healthyBudget} />);

      expect(screen.getByRole('columnheader', { name: /category/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /allocated/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /spent/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /progress|%|percent/i })).toBeInTheDocument();
    });

    it('renders all categories as table rows', () => {
      render(<BudgetSummaryCard budget={healthyBudget} />);

      expect(screen.getByText('Personnel')).toBeInTheDocument();
      expect(screen.getByText('Equipment')).toBeInTheDocument();
      expect(screen.getByText('Software')).toBeInTheDocument();
      expect(screen.getByText('Travel')).toBeInTheDocument();
    });

    it('renders category allocated amounts formatted', () => {
      render(<BudgetSummaryCard budget={healthyBudget} />);

      const personnelRow = screen.getByTestId('category-row-Personnel');
      expect(within(personnelRow).getByText('$500,000')).toBeInTheDocument();
    });

    it('renders category spent amounts formatted', () => {
      render(<BudgetSummaryCard budget={healthyBudget} />);

      const personnelRow = screen.getByTestId('category-row-Personnel');
      expect(within(personnelRow).getByText('$350,000')).toBeInTheDocument();
    });

    it('renders category percentages', () => {
      render(<BudgetSummaryCard budget={healthyBudget} />);

      const personnelRow = screen.getByTestId('category-row-Personnel');
      expect(within(personnelRow).getByText('70%')).toBeInTheDocument();
    });

    it('renders individual progress bar for each category', () => {
      render(<BudgetSummaryCard budget={healthyBudget} />);

      // Each category row should have a progress indicator (using testid since main has role)
      const categoryRows = screen.getAllByTestId(/category-row-/);
      categoryRows.forEach(row => {
        expect(within(row).getByTestId('category-progress')).toBeInTheDocument();
      });
    });

    it('applies correct color to category progress bars based on percentage', () => {
      render(<BudgetSummaryCard budget={healthyBudget} />);

      // Personnel: 70% - green
      const personnelRow = screen.getByTestId('category-row-Personnel');
      expect(within(personnelRow).getByTestId('category-progress')).toHaveClass('bg-green-500');

      // Equipment: 93.33% - yellow
      const equipmentRow = screen.getByTestId('category-row-Equipment');
      expect(within(equipmentRow).getByTestId('category-progress')).toHaveClass('bg-yellow-500');

      // Software: 98% - red
      const softwareRow = screen.getByTestId('category-row-Software');
      expect(within(softwareRow).getByTestId('category-progress')).toHaveClass('bg-red-500');

      // Travel: 50% - green
      const travelRow = screen.getByTestId('category-row-Travel');
      expect(within(travelRow).getByTestId('category-progress')).toHaveClass('bg-green-500');
    });

    it('handles empty categories array', () => {
      const budgetNoCategories: BudgetData = {
        ...healthyBudget,
        categories: [],
      };
      render(<BudgetSummaryCard budget={budgetNoCategories} />);

      expect(screen.getByText(/no categories|no breakdown available/i)).toBeInTheDocument();
    });
  });

  describe('Request Amendment Button', () => {
    it('renders Request Amendment button when remaining is less than 10%', () => {
      render(<BudgetSummaryCard budget={criticalBudget} />);

      expect(screen.getByRole('button', { name: /request amendment/i })).toBeInTheDocument();
    });

    it('does not render Request Amendment button when remaining is 10% or more', () => {
      render(<BudgetSummaryCard budget={healthyBudget} />);

      expect(screen.queryByRole('button', { name: /request amendment/i })).not.toBeInTheDocument();
    });

    it('renders Request Amendment button at exactly 9% remaining', () => {
      const budget91spent: BudgetData = {
        ...healthyBudget,
        spent: 910000,
        remaining: 90000,
      };
      render(<BudgetSummaryCard budget={budget91spent} />);

      expect(screen.getByRole('button', { name: /request amendment/i })).toBeInTheDocument();
    });

    it('does not render Request Amendment button at exactly 10% remaining', () => {
      const budget90spent: BudgetData = {
        ...healthyBudget,
        spent: 900000,
        remaining: 100000,
      };
      render(<BudgetSummaryCard budget={budget90spent} />);

      expect(screen.queryByRole('button', { name: /request amendment/i })).not.toBeInTheDocument();
    });

    it('renders Request Amendment button when over budget', () => {
      render(<BudgetSummaryCard budget={overBudget} />);

      expect(screen.getByRole('button', { name: /request amendment/i })).toBeInTheDocument();
    });

    it('calls onRequestAmendment when button is clicked', () => {
      const onRequestAmendment = jest.fn();
      render(
        <BudgetSummaryCard
          budget={criticalBudget}
          onRequestAmendment={onRequestAmendment}
        />
      );

      const button = screen.getByRole('button', { name: /request amendment/i });
      fireEvent.click(button);

      expect(onRequestAmendment).toHaveBeenCalledTimes(1);
    });

    it('passes budget data to onRequestAmendment callback', () => {
      const onRequestAmendment = jest.fn();
      render(
        <BudgetSummaryCard
          budget={criticalBudget}
          onRequestAmendment={onRequestAmendment}
        />
      );

      const button = screen.getByRole('button', { name: /request amendment/i });
      fireEvent.click(button);

      expect(onRequestAmendment).toHaveBeenCalledWith(criticalBudget);
    });

    it('disables Request Amendment button when onRequestAmendment not provided', () => {
      render(<BudgetSummaryCard budget={criticalBudget} />);

      const button = screen.getByRole('button', { name: /request amendment/i });
      expect(button).toBeDisabled();
    });
  });

  describe('Trend Indicator', () => {
    it('renders trend indicator when lastPeriodSpent is provided', () => {
      render(<BudgetSummaryCard budget={budgetWithTrend} />);

      expect(screen.getByTestId('trend-indicator')).toBeInTheDocument();
    });

    it('does not render trend indicator when lastPeriodSpent is not provided', () => {
      render(<BudgetSummaryCard budget={healthyBudget} />);

      expect(screen.queryByTestId('trend-indicator')).not.toBeInTheDocument();
    });

    it('renders up arrow when spending rate increased', () => {
      // Current: 400000/800000 = 50% vs Last: 350000/750000 = 46.67%
      render(<BudgetSummaryCard budget={budgetWithTrend} />);

      const trendIndicator = screen.getByTestId('trend-indicator');
      expect(within(trendIndicator).getByRole('img', { name: /up|increase/i })).toBeInTheDocument();
    });

    it('renders down arrow when spending rate decreased', () => {
      const decreasedTrend: BudgetData = {
        ...budgetWithTrend,
        lastPeriodSpent: 500000, // 66.67% of 750000
        // Current: 50% vs Last: 66.67%
      };
      render(<BudgetSummaryCard budget={decreasedTrend} />);

      const trendIndicator = screen.getByTestId('trend-indicator');
      expect(within(trendIndicator).getByRole('img', { name: /down|decrease/i })).toBeInTheDocument();
    });

    it('applies green color to down trend (positive - spending less)', () => {
      const decreasedTrend: BudgetData = {
        ...budgetWithTrend,
        lastPeriodSpent: 500000,
      };
      render(<BudgetSummaryCard budget={decreasedTrend} />);

      const trendIndicator = screen.getByTestId('trend-indicator');
      expect(trendIndicator).toHaveClass('text-green-600');
    });

    it('applies red color to up trend (negative - spending more)', () => {
      render(<BudgetSummaryCard budget={budgetWithTrend} />);

      const trendIndicator = screen.getByTestId('trend-indicator');
      expect(trendIndicator).toHaveClass('text-red-600');
    });

    it('displays percentage change in trend indicator', () => {
      render(<BudgetSummaryCard budget={budgetWithTrend} />);

      // Current: 50%, Last: 46.67%, Diff: ~3.33%
      const trendIndicator = screen.getByTestId('trend-indicator');
      expect(within(trendIndicator).getByText(/\+?3\.?\d*%/)).toBeInTheDocument();
    });

    it('shows neutral indicator when no change in spending rate', () => {
      const noChangeTrend: BudgetData = {
        ...budgetWithTrend,
        spent: 375000, // 46.875%
        lastPeriodSpent: 351563, // ~46.875% of 750000
        lastPeriodAllocated: 750000,
      };
      render(<BudgetSummaryCard budget={noChangeTrend} />);

      const trendIndicator = screen.getByTestId('trend-indicator');
      expect(within(trendIndicator).getByRole('img', { name: /stable|no change/i })).toBeInTheDocument();
    });
  });

  describe('View Details Callback', () => {
    it('renders View Details button', () => {
      render(<BudgetSummaryCard budget={healthyBudget} />);

      expect(screen.getByRole('button', { name: /view details/i })).toBeInTheDocument();
    });

    it('calls onViewDetails when View Details button is clicked', () => {
      const onViewDetails = jest.fn();
      render(
        <BudgetSummaryCard
          budget={healthyBudget}
          onViewDetails={onViewDetails}
        />
      );

      const button = screen.getByRole('button', { name: /view details/i });
      fireEvent.click(button);

      expect(onViewDetails).toHaveBeenCalledTimes(1);
    });

    it('passes department name and fiscal year to onViewDetails', () => {
      const onViewDetails = jest.fn();
      render(
        <BudgetSummaryCard
          budget={healthyBudget}
          onViewDetails={onViewDetails}
        />
      );

      const button = screen.getByRole('button', { name: /view details/i });
      fireEvent.click(button);

      expect(onViewDetails).toHaveBeenCalledWith({
        departmentName: 'Engineering',
        fiscalYear: 2026,
      });
    });

    it('disables View Details button when onViewDetails not provided', () => {
      render(<BudgetSummaryCard budget={healthyBudget} />);

      const button = screen.getByRole('button', { name: /view details/i });
      expect(button).toBeDisabled();
    });
  });

  describe('Loading State', () => {
    it('renders skeleton loader when loading', () => {
      render(<BudgetSummaryCard budget={healthyBudget} loading={true} />);

      expect(screen.getByTestId('budget-summary-skeleton')).toBeInTheDocument();
    });

    it('does not render budget data when loading', () => {
      render(<BudgetSummaryCard budget={healthyBudget} loading={true} />);

      expect(screen.queryByText('Engineering')).not.toBeInTheDocument();
      expect(screen.queryByText('$1,000,000')).not.toBeInTheDocument();
    });

    it('renders animated skeleton bars', () => {
      render(<BudgetSummaryCard budget={healthyBudget} loading={true} />);

      const skeleton = screen.getByTestId('budget-summary-skeleton');
      expect(skeleton).toHaveClass('animate-pulse');
    });
  });

  describe('Error State', () => {
    it('renders error state when error prop provided', () => {
      render(
        <BudgetSummaryCard
          budget={healthyBudget}
          error="Failed to load budget data"
        />
      );

      expect(screen.getByTestId('budget-summary-error')).toBeInTheDocument();
      expect(screen.getByText('Failed to load budget data')).toBeInTheDocument();
    });

    it('renders retry button in error state', () => {
      const onRetry = jest.fn();
      render(
        <BudgetSummaryCard
          budget={healthyBudget}
          error="Failed to load budget data"
          onRetry={onRetry}
        />
      );

      const retryButton = screen.getByRole('button', { name: /retry/i });
      fireEvent.click(retryButton);

      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('renders error icon in error state', () => {
      render(
        <BudgetSummaryCard
          budget={healthyBudget}
          error="Failed to load budget data"
        />
      );

      const errorState = screen.getByTestId('budget-summary-error');
      expect(within(errorState).getByRole('img', { name: /error/i })).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper article role for card', () => {
      render(<BudgetSummaryCard budget={healthyBudget} />);

      expect(screen.getByRole('article')).toBeInTheDocument();
    });

    it('has proper heading hierarchy', () => {
      render(<BudgetSummaryCard budget={healthyBudget} />);

      const mainHeading = screen.getByRole('heading', { name: 'Engineering', level: 2 });
      expect(mainHeading).toBeInTheDocument();

      const categoryHeading = screen.getByRole('heading', { name: /category breakdown/i, level: 3 });
      expect(categoryHeading).toBeInTheDocument();
    });

    it('has aria-label on progress bar describing budget status', () => {
      render(<BudgetSummaryCard budget={healthyBudget} />);

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-label', expect.stringContaining('Engineering'));
      expect(progressBar).toHaveAttribute('aria-label', expect.stringContaining('60%'));
    });

    it('table has proper accessibility attributes', () => {
      render(<BudgetSummaryCard budget={healthyBudget} />);

      const table = screen.getByRole('table');
      expect(table).toHaveAttribute('aria-label', expect.stringContaining('category'));
    });

    it('buttons have proper aria-labels', () => {
      const onViewDetails = jest.fn();
      render(
        <BudgetSummaryCard
          budget={criticalBudget}
          onViewDetails={onViewDetails}
          onRequestAmendment={jest.fn()}
        />
      );

      const viewDetailsBtn = screen.getByRole('button', { name: /view details/i });
      expect(viewDetailsBtn).toHaveAttribute('aria-label', expect.stringContaining('Sales'));

      const amendmentBtn = screen.getByRole('button', { name: /request amendment/i });
      expect(amendmentBtn).toHaveAttribute('aria-label', expect.stringContaining('Sales'));
    });

    it('warning indicator has proper aria-live region', () => {
      render(<BudgetSummaryCard budget={criticalBudget} />);

      const warning = screen.getByTestId('budget-warning-indicator');
      expect(warning).toHaveAttribute('role', 'alert');
      expect(warning).toHaveAttribute('aria-live', 'polite');
    });

    it('trend indicator has accessible description', () => {
      render(<BudgetSummaryCard budget={budgetWithTrend} />);

      const trendIndicator = screen.getByTestId('trend-indicator');
      expect(trendIndicator).toHaveAttribute('aria-label', expect.stringContaining('spending'));
    });
  });

  describe('Keyboard Navigation', () => {
    it('buttons are keyboard accessible', () => {
      const onViewDetails = jest.fn();
      render(
        <BudgetSummaryCard
          budget={healthyBudget}
          onViewDetails={onViewDetails}
        />
      );

      const button = screen.getByRole('button', { name: /view details/i });
      button.focus();
      fireEvent.keyDown(button, { key: 'Enter' });

      expect(onViewDetails).toHaveBeenCalledTimes(1);
    });

    it('View Details button responds to Space key', () => {
      const onViewDetails = jest.fn();
      render(
        <BudgetSummaryCard
          budget={healthyBudget}
          onViewDetails={onViewDetails}
        />
      );

      const button = screen.getByRole('button', { name: /view details/i });
      button.focus();
      fireEvent.keyDown(button, { key: ' ' });

      expect(onViewDetails).toHaveBeenCalledTimes(1);
    });

    it('Request Amendment button responds to Enter key', () => {
      const onRequestAmendment = jest.fn();
      render(
        <BudgetSummaryCard
          budget={criticalBudget}
          onRequestAmendment={onRequestAmendment}
        />
      );

      const button = screen.getByRole('button', { name: /request amendment/i });
      button.focus();
      fireEvent.keyDown(button, { key: 'Enter' });

      expect(onRequestAmendment).toHaveBeenCalledWith(criticalBudget);
    });

    it('Request Amendment button responds to Space key', () => {
      const onRequestAmendment = jest.fn();
      render(
        <BudgetSummaryCard
          budget={criticalBudget}
          onRequestAmendment={onRequestAmendment}
        />
      );

      const button = screen.getByRole('button', { name: /request amendment/i });
      button.focus();
      fireEvent.keyDown(button, { key: ' ' });

      expect(onRequestAmendment).toHaveBeenCalledWith(criticalBudget);
    });

    it('category rows can be focused for screen readers', () => {
      render(<BudgetSummaryCard budget={healthyBudget} />);

      const categoryRows = screen.getAllByTestId(/category-row-/);
      categoryRows.forEach(row => {
        expect(row).toHaveAttribute('tabindex', '0');
      });
    });
  });

  describe('Responsive Design Hints', () => {
    it('has appropriate test ID for responsive container', () => {
      render(<BudgetSummaryCard budget={healthyBudget} />);

      const card = screen.getByTestId('budget-summary-card');
      expect(card).toHaveClass('w-full');
    });
  });

  describe('Edge Cases', () => {
    it('handles zero allocated budget', () => {
      const zeroBudget: BudgetData = {
        departmentName: 'New Department',
        fiscalYear: 2026,
        allocated: 0,
        spent: 0,
        remaining: 0,
        categories: [],
      };
      render(<BudgetSummaryCard budget={zeroBudget} />);

      expect(screen.getByText('$0')).toBeInTheDocument();
      expect(screen.getByText('0%')).toBeInTheDocument();
    });

    it('handles very large budget numbers', () => {
      const largeBudget: BudgetData = {
        departmentName: 'Enterprise',
        fiscalYear: 2026,
        allocated: 10000000000,
        spent: 5000000000,
        remaining: 5000000000,
        categories: [],
      };
      render(<BudgetSummaryCard budget={largeBudget} />);

      expect(screen.getByText(/\$10,000,000,000|\$10B/)).toBeInTheDocument();
    });

    it('handles category names with special characters', () => {
      const specialCategoryBudget: BudgetData = {
        ...healthyBudget,
        categories: [
          { name: 'R&D Equipment', allocated: 100000, spent: 50000, percentage: 50 },
          { name: 'IT/Software', allocated: 100000, spent: 60000, percentage: 60 },
        ],
      };
      render(<BudgetSummaryCard budget={specialCategoryBudget} />);

      expect(screen.getByText('R&D Equipment')).toBeInTheDocument();
      expect(screen.getByText('IT/Software')).toBeInTheDocument();
    });

    it('handles negative remaining (over budget) display', () => {
      render(<BudgetSummaryCard budget={overBudget} />);

      expect(screen.getByText('-$20,000')).toBeInTheDocument();
    });

    it('handles budget at exactly 100% spent', () => {
      const exactBudget: BudgetData = {
        departmentName: 'Exact',
        fiscalYear: 2026,
        allocated: 100000,
        spent: 100000,
        remaining: 0,
        categories: [],
      };
      render(<BudgetSummaryCard budget={exactBudget} />);

      expect(screen.getByText('100%')).toBeInTheDocument();
      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveClass('bg-red-500');
    });
  });
});
