/**
 * Time-Off Request Wizard Tests
 *
 * Multi-step wizard for submitting time-off requests.
 * Follows Gusto-style time-off request flow.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import TimeOffRequestWizard from './TimeOffRequestWizard';
import type { TimeOffBalance, TimeOffRequest } from '../types';

// Mock auth module
vi.mock('@tamshai/auth', () => ({
  useAuth: () => ({
    userContext: { sub: 'user-123', roles: ['hr-read'], firstName: 'Test', lastName: 'User' },
    getAccessToken: () => 'test-token',
  }),
  canModifyHR: () => false,
  apiConfig: { mcpGatewayUrl: '' },
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Test data
const mockBalances: TimeOffBalance[] = [
  {
    type_id: 'type-001',
    type_name: 'Paid Time Off',
    type_code: 'PTO',
    entitlement: 15,
    carryover: 2,
    used: 5,
    pending: 1,
    available: 11,
  },
  {
    type_id: 'type-002',
    type_name: 'Sick Leave',
    type_code: 'SICK',
    entitlement: 10,
    carryover: 0,
    used: 2,
    pending: 0,
    available: 8,
  },
  {
    type_id: 'type-003',
    type_name: 'Personal Days',
    type_code: 'PERSONAL',
    entitlement: 3,
    carryover: 0,
    used: 1,
    pending: 0,
    available: 2,
  },
];

const mockExistingRequests: TimeOffRequest[] = [
  {
    request_id: 'req-001',
    employee_id: 'user-123',
    employee_name: 'Test User',
    type_id: 'type-001',
    type_name: 'Paid Time Off',
    start_date: '2026-03-10',
    end_date: '2026-03-12',
    total_days: 3,
    half_day_start: false,
    half_day_end: false,
    status: 'approved',
    created_at: '2026-02-01T10:00:00Z',
  },
  {
    request_id: 'req-002',
    employee_id: 'user-123',
    employee_name: 'Test User',
    type_id: 'type-002',
    type_name: 'Sick Leave',
    start_date: '2026-03-20',
    end_date: '2026-03-21',
    total_days: 2,
    half_day_start: false,
    half_day_end: false,
    status: 'pending',
    created_at: '2026-02-02T10:00:00Z',
  },
];

const mockManager = {
  employee_id: 'mgr-001',
  first_name: 'Sarah',
  last_name: 'Manager',
  work_email: 'sarah.manager@company.com',
};

// Test wrapper
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
};

describe('TimeOffRequestWizard', () => {
  const onClose = vi.fn();
  const onComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('Basic Rendering', () => {
    it('renders wizard with title', () => {
      render(
        <TimeOffRequestWizard
          balances={mockBalances}
          existingRequests={mockExistingRequests}
          manager={mockManager}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText('Request Time Off')).toBeInTheDocument();
    });

    it('shows step indicator starting at step 1', () => {
      render(
        <TimeOffRequestWizard
          balances={mockBalances}
          existingRequests={mockExistingRequests}
          manager={mockManager}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText(/Step 1 of/)).toBeInTheDocument();
    });

    it('renders cancel button', () => {
      render(
        <TimeOffRequestWizard
          balances={mockBalances}
          existingRequests={mockExistingRequests}
          manager={mockManager}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });
  });

  describe('Step 1: Select Type', () => {
    it('displays all time-off types with available balances', () => {
      render(
        <TimeOffRequestWizard
          balances={mockBalances}
          existingRequests={mockExistingRequests}
          manager={mockManager}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText('Paid Time Off')).toBeInTheDocument();
      expect(screen.getByText('Sick Leave')).toBeInTheDocument();
      expect(screen.getByText('Personal Days')).toBeInTheDocument();
      expect(screen.getByText(/11 days available/i)).toBeInTheDocument();
    });

    it('shows balance progress bar for each type', () => {
      render(
        <TimeOffRequestWizard
          balances={mockBalances}
          existingRequests={mockExistingRequests}
          manager={mockManager}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      // Check for progress indicators (data-testid pattern)
      expect(screen.getByTestId('balance-progress-PTO')).toBeInTheDocument();
      expect(screen.getByTestId('balance-progress-SICK')).toBeInTheDocument();
    });

    it('allows selecting a time-off type', () => {
      render(
        <TimeOffRequestWizard
          balances={mockBalances}
          existingRequests={mockExistingRequests}
          manager={mockManager}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      const ptoOption = screen.getByTestId('type-option-PTO');
      fireEvent.click(ptoOption);

      expect(ptoOption).toHaveClass('selected');
    });

    it('shows validation error when next clicked without type selected', async () => {
      render(
        <TimeOffRequestWizard
          balances={mockBalances}
          existingRequests={mockExistingRequests}
          manager={mockManager}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      // Click next without selecting a type
      fireEvent.click(screen.getByRole('button', { name: /next/i }));

      // Should show validation error
      await waitFor(() => {
        expect(screen.getByText(/please select a time-off type/i)).toBeInTheDocument();
      });

      // Select a type and try again - should proceed
      fireEvent.click(screen.getByTestId('type-option-PTO'));
      fireEvent.click(screen.getByRole('button', { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText(/Step 2 of/)).toBeInTheDocument();
      });
    });

    it('proceeds to step 2 when next clicked with type selected', async () => {
      render(
        <TimeOffRequestWizard
          balances={mockBalances}
          existingRequests={mockExistingRequests}
          manager={mockManager}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      fireEvent.click(screen.getByTestId('type-option-PTO'));
      fireEvent.click(screen.getByRole('button', { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText(/Step 2 of/)).toBeInTheDocument();
      });
    });
  });

  describe('Step 2: Select Dates', () => {
    beforeEach(async () => {
      render(
        <TimeOffRequestWizard
          balances={mockBalances}
          existingRequests={mockExistingRequests}
          manager={mockManager}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      // Navigate to step 2
      fireEvent.click(screen.getByTestId('type-option-PTO'));
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
      await waitFor(() => {
        expect(screen.getByText(/Step 2 of/)).toBeInTheDocument();
      });
    });

    it('displays date selection form with start and end dates', () => {
      expect(screen.getByLabelText(/start date/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/end date/i)).toBeInTheDocument();
    });

    it('shows selected type balance summary', () => {
      expect(screen.getByText(/Paid Time Off/)).toBeInTheDocument();
      expect(screen.getByText(/11 days available/i)).toBeInTheDocument();
    });

    it('allows selecting half-day options', () => {
      const halfDayStart = screen.getByLabelText(/half day.*start/i);
      const halfDayEnd = screen.getByLabelText(/half day.*end/i);

      expect(halfDayStart).toBeInTheDocument();
      expect(halfDayEnd).toBeInTheDocument();

      fireEvent.click(halfDayStart);
      expect(halfDayStart).toBeChecked();
    });

    it('calculates total days when dates selected', async () => {
      const startDate = screen.getByLabelText(/start date/i);
      const endDate = screen.getByLabelText(/end date/i);

      fireEvent.change(startDate, { target: { value: '2026-04-01' } });
      fireEvent.change(endDate, { target: { value: '2026-04-03' } });

      await waitFor(() => {
        expect(screen.getByTestId('total-days')).toHaveTextContent('3');
      });
    });

    it('shows warning when requesting more than available', async () => {
      const startDate = screen.getByLabelText(/start date/i);
      const endDate = screen.getByLabelText(/end date/i);

      // Request 15 days when only 11 available
      fireEvent.change(startDate, { target: { value: '2026-04-01' } });
      fireEvent.change(endDate, { target: { value: '2026-04-20' } });

      await waitFor(() => {
        expect(screen.getByText(/exceeds available balance/i)).toBeInTheDocument();
      });
    });

    it('validates that end date is not before start date', async () => {
      const startDate = screen.getByLabelText(/start date/i);
      const endDate = screen.getByLabelText(/end date/i);

      fireEvent.change(startDate, { target: { value: '2026-04-10' } });
      fireEvent.change(endDate, { target: { value: '2026-04-05' } });

      fireEvent.click(screen.getByRole('button', { name: /next/i }));

      await waitFor(() => {
        // Multiple elements show this error (wizard validation + inline)
        const errorMessages = screen.getAllByText(/end date must be after start date/i);
        expect(errorMessages.length).toBeGreaterThan(0);
      });
    });

    it('allows adding optional notes', () => {
      const notesInput = screen.getByLabelText(/notes/i);
      fireEvent.change(notesInput, { target: { value: 'Family vacation' } });
      expect(notesInput).toHaveValue('Family vacation');
    });
  });

  describe('Step 3: Conflict Check', () => {
    beforeEach(async () => {
      render(
        <TimeOffRequestWizard
          balances={mockBalances}
          existingRequests={mockExistingRequests}
          manager={mockManager}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      // Navigate to step 3
      fireEvent.click(screen.getByTestId('type-option-PTO'));
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
      await waitFor(() => {
        expect(screen.getByText(/Step 2 of/)).toBeInTheDocument();
      });

      // Fill in dates
      fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2026-04-01' } });
      fireEvent.change(screen.getByLabelText(/end date/i), { target: { value: '2026-04-03' } });
      fireEvent.click(screen.getByRole('button', { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText(/Step 3 of/)).toBeInTheDocument();
      });
    });

    it('displays conflict check step', () => {
      // Multiple elements contain "Conflict Check" (wizard header + step content)
      const conflictCheckElements = screen.getAllByText(/Conflict Check/i);
      expect(conflictCheckElements.length).toBeGreaterThan(0);
    });

    it('shows no conflicts message when dates are clear', () => {
      expect(screen.getByText(/no conflicts found/i)).toBeInTheDocument();
    });

    it('shows existing approved requests calendar', () => {
      expect(screen.getByTestId('existing-requests-list')).toBeInTheDocument();
    });
  });

  describe('Step 3: Conflict Detection', () => {
    it('shows conflict warning when dates overlap with existing request', async () => {
      render(
        <TimeOffRequestWizard
          balances={mockBalances}
          existingRequests={mockExistingRequests}
          manager={mockManager}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      // Navigate to step 2
      fireEvent.click(screen.getByTestId('type-option-PTO'));
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
      await waitFor(() => {
        expect(screen.getByText(/Step 2 of/)).toBeInTheDocument();
      });

      // Select dates that overlap with existing request (Mar 10-12)
      fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2026-03-11' } });
      fireEvent.change(screen.getByLabelText(/end date/i), { target: { value: '2026-03-15' } });
      fireEvent.click(screen.getByRole('button', { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText(/Step 3 of/)).toBeInTheDocument();
      });

      // Should show conflict warning
      expect(screen.getByText(/conflict detected/i)).toBeInTheDocument();
      // Verify the conflict shows the type name (multiple elements contain this text)
      const ptoElements = screen.getAllByText(/Paid Time Off/i);
      expect(ptoElements.length).toBeGreaterThan(0);
    });
  });

  describe('Step 4: Review & Submit', () => {
    beforeEach(async () => {
      render(
        <TimeOffRequestWizard
          balances={mockBalances}
          existingRequests={mockExistingRequests}
          manager={mockManager}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      // Navigate through all steps
      fireEvent.click(screen.getByTestId('type-option-PTO'));
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
      await waitFor(() => {
        expect(screen.getByText(/Step 2 of/)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2026-04-01' } });
      fireEvent.change(screen.getByLabelText(/end date/i), { target: { value: '2026-04-03' } });
      fireEvent.change(screen.getByLabelText(/notes/i), { target: { value: 'Family vacation' } });
      fireEvent.click(screen.getByRole('button', { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText(/Step 3 of/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /next/i }));
      await waitFor(() => {
        expect(screen.getByText(/Step 4 of/)).toBeInTheDocument();
      });
    });

    it('displays review summary with all selections', () => {
      // Multiple elements contain "Review" text
      const reviewElements = screen.getAllByText(/Review/i);
      expect(reviewElements.length).toBeGreaterThan(0);
      // Type name shows in summary (multiple instances possible)
      const ptoElements = screen.getAllByText('Paid Time Off');
      expect(ptoElements.length).toBeGreaterThan(0);
      // Check duration
      expect(screen.getByText('3 days')).toBeInTheDocument();
      // Check notes
      expect(screen.getByText('Family vacation')).toBeInTheDocument();
    });

    it('shows manager who will approve', () => {
      expect(screen.getByText(/Sarah Manager/)).toBeInTheDocument();
      expect(screen.getByText(/will review your request/i)).toBeInTheDocument();
    });

    it('shows submit button instead of next on final step', () => {
      expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument();
    });

    it('allows navigating back to previous steps', async () => {
      fireEvent.click(screen.getByRole('button', { name: /previous/i }));

      await waitFor(() => {
        expect(screen.getByText(/Step 3 of/)).toBeInTheDocument();
      });
    });
  });

  describe('Submission Flow', () => {
    it('calls submit API on submit', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          status: 'success',
          data: { request_id: 'new-req-001', status: 'pending' },
        }),
      });

      render(
        <TimeOffRequestWizard
          balances={mockBalances}
          existingRequests={mockExistingRequests}
          manager={mockManager}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      // Navigate through all steps and submit
      fireEvent.click(screen.getByTestId('type-option-PTO'));
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
      await waitFor(() => {
        expect(screen.getByText(/Step 2 of/)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2026-04-01' } });
      fireEvent.change(screen.getByLabelText(/end date/i), { target: { value: '2026-04-03' } });
      fireEvent.click(screen.getByRole('button', { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText(/Step 3 of/)).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText(/Step 4 of/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/mcp/hr/create_time_off_request'),
          expect.objectContaining({
            method: 'POST',
            body: expect.any(String),
          })
        );
      });
    });

    it('shows loading state during submission', async () => {
      mockFetch.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'success' }),
        }), 100))
      );

      render(
        <TimeOffRequestWizard
          balances={mockBalances}
          existingRequests={mockExistingRequests}
          manager={mockManager}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      // Navigate through all steps
      fireEvent.click(screen.getByTestId('type-option-PTO'));
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
      await waitFor(() => {
        expect(screen.getByText(/Step 2 of/)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2026-04-01' } });
      fireEvent.change(screen.getByLabelText(/end date/i), { target: { value: '2026-04-03' } });
      fireEvent.click(screen.getByRole('button', { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText(/Step 3 of/)).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText(/Step 4 of/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /submit/i }));

      expect(screen.getByText(/Submitting/i)).toBeInTheDocument();
    });

    it('calls onComplete callback on successful submission', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          status: 'success',
          data: { request_id: 'new-req-001', status: 'pending' },
        }),
      });

      render(
        <TimeOffRequestWizard
          balances={mockBalances}
          existingRequests={mockExistingRequests}
          manager={mockManager}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      // Navigate through all steps and submit
      fireEvent.click(screen.getByTestId('type-option-PTO'));
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
      await waitFor(() => {
        expect(screen.getByText(/Step 2 of/)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2026-04-01' } });
      fireEvent.change(screen.getByLabelText(/end date/i), { target: { value: '2026-04-03' } });
      fireEvent.click(screen.getByRole('button', { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText(/Step 3 of/)).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText(/Step 4 of/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(onComplete).toHaveBeenCalled();
      });
    });

    it('displays error message on submission failure', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          status: 'error',
          message: 'Insufficient balance for requested time off',
          suggestedAction: 'Please reduce the number of days requested',
        }),
      });

      render(
        <TimeOffRequestWizard
          balances={mockBalances}
          existingRequests={mockExistingRequests}
          manager={mockManager}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      // Navigate through all steps and submit
      fireEvent.click(screen.getByTestId('type-option-PTO'));
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
      await waitFor(() => {
        expect(screen.getByText(/Step 2 of/)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2026-04-01' } });
      fireEvent.change(screen.getByLabelText(/end date/i), { target: { value: '2026-04-03' } });
      fireEvent.click(screen.getByRole('button', { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText(/Step 3 of/)).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText(/Step 4 of/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(screen.getByText(/Insufficient balance/i)).toBeInTheDocument();
      });
    });
  });

  describe('Cancel Flow', () => {
    it('calls onClose when cancel clicked', () => {
      render(
        <TimeOffRequestWizard
          balances={mockBalances}
          existingRequests={mockExistingRequests}
          manager={mockManager}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
      expect(onClose).toHaveBeenCalled();
    });

    it('closes on escape key', () => {
      render(
        <TimeOffRequestWizard
          balances={mockBalances}
          existingRequests={mockExistingRequests}
          manager={mockManager}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA attributes on wizard container', () => {
      render(
        <TimeOffRequestWizard
          balances={mockBalances}
          existingRequests={mockExistingRequests}
          manager={mockManager}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      // Multiple dialogs present (wrapper + wizard component)
      const dialogs = screen.getAllByRole('dialog');
      expect(dialogs.length).toBeGreaterThan(0);
      // At least one should have aria-labelledby
      const hasAriaLabel = dialogs.some(dialog => dialog.hasAttribute('aria-labelledby'));
      expect(hasAriaLabel).toBe(true);
    });

    it('step content has live region for updates', () => {
      render(
        <TimeOffRequestWizard
          balances={mockBalances}
          existingRequests={mockExistingRequests}
          manager={mockManager}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      const main = screen.getByRole('main');
      expect(main).toHaveAttribute('aria-live', 'polite');
    });
  });

  describe('Edge Cases', () => {
    it('handles empty balances gracefully', () => {
      render(
        <TimeOffRequestWizard
          balances={[]}
          existingRequests={[]}
          manager={mockManager}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText(/no time-off types available/i)).toBeInTheDocument();
    });

    it('handles missing manager gracefully', () => {
      render(
        <TimeOffRequestWizard
          balances={mockBalances}
          existingRequests={mockExistingRequests}
          manager={null}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      // Navigate to review step
      fireEvent.click(screen.getByTestId('type-option-PTO'));
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
    });

    it('disables types with zero balance', () => {
      const balancesWithZero: TimeOffBalance[] = [
        ...mockBalances,
        {
          type_id: 'type-004',
          type_name: 'Bereavement',
          type_code: 'BEREAVE',
          entitlement: 5,
          carryover: 0,
          used: 5,
          pending: 0,
          available: 0,
        },
      ];

      render(
        <TimeOffRequestWizard
          balances={balancesWithZero}
          existingRequests={mockExistingRequests}
          manager={mockManager}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      const bereavementOption = screen.getByTestId('type-option-BEREAVE');
      expect(bereavementOption).toHaveAttribute('aria-disabled', 'true');
    });
  });
});
