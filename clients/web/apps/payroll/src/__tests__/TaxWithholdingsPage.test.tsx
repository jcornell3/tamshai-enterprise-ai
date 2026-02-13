/**
 * TaxWithholdingsPage Tests
 *
 * Tests for the Tax Withholdings page including:
 * - Federal W-4 display
 * - State tax settings
 * - Update buttons
 */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import TaxWithholdingsPage from '../pages/TaxWithholdingsPage';
import type { TaxWithholding } from '../types';

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
const mockWithholding: TaxWithholding = {
  withholding_id: 'wh-001',
  employee_id: 'emp-042',
  federal_filing_status: 'married_filing_jointly',
  federal_allowances: 2,
  federal_additional: 50,
  state: 'CA',
  state_filing_status: 'Married',
  state_allowances: 2,
  state_additional: 25,
};

describe('TaxWithholdingsPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('Page Rendering', () => {
    test('displays page title', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockWithholding }),
      });

      render(<TaxWithholdingsPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Tax Withholdings')).toBeInTheDocument();
    });

    test('displays page description', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockWithholding }),
      });

      render(<TaxWithholdingsPage />, { wrapper: createWrapper() });

      expect(screen.getByText(/federal and state tax elections/i)).toBeInTheDocument();
    });

    test('displays loading state while fetching', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));

      render(<TaxWithholdingsPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Loading tax withholding settings...')).toBeInTheDocument();
    });
  });

  describe('Federal W-4 Section', () => {
    test('displays Federal W-4 header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockWithholding }),
      });

      render(<TaxWithholdingsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Federal W-4')).toBeInTheDocument();
      });
    });

    test('displays filing status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockWithholding }),
      });

      render(<TaxWithholdingsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        // There are 2 Filing Status labels (Federal and State)
        const filingStatusLabels = screen.getAllByText('Filing Status');
        expect(filingStatusLabels).toHaveLength(2);
        expect(screen.getByText(/married filing jointly/i)).toBeInTheDocument();
      });
    });

    test('displays allowances', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockWithholding }),
      });

      render(<TaxWithholdingsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        // There are 2 Allowances labels (Federal and State)
        const allowancesLabels = screen.getAllByText('Allowances');
        expect(allowancesLabels).toHaveLength(2);
      });
    });

    test('displays additional withholding', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockWithholding }),
      });

      render(<TaxWithholdingsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        // There are 2 Additional Withholding labels (Federal and State)
        const additionalLabels = screen.getAllByText('Additional Withholding');
        expect(additionalLabels).toHaveLength(2);
      });
    });

    test('displays Update W-4 button', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockWithholding }),
      });

      render(<TaxWithholdingsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /update w-4/i })).toBeInTheDocument();
      });
    });
  });

  describe('State Tax Section', () => {
    test('displays State Tax header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockWithholding }),
      });

      render(<TaxWithholdingsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('State Tax')).toBeInTheDocument();
      });
    });

    test('displays state name', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockWithholding }),
      });

      render(<TaxWithholdingsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('State')).toBeInTheDocument();
        expect(screen.getByText('CA')).toBeInTheDocument();
      });
    });

    test('displays Update State Tax button', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockWithholding }),
      });

      render(<TaxWithholdingsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /update state tax/i })).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    test('shows error message on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      });

      render(<TaxWithholdingsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/error loading tax withholdings/i)).toBeInTheDocument();
      });
    });
  });
});
