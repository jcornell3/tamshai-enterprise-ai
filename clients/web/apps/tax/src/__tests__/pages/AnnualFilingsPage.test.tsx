/**
 * AnnualFilingsPage Tests
 *
 * Tests for the Annual Tax Filings page showing 1099s, W-2s, and other filings.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnnualFilingsPage } from '../../pages/AnnualFilingsPage';
import { AnnualFiling } from '../../types';

const mockFilings: AnnualFiling[] = [
  {
    id: 'filing-1',
    year: 2025,
    filingType: '1099',
    entityName: 'Acme Consulting LLC',
    entityId: 'contractor-1',
    totalAmount: 85000,
    filingDate: '2026-01-28',
    dueDate: '2026-01-31',
    status: 'filed',
    confirmationNumber: 'IRS-1099-2025-12345',
  },
  {
    id: 'filing-2',
    year: 2025,
    filingType: 'W-2',
    entityName: 'John Smith',
    entityId: 'emp-001',
    totalAmount: 125000,
    filingDate: '2026-01-30',
    dueDate: '2026-01-31',
    status: 'accepted',
    confirmationNumber: 'SSA-W2-2025-67890',
  },
  {
    id: 'filing-3',
    year: 2025,
    filingType: '941',
    entityName: 'Q4 2025 Payroll Tax',
    entityId: 'quarter-4',
    totalAmount: 45000,
    dueDate: '2026-01-31',
    status: 'draft',
  },
  {
    id: 'filing-4',
    year: 2024,
    filingType: '1099',
    entityName: 'Old Vendor Inc',
    entityId: 'contractor-2',
    totalAmount: 32000,
    filingDate: '2025-01-15',
    dueDate: '2025-01-31',
    status: 'amended',
    notes: 'Corrected TIN',
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

describe('AnnualFilingsPage', () => {
  beforeEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
  });

  it('renders the page title', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockFilings }),
    });

    renderWithProviders(<AnnualFilingsPage />);

    expect(screen.getByText('Annual Tax Filings')).toBeInTheDocument();
  });

  it('displays loading state while fetching data', () => {
    global.fetch = vi.fn().mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    renderWithProviders(<AnnualFilingsPage />);

    expect(screen.getByText('Loading filings...')).toBeInTheDocument();
  });

  it('displays table headers', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockFilings }),
    });

    renderWithProviders(<AnnualFilingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Year')).toBeInTheDocument();
      expect(screen.getByText('Type')).toBeInTheDocument();
      expect(screen.getByText('Entity')).toBeInTheDocument();
      expect(screen.getByText('Amount')).toBeInTheDocument();
      expect(screen.getByText('Due Date')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
    });
  });

  it('displays 1099 filings', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockFilings }),
    });

    renderWithProviders(<AnnualFilingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Acme Consulting LLC')).toBeInTheDocument();
      expect(screen.getByText('$85,000.00')).toBeInTheDocument();
    });
  });

  it('displays W-2 filings', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockFilings }),
    });

    renderWithProviders(<AnnualFilingsPage />);

    await waitFor(() => {
      expect(screen.getByText('John Smith')).toBeInTheDocument();
      expect(screen.getByText('W-2')).toBeInTheDocument();
      expect(screen.getByText('$125,000.00')).toBeInTheDocument();
    });
  });

  it('displays filing types as badges', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockFilings }),
    });

    renderWithProviders(<AnnualFilingsPage />);

    await waitFor(() => {
      // Multiple 1099 filings exist
      const filings1099 = screen.getAllByText('1099');
      expect(filings1099.length).toBeGreaterThan(0);
      expect(screen.getByText('W-2')).toBeInTheDocument();
      expect(screen.getByText('941')).toBeInTheDocument();
    });
  });

  it('displays filed status correctly', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockFilings }),
    });

    renderWithProviders(<AnnualFilingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Filed')).toBeInTheDocument();
    });
  });

  it('displays accepted status correctly', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockFilings }),
    });

    renderWithProviders(<AnnualFilingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Accepted')).toBeInTheDocument();
    });
  });

  it('displays draft status correctly', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockFilings }),
    });

    renderWithProviders(<AnnualFilingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Draft')).toBeInTheDocument();
    });
  });

  it('displays confirmation numbers when available', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockFilings }),
    });

    renderWithProviders(<AnnualFilingsPage />);

    await waitFor(() => {
      expect(screen.getByText('IRS-1099-2025-12345')).toBeInTheDocument();
    });
  });

  it('displays error message on fetch failure', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'error',
          code: 'FETCH_ERROR',
          message: 'Failed to load filings',
        }),
    });

    renderWithProviders(<AnnualFilingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Error loading filings')).toBeInTheDocument();
    });
  });
});
