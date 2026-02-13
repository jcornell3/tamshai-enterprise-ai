/**
 * OpportunityDetail Tests - GREEN PHASE
 *
 * Tests for the Opportunity Detail modal with opportunity info,
 * stage timeline, customer info, and actions.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import OpportunityDetail from '../components/OpportunityDetail';
import type { Opportunity, Customer } from '../types';

// Mock auth module
vi.mock('@tamshai/auth', () => ({
  useAuth: () => ({
    getAccessToken: () => 'mock-token',
    isAuthenticated: true,
    user: { preferred_username: 'testuser' },
  }),
  apiConfig: {
    mcpGatewayUrl: '',
  },
}));

// Mock fetch for API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Test wrapper with providers
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

// Mock opportunity data
const mockOpenOpportunity: Opportunity = {
  _id: 'opp-001',
  customer_id: 'cust-001',
  customer_name: 'Acme Corporation',
  title: 'Enterprise License Deal',
  value: 150000,
  stage: 'NEGOTIATION',
  probability: 75,
  expected_close_date: '2026-02-15',
  owner_id: 'user-001',
  owner_name: 'Alice Sales',
  created_at: '2026-01-01T10:00:00Z',
  updated_at: '2026-01-15T14:30:00Z',
};

const mockClosedWonOpportunity: Opportunity = {
  _id: 'opp-002',
  customer_id: 'cust-002',
  customer_name: 'Global Industries',
  title: 'Multi-year Contract',
  value: 500000,
  stage: 'CLOSED_WON',
  probability: 100,
  expected_close_date: '2026-01-10',
  owner_id: 'user-002',
  owner_name: 'Bob Sales',
  created_at: '2025-12-01T10:00:00Z',
  updated_at: '2026-01-10T16:00:00Z',
};

const mockClosedLostOpportunity: Opportunity = {
  _id: 'opp-003',
  customer_id: 'cust-003',
  customer_name: 'SmallBiz LLC',
  title: 'Basic Plan',
  value: 10000,
  stage: 'CLOSED_LOST',
  probability: 0,
  owner_id: 'user-001',
  owner_name: 'Alice Sales',
  created_at: '2025-12-15T10:00:00Z',
  updated_at: '2026-01-05T10:00:00Z',
};

const mockCustomer: Customer = {
  _id: 'cust-001',
  company_name: 'Acme Corporation',
  industry: 'Technology',
  website: 'https://acme.com',
  primary_contact: {
    name: 'John Smith',
    email: 'john@acme.com',
    phone: '+1-555-0101',
  },
  address: {
    city: 'San Francisco',
    state: 'CA',
    country: 'USA',
  },
  created_at: '2025-06-15T10:00:00Z',
  updated_at: '2026-01-02T14:30:00Z',
};

describe('OpportunityDetail', () => {
  const mockOnClose = vi.fn();
  const mockOnCustomerClick = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    mockOnClose.mockReset();
    mockOnCustomerClick.mockReset();
  });

  describe('Display - Open Opportunity', () => {
    test('displays opportunity title', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockCustomer }),
      });

      render(
        <OpportunityDetail
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText('Enterprise License Deal')).toBeInTheDocument();
    });

    test('displays deal value formatted as currency', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockCustomer }),
      });

      render(
        <OpportunityDetail
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText('$150,000')).toBeInTheDocument();
    });

    test('displays stage badge', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockCustomer }),
      });

      render(
        <OpportunityDetail
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      // Stage appears in badge and timeline, so use getAllByText
      const stageElements = screen.getAllByText(/NEGOTIATION/);
      expect(stageElements.length).toBeGreaterThan(0);
    });

    test('displays probability percentage', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockCustomer }),
      });

      render(
        <OpportunityDetail
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText('75%')).toBeInTheDocument();
    });

    test('displays expected close date', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockCustomer }),
      });

      render(
        <OpportunityDetail
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      // Check for Expected Close label and date parts (locale-agnostic)
      expect(screen.getByText(/Expected Close/)).toBeInTheDocument();
      expect(screen.getByText(/2026/)).toBeInTheDocument();
    });

    test('displays owner name', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockCustomer }),
      });

      render(
        <OpportunityDetail
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText('Alice Sales')).toBeInTheDocument();
    });

    test('displays weighted value (value * probability)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockCustomer }),
      });

      render(
        <OpportunityDetail
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      // 150000 * 0.75 = 112500
      expect(screen.getByText('$112,500')).toBeInTheDocument();
    });
  });

  describe('Display - Closed Won Opportunity', () => {
    test('displays CLOSED_WON stage badge', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockCustomer }),
      });

      render(
        <OpportunityDetail
          opportunity={mockClosedWonOpportunity}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText('CLOSED WON')).toBeInTheDocument();
    });

    test('displays actual close date for closed opportunity', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockCustomer }),
      });

      render(
        <OpportunityDetail
          opportunity={mockClosedWonOpportunity}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText(/January 10, 2026/)).toBeInTheDocument();
    });

    test('hides Close Deal buttons for closed opportunities', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockCustomer }),
      });

      render(
        <OpportunityDetail
          opportunity={mockClosedWonOpportunity}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.queryByTestId('close-as-won-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('close-as-lost-button')).not.toBeInTheDocument();
    });
  });

  describe('Display - Closed Lost Opportunity', () => {
    test('displays CLOSED_LOST stage badge', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockCustomer }),
      });

      render(
        <OpportunityDetail
          opportunity={mockClosedLostOpportunity}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText('CLOSED LOST')).toBeInTheDocument();
    });
  });

  describe('Customer Information', () => {
    test('displays linked customer name', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockCustomer }),
      });

      render(
        <OpportunityDetail
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByTestId('customer-link')).toBeInTheDocument();
        expect(screen.getByText('Acme Corporation')).toBeInTheDocument();
      });
    });

    test('displays customer primary contact', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockCustomer }),
      });

      render(
        <OpportunityDetail
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByText('John Smith')).toBeInTheDocument();
        expect(screen.getByText('john@acme.com')).toBeInTheDocument();
        expect(screen.getByText('+1-555-0101')).toBeInTheDocument();
      });
    });

    test('clicking customer name calls onCustomerClick', async () => {
      const user = userEvent.setup();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockCustomer }),
      });

      render(
        <OpportunityDetail
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          canWrite={true}
          onCustomerClick={mockOnCustomerClick}
        />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByTestId('customer-link')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('customer-link'));
      expect(mockOnCustomerClick).toHaveBeenCalledWith('cust-001');
    });
  });

  describe('Actions - Open Opportunity', () => {
    test('Close as Won button visible for open opportunities', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockCustomer }),
      });

      render(
        <OpportunityDetail
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId('close-as-won-button')).toBeInTheDocument();
    });

    test('Close as Lost button visible for open opportunities', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockCustomer }),
      });

      render(
        <OpportunityDetail
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId('close-as-lost-button')).toBeInTheDocument();
    });

    test('delete button visible for sales-write role', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockCustomer }),
      });

      render(
        <OpportunityDetail
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId('delete-button')).toBeInTheDocument();
    });

    test('delete button hidden for sales-read role', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockCustomer }),
      });

      render(
        <OpportunityDetail
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          canWrite={false}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.queryByTestId('delete-button')).not.toBeInTheDocument();
    });

    test('close buttons hidden for sales-read role', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockCustomer }),
      });

      render(
        <OpportunityDetail
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          canWrite={false}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.queryByTestId('close-as-won-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('close-as-lost-button')).not.toBeInTheDocument();
    });
  });

  describe('Stage Timeline', () => {
    test('displays stage progression timeline', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockCustomer }),
      });

      render(
        <OpportunityDetail
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId('stage-timeline')).toBeInTheDocument();
    });

    test('displays timeline stages', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockCustomer }),
      });

      render(
        <OpportunityDetail
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId('timeline-lead')).toBeInTheDocument();
      expect(screen.getByTestId('timeline-qualified')).toBeInTheDocument();
      expect(screen.getByTestId('timeline-proposal')).toBeInTheDocument();
      expect(screen.getByTestId('timeline-negotiation')).toBeInTheDocument();
    });
  });

  describe('Modal Behavior', () => {
    test('close button dismisses modal', async () => {
      const user = userEvent.setup();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockCustomer }),
      });

      render(
        <OpportunityDetail
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      await user.click(screen.getByTestId('close-button'));
      expect(mockOnClose).toHaveBeenCalled();
    });

    test('clicking outside modal closes it', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockCustomer }),
      });

      render(
        <OpportunityDetail
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      const backdrop = screen.getByTestId('opportunity-detail-modal');
      fireEvent.click(backdrop);
      expect(mockOnClose).toHaveBeenCalled();
    });

    test('escape key closes modal', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockCustomer }),
      });

      render(
        <OpportunityDetail
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(mockOnClose).toHaveBeenCalled();
    });

    test('modal has proper ARIA attributes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockCustomer }),
      });

      render(
        <OpportunityDetail
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      const modal = screen.getByTestId('opportunity-detail-modal');
      expect(modal).toHaveAttribute('role', 'dialog');
      expect(modal).toHaveAttribute('aria-modal', 'true');
    });
  });

  describe('Loading and Error States', () => {
    test('shows loading state while fetching customer', async () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));

      render(
        <OpportunityDetail
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId('customer-loading')).toBeInTheDocument();
    });

    test('handles customer fetch error gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Customer not found'));

      render(
        <OpportunityDetail
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByTestId('customer-error')).toBeInTheDocument();
      });
    });
  });

  describe('Delete Action', () => {
    test('delete triggers v1.4 confirmation flow', async () => {
      const user = userEvent.setup();

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockCustomer }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              status: 'pending_confirmation',
              confirmationId: 'conf-123',
              message: 'Delete opportunity Enterprise License Deal?',
            }),
        });

      render(
        <OpportunityDetail
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      await user.click(screen.getByTestId('delete-button'));

      await waitFor(() => {
        expect(screen.getByText(/Delete opportunity/)).toBeInTheDocument();
      });
    });
  });
});
