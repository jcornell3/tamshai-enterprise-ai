/**
 * ContractorsPage Tests - RED Phase
 *
 * Tests for the 1099 Contractor Management page including:
 * - Contractor list display
 * - YTD payments tracking
 * - 1099 generation
 * - Payment recording
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import ContractorsPage from '../pages/ContractorsPage';
import type { Contractor } from '../types';

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
const mockContractors: Contractor[] = [
  {
    contractor_id: 'con-001',
    name: 'John Smith',
    company_name: 'Smith Consulting LLC',
    tax_id_masked: '***-**-4567',
    email: 'john@smithconsulting.com',
    status: 'active',
    ytd_payments: 15000,
    form_1099_status: 'pending',
  },
  {
    contractor_id: 'con-002',
    name: 'Jane Doe',
    company_name: null,
    tax_id_masked: '***-**-7890',
    email: 'jane.doe@email.com',
    status: 'active',
    ytd_payments: 8500,
    form_1099_status: 'pending',
  },
  {
    contractor_id: 'con-003',
    name: 'Acme Corp',
    company_name: 'Acme Corporation',
    tax_id_masked: '**-***1234',
    email: 'billing@acme.com',
    status: 'inactive',
    ytd_payments: 450,
    form_1099_status: 'pending',
  },
];

describe('ContractorsPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('Page Rendering', () => {
    test('displays page title', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockContractors }),
      });

      render(<ContractorsPage />, { wrapper: createWrapper() });

      expect(screen.getByText('1099 Contractors')).toBeInTheDocument();
    });

    test('displays Add Contractor button', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockContractors }),
      });

      render(<ContractorsPage />, { wrapper: createWrapper() });

      expect(screen.getByRole('button', { name: /add contractor/i })).toBeInTheDocument();
    });

    test('displays loading state while fetching', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));

      render(<ContractorsPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Loading contractors...')).toBeInTheDocument();
    });
  });

  describe('Contractor List', () => {
    test('displays contractor name column', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockContractors }),
      });

      render(<ContractorsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Name')).toBeInTheDocument();
      });
    });

    test('displays company column', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockContractors }),
      });

      render(<ContractorsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Company')).toBeInTheDocument();
      });
    });

    test('displays Tax ID column with masked values', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockContractors }),
      });

      render(<ContractorsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Tax ID')).toBeInTheDocument();
        expect(screen.getByText('***-**-4567')).toBeInTheDocument();
      });
    });

    test('displays YTD Payments column', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockContractors }),
      });

      render(<ContractorsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('YTD Payments')).toBeInTheDocument();
      });
    });

    test('displays contractor payment amounts', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockContractors }),
      });

      render(<ContractorsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('$15,000')).toBeInTheDocument();
      });
    });

    test('displays status badges', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockContractors }),
      });

      render(<ContractorsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        // Status badges are rendered in the table
        const activeBadges = screen.getAllByText(/^active$/i);
        expect(activeBadges.length).toBeGreaterThan(0);
        expect(screen.getByText(/^inactive$/i)).toBeInTheDocument();
      });
    });
  });

  describe('1099 Status', () => {
    test('displays 1099 Status column', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockContractors }),
      });

      render(<ContractorsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('1099 Status')).toBeInTheDocument();
      });
    });

    test('displays pending status for contractors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockContractors }),
      });

      render(<ContractorsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        const pendingBadges = screen.getAllByText('pending');
        expect(pendingBadges.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Actions', () => {
    test('displays Record Payment action', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockContractors }),
      });

      render(<ContractorsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        const paymentButtons = screen.getAllByRole('button', { name: /record payment/i });
        expect(paymentButtons.length).toBeGreaterThan(0);
      });
    });

    test('displays Generate 1099 button', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockContractors }),
      });

      render(<ContractorsPage />, { wrapper: createWrapper() });

      expect(screen.getByRole('button', { name: /generate 1099s/i })).toBeInTheDocument();
    });
  });

  describe('1099 Threshold Indicator', () => {
    test('highlights contractors above $600 threshold', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockContractors }),
      });

      render(<ContractorsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        // Contractors with YTD >= $600 should be marked for 1099
        expect(screen.getByText('1099 Required')).toBeInTheDocument();
      });
    });

    test('shows count of contractors requiring 1099', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockContractors }),
      });

      render(<ContractorsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        // The count is displayed as part of a longer message
        expect(screen.getByText(/2 contractors require 1099/i)).toBeInTheDocument();
      });
    });
  });

  describe('Filtering', () => {
    test('displays status filter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockContractors }),
      });

      render(<ContractorsPage />, { wrapper: createWrapper() });

      expect(screen.getByRole('combobox', { name: /status/i })).toBeInTheDocument();
    });

    test('displays year filter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockContractors }),
      });

      render(<ContractorsPage />, { wrapper: createWrapper() });

      expect(screen.getByRole('combobox', { name: /year/i })).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    test('shows error message on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      });

      render(<ContractorsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/error loading contractors/i)).toBeInTheDocument();
      });
    });

    test('shows empty state when no contractors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(<ContractorsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/no contractors found/i)).toBeInTheDocument();
      });
    });
  });
});
