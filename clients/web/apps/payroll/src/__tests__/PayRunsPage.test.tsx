/**
 * PayRunsPage Tests - RED Phase
 *
 * Tests for the Pay Runs list page including:
 * - Pay run list display
 * - Status badges
 * - Actions (View, Process, Export)
 * - New Pay Run button
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import PayRunsPage from '../pages/PayRunsPage';

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

// Mock data - uses API field names (page maps to UI field names)
const mockPayRunsApiFormat = [
  {
    pay_run_id: 'pr-001',
    pay_period_start: '2026-01-01',
    pay_period_end: '2026-01-14',
    pay_date: '2026-01-17',
    employee_count: 54,
    total_gross: 425000,
    total_net: 260387.5,
    status: 'completed',
    created_at: '2026-01-10T10:00:00Z',
    processed_at: '2026-01-17T08:00:00Z',
  },
  {
    pay_run_id: 'pr-002',
    pay_period_start: '2026-01-15',
    pay_period_end: '2026-01-28',
    pay_date: '2026-01-31',
    employee_count: 54,
    total_gross: 430000,
    total_net: 265000,
    status: 'draft',
    created_at: '2026-01-25T10:00:00Z',
    processed_at: null,
  },
];

describe('PayRunsPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('Page Rendering', () => {
    test('displays page title', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockPayRunsApiFormat }),
      });

      render(<PayRunsPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Pay Runs')).toBeInTheDocument();
    });

    test('displays New Pay Run button', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockPayRunsApiFormat }),
      });

      render(<PayRunsPage />, { wrapper: createWrapper() });

      expect(screen.getByRole('button', { name: /new pay run/i })).toBeInTheDocument();
    });

    test('displays loading state while fetching', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));

      render(<PayRunsPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Loading pay runs...')).toBeInTheDocument();
    });
  });

  describe('Pay Run List', () => {
    test('displays pay period column', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockPayRunsApiFormat }),
      });

      render(<PayRunsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Pay Period')).toBeInTheDocument();
      });
    });

    test('displays pay date column', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockPayRunsApiFormat }),
      });

      render(<PayRunsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Pay Date')).toBeInTheDocument();
      });
    });

    test('displays employees count column', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockPayRunsApiFormat }),
      });

      render(<PayRunsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Employees')).toBeInTheDocument();
      });
    });

    test('displays pay run data when loaded', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockPayRunsApiFormat }),
      });

      render(<PayRunsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        // Check for gross pay which indicates data is loaded
        expect(screen.getByText('$425,000')).toBeInTheDocument();
      });
    });

    test('displays gross pay for each run', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockPayRunsApiFormat }),
      });

      render(<PayRunsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('$425,000')).toBeInTheDocument();
      });
    });

    test('displays net pay for each run', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockPayRunsApiFormat }),
      });

      render(<PayRunsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('$260,387.50')).toBeInTheDocument();
      });
    });
  });

  describe('Status Badges', () => {
    test('displays completed status badge', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockPayRunsApiFormat }),
      });

      render(<PayRunsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('completed')).toBeInTheDocument();
      });
    });

    test('displays draft status badge', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockPayRunsApiFormat }),
      });

      render(<PayRunsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('draft')).toBeInTheDocument();
      });
    });
  });

  describe('Actions', () => {
    test('displays View action for each pay run', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockPayRunsApiFormat }),
      });

      render(<PayRunsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        const viewButtons = screen.getAllByRole('button', { name: /view/i });
        expect(viewButtons.length).toBeGreaterThan(0);
      });
    });

    test('displays Process action for draft pay runs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockPayRunsApiFormat }),
      });

      render(<PayRunsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /process/i })).toBeInTheDocument();
      });
    });
  });

  describe('Filtering', () => {
    test('displays year filter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockPayRunsApiFormat }),
      });

      render(<PayRunsPage />, { wrapper: createWrapper() });

      expect(screen.getByRole('combobox', { name: /year/i })).toBeInTheDocument();
    });

    test('displays status filter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockPayRunsApiFormat }),
      });

      render(<PayRunsPage />, { wrapper: createWrapper() });

      expect(screen.getByRole('combobox', { name: /status/i })).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    test('shows error message on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      });

      render(<PayRunsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/error loading pay runs/i)).toBeInTheDocument();
      });
    });

    test('shows empty state when no pay runs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(<PayRunsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/no pay runs found/i)).toBeInTheDocument();
      });
    });
  });
});
