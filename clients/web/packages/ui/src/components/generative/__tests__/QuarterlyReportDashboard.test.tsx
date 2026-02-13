/**
 * QuarterlyReportDashboard Component Tests - TDD RED Phase
 *
 * Tests for the generative UI quarterly report dashboard component.
 * Displays executive quarterly metrics including KPIs, ARR Waterfall, and highlights.
 *
 * These tests are written BEFORE the component implementation (TDD RED phase).
 * All tests should FAIL until the component is implemented.
 */
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QuarterlyReportDashboard } from '../QuarterlyReportDashboard';
import type {
  QuarterlyReport,
  KPI,
  WaterfallItem,
} from '../QuarterlyReportDashboard';

// Test data for KPIs
const mockKPIs: KPI[] = [
  {
    name: 'Revenue',
    value: 12500000,
    change: 15.2,
    target: 12000000,
    unit: 'currency',
  },
  {
    name: 'MRR',
    value: 1050000,
    change: 8.5,
    target: 1000000,
    unit: 'currency',
  },
  {
    name: 'Churn',
    value: 2.3,
    change: -0.5,
    target: 3.0,
    unit: 'percentage',
  },
  {
    name: 'NPS',
    value: 72,
    change: 5,
    target: 70,
    unit: 'number',
  },
  {
    name: 'Active Users',
    value: 45000,
    change: 12.8,
    target: 40000,
    unit: 'number',
  },
  {
    name: 'Customer Count',
    value: 850,
    change: 7.2,
    target: 800,
    unit: 'number',
  },
];

// Test data for ARR Waterfall
const mockWaterfall: WaterfallItem[] = [
  { label: 'Starting ARR', value: 48000000, type: 'start' },
  { label: 'New Business', value: 3500000, type: 'increase' },
  { label: 'Expansion', value: 2200000, type: 'increase' },
  { label: 'Churn', value: -1800000, type: 'decrease' },
  { label: 'Contraction', value: -400000, type: 'decrease' },
  { label: 'Ending ARR', value: 51500000, type: 'end' },
];

// Test data for highlights
const mockHighlights: string[] = [
  'Record quarterly revenue of $12.5M, exceeding target by 4.2%',
  'Successfully closed 3 enterprise deals worth $2.8M total',
  'NPS improved to 72, highest in company history',
  'Churn rate decreased to 2.3%, below target threshold',
  'Launched new product tier contributing $800K in new MRR',
];

// Complete mock quarterly report
const mockQuarterlyReport: QuarterlyReport = {
  quarter: 'Q4',
  year: 2025,
  kpis: mockKPIs,
  arrWaterfall: mockWaterfall,
  highlights: mockHighlights,
};

describe('QuarterlyReportDashboard Component', () => {
  describe('Basic Rendering', () => {
    it('renders the quarterly report dashboard container', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      expect(screen.getByTestId('quarterly-report-dashboard')).toBeInTheDocument();
    });

    it('renders the quarter and year in the header', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      expect(screen.getByText(/Q4 2025/)).toBeInTheDocument();
    });

    it('renders section headers for KPIs, Waterfall, and Highlights', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      expect(screen.getByRole('heading', { name: /key performance indicators|kpis/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /arr waterfall|arr movement/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /highlights/i })).toBeInTheDocument();
    });

    it('renders quarterly report title as main heading', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      const mainHeading = screen.getByRole('heading', { level: 1 });
      expect(mainHeading).toHaveTextContent(/quarterly report|executive summary/i);
    });
  });

  describe('KPI Cards Grid Rendering', () => {
    it('renders all KPI cards', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      expect(screen.getByTestId('kpi-card-Revenue')).toBeInTheDocument();
      expect(screen.getByTestId('kpi-card-MRR')).toBeInTheDocument();
      expect(screen.getByTestId('kpi-card-Churn')).toBeInTheDocument();
      expect(screen.getByTestId('kpi-card-NPS')).toBeInTheDocument();
      expect(screen.getByTestId('kpi-card-Active Users')).toBeInTheDocument();
      expect(screen.getByTestId('kpi-card-Customer Count')).toBeInTheDocument();
    });

    it('renders KPI names as card labels', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      expect(screen.getByText('Revenue')).toBeInTheDocument();
      expect(screen.getByText('MRR')).toBeInTheDocument();
      expect(screen.getByText('Churn')).toBeInTheDocument();
      expect(screen.getByText('NPS')).toBeInTheDocument();
      expect(screen.getByText('Active Users')).toBeInTheDocument();
      expect(screen.getByText('Customer Count')).toBeInTheDocument();
    });

    it('formats currency KPI values correctly', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      const revenueCard = screen.getByTestId('kpi-card-Revenue');
      expect(within(revenueCard).getByText(/\$12,500,000|\$12\.5M/)).toBeInTheDocument();

      const mrrCard = screen.getByTestId('kpi-card-MRR');
      expect(within(mrrCard).getByText(/\$1,050,000|\$1\.05M/)).toBeInTheDocument();
    });

    it('formats percentage KPI values correctly', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      const churnCard = screen.getByTestId('kpi-card-Churn');
      expect(within(churnCard).getByText('2.3%')).toBeInTheDocument();
    });

    it('formats number KPI values correctly', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      const npsCard = screen.getByTestId('kpi-card-NPS');
      expect(within(npsCard).getByText('72')).toBeInTheDocument();

      const usersCard = screen.getByTestId('kpi-card-Active Users');
      expect(within(usersCard).getByText(/45,000|45K/)).toBeInTheDocument();
    });

    it('displays target values for KPIs', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      const revenueCard = screen.getByTestId('kpi-card-Revenue');
      expect(within(revenueCard).getByText(/target.*\$12,000,000|\$12M/i)).toBeInTheDocument();
    });

    it('renders KPIs in a grid layout', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      const kpiGrid = screen.getByTestId('kpi-cards-grid');
      expect(kpiGrid).toHaveClass('grid');
    });
  });

  describe('Change Indicators', () => {
    it('shows positive change indicator with percentage', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      const revenueCard = screen.getByTestId('kpi-card-Revenue');
      const changeIndicator = within(revenueCard).getByTestId('change-indicator');
      expect(changeIndicator).toHaveTextContent('+15.2%');
    });

    it('shows negative change indicator with percentage', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      const churnCard = screen.getByTestId('kpi-card-Churn');
      const changeIndicator = within(churnCard).getByTestId('change-indicator');
      expect(changeIndicator).toHaveTextContent('-0.5%');
    });

    it('applies green color to positive changes', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      const revenueCard = screen.getByTestId('kpi-card-Revenue');
      const changeIndicator = within(revenueCard).getByTestId('change-indicator');
      expect(changeIndicator).toHaveClass('text-green-600');
    });

    it('applies red color to negative changes', () => {
      const reportWithNegativeChange: QuarterlyReport = {
        ...mockQuarterlyReport,
        kpis: [
          {
            name: 'Revenue',
            value: 10000000,
            change: -5.0,
            target: 12000000,
            unit: 'currency',
          },
        ],
      };

      render(<QuarterlyReportDashboard report={reportWithNegativeChange} />);

      const revenueCard = screen.getByTestId('kpi-card-Revenue');
      const changeIndicator = within(revenueCard).getByTestId('change-indicator');
      expect(changeIndicator).toHaveClass('text-red-600');
    });

    it('applies green color to negative churn (lower is better)', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      const churnCard = screen.getByTestId('kpi-card-Churn');
      const changeIndicator = within(churnCard).getByTestId('change-indicator');
      // Churn decrease is positive, so should be green
      expect(changeIndicator).toHaveClass('text-green-600');
    });

    it('shows upward arrow icon for positive changes', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      const revenueCard = screen.getByTestId('kpi-card-Revenue');
      const arrowIcon = within(revenueCard).getByTestId('arrow-up-icon');
      expect(arrowIcon).toBeInTheDocument();
    });

    it('shows downward arrow icon for negative changes', () => {
      const reportWithNegativeChange: QuarterlyReport = {
        ...mockQuarterlyReport,
        kpis: [
          {
            name: 'Revenue',
            value: 10000000,
            change: -5.0,
            target: 12000000,
            unit: 'currency',
          },
        ],
      };

      render(<QuarterlyReportDashboard report={reportWithNegativeChange} />);

      const revenueCard = screen.getByTestId('kpi-card-Revenue');
      const arrowIcon = within(revenueCard).getByTestId('arrow-down-icon');
      expect(arrowIcon).toBeInTheDocument();
    });

    it('handles zero change appropriately', () => {
      const reportWithZeroChange: QuarterlyReport = {
        ...mockQuarterlyReport,
        kpis: [
          {
            name: 'Revenue',
            value: 12000000,
            change: 0,
            target: 12000000,
            unit: 'currency',
          },
        ],
      };

      render(<QuarterlyReportDashboard report={reportWithZeroChange} />);

      const revenueCard = screen.getByTestId('kpi-card-Revenue');
      const changeIndicator = within(revenueCard).getByTestId('change-indicator');
      expect(changeIndicator).toHaveTextContent('0%');
      expect(changeIndicator).toHaveClass('text-gray-600');
    });
  });

  describe('ARR Waterfall Chart', () => {
    it('renders waterfall chart container', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      expect(screen.getByTestId('arr-waterfall-chart')).toBeInTheDocument();
    });

    it('renders all waterfall items', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      const waterfallChart = screen.getByTestId('arr-waterfall-chart');
      expect(within(waterfallChart).getByText('Starting ARR')).toBeInTheDocument();
      expect(within(waterfallChart).getByText('New Business')).toBeInTheDocument();
      expect(within(waterfallChart).getByText('Expansion')).toBeInTheDocument();
      expect(within(waterfallChart).getByText('Churn')).toBeInTheDocument();
      expect(within(waterfallChart).getByText('Contraction')).toBeInTheDocument();
      expect(within(waterfallChart).getByText('Ending ARR')).toBeInTheDocument();
    });

    it('displays waterfall values formatted as currency', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      const waterfallChart = screen.getByTestId('arr-waterfall-chart');
      expect(within(waterfallChart).getByText(/\$48,000,000|\$48M/)).toBeInTheDocument();
      expect(within(waterfallChart).getByText(/\$3,500,000|\$3\.5M/)).toBeInTheDocument();
    });

    it('applies start type styling to start items', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      const startingBar = screen.getByTestId('waterfall-bar-Starting ARR');
      expect(startingBar).toHaveClass('bg-blue-500');
    });

    it('applies increase type styling to increase items', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      const newBusinessBar = screen.getByTestId('waterfall-bar-New Business');
      expect(newBusinessBar).toHaveClass('bg-green-500');

      const expansionBar = screen.getByTestId('waterfall-bar-Expansion');
      expect(expansionBar).toHaveClass('bg-green-500');
    });

    it('applies decrease type styling to decrease items', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      const churnBar = screen.getByTestId('waterfall-bar-Churn');
      expect(churnBar).toHaveClass('bg-red-500');

      const contractionBar = screen.getByTestId('waterfall-bar-Contraction');
      expect(contractionBar).toHaveClass('bg-red-500');
    });

    it('applies end type styling to end items', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      const endingBar = screen.getByTestId('waterfall-bar-Ending ARR');
      expect(endingBar).toHaveClass('bg-blue-700');
    });

    it('renders waterfall items in order', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      const waterfallChart = screen.getByTestId('arr-waterfall-chart');
      const bars = within(waterfallChart).getAllByTestId(/^waterfall-bar-/);
      expect(bars).toHaveLength(6);
    });

    it('displays negative values with minus sign', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      const waterfallChart = screen.getByTestId('arr-waterfall-chart');
      expect(within(waterfallChart).getByText(/-\$1,800,000|-\$1\.8M/)).toBeInTheDocument();
    });
  });

  describe('Highlights Section', () => {
    it('renders highlights section', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      expect(screen.getByTestId('highlights-section')).toBeInTheDocument();
    });

    it('renders all highlight bullet points', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      const highlightsSection = screen.getByTestId('highlights-section');
      mockHighlights.forEach((highlight) => {
        expect(within(highlightsSection).getByText(highlight)).toBeInTheDocument();
      });
    });

    it('renders highlights as a list', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      const highlightsList = screen.getByRole('list', { name: /highlights/i });
      expect(highlightsList).toBeInTheDocument();

      const listItems = within(highlightsList).getAllByRole('listitem');
      expect(listItems).toHaveLength(5);
    });

    it('renders bullet icons for each highlight', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      const highlightsSection = screen.getByTestId('highlights-section');
      const bulletIcons = within(highlightsSection).getAllByTestId('highlight-bullet');
      expect(bulletIcons).toHaveLength(5);
    });

    it('displays empty state when no highlights', () => {
      const reportWithNoHighlights: QuarterlyReport = {
        ...mockQuarterlyReport,
        highlights: [],
      };

      render(<QuarterlyReportDashboard report={reportWithNoHighlights} />);

      expect(screen.getByText(/no highlights available/i)).toBeInTheDocument();
    });
  });

  describe('Export Actions', () => {
    it('renders PDF export button', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      expect(screen.getByRole('button', { name: /export pdf|download pdf/i })).toBeInTheDocument();
    });

    it('renders CSV export button', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      expect(screen.getByRole('button', { name: /export csv|download csv/i })).toBeInTheDocument();
    });

    it('calls onExport with "pdf" when PDF button is clicked', () => {
      const onExport = jest.fn();
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} onExport={onExport} />);

      const pdfButton = screen.getByRole('button', { name: /export pdf|download pdf/i });
      fireEvent.click(pdfButton);

      expect(onExport).toHaveBeenCalledWith('pdf');
    });

    it('calls onExport with "csv" when CSV button is clicked', () => {
      const onExport = jest.fn();
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} onExport={onExport} />);

      const csvButton = screen.getByRole('button', { name: /export csv|download csv/i });
      fireEvent.click(csvButton);

      expect(onExport).toHaveBeenCalledWith('csv');
    });

    it('disables export buttons when onExport is not provided', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      const pdfButton = screen.getByRole('button', { name: /export pdf|download pdf/i });
      const csvButton = screen.getByRole('button', { name: /export csv|download csv/i });

      expect(pdfButton).toBeDisabled();
      expect(csvButton).toBeDisabled();
    });

    it('renders export buttons in a toolbar', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      const exportToolbar = screen.getByTestId('export-toolbar');
      expect(exportToolbar).toBeInTheDocument();
      expect(within(exportToolbar).getByRole('button', { name: /export pdf|download pdf/i })).toBeInTheDocument();
      expect(within(exportToolbar).getByRole('button', { name: /export csv|download csv/i })).toBeInTheDocument();
    });
  });

  describe('KPI Card Drill-Down', () => {
    it('calls onDrillDown with KPI name when KPI card is clicked', () => {
      const onDrillDown = jest.fn();
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} onDrillDown={onDrillDown} />);

      const revenueCard = screen.getByTestId('kpi-card-Revenue');
      fireEvent.click(revenueCard);

      expect(onDrillDown).toHaveBeenCalledWith('Revenue');
    });

    it('calls onDrillDown with correct KPI name for each card', () => {
      const onDrillDown = jest.fn();
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} onDrillDown={onDrillDown} />);

      const mrrCard = screen.getByTestId('kpi-card-MRR');
      fireEvent.click(mrrCard);
      expect(onDrillDown).toHaveBeenCalledWith('MRR');

      const churnCard = screen.getByTestId('kpi-card-Churn');
      fireEvent.click(churnCard);
      expect(onDrillDown).toHaveBeenCalledWith('Churn');

      const npsCard = screen.getByTestId('kpi-card-NPS');
      fireEvent.click(npsCard);
      expect(onDrillDown).toHaveBeenCalledWith('NPS');
    });

    it('does not throw when clicking KPI card without onDrillDown', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      const revenueCard = screen.getByTestId('kpi-card-Revenue');
      expect(() => fireEvent.click(revenueCard)).not.toThrow();
    });

    it('shows clickable cursor when onDrillDown is provided', () => {
      const onDrillDown = jest.fn();
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} onDrillDown={onDrillDown} />);

      const revenueCard = screen.getByTestId('kpi-card-Revenue');
      expect(revenueCard).toHaveClass('cursor-pointer');
    });

    it('does not show clickable cursor when onDrillDown is not provided', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      const revenueCard = screen.getByTestId('kpi-card-Revenue');
      expect(revenueCard).not.toHaveClass('cursor-pointer');
    });

    it('supports keyboard navigation to drill down', () => {
      const onDrillDown = jest.fn();
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} onDrillDown={onDrillDown} />);

      const revenueCard = screen.getByTestId('kpi-card-Revenue');
      revenueCard.focus();
      fireEvent.keyDown(revenueCard, { key: 'Enter' });

      expect(onDrillDown).toHaveBeenCalledWith('Revenue');
    });

    it('supports Space key to drill down', () => {
      const onDrillDown = jest.fn();
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} onDrillDown={onDrillDown} />);

      const revenueCard = screen.getByTestId('kpi-card-Revenue');
      revenueCard.focus();
      fireEvent.keyDown(revenueCard, { key: ' ' });

      expect(onDrillDown).toHaveBeenCalledWith('Revenue');
    });
  });

  describe('Loading State', () => {
    it('renders skeleton when loading', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} loading={true} />);

      expect(screen.getByTestId('quarterly-report-skeleton')).toBeInTheDocument();
    });

    it('does not render report data when loading', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} loading={true} />);

      expect(screen.queryByText('Revenue')).not.toBeInTheDocument();
      expect(screen.queryByText('Q4 2025')).not.toBeInTheDocument();
    });

    it('renders skeleton KPI cards when loading', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} loading={true} />);

      const skeletonCards = screen.getAllByTestId('kpi-skeleton-card');
      expect(skeletonCards.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('Error State', () => {
    it('renders error state when error prop is provided', () => {
      render(
        <QuarterlyReportDashboard
          report={mockQuarterlyReport}
          error="Failed to load quarterly report"
        />
      );

      expect(screen.getByTestId('quarterly-report-error')).toBeInTheDocument();
      expect(screen.getByText('Failed to load quarterly report')).toBeInTheDocument();
    });

    it('renders retry button in error state', () => {
      const onRetry = jest.fn();
      render(
        <QuarterlyReportDashboard
          report={mockQuarterlyReport}
          error="Failed to load quarterly report"
          onRetry={onRetry}
        />
      );

      const retryButton = screen.getByRole('button', { name: /retry/i });
      expect(retryButton).toBeInTheDocument();

      fireEvent.click(retryButton);
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('does not render report content when error exists', () => {
      render(
        <QuarterlyReportDashboard
          report={mockQuarterlyReport}
          error="Failed to load quarterly report"
        />
      );

      expect(screen.queryByTestId('kpi-card-Revenue')).not.toBeInTheDocument();
      expect(screen.queryByTestId('arr-waterfall-chart')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper heading hierarchy', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1).toBeInTheDocument();

      const h2s = screen.getAllByRole('heading', { level: 2 });
      expect(h2s.length).toBeGreaterThanOrEqual(3); // KPIs, Waterfall, Highlights
    });

    it('has proper article role for dashboard', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      expect(screen.getByRole('article')).toBeInTheDocument();
    });

    it('KPI cards have proper aria-labels', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      const revenueCard = screen.getByTestId('kpi-card-Revenue');
      expect(revenueCard).toHaveAttribute(
        'aria-label',
        expect.stringContaining('Revenue')
      );
    });

    it('has proper ARIA labels for change indicators', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      const revenueCard = screen.getByTestId('kpi-card-Revenue');
      const changeIndicator = within(revenueCard).getByTestId('change-indicator');
      expect(changeIndicator).toHaveAttribute(
        'aria-label',
        expect.stringContaining('increased')
      );
    });

    it('waterfall chart has proper aria-labels', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      const waterfallChart = screen.getByTestId('arr-waterfall-chart');
      expect(waterfallChart).toHaveAttribute('aria-label', expect.stringContaining('ARR'));
    });

    it('export buttons are keyboard accessible', () => {
      const onExport = jest.fn();
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} onExport={onExport} />);

      const pdfButton = screen.getByRole('button', { name: /export pdf|download pdf/i });
      pdfButton.focus();
      fireEvent.keyDown(pdfButton, { key: 'Enter' });

      expect(onExport).toHaveBeenCalledWith('pdf');
    });

    it('KPI cards are focusable when drilldown is enabled', () => {
      const onDrillDown = jest.fn();
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} onDrillDown={onDrillDown} />);

      const revenueCard = screen.getByTestId('kpi-card-Revenue');
      expect(revenueCard).toHaveAttribute('tabIndex', '0');
    });

    it('uses semantic list markup for highlights', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      const list = screen.getByRole('list', { name: /highlights/i });
      expect(list).toBeInTheDocument();
    });
  });

  describe('Target Comparison', () => {
    it('shows target exceeded indicator when value exceeds target', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      const revenueCard = screen.getByTestId('kpi-card-Revenue');
      const targetIndicator = within(revenueCard).getByTestId('target-indicator');
      expect(targetIndicator).toHaveClass('text-green-600');
      expect(targetIndicator).toHaveTextContent(/exceeded|above target/i);
    });

    it('shows target missed indicator when value is below target', () => {
      const reportWithMissedTarget: QuarterlyReport = {
        ...mockQuarterlyReport,
        kpis: [
          {
            name: 'Revenue',
            value: 10000000,
            change: -5.0,
            target: 12000000,
            unit: 'currency',
          },
        ],
      };

      render(<QuarterlyReportDashboard report={reportWithMissedTarget} />);

      const revenueCard = screen.getByTestId('kpi-card-Revenue');
      const targetIndicator = within(revenueCard).getByTestId('target-indicator');
      expect(targetIndicator).toHaveClass('text-red-600');
      expect(targetIndicator).toHaveTextContent(/missed|below target/i);
    });

    it('shows target met indicator when value equals target', () => {
      const reportWithMetTarget: QuarterlyReport = {
        ...mockQuarterlyReport,
        kpis: [
          {
            name: 'Revenue',
            value: 12000000,
            change: 0,
            target: 12000000,
            unit: 'currency',
          },
        ],
      };

      render(<QuarterlyReportDashboard report={reportWithMetTarget} />);

      const revenueCard = screen.getByTestId('kpi-card-Revenue');
      const targetIndicator = within(revenueCard).getByTestId('target-indicator');
      expect(targetIndicator).toHaveTextContent(/met|on target/i);
    });
  });

  describe('Responsive Layout', () => {
    it('renders KPI grid with responsive columns', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      const kpiGrid = screen.getByTestId('kpi-cards-grid');
      // Check for responsive grid classes
      expect(kpiGrid).toHaveClass('grid-cols-1');
      expect(kpiGrid).toHaveClass('md:grid-cols-2');
      expect(kpiGrid).toHaveClass('lg:grid-cols-3');
    });
  });

  describe('Edge Cases', () => {
    it('handles empty KPIs array', () => {
      const reportWithNoKPIs: QuarterlyReport = {
        ...mockQuarterlyReport,
        kpis: [],
      };

      render(<QuarterlyReportDashboard report={reportWithNoKPIs} />);

      expect(screen.getByText(/no kpis available/i)).toBeInTheDocument();
    });

    it('handles empty waterfall array', () => {
      const reportWithNoWaterfall: QuarterlyReport = {
        ...mockQuarterlyReport,
        arrWaterfall: [],
      };

      render(<QuarterlyReportDashboard report={reportWithNoWaterfall} />);

      expect(screen.getByText(/no arr data available/i)).toBeInTheDocument();
    });

    it('handles very large numbers', () => {
      const reportWithLargeNumbers: QuarterlyReport = {
        ...mockQuarterlyReport,
        kpis: [
          {
            name: 'Revenue',
            value: 1000000000,
            change: 25.5,
            target: 900000000,
            unit: 'currency',
          },
        ],
      };

      render(<QuarterlyReportDashboard report={reportWithLargeNumbers} />);

      const revenueCard = screen.getByTestId('kpi-card-Revenue');
      // Should display as $1B or $1,000,000,000
      expect(within(revenueCard).getByText(/\$1,000,000,000|\$1B/)).toBeInTheDocument();
    });

    it('handles negative values in KPIs', () => {
      const reportWithNegativeValue: QuarterlyReport = {
        ...mockQuarterlyReport,
        kpis: [
          {
            name: 'Net Income',
            value: -500000,
            change: -120.0,
            target: 1000000,
            unit: 'currency',
          },
        ],
      };

      render(<QuarterlyReportDashboard report={reportWithNegativeValue} />);

      const incomeCard = screen.getByTestId('kpi-card-Net Income');
      expect(within(incomeCard).getByText(/-\$500,000|-\$500K/)).toBeInTheDocument();
    });

    it('handles special characters in highlights', () => {
      const reportWithSpecialChars: QuarterlyReport = {
        ...mockQuarterlyReport,
        highlights: [
          'Revenue increased by 15% (Q/Q) & exceeded expectations',
          'New product launch: "Enterprise Pro" edition',
        ],
      };

      render(<QuarterlyReportDashboard report={reportWithSpecialChars} />);

      expect(
        screen.getByText('Revenue increased by 15% (Q/Q) & exceeded expectations')
      ).toBeInTheDocument();
      expect(
        screen.getByText('New product launch: "Enterprise Pro" edition')
      ).toBeInTheDocument();
    });

    it('handles KPIs without target', () => {
      const reportWithNoTarget: QuarterlyReport = {
        ...mockQuarterlyReport,
        kpis: [
          {
            name: 'Revenue',
            value: 12500000,
            change: 15.2,
            unit: 'currency',
          } as KPI,
        ],
      };

      render(<QuarterlyReportDashboard report={reportWithNoTarget} />);

      const revenueCard = screen.getByTestId('kpi-card-Revenue');
      expect(within(revenueCard).queryByTestId('target-indicator')).not.toBeInTheDocument();
    });
  });

  describe('Print Styles', () => {
    it('has print-friendly class on dashboard', () => {
      render(<QuarterlyReportDashboard report={mockQuarterlyReport} />);

      const dashboard = screen.getByTestId('quarterly-report-dashboard');
      expect(dashboard).toHaveClass('print:break-inside-avoid');
    });
  });
});
