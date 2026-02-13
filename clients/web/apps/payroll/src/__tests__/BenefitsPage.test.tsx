/**
 * BenefitsPage Tests
 *
 * Tests for the Benefits page including:
 * - Benefit list display
 * - Contribution amounts
 * - Tax treatment
 */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import BenefitsPage from '../pages/BenefitsPage';
import type { BenefitDeduction } from '../types';

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
const mockBenefits: BenefitDeduction[] = [
  {
    deduction_id: 'ded-001',
    employee_id: 'emp-042',
    type: 'health',
    name: 'Health Insurance - PPO',
    amount: 250.0,
    employer_contribution: 500.0,
    frequency: 'per_pay_period',
    is_pretax: true,
  },
  {
    deduction_id: 'ded-002',
    employee_id: 'emp-042',
    type: '401k',
    name: '401(k) Contribution',
    amount: 365.39,
    employer_contribution: 182.69,
    frequency: 'per_pay_period',
    is_pretax: true,
  },
  {
    deduction_id: 'ded-003',
    employee_id: 'emp-042',
    type: 'dental',
    name: 'Dental Insurance',
    amount: 35.0,
    employer_contribution: 35.0,
    frequency: 'per_pay_period',
    is_pretax: true,
  },
];

describe('BenefitsPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('Page Rendering', () => {
    test('displays page title', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockBenefits }),
      });

      render(<BenefitsPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Benefits')).toBeInTheDocument();
    });

    test('displays page description', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockBenefits }),
      });

      render(<BenefitsPage />, { wrapper: createWrapper() });

      expect(screen.getByText(/benefit elections and deductions/i)).toBeInTheDocument();
    });

    test('displays loading state while fetching', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));

      render(<BenefitsPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Loading benefits...')).toBeInTheDocument();
    });
  });

  describe('Benefits List', () => {
    test('displays benefit type labels', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockBenefits }),
      });

      render(<BenefitsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Health Insurance')).toBeInTheDocument();
        expect(screen.getByText('401(k) Retirement')).toBeInTheDocument();
        expect(screen.getByText('Dental Insurance')).toBeInTheDocument();
      });
    });

    test('displays Your Contribution column', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockBenefits }),
      });

      render(<BenefitsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        const contributions = screen.getAllByText('Your Contribution');
        expect(contributions.length).toBeGreaterThan(0);
      });
    });

    test('displays Employer Contribution column', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockBenefits }),
      });

      render(<BenefitsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        const contributions = screen.getAllByText('Employer Contribution');
        expect(contributions.length).toBeGreaterThan(0);
      });
    });

    test('displays contribution amounts', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockBenefits }),
      });

      render(<BenefitsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        const amounts = screen.getAllByText((content) => content.includes('$250.00'));
        expect(amounts.length).toBeGreaterThan(0);
      });
    });

    test('displays frequency', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockBenefits }),
      });

      render(<BenefitsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        const frequencies = screen.getAllByText('Frequency');
        expect(frequencies.length).toBeGreaterThan(0);
      });
    });

    test('displays tax treatment', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockBenefits }),
      });

      render(<BenefitsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        const taxTreatments = screen.getAllByText('Tax Treatment');
        expect(taxTreatments.length).toBeGreaterThan(0);
        const preTaxLabels = screen.getAllByText('Pre-Tax');
        expect(preTaxLabels.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Empty State', () => {
    test('shows empty state when no benefits', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(<BenefitsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/no benefit elections found/i)).toBeInTheDocument();
      });
    });
  });

  describe('Information Notice', () => {
    test('displays enrollment period notice', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockBenefits }),
      });

      render(<BenefitsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/contact HR or wait for the annual enrollment period/i)).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    test('shows error message on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      });

      render(<BenefitsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/error loading benefits/i)).toBeInTheDocument();
      });
    });
  });
});
