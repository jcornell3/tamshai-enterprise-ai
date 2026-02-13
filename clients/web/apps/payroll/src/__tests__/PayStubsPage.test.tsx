/**
 * PayStubsPage Tests - RED Phase
 *
 * Tests for the Pay Stubs page including:
 * - Pay stub list display
 * - Employee self-service view
 * - PDF download
 * - YTD summary
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import PayStubsPage from '../pages/PayStubsPage';
import type { PayStub } from '../types';

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
const mockPayStubs: PayStub[] = [
  {
    pay_stub_id: 'ps-001',
    pay_run_id: 'pr-001',
    employee_id: 'emp-042',
    employee_name: 'Marcus Johnson',
    department: 'Engineering',
    pay_period_start: '2026-01-01',
    pay_period_end: '2026-01-14',
    pay_date: '2026-01-17',
    gross_pay: 3653.85,
    federal_tax: 584.62,
    state_tax: 319.47,
    social_security: 226.54,
    medicare: 52.98,
    benefits_deductions: 150.0,
    retirement_401k: 182.69,
    net_pay: 2101.01,
    ytd_gross: 3653.85,
    ytd_net: 2101.01,
  },
  {
    pay_stub_id: 'ps-002',
    pay_run_id: 'pr-002',
    employee_id: 'emp-042',
    employee_name: 'Marcus Johnson',
    department: 'Engineering',
    pay_period_start: '2026-01-15',
    pay_period_end: '2026-01-28',
    pay_date: '2026-01-31',
    gross_pay: 3653.85,
    federal_tax: 584.62,
    state_tax: 319.47,
    social_security: 226.54,
    medicare: 52.98,
    benefits_deductions: 150.0,
    retirement_401k: 182.69,
    net_pay: 2101.01,
    ytd_gross: 7307.70,
    ytd_net: 4202.02,
  },
];

describe('PayStubsPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('Page Rendering', () => {
    test('displays page title', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockPayStubs }),
      });

      render(<PayStubsPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Pay Stubs')).toBeInTheDocument();
    });

    test('displays loading state while fetching', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));

      render(<PayStubsPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Loading pay stubs...')).toBeInTheDocument();
    });
  });

  describe('Pay Stub List', () => {
    test('displays pay period column', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockPayStubs }),
      });

      render(<PayStubsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Pay Period')).toBeInTheDocument();
      });
    });

    test('displays pay date column', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockPayStubs }),
      });

      render(<PayStubsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Pay Date')).toBeInTheDocument();
      });
    });

    test('displays gross pay column', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockPayStubs }),
      });

      render(<PayStubsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Gross Pay')).toBeInTheDocument();
      });
    });

    test('displays net pay column', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockPayStubs }),
      });

      render(<PayStubsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Net Pay')).toBeInTheDocument();
      });
    });

    test('displays pay stub data when loaded', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockPayStubs }),
      });

      render(<PayStubsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        // Gross pay appears multiple times - use getAllByText
        const grossPayElements = screen.getAllByText((content) => content.includes('$3,653.85'));
        expect(grossPayElements.length).toBeGreaterThan(0);
      });
    });

    test('displays net pay amount', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockPayStubs }),
      });

      render(<PayStubsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        // Net pay appears multiple times - use getAllByText
        const netPayElements = screen.getAllByText((content) => content.includes('$2,101.01'));
        expect(netPayElements.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Actions', () => {
    test('displays View action for each pay stub', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockPayStubs }),
      });

      render(<PayStubsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        const viewButtons = screen.getAllByRole('button', { name: /view/i });
        expect(viewButtons.length).toBeGreaterThan(0);
      });
    });

    test('displays Download PDF action', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockPayStubs }),
      });

      render(<PayStubsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        const downloadButtons = screen.getAllByRole('button', { name: /download|pdf/i });
        expect(downloadButtons.length).toBeGreaterThan(0);
      });
    });
  });

  describe('YTD Summary', () => {
    test('displays YTD Gross summary', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockPayStubs }),
      });

      render(<PayStubsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('YTD Gross')).toBeInTheDocument();
      });
    });

    test('displays YTD Net summary', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockPayStubs }),
      });

      render(<PayStubsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('YTD Net')).toBeInTheDocument();
      });
    });
  });

  describe('Filtering', () => {
    test('displays year filter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockPayStubs }),
      });

      render(<PayStubsPage />, { wrapper: createWrapper() });

      expect(screen.getByRole('combobox', { name: /year/i })).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    test('shows error message on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      });

      render(<PayStubsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/error loading pay stubs/i)).toBeInTheDocument();
      });
    });

    test('shows empty state when no pay stubs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(<PayStubsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/no pay stubs found/i)).toBeInTheDocument();
      });
    });
  });
});
