/**
 * DashboardPage Tests
 *
 * Tests for the Tax Dashboard page showing tax summary,
 * upcoming deadlines, and compliance status.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardPage } from '../../pages/DashboardPage';
import { TaxSummary } from '../../types';

const mockTaxSummary: TaxSummary = {
  currentYear: 2026,
  currentQuarter: 1,
  totalTaxLiability: 125000,
  paidToDate: 75000,
  remainingBalance: 50000,
  upcomingDeadlines: [
    { description: 'Q1 Federal Estimated Tax', dueDate: '2026-04-15', amount: 12500 },
    { description: 'California Sales Tax', dueDate: '2026-04-30', amount: 3200 },
  ],
  stateBreakdown: [
    { state: 'California', liability: 45000, paid: 30000 },
    { state: 'Texas', liability: 25000, paid: 15000 },
    { state: 'New York', liability: 35000, paid: 20000 },
  ],
  recentFilings: [
    {
      id: 'filing-1',
      year: 2025,
      filingType: '1099',
      entityName: 'Contractor Inc',
      entityId: 'contractor-1',
      totalAmount: 85000,
      filingDate: '2026-01-31',
      dueDate: '2026-01-31',
      status: 'filed',
      confirmationNumber: 'CONF-12345',
    },
  ],
  complianceStatus: 'compliant',
};

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

describe('DashboardPage', () => {
  beforeEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
  });

  it('renders the page title', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockTaxSummary }),
    });

    renderWithProviders(<DashboardPage />);

    expect(screen.getByText('Tax Dashboard')).toBeInTheDocument();
  });

  it('displays loading state while fetching data', () => {
    global.fetch = vi.fn().mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    renderWithProviders(<DashboardPage />);

    expect(screen.getByText('Loading tax data...')).toBeInTheDocument();
  });

  it('displays tax summary metrics', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockTaxSummary }),
    });

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('$125,000.00')).toBeInTheDocument(); // Total Liability
      expect(screen.getByText('$75,000.00')).toBeInTheDocument(); // Paid to Date
      expect(screen.getByText('$50,000.00')).toBeInTheDocument(); // Remaining Balance
    });
  });

  it('displays compliance status badge', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockTaxSummary }),
    });

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Compliant')).toBeInTheDocument();
    });
  });

  it('displays upcoming deadlines', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockTaxSummary }),
    });

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Q1 Federal Estimated Tax')).toBeInTheDocument();
      expect(screen.getByText('California Sales Tax')).toBeInTheDocument();
    });
  });

  it('displays state tax breakdown', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockTaxSummary }),
    });

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('California')).toBeInTheDocument();
      expect(screen.getByText('Texas')).toBeInTheDocument();
      expect(screen.getByText('New York')).toBeInTheDocument();
    });
  });

  it('displays recent filings', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockTaxSummary }),
    });

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Contractor Inc')).toBeInTheDocument();
      expect(screen.getByText('1099 - 2025')).toBeInTheDocument();
    });
  });

  it('displays error message on fetch failure', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'error',
          code: 'FETCH_ERROR',
          message: 'Failed to load tax summary',
        }),
    });

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Error loading tax summary')).toBeInTheDocument();
    });
  });

  it('displays at-risk compliance status correctly', async () => {
    const atRiskSummary = { ...mockTaxSummary, complianceStatus: 'at_risk' as const };
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: atRiskSummary }),
    });

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('At Risk')).toBeInTheDocument();
    });
  });
});
