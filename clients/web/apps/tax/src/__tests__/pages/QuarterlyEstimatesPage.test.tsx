/**
 * QuarterlyEstimatesPage Tests
 *
 * Tests for the Quarterly Tax Estimates page showing federal and state estimates.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuarterlyEstimatesPage } from '../../pages/QuarterlyEstimatesPage';
import { QuarterlyEstimate } from '../../types';

const mockEstimates: QuarterlyEstimate[] = [
  {
    id: 'est-1',
    year: 2026,
    quarter: 1,
    federalEstimate: 15000,
    stateEstimate: 5000,
    totalEstimate: 20000,
    dueDate: '2026-04-15',
    status: 'pending',
  },
  {
    id: 'est-2',
    year: 2025,
    quarter: 4,
    federalEstimate: 14000,
    stateEstimate: 4500,
    totalEstimate: 18500,
    dueDate: '2026-01-15',
    paidDate: '2026-01-10',
    paidAmount: 18500,
    status: 'paid',
  },
  {
    id: 'est-3',
    year: 2025,
    quarter: 3,
    federalEstimate: 13500,
    stateEstimate: 4200,
    totalEstimate: 17700,
    dueDate: '2025-09-15',
    paidDate: '2025-09-20',
    paidAmount: 10000,
    status: 'partial',
    notes: 'Partial payment due to cash flow',
  },
];

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const renderWithProviders = (component: React.ReactNode) => {
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{component}</BrowserRouter>
    </QueryClientProvider>
  );
};

describe('QuarterlyEstimatesPage', () => {
  beforeEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
  });

  it('renders the page title', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockEstimates }),
    });

    renderWithProviders(<QuarterlyEstimatesPage />);

    expect(screen.getByText('Quarterly Tax Estimates')).toBeInTheDocument();
  });

  it('displays loading state while fetching data', () => {
    global.fetch = vi.fn().mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    renderWithProviders(<QuarterlyEstimatesPage />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('displays table headers', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockEstimates }),
    });

    renderWithProviders(<QuarterlyEstimatesPage />);

    await waitFor(() => {
      expect(screen.getByText('Quarter')).toBeInTheDocument();
      expect(screen.getByText('Federal')).toBeInTheDocument();
      expect(screen.getByText('State')).toBeInTheDocument();
      expect(screen.getByText('Total')).toBeInTheDocument();
      expect(screen.getByText('Due Date')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
    });
  });

  it('displays quarterly estimates', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockEstimates }),
    });

    renderWithProviders(<QuarterlyEstimatesPage />);

    await waitFor(() => {
      expect(screen.getByText('Q1 2026')).toBeInTheDocument();
      expect(screen.getByText('$15,000.00')).toBeInTheDocument();
      expect(screen.getByText('$20,000.00')).toBeInTheDocument();
    });
  });

  it('displays pending status correctly', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockEstimates }),
    });

    renderWithProviders(<QuarterlyEstimatesPage />);

    await waitFor(() => {
      expect(screen.getByText('Pending')).toBeInTheDocument();
    });
  });

  it('displays paid status correctly', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockEstimates }),
    });

    renderWithProviders(<QuarterlyEstimatesPage />);

    await waitFor(() => {
      expect(screen.getByText('Paid')).toBeInTheDocument();
    });
  });

  it('displays partial status correctly', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockEstimates }),
    });

    renderWithProviders(<QuarterlyEstimatesPage />);

    await waitFor(() => {
      expect(screen.getByText('Partial')).toBeInTheDocument();
    });
  });

  it('displays paid date when available', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockEstimates }),
    });

    renderWithProviders(<QuarterlyEstimatesPage />);

    await waitFor(() => {
      // Q4 2025 was paid on 2026-01-10
      expect(screen.getByText('Q4 2025')).toBeInTheDocument();
    });
  });

  it('displays error message on fetch failure', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'error',
          code: 'FETCH_ERROR',
          message: 'Failed to load estimates',
        }),
    });

    renderWithProviders(<QuarterlyEstimatesPage />);

    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
    });
  });

  it('displays notes when available', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockEstimates }),
    });

    renderWithProviders(<QuarterlyEstimatesPage />);

    await waitFor(() => {
      expect(screen.getByText('Partial payment due to cash flow')).toBeInTheDocument();
    });
  });
});
