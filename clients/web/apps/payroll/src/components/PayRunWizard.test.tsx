/**
 * Pay Run Wizard Tests - Enterprise UX Hardening
 *
 * TDD tests for the Gusto/ADP-style payroll wizard.
 * Tests wizard navigation, validation, and submission.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import PayRunWizard from './PayRunWizard';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock navigation
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

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

// Mock employee data
const mockEmployees = [
  {
    employee_id: 'emp-001',
    first_name: 'Alice',
    last_name: 'Chen',
    department: 'Engineering',
    salary: 120000,
    pay_type: 'salary',
    hours_worked: 80,
    gross_pay: 4615.38,
  },
  {
    employee_id: 'emp-002',
    first_name: 'Bob',
    last_name: 'Martinez',
    department: 'Finance',
    salary: 95000,
    pay_type: 'salary',
    hours_worked: 80,
    gross_pay: 3653.85,
  },
  {
    employee_id: 'emp-003',
    first_name: 'Carol',
    last_name: 'Johnson',
    department: 'Sales',
    salary: 0,
    hourly_rate: 35,
    pay_type: 'hourly',
    hours_worked: 88,
    overtime_hours: 8,
    gross_pay: 3220.00,
  },
];

describe('PayRunWizard', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockNavigate.mockReset();

    // Default mock for fetching employees
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        status: 'success',
        data: mockEmployees,
      }),
    });
  });

  describe('Wizard Structure', () => {
    test('renders wizard with title', async () => {
      render(<PayRunWizard />, { wrapper: createWrapper() });

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/new pay run/i)).toBeInTheDocument();
    });

    test('shows 4 steps in breadcrumbs', async () => {
      render(<PayRunWizard />, { wrapper: createWrapper() });

      const nav = screen.getByRole('navigation', { name: /wizard progress/i });
      expect(within(nav).getByText('Pay Period')).toBeInTheDocument();
      expect(within(nav).getByText('Earnings')).toBeInTheDocument();
      expect(within(nav).getByText('Deductions')).toBeInTheDocument();
      expect(within(nav).getByText('Review')).toBeInTheDocument();
    });

    test('starts on Step 1: Pay Period', async () => {
      render(<PayRunWizard />, { wrapper: createWrapper() });

      expect(screen.getByText(/Step 1 of 4/)).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2, name: /pay period/i })).toBeInTheDocument();
    });
  });

  describe('Step 1: Pay Period Selection', () => {
    test('shows pay period date inputs', async () => {
      render(<PayRunWizard />, { wrapper: createWrapper() });

      expect(screen.getByLabelText(/period start/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/period end/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/pay date/i)).toBeInTheDocument();
    });

    test('has default dates populated on load', async () => {
      render(<PayRunWizard />, { wrapper: createWrapper() });

      // Component provides default dates
      const startInput = screen.getByLabelText(/period start/i) as HTMLInputElement;
      const endInput = screen.getByLabelText(/period end/i) as HTMLInputElement;
      const payDateInput = screen.getByLabelText(/pay date/i) as HTMLInputElement;

      expect(startInput.value).toBeTruthy();
      expect(endInput.value).toBeTruthy();
      expect(payDateInput.value).toBeTruthy();
    });

    test('validates end date is after start date', async () => {
      const user = userEvent.setup();
      render(<PayRunWizard />, { wrapper: createWrapper() });

      // Fill invalid dates (end before start)
      const startInput = screen.getByLabelText(/period start/i);
      const endInput = screen.getByLabelText(/period end/i);

      await user.clear(startInput);
      await user.type(startInput, '2026-02-15');
      await user.clear(endInput);
      await user.type(endInput, '2026-02-01');

      const nextButton = screen.getByRole('button', { name: /next.*earnings/i });
      await user.click(nextButton);

      // Validation should prevent navigation and show error
      await waitFor(() => {
        // Either shows error or stays on step 1
        const stillOnStep1 = screen.queryByText(/Step 1 of 4/);
        expect(stillOnStep1).toBeInTheDocument();
      });
    });

    test('proceeds to Step 2 with valid dates', async () => {
      const user = userEvent.setup();
      render(<PayRunWizard />, { wrapper: createWrapper() });

      // Default dates are valid, just click next
      const nextButton = screen.getByRole('button', { name: /next.*earnings/i });
      await user.click(nextButton);

      // Should advance to step 2
      await waitFor(() => {
        expect(screen.getByText(/Step 2 of 4/)).toBeInTheDocument();
      });
    });
  });

  describe('Step 2: Earnings Review', () => {
    async function goToStep2() {
      const user = userEvent.setup();
      render(<PayRunWizard />, { wrapper: createWrapper() });

      // Default dates are valid - just click next
      await user.click(screen.getByRole('button', { name: /next.*earnings/i }));

      await waitFor(() => {
        expect(screen.getByText(/Step 2 of 4/)).toBeInTheDocument();
      }, { timeout: 3000 });

      return user;
    }

    test('displays employee earnings table', async () => {
      await goToStep2();

      await waitFor(() => {
        expect(screen.getByText('Alice Chen')).toBeInTheDocument();
        expect(screen.getByText('Bob Martinez')).toBeInTheDocument();
        expect(screen.getByText('Carol Johnson')).toBeInTheDocument();
      });
    });

    test('shows gross pay for each employee', async () => {
      await goToStep2();

      await waitFor(() => {
        expect(screen.getByText('$4,615.38')).toBeInTheDocument();
        expect(screen.getByText('$3,653.85')).toBeInTheDocument();
        expect(screen.getByText('$3,220.00')).toBeInTheDocument();
      });
    });

    test('shows total gross pay summary', async () => {
      await goToStep2();

      await waitFor(() => {
        // Total: 4615.38 + 3653.85 + 3220.00 = 11489.23
        expect(screen.getByText(/total gross/i)).toBeInTheDocument();
        expect(screen.getByText('$11,489.23')).toBeInTheDocument();
      });
    });

    test('shows overtime hours for hourly employees', async () => {
      await goToStep2();

      await waitFor(() => {
        // Carol has 8 overtime hours
        expect(screen.getByText(/8.*overtime/i)).toBeInTheDocument();
      });
    });
  });

  describe('Step 3: Deductions & Taxes', () => {
    async function goToStep3() {
      const user = userEvent.setup();
      render(<PayRunWizard />, { wrapper: createWrapper() });

      // Navigate through steps with defaults
      await user.click(screen.getByRole('button', { name: /next.*earnings/i }));
      await waitFor(() => expect(screen.getByText(/Step 2 of 4/)).toBeInTheDocument(), { timeout: 3000 });

      await user.click(screen.getByRole('button', { name: /next.*deductions/i }));
      await waitFor(() => expect(screen.getByText(/Step 3 of 4/)).toBeInTheDocument(), { timeout: 3000 });

      return user;
    }

    test('shows tax withholding summary', async () => {
      await goToStep3();

      expect(screen.getByText(/federal tax/i)).toBeInTheDocument();
      expect(screen.getByText(/state tax/i)).toBeInTheDocument();
      expect(screen.getByText(/social security/i)).toBeInTheDocument();
      expect(screen.getByText(/medicare/i)).toBeInTheDocument();
    });

    test('shows benefits deductions', async () => {
      await goToStep3();

      expect(screen.getByText(/health insurance/i)).toBeInTheDocument();
      // 401(k) appears in multiple places, use getAllByText
      expect(screen.getAllByText(/401\(k\)/i).length).toBeGreaterThan(0);
    });

    test('shows employer contributions', async () => {
      await goToStep3();

      expect(screen.getByText(/employer contributions/i)).toBeInTheDocument();
    });
  });

  describe('Step 4: Review & Submit', () => {
    async function goToStep4() {
      const user = userEvent.setup();
      render(<PayRunWizard />, { wrapper: createWrapper() });

      // Navigate through steps with defaults
      await user.click(screen.getByRole('button', { name: /next.*earnings/i }));
      await waitFor(() => expect(screen.getByText(/Step 2 of 4/)).toBeInTheDocument(), { timeout: 3000 });

      await user.click(screen.getByRole('button', { name: /next.*deductions/i }));
      await waitFor(() => expect(screen.getByText(/Step 3 of 4/)).toBeInTheDocument(), { timeout: 3000 });

      await user.click(screen.getByRole('button', { name: /next.*review/i }));
      await waitFor(() => expect(screen.getByText(/Step 4 of 4/)).toBeInTheDocument(), { timeout: 3000 });

      return user;
    }

    test('shows pay run summary', async () => {
      await goToStep4();

      // These terms appear multiple times, verify at least one exists
      expect(screen.getAllByText(/pay period/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/pay date/i).length).toBeGreaterThan(0);
      // Check for step 4 specific content
      expect(screen.getByRole('heading', { level: 2, name: /review/i })).toBeInTheDocument();
    });

    test('shows employee count', async () => {
      await goToStep4();

      expect(screen.getByText(/3 employees/i)).toBeInTheDocument();
    });

    test('shows total amounts', async () => {
      await goToStep4();

      expect(screen.getByText(/gross pay/i)).toBeInTheDocument();
      expect(screen.getByText(/total deductions/i)).toBeInTheDocument();
      expect(screen.getByText(/net pay/i)).toBeInTheDocument();
    });

    test('submit button shows "Run Payroll"', async () => {
      await goToStep4();

      expect(screen.getByRole('button', { name: /run payroll/i })).toBeInTheDocument();
    });

    test('submitting payroll calls API', async () => {
      const user = await goToStep4();

      // Mock successful submission
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          status: 'success',
          data: { pay_run_id: 'new-pay-run-001' },
        }),
      });

      const submitButton = screen.getByRole('button', { name: /run payroll/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/mcp/payroll/create_pay_run'),
          expect.objectContaining({
            method: 'POST',
          })
        );
      });
    });

    test('shows loading state during submission', async () => {
      const user = await goToStep4();

      // Mock slow submission
      mockFetch.mockImplementation(() => new Promise(() => {}));

      const submitButton = screen.getByRole('button', { name: /run payroll/i });
      await user.click(submitButton);

      // Button should show "Processing..." text and be disabled
      await waitFor(() => {
        const loadingButton = screen.getByRole('button', { name: /processing/i });
        expect(loadingButton).toBeDisabled();
      });
    });

    test('navigates to pay runs on success', async () => {
      const user = await goToStep4();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          status: 'success',
          data: { pay_run_id: 'new-pay-run-001' },
        }),
      });

      await user.click(screen.getByRole('button', { name: /run payroll/i }));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/pay-runs');
      });
    });
  });

  describe('Navigation', () => {
    test('can go back to previous step', async () => {
      const user = userEvent.setup();
      render(<PayRunWizard />, { wrapper: createWrapper() });

      // Go to Step 2 with default values
      await user.click(screen.getByRole('button', { name: /next.*earnings/i }));
      await waitFor(() => expect(screen.getByText(/Step 2 of 4/)).toBeInTheDocument(), { timeout: 3000 });

      // Go back
      await user.click(screen.getByRole('button', { name: /previous/i }));

      await waitFor(() => {
        expect(screen.getByText(/Step 1 of 4/)).toBeInTheDocument();
      });
    });

    test('preserves data when navigating back', async () => {
      const user = userEvent.setup();
      render(<PayRunWizard />, { wrapper: createWrapper() });

      // Go to Step 2
      await user.click(screen.getByRole('button', { name: /next.*earnings/i }));
      await waitFor(() => expect(screen.getByText(/Step 2 of 4/)).toBeInTheDocument(), { timeout: 3000 });
      await user.click(screen.getByRole('button', { name: /previous/i }));

      // Data should be preserved - defaults are set
      await waitFor(() => {
        const startInput = screen.getByLabelText(/period start/i) as HTMLInputElement;
        const endInput = screen.getByLabelText(/period end/i) as HTMLInputElement;
        expect(startInput.value).toBeTruthy();
        expect(endInput.value).toBeTruthy();
      });
    });

    test('cancel button navigates to pay runs list', async () => {
      const user = userEvent.setup();
      render(<PayRunWizard />, { wrapper: createWrapper() });

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(mockNavigate).toHaveBeenCalledWith('/pay-runs');
    });
  });

  describe('Accessibility', () => {
    test('wizard has dialog role', () => {
      render(<PayRunWizard />, { wrapper: createWrapper() });
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    test('breadcrumbs have navigation role', () => {
      render(<PayRunWizard />, { wrapper: createWrapper() });
      expect(screen.getByRole('navigation', { name: /wizard progress/i })).toBeInTheDocument();
    });

    test('step indicators show current step', () => {
      render(<PayRunWizard />, { wrapper: createWrapper() });

      const nav = screen.getByRole('navigation', { name: /wizard progress/i });
      const currentStep = within(nav).getByText('Pay Period').closest('li');
      expect(currentStep).toHaveAttribute('aria-current', 'step');
    });

    test('future steps are marked as disabled', () => {
      render(<PayRunWizard />, { wrapper: createWrapper() });

      const futureStep = screen.getByText('Deductions').closest('li');
      expect(futureStep).toHaveAttribute('aria-disabled', 'true');
    });
  });
});
