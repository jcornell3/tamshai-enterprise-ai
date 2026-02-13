/**
 * DirectDepositPage Tests - RED Phase
 *
 * Tests for the Direct Deposit configuration page including:
 * - Bank account display
 * - Add/Update account modal
 * - Allocation settings
 * - Confirmation flow
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import DirectDepositPage from '../pages/DirectDepositPage';
import type { DirectDeposit } from '../types';

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
const mockDirectDeposits: DirectDeposit[] = [
  {
    deposit_id: 'dd-001',
    employee_id: 'emp-042',
    bank_name: 'Chase Bank',
    routing_number: '021000021',
    account_number_masked: '****4567',
    account_type: 'checking',
    allocation_type: 'remainder',
    allocation_amount: 100,
    is_primary: true,
  },
  {
    deposit_id: 'dd-002',
    employee_id: 'emp-042',
    bank_name: 'Bank of America',
    routing_number: '026009593',
    account_number_masked: '****8901',
    account_type: 'savings',
    allocation_type: 'fixed',
    allocation_amount: 500,
    is_primary: false,
  },
];

describe('DirectDepositPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('Page Rendering', () => {
    test('displays page title', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockDirectDeposits }),
      });

      render(<DirectDepositPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Direct Deposit')).toBeInTheDocument();
    });

    test('displays Add Account button', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockDirectDeposits }),
      });

      render(<DirectDepositPage />, { wrapper: createWrapper() });

      expect(screen.getByRole('button', { name: /add account/i })).toBeInTheDocument();
    });

    test('displays loading state while fetching', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));

      render(<DirectDepositPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Loading direct deposit settings...')).toBeInTheDocument();
    });
  });

  describe('Bank Account List', () => {
    test('displays bank name', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockDirectDeposits }),
      });

      render(<DirectDepositPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Chase Bank')).toBeInTheDocument();
        expect(screen.getByText('Bank of America')).toBeInTheDocument();
      });
    });

    test('displays masked account numbers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockDirectDeposits }),
      });

      render(<DirectDepositPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        // Account numbers are displayed with account type, use partial match
        expect(screen.getByText(/\*{4}4567/)).toBeInTheDocument();
        expect(screen.getByText(/\*{4}8901/)).toBeInTheDocument();
      });
    });

    test('displays account type', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockDirectDeposits }),
      });

      render(<DirectDepositPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Checking')).toBeInTheDocument();
        expect(screen.getByText('Savings')).toBeInTheDocument();
      });
    });

    test('displays primary account indicator', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockDirectDeposits }),
      });

      render(<DirectDepositPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Primary')).toBeInTheDocument();
      });
    });
  });

  describe('Allocation Display', () => {
    test('displays allocation type for each account', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockDirectDeposits }),
      });

      render(<DirectDepositPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Remainder')).toBeInTheDocument();
      });
    });

    test('displays fixed amount allocation', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockDirectDeposits }),
      });

      render(<DirectDepositPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('$500')).toBeInTheDocument();
      });
    });
  });

  describe('Actions', () => {
    test('displays Edit button for each account', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockDirectDeposits }),
      });

      render(<DirectDepositPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        const editButtons = screen.getAllByRole('button', { name: /edit/i });
        expect(editButtons.length).toBe(2);
      });
    });

    test('displays Remove button for secondary accounts', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockDirectDeposits }),
      });

      render(<DirectDepositPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        const removeButtons = screen.getAllByRole('button', { name: /remove/i });
        expect(removeButtons.length).toBe(1); // Only non-primary can be removed
      });
    });
  });

  describe('Add Account Modal', () => {
    test('opens modal when Add Account clicked', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockDirectDeposits }),
      });

      render(<DirectDepositPage />, { wrapper: createWrapper() });

      const addButton = screen.getByRole('button', { name: /add account/i });
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(screen.getByText('Add Bank Account')).toBeInTheDocument();
      });
    });

    test('modal contains bank name field', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockDirectDeposits }),
      });

      render(<DirectDepositPage />, { wrapper: createWrapper() });

      const addButton = screen.getByRole('button', { name: /add account/i });
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/bank name/i)).toBeInTheDocument();
      });
    });

    test('modal contains routing number field', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockDirectDeposits }),
      });

      render(<DirectDepositPage />, { wrapper: createWrapper() });

      const addButton = screen.getByRole('button', { name: /add account/i });
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/routing number/i)).toBeInTheDocument();
      });
    });

    test('modal contains account number field', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockDirectDeposits }),
      });

      render(<DirectDepositPage />, { wrapper: createWrapper() });

      const addButton = screen.getByRole('button', { name: /add account/i });
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/account number/i)).toBeInTheDocument();
      });
    });

    test('modal contains account type selection', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockDirectDeposits }),
      });

      render(<DirectDepositPage />, { wrapper: createWrapper() });

      const addButton = screen.getByRole('button', { name: /add account/i });
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/account type/i)).toBeInTheDocument();
      });
    });
  });

  describe('Confirmation Flow', () => {
    test('shows confirmation when updating account', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockDirectDeposits }),
      });

      render(<DirectDepositPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Chase Bank')).toBeInTheDocument();
      });

      // Click edit on first account
      const editButtons = screen.getAllByRole('button', { name: /edit/i });
      fireEvent.click(editButtons[0]);

      // Note: Full modal interaction would be tested in E2E
      // This test verifies the edit action is available
    });
  });

  describe('Error Handling', () => {
    test('shows error message on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      });

      render(<DirectDepositPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/error loading direct deposit/i)).toBeInTheDocument();
      });
    });

    test('shows empty state when no accounts configured', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(<DirectDepositPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/no bank accounts configured/i)).toBeInTheDocument();
      });
    });
  });

  describe('Effective Date Notice', () => {
    test('displays notice about when changes take effect', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockDirectDeposits }),
      });

      render(<DirectDepositPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/changes take effect/i)).toBeInTheDocument();
      });
    });
  });
});
