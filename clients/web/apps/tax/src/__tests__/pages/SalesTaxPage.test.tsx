/**
 * SalesTaxPage Tests
 *
 * Tests for the Sales Tax Rates page showing state-by-state tax rates.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SalesTaxPage } from '../../pages/SalesTaxPage';
import { SalesTaxRate } from '../../types';

const mockSalesTaxRates: SalesTaxRate[] = [
  {
    id: 'rate-1',
    state: 'California',
    stateCode: 'CA',
    baseRate: 7.25,
    localRate: 1.5,
    combinedRate: 8.75,
    effectiveDate: '2024-01-01',
    notes: 'Includes state and average local rate',
  },
  {
    id: 'rate-2',
    state: 'Texas',
    stateCode: 'TX',
    baseRate: 6.25,
    localRate: 2.0,
    combinedRate: 8.25,
    effectiveDate: '2024-01-01',
  },
  {
    id: 'rate-3',
    state: 'Oregon',
    stateCode: 'OR',
    baseRate: 0,
    localRate: 0,
    combinedRate: 0,
    effectiveDate: '2024-01-01',
    notes: 'No sales tax',
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

describe('SalesTaxPage', () => {
  beforeEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
  });

  it('renders the page title', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockSalesTaxRates }),
    });

    renderWithProviders(<SalesTaxPage />);

    expect(screen.getByText('Sales Tax Rates')).toBeInTheDocument();
  });

  it('displays loading state while fetching data', () => {
    global.fetch = vi.fn().mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    renderWithProviders(<SalesTaxPage />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('displays table headers', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockSalesTaxRates }),
    });

    renderWithProviders(<SalesTaxPage />);

    await waitFor(() => {
      expect(screen.getByText('State')).toBeInTheDocument();
      expect(screen.getByText('Base Rate')).toBeInTheDocument();
      expect(screen.getByText('Local Rate')).toBeInTheDocument();
      expect(screen.getByText('Combined Rate')).toBeInTheDocument();
      expect(screen.getByText('Effective Date')).toBeInTheDocument();
    });
  });

  it('displays tax rates for each state', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockSalesTaxRates }),
    });

    renderWithProviders(<SalesTaxPage />);

    await waitFor(() => {
      expect(screen.getByText('California')).toBeInTheDocument();
      expect(screen.getByText('CA')).toBeInTheDocument();
      expect(screen.getByText('7.25%')).toBeInTheDocument();
      expect(screen.getByText('8.75%')).toBeInTheDocument();
    });
  });

  it('displays Texas tax rates', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockSalesTaxRates }),
    });

    renderWithProviders(<SalesTaxPage />);

    await waitFor(() => {
      expect(screen.getByText('Texas')).toBeInTheDocument();
      expect(screen.getByText('TX')).toBeInTheDocument();
    });
  });

  it('displays zero tax rate states correctly', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockSalesTaxRates }),
    });

    renderWithProviders(<SalesTaxPage />);

    await waitFor(() => {
      expect(screen.getByText('Oregon')).toBeInTheDocument();
      expect(screen.getByText('OR')).toBeInTheDocument();
      // Should show 0.00% for zero-tax states
      const zeroRates = screen.getAllByText('0.00%');
      expect(zeroRates.length).toBeGreaterThan(0);
    });
  });

  it('displays notes when available', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockSalesTaxRates }),
    });

    renderWithProviders(<SalesTaxPage />);

    await waitFor(() => {
      expect(screen.getByText('No sales tax')).toBeInTheDocument();
    });
  });

  it('displays error message on fetch failure', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'error',
          code: 'FETCH_ERROR',
          message: 'Failed to load tax rates',
        }),
    });

    renderWithProviders(<SalesTaxPage />);

    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
    });
  });

  it('displays truncation warning when data is truncated', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'success',
          data: mockSalesTaxRates,
          metadata: {
            truncated: true,
            totalCount: '50+',
            warning: 'Only 50 of 50+ records returned',
          },
        }),
    });

    renderWithProviders(<SalesTaxPage />);

    await waitFor(() => {
      expect(screen.getByTestId('truncation-warning')).toBeInTheDocument();
    });
  });
});
