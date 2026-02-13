/**
 * DashboardPage Tests - GREEN PHASE
 *
 * Tests for the Sales Dashboard page with pipeline metrics and visualizations.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import DashboardPage from '../pages/DashboardPage';
import type { Opportunity } from '../types';

// Mock fetch for API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock navigation
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Test wrapper with providers
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
};

// Mock opportunity data for testing
const mockOpportunities: Opportunity[] = [
  {
    _id: 'opp-001',
    customer_id: 'cust-001',
    customer_name: 'Acme Corp',
    title: 'Enterprise License Deal',
    value: 150000,
    stage: 'NEGOTIATION',
    probability: 75,
    expected_close_date: '2026-02-15',
    owner_id: 'user-001',
    owner_name: 'Alice Sales',
    created_at: '2026-01-01T10:00:00Z',
    updated_at: '2026-01-02T14:30:00Z',
  },
  {
    _id: 'opp-002',
    customer_id: 'cust-002',
    customer_name: 'TechStart Inc',
    title: 'Startup Package',
    value: 25000,
    stage: 'QUALIFICATION',
    probability: 40,
    expected_close_date: '2026-03-01',
    owner_id: 'user-001',
    owner_name: 'Alice Sales',
    created_at: '2026-01-02T09:00:00Z',
    updated_at: '2026-01-02T15:00:00Z',
  },
  {
    _id: 'opp-003',
    customer_id: 'cust-003',
    customer_name: 'Global Industries',
    title: 'Multi-year Contract',
    value: 500000,
    stage: 'CLOSED_WON',
    probability: 100,
    expected_close_date: '2026-01-10',
    owner_id: 'user-002',
    owner_name: 'Bob Sales',
    created_at: '2025-12-01T10:00:00Z',
    updated_at: '2026-01-10T16:00:00Z',
  },
  {
    _id: 'opp-004',
    customer_id: 'cust-004',
    customer_name: 'SmallBiz LLC',
    title: 'Basic Plan',
    value: 10000,
    stage: 'CLOSED_LOST',
    probability: 0,
    owner_id: 'user-001',
    owner_name: 'Alice Sales',
    created_at: '2025-12-15T10:00:00Z',
    updated_at: '2026-01-05T10:00:00Z',
  },
  {
    _id: 'opp-005',
    customer_id: 'cust-005',
    customer_name: 'MegaCorp',
    title: 'Premium Enterprise',
    value: 750000,
    stage: 'PROPOSAL',
    probability: 50,
    expected_close_date: '2026-04-01',
    owner_id: 'user-002',
    owner_name: 'Bob Sales',
    created_at: '2026-01-03T08:00:00Z',
    updated_at: '2026-01-03T12:00:00Z',
  },
];

describe('DashboardPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockNavigate.mockReset();
  });

  describe('Pipeline Metrics', () => {
    test('displays total pipeline value', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockOpportunities }),
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('total-pipeline-card')).toBeInTheDocument();
      });

      // Open pipeline = 150000 + 25000 + 750000 = 925000
      expect(screen.getByText('Total Pipeline')).toBeInTheDocument();
    });

    test('displays opportunities won this quarter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockOpportunities }),
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('won-this-quarter-card')).toBeInTheDocument();
      });

      expect(screen.getByText('Won This Quarter')).toBeInTheDocument();
    });

    test('displays win rate percentage', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockOpportunities }),
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('win-rate-card')).toBeInTheDocument();
      });

      expect(screen.getByText('Win Rate')).toBeInTheDocument();
    });

    test('displays average deal size', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockOpportunities }),
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('avg-deal-card')).toBeInTheDocument();
      });

      expect(screen.getByText('Average Deal Size')).toBeInTheDocument();
    });

    test('displays expected revenue this quarter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockOpportunities }),
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('expected-revenue-card')).toBeInTheDocument();
      });

      expect(screen.getByText('Expected Revenue')).toBeInTheDocument();
    });
  });

  describe('Pipeline Visualization', () => {
    test('displays opportunities grouped by stage', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockOpportunities }),
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('pipeline-chart')).toBeInTheDocument();
      });

      expect(screen.getByText('Pipeline by Stage')).toBeInTheDocument();
    });

    test('displays total value per stage', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockOpportunities }),
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('stage-qualification')).toBeInTheDocument();
        expect(screen.getByTestId('stage-negotiation')).toBeInTheDocument();
      });
    });

    test('clicking stage navigates to filtered opportunities', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockOpportunities }),
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('stage-qualification')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('stage-qualification'));

      expect(mockNavigate).toHaveBeenCalledWith('/opportunities?stage=QUALIFICATION');
    });
  });

  describe('Recent Activity', () => {
    test('displays top 5 recent opportunities', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockOpportunities }),
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('recent-activity')).toBeInTheDocument();
      });

      expect(screen.getByText('Recent Activity')).toBeInTheDocument();
    });

    test('displays top customers by revenue', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockOpportunities }),
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('top-customers')).toBeInTheDocument();
      });

      expect(screen.getByText('Top Customers by Revenue')).toBeInTheDocument();
    });

    test('clicking opportunity navigates to detail view', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockOpportunities }),
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('recent-opp-opp-001')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('recent-opp-opp-001'));

      expect(mockNavigate).toHaveBeenCalledWith('/opportunities/opp-001');
    });

    test('clicking customer navigates to customer detail', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockOpportunities }),
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('top-customer-cust-003')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('top-customer-cust-003'));

      expect(mockNavigate).toHaveBeenCalledWith('/customers/cust-003');
    });
  });

  describe('Closing Soon', () => {
    test('displays opportunities closing within 30 days', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockOpportunities }),
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('closing-soon')).toBeInTheDocument();
      });

      expect(screen.getByText('Closing Soon (30 days)')).toBeInTheDocument();
    });

    test('highlights overdue opportunities', async () => {
      const overdueOpportunities = [
        {
          ...mockOpportunities[0],
          expected_close_date: '2025-01-01', // Past date = overdue
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: overdueOpportunities }),
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('closing-soon')).toBeInTheDocument();
      });

      // The overdue opportunity should be highlighted
      expect(screen.getByTestId('overdue-opp-001')).toBeInTheDocument();
    });
  });

  describe('Loading and Error States', () => {
    test('shows loading state initially', async () => {
      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<DashboardPage />, { wrapper: createWrapper() });

      expect(screen.getByTestId('loading')).toBeInTheDocument();
      expect(screen.getByText('Loading dashboard...')).toBeInTheDocument();
    });

    test('handles API error gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('API Error'));

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('error')).toBeInTheDocument();
      });

      expect(screen.getByText('Error loading dashboard')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    test('shows empty state when no opportunities', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('empty-state')).toBeInTheDocument();
      });

      expect(screen.getByText('No opportunities found')).toBeInTheDocument();
    });
  });

  describe('Refresh and Date Range', () => {
    test('refresh button reloads dashboard data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockOpportunities }),
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('refresh-button')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('refresh-button'));

      // Should have made at least 2 fetch calls (initial + refresh)
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });
    });

    test('date range selector filters metrics', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockOpportunities }),
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('date-range-selector')).toBeInTheDocument();
      });

      const selector = screen.getByTestId('date-range-selector');
      expect(selector).toHaveValue('this_quarter');

      fireEvent.change(selector, { target: { value: 'all_time' } });
      expect(selector).toHaveValue('all_time');
    });
  });
});
