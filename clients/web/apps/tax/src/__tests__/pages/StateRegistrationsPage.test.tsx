/**
 * StateRegistrationsPage Tests
 *
 * Tests for the State Tax Registrations page.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateRegistrationsPage } from '../../pages/StateRegistrationsPage';
import { StateRegistration } from '../../types';

const mockRegistrations: StateRegistration[] = [
  {
    id: 'reg-1',
    state: 'California',
    stateCode: 'CA',
    registrationType: 'sales_tax',
    registrationNumber: 'CA-SALES-123456',
    registrationDate: '2023-01-15',
    status: 'active',
    filingFrequency: 'quarterly',
  },
  {
    id: 'reg-2',
    state: 'Texas',
    stateCode: 'TX',
    registrationType: 'franchise_tax',
    registrationNumber: 'TX-FRAN-789012',
    registrationDate: '2023-03-01',
    expirationDate: '2026-03-01',
    status: 'active',
    filingFrequency: 'annually',
  },
  {
    id: 'reg-3',
    state: 'New York',
    stateCode: 'NY',
    registrationType: 'income_tax',
    registrationNumber: 'NY-INC-345678',
    registrationDate: '2022-06-01',
    status: 'pending',
    filingFrequency: 'quarterly',
    notes: 'Awaiting confirmation from NY Tax Authority',
  },
  {
    id: 'reg-4',
    state: 'Florida',
    stateCode: 'FL',
    registrationType: 'sales_tax',
    registrationNumber: 'FL-SALES-901234',
    registrationDate: '2021-01-01',
    expirationDate: '2024-01-01',
    status: 'expired',
    filingFrequency: 'monthly',
    notes: 'Renewal submitted',
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

describe('StateRegistrationsPage', () => {
  beforeEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
  });

  it('renders the page title', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockRegistrations }),
    });

    renderWithProviders(<StateRegistrationsPage />);

    expect(screen.getByText('State Tax Registrations')).toBeInTheDocument();
  });

  it('displays loading state while fetching data', () => {
    global.fetch = vi.fn().mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    renderWithProviders(<StateRegistrationsPage />);

    expect(screen.getByText('Loading registrations...')).toBeInTheDocument();
  });

  it('displays table headers', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockRegistrations }),
    });

    renderWithProviders(<StateRegistrationsPage />);

    await waitFor(() => {
      expect(screen.getByText('State')).toBeInTheDocument();
      expect(screen.getByText('Type')).toBeInTheDocument();
      expect(screen.getByText('Registration #')).toBeInTheDocument();
      expect(screen.getByText('Filing Frequency')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
    });
  });

  it('displays California registration', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockRegistrations }),
    });

    renderWithProviders(<StateRegistrationsPage />);

    await waitFor(() => {
      expect(screen.getByText('California')).toBeInTheDocument();
      expect(screen.getByText('CA-SALES-123456')).toBeInTheDocument();
    });
  });

  it('displays registration types correctly', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockRegistrations }),
    });

    renderWithProviders(<StateRegistrationsPage />);

    await waitFor(() => {
      // Multiple sales tax registrations exist
      const salesTaxEntries = screen.getAllByText('Sales Tax');
      expect(salesTaxEntries.length).toBeGreaterThan(0);
      expect(screen.getByText('Franchise Tax')).toBeInTheDocument();
      expect(screen.getByText('Income Tax')).toBeInTheDocument();
    });
  });

  it('displays active status correctly', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockRegistrations }),
    });

    renderWithProviders(<StateRegistrationsPage />);

    await waitFor(() => {
      const activeStatuses = screen.getAllByText('Active');
      expect(activeStatuses.length).toBe(2);
    });
  });

  it('displays pending status correctly', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockRegistrations }),
    });

    renderWithProviders(<StateRegistrationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Pending')).toBeInTheDocument();
    });
  });

  it('displays expired status correctly', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockRegistrations }),
    });

    renderWithProviders(<StateRegistrationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Expired')).toBeInTheDocument();
    });
  });

  it('displays filing frequency correctly', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockRegistrations }),
    });

    renderWithProviders(<StateRegistrationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Monthly')).toBeInTheDocument();
      const quarterlyElements = screen.getAllByText('Quarterly');
      expect(quarterlyElements.length).toBeGreaterThan(0);
      expect(screen.getByText('Annually')).toBeInTheDocument();
    });
  });

  it('displays notes when available', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockRegistrations }),
    });

    renderWithProviders(<StateRegistrationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Renewal submitted')).toBeInTheDocument();
    });
  });

  it('displays error message on fetch failure', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'error',
          code: 'FETCH_ERROR',
          message: 'Failed to load registrations',
        }),
    });

    renderWithProviders(<StateRegistrationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Error loading registrations')).toBeInTheDocument();
    });
  });
});
