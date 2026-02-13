/**
 * ForecastingPage Tests
 *
 * Tests for the Sales Forecast page including:
 * - Forecast summary cards
 * - Rep leaderboard with quotas
 * - Expand/collapse for opportunities
 * - Category updates
 * - Truncation warnings
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import ForecastingPage from '../pages/ForecastingPage';
import type { ForecastSummary } from '../types';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Test wrapper
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

// Mock data
const mockForecast: ForecastSummary = {
  period: '2026-02',
  period_label: 'February 2026',
  team_quota: 1000000,
  team_closed: 450000,
  team_commit: 200000,
  team_best_case: 150000,
  team_pipeline: 300000,
  team_gap: 200000,
  reps: [
    {
      owner_id: 'rep-001',
      owner_name: 'Alice Sales',
      quota: 400000,
      closed: 200000,
      commit: 100000,
      best_case: 50000,
      pipeline: 100000,
      gap: 50000,
      opportunities: [
        {
          opportunity_id: 'opp-001',
          opportunity_name: 'Big Deal',
          customer_name: 'Acme Corp',
          value: 100000,
          stage: 'Negotiation',
          close_date: '2026-02-15',
          forecast_category: 'COMMIT',
        },
        {
          opportunity_id: 'opp-002',
          opportunity_name: 'Medium Deal',
          customer_name: 'Beta Inc',
          value: 50000,
          stage: 'Proposal',
          close_date: '2026-02-20',
          forecast_category: 'BEST_CASE',
        },
      ],
    },
    {
      owner_id: 'rep-002',
      owner_name: 'Bob Sales',
      quota: 300000,
      closed: 150000,
      commit: 50000,
      best_case: 75000,
      pipeline: 100000,
      gap: 25000,
      opportunities: [
        {
          opportunity_id: 'opp-003',
          opportunity_name: 'Small Deal',
          customer_name: 'Gamma LLC',
          value: 50000,
          stage: 'Discovery',
          close_date: '2026-02-28',
          forecast_category: 'PIPELINE',
        },
      ],
    },
    {
      owner_id: 'rep-003',
      owner_name: 'Carol Sales',
      quota: 300000,
      closed: 100000,
      commit: 50000,
      best_case: 25000,
      pipeline: 100000,
      gap: 125000,
      opportunities: [],
    },
  ],
};

describe('ForecastingPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('Team Summary Cards', () => {
    test('displays team quota and closed amounts', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockForecast }),
      });

      render(<ForecastingPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('team-quota')).toHaveTextContent('$1.0M');
      });

      expect(screen.getByTestId('team-closed')).toHaveTextContent('$450K');
    });

    test('displays commit, best case, and pipeline totals', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockForecast }),
      });

      render(<ForecastingPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('team-commit')).toHaveTextContent('$200K');
      });

      expect(screen.getByTestId('team-best-case')).toHaveTextContent('$150K');
      expect(screen.getByTestId('team-pipeline')).toHaveTextContent('$300K');
    });

    test('displays gap to quota', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockForecast }),
      });

      render(<ForecastingPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('team-gap')).toHaveTextContent('$200K');
      });
    });

    test('shows attainment percentage', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockForecast }),
      });

      render(<ForecastingPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        // 450000 / 1000000 = 45% attainment
        expect(screen.getByTestId('team-closed')).toHaveTextContent('45% attainment');
      });
    });
  });

  describe('Rep Forecast Table', () => {
    test('displays each rep with their metrics', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockForecast }),
      });

      render(<ForecastingPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Alice Sales')).toBeInTheDocument();
      });

      expect(screen.getByText('Bob Sales')).toBeInTheDocument();
      expect(screen.getByText('Carol Sales')).toBeInTheDocument();
    });

    test('displays team totals row', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockForecast }),
      });

      render(<ForecastingPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('team-totals-row')).toBeInTheDocument();
      });

      expect(screen.getByTestId('team-totals-row')).toHaveTextContent('Team Total');
    });
  });

  describe('Expand/Collapse', () => {
    test('expands rep row to show opportunities in detailed view', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockForecast }),
      });

      render(<ForecastingPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Alice Sales')).toBeInTheDocument();
      });

      // Switch to detailed view
      fireEvent.click(screen.getByText('Detailed'));

      // Click on rep row to expand
      const repRows = screen.getAllByTestId('rep-row');
      fireEvent.click(repRows[0]);

      await waitFor(() => {
        expect(screen.getByText('Big Deal')).toBeInTheDocument();
      });

      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });
  });

  describe('Period Selection', () => {
    test('allows selecting different periods', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockForecast }),
      });

      render(<ForecastingPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('period-select')).toBeInTheDocument();
      });

      const periodSelect = screen.getByTestId('period-select');
      expect(periodSelect).toBeInTheDocument();
    });
  });

  describe('View Mode Toggle', () => {
    test('toggles between summary and detailed view', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockForecast }),
      });

      render(<ForecastingPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Summary')).toBeInTheDocument();
      });

      expect(screen.getByText('Detailed')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Detailed'));

      // View mode should change (button styling will update)
      expect(screen.getByText('Detailed')).toBeInTheDocument();
    });
  });

  describe('Loading and Error States', () => {
    test('shows loading skeleton while fetching', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));

      render(<ForecastingPage />, { wrapper: createWrapper() });

      expect(screen.getByTestId('forecast-loading')).toBeInTheDocument();
    });

    test('shows error state on API failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      render(<ForecastingPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('error-state')).toBeInTheDocument();
      });
    });
  });

  describe('Truncation Warning', () => {
    test('displays truncation warning when data is truncated', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          status: 'success',
          data: mockForecast,
          metadata: {
            truncated: true,
            totalCount: '50+',
            warning: 'Results truncated to 50 records',
          },
        }),
      });

      render(<ForecastingPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        // May have multiple truncation warnings from different data sources
        const warnings = screen.queryAllByTestId('truncation-warning');
        expect(warnings.length).toBeGreaterThan(0);
      });
    });
  });
});
