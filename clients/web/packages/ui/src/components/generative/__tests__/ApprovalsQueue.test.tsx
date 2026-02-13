/**
 * ApprovalsQueue Component Tests - TDD RED Phase
 *
 * Tests for the generative UI approvals queue component.
 * Displays pending approvals for time-off requests, expense reports, and budget amendments.
 *
 * These tests are written BEFORE the component implementation (TDD RED phase).
 * All tests should FAIL until the component is implemented.
 */
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ApprovalsQueue } from '../ApprovalsQueue';
import type {
  TimeOffRequest,
  ExpenseReport,
  BudgetAmendment,
} from '../ApprovalsQueue';

// Test data for time-off requests
const mockTimeOffRequests: TimeOffRequest[] = [
  {
    id: 'tor-001',
    employeeName: 'Alice Chen',
    startDate: '2026-02-10',
    endDate: '2026-02-14',
    type: 'vacation',
    reason: 'Family trip to Hawaii',
  },
  {
    id: 'tor-002',
    employeeName: 'Bob Martinez',
    startDate: '2026-02-20',
    endDate: '2026-02-20',
    type: 'sick',
    reason: 'Doctor appointment',
  },
  {
    id: 'tor-003',
    employeeName: 'Carol Johnson',
    startDate: '2026-03-01',
    endDate: '2026-03-05',
    type: 'personal',
    reason: 'Moving to new apartment',
  },
];

// Test data for expense reports
const mockExpenseReports: ExpenseReport[] = [
  {
    id: 'exp-001',
    employeeName: 'Dan Williams',
    amount: 1250.00,
    date: '2026-01-28',
    description: 'Client dinner and entertainment',
    itemCount: 4,
  },
  {
    id: 'exp-002',
    employeeName: 'Eve Thompson',
    amount: 3500.00,
    date: '2026-01-25',
    description: 'Conference travel and accommodation',
    itemCount: 8,
  },
];

// Test data for budget amendments
const mockBudgetAmendments: BudgetAmendment[] = [
  {
    id: 'ba-001',
    department: 'Engineering',
    currentBudget: 500000,
    requestedBudget: 650000,
    reason: 'Additional headcount for Q2 project expansion',
  },
  {
    id: 'ba-002',
    department: 'Marketing',
    currentBudget: 200000,
    requestedBudget: 275000,
    reason: 'Increased ad spend for product launch',
  },
  {
    id: 'ba-003',
    department: 'Sales',
    currentBudget: 150000,
    requestedBudget: 180000,
    reason: 'New CRM software licenses',
  },
];

describe('ApprovalsQueue Component', () => {
  describe('Basic Rendering', () => {
    it('renders the approvals queue container', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={mockTimeOffRequests}
          expenseReports={mockExpenseReports}
          budgetAmendments={mockBudgetAmendments}
        />
      );

      expect(screen.getByTestId('approvals-queue')).toBeInTheDocument();
    });

    it('renders section headers for each approval type', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={mockTimeOffRequests}
          expenseReports={mockExpenseReports}
          budgetAmendments={mockBudgetAmendments}
        />
      );

      expect(screen.getByText('Time-Off Requests')).toBeInTheDocument();
      expect(screen.getByText('Expense Reports')).toBeInTheDocument();
      expect(screen.getByText('Budget Amendments')).toBeInTheDocument();
    });

    it('displays item counts in section headers', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={mockTimeOffRequests}
          expenseReports={mockExpenseReports}
          budgetAmendments={mockBudgetAmendments}
        />
      );

      expect(screen.getByText(/Time-Off Requests.*\(3\)/)).toBeInTheDocument();
      expect(screen.getByText(/Expense Reports.*\(2\)/)).toBeInTheDocument();
      expect(screen.getByText(/Budget Amendments.*\(3\)/)).toBeInTheDocument();
    });

    it('renders total pending count', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={mockTimeOffRequests}
          expenseReports={mockExpenseReports}
          budgetAmendments={mockBudgetAmendments}
        />
      );

      expect(screen.getByText('8 pending approvals')).toBeInTheDocument();
    });
  });

  describe('Time-Off Requests Section', () => {
    it('renders all time-off request items', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={mockTimeOffRequests}
          expenseReports={[]}
          budgetAmendments={[]}
        />
      );

      expect(screen.getByText('Alice Chen')).toBeInTheDocument();
      expect(screen.getByText('Bob Martinez')).toBeInTheDocument();
      expect(screen.getByText('Carol Johnson')).toBeInTheDocument();
    });

    it('displays time-off request details', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={mockTimeOffRequests}
          expenseReports={[]}
          budgetAmendments={[]}
        />
      );

      const aliceRequest = screen.getByTestId('time-off-request-tor-001');
      expect(within(aliceRequest).getByText('Alice Chen')).toBeInTheDocument();
      expect(within(aliceRequest).getByText(/Feb 10.*Feb 14/)).toBeInTheDocument();
      expect(within(aliceRequest).getByText('vacation')).toBeInTheDocument();
      expect(within(aliceRequest).getByText('Family trip to Hawaii')).toBeInTheDocument();
    });

    it('renders approve button for each time-off request', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={mockTimeOffRequests}
          expenseReports={[]}
          budgetAmendments={[]}
        />
      );

      const approveButtons = screen.getAllByRole('button', { name: /approve/i });
      expect(approveButtons.length).toBeGreaterThanOrEqual(3);
    });

    it('renders reject button for each time-off request', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={mockTimeOffRequests}
          expenseReports={[]}
          budgetAmendments={[]}
        />
      );

      const rejectButtons = screen.getAllByRole('button', { name: /reject/i });
      expect(rejectButtons.length).toBeGreaterThanOrEqual(3);
    });

    it('renders view details link for each time-off request', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={mockTimeOffRequests}
          expenseReports={[]}
          budgetAmendments={[]}
        />
      );

      const detailsLinks = screen.getAllByRole('link', { name: /view details/i });
      expect(detailsLinks.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Expense Reports Section', () => {
    it('renders all expense report items', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={[]}
          expenseReports={mockExpenseReports}
          budgetAmendments={[]}
        />
      );

      expect(screen.getByText('Dan Williams')).toBeInTheDocument();
      expect(screen.getByText('Eve Thompson')).toBeInTheDocument();
    });

    it('displays expense report details with formatted amount', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={[]}
          expenseReports={mockExpenseReports}
          budgetAmendments={[]}
        />
      );

      const danReport = screen.getByTestId('expense-report-exp-001');
      expect(within(danReport).getByText('Dan Williams')).toBeInTheDocument();
      expect(within(danReport).getByText('$1,250.00')).toBeInTheDocument();
      expect(within(danReport).getByText(/Jan 28/)).toBeInTheDocument();
      expect(within(danReport).getByText('Client dinner and entertainment')).toBeInTheDocument();
      expect(within(danReport).getByText('4 items')).toBeInTheDocument();
    });

    it('renders action buttons for expense reports', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={[]}
          expenseReports={mockExpenseReports}
          budgetAmendments={[]}
        />
      );

      const expenseSection = screen.getByTestId('expense-reports-section');
      const approveButtons = within(expenseSection).getAllByRole('button', { name: /approve/i });
      const rejectButtons = within(expenseSection).getAllByRole('button', { name: /reject/i });

      expect(approveButtons).toHaveLength(2);
      expect(rejectButtons).toHaveLength(2);
    });
  });

  describe('Budget Amendments Section', () => {
    it('renders all budget amendment items', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={[]}
          expenseReports={[]}
          budgetAmendments={mockBudgetAmendments}
        />
      );

      expect(screen.getByText('Engineering')).toBeInTheDocument();
      expect(screen.getByText('Marketing')).toBeInTheDocument();
      expect(screen.getByText('Sales')).toBeInTheDocument();
    });

    it('displays budget amendment details with formatted amounts', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={[]}
          expenseReports={[]}
          budgetAmendments={mockBudgetAmendments}
        />
      );

      const engAmendment = screen.getByTestId('budget-amendment-ba-001');
      expect(within(engAmendment).getByText('Engineering')).toBeInTheDocument();
      expect(within(engAmendment).getByText('$500,000')).toBeInTheDocument();
      expect(within(engAmendment).getByText('$650,000')).toBeInTheDocument();
      expect(within(engAmendment).getByText(/\+\$150,000/)).toBeInTheDocument();
      expect(within(engAmendment).getByText(/\+30%/)).toBeInTheDocument();
      expect(within(engAmendment).getByText('Additional headcount for Q2 project expansion')).toBeInTheDocument();
    });

    it('renders action buttons for budget amendments', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={[]}
          expenseReports={[]}
          budgetAmendments={mockBudgetAmendments}
        />
      );

      const budgetSection = screen.getByTestId('budget-amendments-section');
      const approveButtons = within(budgetSection).getAllByRole('button', { name: /approve/i });
      const rejectButtons = within(budgetSection).getAllByRole('button', { name: /reject/i });

      expect(approveButtons).toHaveLength(3);
      expect(rejectButtons).toHaveLength(3);
    });
  });

  describe('Callback Handlers', () => {
    describe('onApprove callback', () => {
      it('calls onApprove with correct type and id for time-off request', () => {
        const onApprove = jest.fn();
        render(
          <ApprovalsQueue
            timeOffRequests={mockTimeOffRequests}
            expenseReports={[]}
            budgetAmendments={[]}
            onApprove={onApprove}
          />
        );

        const aliceRequest = screen.getByTestId('time-off-request-tor-001');
        const approveButton = within(aliceRequest).getByRole('button', { name: /approve/i });
        fireEvent.click(approveButton);

        expect(onApprove).toHaveBeenCalledWith('time-off', 'tor-001');
      });

      it('calls onApprove with correct type and id for expense report', () => {
        const onApprove = jest.fn();
        render(
          <ApprovalsQueue
            timeOffRequests={[]}
            expenseReports={mockExpenseReports}
            budgetAmendments={[]}
            onApprove={onApprove}
          />
        );

        const danReport = screen.getByTestId('expense-report-exp-001');
        const approveButton = within(danReport).getByRole('button', { name: /approve/i });
        fireEvent.click(approveButton);

        expect(onApprove).toHaveBeenCalledWith('expense', 'exp-001');
      });

      it('calls onApprove with correct type and id for budget amendment', () => {
        const onApprove = jest.fn();
        render(
          <ApprovalsQueue
            timeOffRequests={[]}
            expenseReports={[]}
            budgetAmendments={mockBudgetAmendments}
            onApprove={onApprove}
          />
        );

        const engAmendment = screen.getByTestId('budget-amendment-ba-001');
        const approveButton = within(engAmendment).getByRole('button', { name: /approve/i });
        fireEvent.click(approveButton);

        expect(onApprove).toHaveBeenCalledWith('budget', 'ba-001');
      });
    });

    describe('onReject callback', () => {
      it('calls onReject with correct type and id for time-off request', () => {
        const onReject = jest.fn();
        render(
          <ApprovalsQueue
            timeOffRequests={mockTimeOffRequests}
            expenseReports={[]}
            budgetAmendments={[]}
            onReject={onReject}
          />
        );

        const aliceRequest = screen.getByTestId('time-off-request-tor-001');
        const rejectButton = within(aliceRequest).getByRole('button', { name: /reject/i });
        fireEvent.click(rejectButton);

        expect(onReject).toHaveBeenCalledWith('time-off', 'tor-001', undefined);
      });

      it('calls onReject with reason when provided', () => {
        const onReject = jest.fn();
        render(
          <ApprovalsQueue
            timeOffRequests={mockTimeOffRequests}
            expenseReports={[]}
            budgetAmendments={[]}
            onReject={onReject}
          />
        );

        const aliceRequest = screen.getByTestId('time-off-request-tor-001');
        const rejectButton = within(aliceRequest).getByRole('button', { name: /reject/i });
        fireEvent.click(rejectButton);

        // Should open a dialog/prompt for reason
        const reasonInput = screen.getByPlaceholderText(/reason for rejection/i);
        fireEvent.change(reasonInput, { target: { value: 'Team coverage conflict' } });

        const confirmButton = screen.getByRole('button', { name: /confirm rejection/i });
        fireEvent.click(confirmButton);

        expect(onReject).toHaveBeenCalledWith('time-off', 'tor-001', 'Team coverage conflict');
      });

      it('calls onReject with correct type for expense report', () => {
        const onReject = jest.fn();
        render(
          <ApprovalsQueue
            timeOffRequests={[]}
            expenseReports={mockExpenseReports}
            budgetAmendments={[]}
            onReject={onReject}
          />
        );

        const danReport = screen.getByTestId('expense-report-exp-001');
        const rejectButton = within(danReport).getByRole('button', { name: /reject/i });
        fireEvent.click(rejectButton);

        expect(onReject).toHaveBeenCalledWith('expense', 'exp-001', undefined);
      });

      it('calls onReject with correct type for budget amendment', () => {
        const onReject = jest.fn();
        render(
          <ApprovalsQueue
            timeOffRequests={[]}
            expenseReports={[]}
            budgetAmendments={mockBudgetAmendments}
            onReject={onReject}
          />
        );

        const engAmendment = screen.getByTestId('budget-amendment-ba-001');
        const rejectButton = within(engAmendment).getByRole('button', { name: /reject/i });
        fireEvent.click(rejectButton);

        expect(onReject).toHaveBeenCalledWith('budget', 'ba-001', undefined);
      });
    });

    describe('onViewDetails callback', () => {
      it('calls onViewDetails with correct type and id for time-off request', () => {
        const onViewDetails = jest.fn();
        render(
          <ApprovalsQueue
            timeOffRequests={mockTimeOffRequests}
            expenseReports={[]}
            budgetAmendments={[]}
            onViewDetails={onViewDetails}
          />
        );

        const aliceRequest = screen.getByTestId('time-off-request-tor-001');
        const detailsLink = within(aliceRequest).getByRole('link', { name: /view details/i });
        fireEvent.click(detailsLink);

        expect(onViewDetails).toHaveBeenCalledWith('time-off', 'tor-001');
      });

      it('calls onViewDetails with correct type and id for expense report', () => {
        const onViewDetails = jest.fn();
        render(
          <ApprovalsQueue
            timeOffRequests={[]}
            expenseReports={mockExpenseReports}
            budgetAmendments={[]}
            onViewDetails={onViewDetails}
          />
        );

        const danReport = screen.getByTestId('expense-report-exp-001');
        const detailsLink = within(danReport).getByRole('link', { name: /view details/i });
        fireEvent.click(detailsLink);

        expect(onViewDetails).toHaveBeenCalledWith('expense', 'exp-001');
      });

      it('calls onViewDetails with correct type and id for budget amendment', () => {
        const onViewDetails = jest.fn();
        render(
          <ApprovalsQueue
            timeOffRequests={[]}
            expenseReports={[]}
            budgetAmendments={mockBudgetAmendments}
            onViewDetails={onViewDetails}
          />
        );

        const engAmendment = screen.getByTestId('budget-amendment-ba-001');
        const detailsLink = within(engAmendment).getByRole('link', { name: /view details/i });
        fireEvent.click(detailsLink);

        expect(onViewDetails).toHaveBeenCalledWith('budget', 'ba-001');
      });
    });
  });

  describe('Empty State', () => {
    it('shows empty state when all arrays are empty', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={[]}
          expenseReports={[]}
          budgetAmendments={[]}
        />
      );

      expect(screen.getByTestId('approvals-empty-state')).toBeInTheDocument();
      expect(screen.getByText('No pending approvals')).toBeInTheDocument();
    });

    it('displays checkmark icon in empty state', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={[]}
          expenseReports={[]}
          budgetAmendments={[]}
        />
      );

      const emptyState = screen.getByTestId('approvals-empty-state');
      const checkmarkIcon = within(emptyState).getByRole('img', { name: /all caught up/i });
      expect(checkmarkIcon).toBeInTheDocument();
    });

    it('shows encouraging message in empty state', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={[]}
          expenseReports={[]}
          budgetAmendments={[]}
        />
      );

      expect(screen.getByText(/You're all caught up!/i)).toBeInTheDocument();
    });

    it('hides time-off section when no time-off requests', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={[]}
          expenseReports={mockExpenseReports}
          budgetAmendments={mockBudgetAmendments}
        />
      );

      expect(screen.queryByTestId('time-off-requests-section')).not.toBeInTheDocument();
    });

    it('hides expense section when no expense reports', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={mockTimeOffRequests}
          expenseReports={[]}
          budgetAmendments={mockBudgetAmendments}
        />
      );

      expect(screen.queryByTestId('expense-reports-section')).not.toBeInTheDocument();
    });

    it('hides budget section when no budget amendments', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={mockTimeOffRequests}
          expenseReports={mockExpenseReports}
          budgetAmendments={[]}
        />
      );

      expect(screen.queryByTestId('budget-amendments-section')).not.toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('renders skeleton when loading', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={[]}
          expenseReports={[]}
          budgetAmendments={[]}
          loading={true}
        />
      );

      expect(screen.getByTestId('approvals-queue-skeleton')).toBeInTheDocument();
    });

    it('does not render items when loading', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={mockTimeOffRequests}
          expenseReports={mockExpenseReports}
          budgetAmendments={mockBudgetAmendments}
          loading={true}
        />
      );

      expect(screen.queryByText('Alice Chen')).not.toBeInTheDocument();
      expect(screen.queryByText('Dan Williams')).not.toBeInTheDocument();
      expect(screen.queryByText('Engineering')).not.toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('renders error state when error prop provided', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={[]}
          expenseReports={[]}
          budgetAmendments={[]}
          error="Failed to load approvals"
        />
      );

      expect(screen.getByTestId('approvals-queue-error')).toBeInTheDocument();
      expect(screen.getByText('Failed to load approvals')).toBeInTheDocument();
    });

    it('shows retry button in error state', () => {
      const onRetry = jest.fn();
      render(
        <ApprovalsQueue
          timeOffRequests={[]}
          expenseReports={[]}
          budgetAmendments={[]}
          error="Failed to load approvals"
          onRetry={onRetry}
        />
      );

      const retryButton = screen.getByRole('button', { name: /retry/i });
      expect(retryButton).toBeInTheDocument();

      fireEvent.click(retryButton);
      expect(onRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('Accessibility', () => {
    it('has proper heading hierarchy', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={mockTimeOffRequests}
          expenseReports={mockExpenseReports}
          budgetAmendments={mockBudgetAmendments}
        />
      );

      const mainHeading = screen.getByRole('heading', { name: /pending approvals/i, level: 2 });
      expect(mainHeading).toBeInTheDocument();

      const sectionHeadings = screen.getAllByRole('heading', { level: 3 });
      expect(sectionHeadings.length).toBe(3);
    });

    it('has aria-label on approve buttons', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={mockTimeOffRequests}
          expenseReports={[]}
          budgetAmendments={[]}
        />
      );

      const aliceRequest = screen.getByTestId('time-off-request-tor-001');
      const approveButton = within(aliceRequest).getByRole('button', { name: /approve/i });
      expect(approveButton).toHaveAttribute('aria-label', expect.stringContaining('Alice Chen'));
    });

    it('has aria-label on reject buttons', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={mockTimeOffRequests}
          expenseReports={[]}
          budgetAmendments={[]}
        />
      );

      const aliceRequest = screen.getByTestId('time-off-request-tor-001');
      const rejectButton = within(aliceRequest).getByRole('button', { name: /reject/i });
      expect(rejectButton).toHaveAttribute('aria-label', expect.stringContaining('Alice Chen'));
    });

    it('uses semantic list markup for items', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={mockTimeOffRequests}
          expenseReports={[]}
          budgetAmendments={[]}
        />
      );

      const list = screen.getByRole('list', { name: /time-off requests/i });
      expect(list).toBeInTheDocument();

      const listItems = within(list).getAllByRole('listitem');
      expect(listItems).toHaveLength(3);
    });

    it('has proper ARIA live region for updates', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={mockTimeOffRequests}
          expenseReports={mockExpenseReports}
          budgetAmendments={mockBudgetAmendments}
        />
      );

      const liveRegion = screen.getByRole('status');
      expect(liveRegion).toHaveAttribute('aria-live', 'polite');
    });
  });

  describe('Urgency Indicators', () => {
    it('highlights time-off requests starting soon', () => {
      const urgentRequest: TimeOffRequest = {
        id: 'tor-urgent',
        employeeName: 'Urgent Employee',
        startDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 2 days from now
        endDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        type: 'vacation',
        reason: 'Urgent trip',
      };

      render(
        <ApprovalsQueue
          timeOffRequests={[urgentRequest]}
          expenseReports={[]}
          budgetAmendments={[]}
        />
      );

      const requestItem = screen.getByTestId('time-off-request-tor-urgent');
      expect(requestItem).toHaveClass('urgent');
    });

    it('shows high amount indicator for large expense reports', () => {
      const highAmountReport: ExpenseReport = {
        id: 'exp-high',
        employeeName: 'Big Spender',
        amount: 10000.00,
        date: '2026-01-28',
        description: 'Large purchase',
        itemCount: 1,
      };

      render(
        <ApprovalsQueue
          timeOffRequests={[]}
          expenseReports={[highAmountReport]}
          budgetAmendments={[]}
        />
      );

      const reportItem = screen.getByTestId('expense-report-exp-high');
      expect(within(reportItem).getByTestId('high-amount-indicator')).toBeInTheDocument();
    });

    it('shows large increase indicator for significant budget amendments', () => {
      const largeAmendment: BudgetAmendment = {
        id: 'ba-large',
        department: 'R&D',
        currentBudget: 100000,
        requestedBudget: 200000, // 100% increase
        reason: 'Major expansion',
      };

      render(
        <ApprovalsQueue
          timeOffRequests={[]}
          expenseReports={[]}
          budgetAmendments={[largeAmendment]}
        />
      );

      const amendmentItem = screen.getByTestId('budget-amendment-ba-large');
      expect(within(amendmentItem).getByTestId('large-increase-indicator')).toBeInTheDocument();
    });
  });

  describe('Collapsible Sections', () => {
    it('allows collapsing sections', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={mockTimeOffRequests}
          expenseReports={mockExpenseReports}
          budgetAmendments={mockBudgetAmendments}
        />
      );

      const timeOffHeader = screen.getByRole('button', { name: /time-off requests/i });
      fireEvent.click(timeOffHeader);

      expect(screen.queryByTestId('time-off-request-tor-001')).not.toBeVisible();
    });

    it('toggles section visibility on header click', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={mockTimeOffRequests}
          expenseReports={mockExpenseReports}
          budgetAmendments={mockBudgetAmendments}
        />
      );

      const timeOffHeader = screen.getByRole('button', { name: /time-off requests/i });

      // Collapse
      fireEvent.click(timeOffHeader);
      expect(screen.getByTestId('time-off-request-tor-001')).not.toBeVisible();

      // Expand
      fireEvent.click(timeOffHeader);
      expect(screen.getByTestId('time-off-request-tor-001')).toBeVisible();
    });

    it('has aria-expanded attribute on section headers', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={mockTimeOffRequests}
          expenseReports={mockExpenseReports}
          budgetAmendments={mockBudgetAmendments}
        />
      );

      const timeOffHeader = screen.getByRole('button', { name: /time-off requests/i });
      expect(timeOffHeader).toHaveAttribute('aria-expanded', 'true');

      fireEvent.click(timeOffHeader);
      expect(timeOffHeader).toHaveAttribute('aria-expanded', 'false');
    });

    it('toggles expense reports section visibility', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={mockTimeOffRequests}
          expenseReports={mockExpenseReports}
          budgetAmendments={mockBudgetAmendments}
        />
      );

      const expenseHeader = screen.getByRole('button', { name: /expense reports/i });

      // Collapse
      fireEvent.click(expenseHeader);
      expect(screen.getByTestId('expense-report-exp-001')).not.toBeVisible();

      // Expand
      fireEvent.click(expenseHeader);
      expect(screen.getByTestId('expense-report-exp-001')).toBeVisible();
    });

    it('toggles budget amendments section visibility', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={mockTimeOffRequests}
          expenseReports={mockExpenseReports}
          budgetAmendments={mockBudgetAmendments}
        />
      );

      const budgetHeader = screen.getByRole('button', { name: /budget amendments/i });

      // Collapse
      fireEvent.click(budgetHeader);
      expect(screen.getByTestId('budget-amendment-ba-001')).not.toBeVisible();

      // Expand
      fireEvent.click(budgetHeader);
      expect(screen.getByTestId('budget-amendment-ba-001')).toBeVisible();
    });
  });

  describe('Batch Actions', () => {
    it('allows selecting multiple items', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={mockTimeOffRequests}
          expenseReports={[]}
          budgetAmendments={[]}
          selectable={true}
        />
      );

      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes.length).toBeGreaterThanOrEqual(3);
    });

    it('shows batch action toolbar when items selected', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={mockTimeOffRequests}
          expenseReports={[]}
          budgetAmendments={[]}
          selectable={true}
        />
      );

      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);

      expect(screen.getByTestId('batch-action-toolbar')).toBeInTheDocument();
      expect(screen.getByText('2 selected')).toBeInTheDocument();
    });

    it('calls onBatchApprove with selected items', () => {
      const onBatchApprove = jest.fn();
      render(
        <ApprovalsQueue
          timeOffRequests={mockTimeOffRequests}
          expenseReports={[]}
          budgetAmendments={[]}
          selectable={true}
          onBatchApprove={onBatchApprove}
        />
      );

      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);

      const batchApproveButton = screen.getByRole('button', { name: /approve selected/i });
      fireEvent.click(batchApproveButton);

      expect(onBatchApprove).toHaveBeenCalledWith([
        { type: 'time-off', id: 'tor-001' },
        { type: 'time-off', id: 'tor-002' },
      ]);
    });

    it('allows deselecting items', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={mockTimeOffRequests}
          expenseReports={[]}
          budgetAmendments={[]}
          selectable={true}
        />
      );

      const checkboxes = screen.getAllByRole('checkbox');

      // Select first two items
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);
      expect(screen.getByText('2 selected')).toBeInTheDocument();

      // Deselect the first item
      fireEvent.click(checkboxes[0]);
      expect(screen.getByText('1 selected')).toBeInTheDocument();
    });

    it('allows selecting expense report items', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={[]}
          expenseReports={mockExpenseReports}
          budgetAmendments={[]}
          selectable={true}
        />
      );

      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);

      expect(screen.getByTestId('batch-action-toolbar')).toBeInTheDocument();
      expect(screen.getByText('1 selected')).toBeInTheDocument();
    });

    it('allows selecting budget amendment items', () => {
      render(
        <ApprovalsQueue
          timeOffRequests={[]}
          expenseReports={[]}
          budgetAmendments={mockBudgetAmendments}
          selectable={true}
        />
      );

      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);

      expect(screen.getByTestId('batch-action-toolbar')).toBeInTheDocument();
      expect(screen.getByText('1 selected')).toBeInTheDocument();
    });

    it('allows selecting and deselecting items across all types', () => {
      const onBatchApprove = jest.fn();
      render(
        <ApprovalsQueue
          timeOffRequests={mockTimeOffRequests}
          expenseReports={mockExpenseReports}
          budgetAmendments={mockBudgetAmendments}
          selectable={true}
          onBatchApprove={onBatchApprove}
        />
      );

      const checkboxes = screen.getAllByRole('checkbox');

      // Select from each type
      fireEvent.click(checkboxes[0]); // time-off
      fireEvent.click(checkboxes[3]); // expense (after 3 time-off)
      fireEvent.click(checkboxes[5]); // budget (after 2 expense)

      expect(screen.getByText('3 selected')).toBeInTheDocument();

      // Deselect expense item
      fireEvent.click(checkboxes[3]);
      expect(screen.getByText('2 selected')).toBeInTheDocument();
    });
  });

  describe('Rejection Dialog', () => {
    it('allows canceling the rejection dialog', () => {
      const onReject = jest.fn();
      render(
        <ApprovalsQueue
          timeOffRequests={mockTimeOffRequests}
          expenseReports={[]}
          budgetAmendments={[]}
          onReject={onReject}
        />
      );

      const aliceRequest = screen.getByTestId('time-off-request-tor-001');
      const rejectButton = within(aliceRequest).getByRole('button', { name: /reject/i });
      fireEvent.click(rejectButton);

      // Dialog should be open
      expect(screen.getByPlaceholderText(/reason for rejection/i)).toBeInTheDocument();

      // Cancel the dialog
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButton);

      // Dialog should be closed
      expect(screen.queryByPlaceholderText(/reason for rejection/i)).not.toBeInTheDocument();
    });
  });
});
