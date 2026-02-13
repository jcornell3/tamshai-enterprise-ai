/**
 * CustomerDetail Tests - GREEN PHASE
 *
 * Tests for the Customer Detail modal showing company info, contacts,
 * and associated opportunities.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import CustomerDetail from '../components/CustomerDetail';
import type { Customer, Opportunity } from '../types';

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

// Mock customer data
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

// Mock customer with additional contacts
const mockCustomerWithContacts: Customer = {
  ...mockCustomer,
  contacts: [
    { name: 'Jane Doe', email: 'jane@acme.com', phone: '+1-555-0102', role: 'CTO' },
    { name: 'Bob Wilson', email: 'bob@acme.com', role: 'Procurement' },
  ],
};

// Mock opportunities for this customer
const mockCustomerOpportunities: Opportunity[] = [
  {
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
  },
  {
    _id: 'opp-002',
    customer_id: 'cust-001',
    customer_name: 'Acme Corporation',
    title: 'Support Contract',
    value: 50000,
    stage: 'CLOSED_WON',
    probability: 100,
    owner_id: 'user-001',
    owner_name: 'Alice Sales',
    created_at: '2025-06-01T10:00:00Z',
    updated_at: '2025-07-15T14:30:00Z',
  },
  {
    _id: 'opp-003',
    customer_id: 'cust-001',
    customer_name: 'Acme Corporation',
    title: 'Training Package',
    value: 25000,
    stage: 'CLOSED_LOST',
    probability: 0,
    owner_id: 'user-002',
    owner_name: 'Bob Sales',
    created_at: '2025-09-01T10:00:00Z',
    updated_at: '2025-10-01T10:00:00Z',
  },
];

describe('CustomerDetail', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    mockOnClose.mockReset();
  });

  describe('Company Information', () => {
    test('displays company name as header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(
        <CustomerDetail
          customer={mockCustomer}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText('Acme Corporation')).toBeInTheDocument();
    });

    test('displays industry badge', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(
        <CustomerDetail
          customer={mockCustomer}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText('Technology')).toBeInTheDocument();
    });

    test('displays website as clickable link', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(
        <CustomerDetail
          customer={mockCustomer}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      const link = screen.getByTestId('website-link');
      expect(link).toHaveAttribute('href', 'https://acme.com');
      expect(link).toHaveAttribute('target', '_blank');
    });

    test('displays full address', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(
        <CustomerDetail
          customer={mockCustomer}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText('San Francisco, CA, USA')).toBeInTheDocument();
    });

    test('displays customer since date', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(
        <CustomerDetail
          customer={mockCustomer}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText(/June 2025/)).toBeInTheDocument();
    });
  });

  describe('Contact Information', () => {
    test('displays primary contact details', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(
        <CustomerDetail
          customer={mockCustomer}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText('John Smith')).toBeInTheDocument();
      expect(screen.getByText('john@acme.com')).toBeInTheDocument();
      expect(screen.getByText('+1-555-0101')).toBeInTheDocument();
    });

    test('displays all contacts when multiple exist', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(
        <CustomerDetail
          customer={mockCustomerWithContacts}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      // Primary contact
      expect(screen.getByText('John Smith')).toBeInTheDocument();
      // Additional contacts
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
      expect(screen.getByText('Bob Wilson')).toBeInTheDocument();
    });

    test('email links open mailto', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(
        <CustomerDetail
          customer={mockCustomer}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      const emailLink = screen.getByText('john@acme.com');
      expect(emailLink).toHaveAttribute('href', 'mailto:john@acme.com');
    });

    test('phone links open tel', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(
        <CustomerDetail
          customer={mockCustomer}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      const phoneLink = screen.getByText('+1-555-0101');
      expect(phoneLink).toHaveAttribute('href', 'tel:+1-555-0101');
    });
  });

  describe('Opportunities Section', () => {
    test('displays list of customer opportunities', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ status: 'success', data: mockCustomerOpportunities }),
      });

      render(
        <CustomerDetail
          customer={mockCustomer}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByText('Enterprise License Deal')).toBeInTheDocument();
        expect(screen.getByText('Support Contract')).toBeInTheDocument();
        expect(screen.getByText('Training Package')).toBeInTheDocument();
      });
    });

    test('displays total deal count', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ status: 'success', data: mockCustomerOpportunities }),
      });

      render(
        <CustomerDetail
          customer={mockCustomer}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByText('3 Deals')).toBeInTheDocument();
      });
    });

    test('displays total revenue from won deals', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ status: 'success', data: mockCustomerOpportunities }),
      });

      render(
        <CustomerDetail
          customer={mockCustomer}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        // Only CLOSED_WON: $50,000
        // Use testId to avoid matching table row with same value
        expect(screen.getByTestId('total-revenue-card')).toBeInTheDocument();
        expect(screen.getByTestId('total-revenue-card')).toHaveTextContent('$50,000');
        expect(screen.getByTestId('total-revenue-card')).toHaveTextContent('Total Revenue');
      });
    });

    test('displays open pipeline value', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ status: 'success', data: mockCustomerOpportunities }),
      });

      render(
        <CustomerDetail
          customer={mockCustomer}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        // Only NEGOTIATION: $150,000
        // Use testId to avoid matching table row with same value
        expect(screen.getByTestId('pipeline-card')).toBeInTheDocument();
        expect(screen.getByTestId('pipeline-card')).toHaveTextContent('$150,000');
        expect(screen.getByTestId('pipeline-card')).toHaveTextContent('in Pipeline');
      });
    });

    test('shows stage badge for each opportunity', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ status: 'success', data: mockCustomerOpportunities }),
      });

      render(
        <CustomerDetail
          customer={mockCustomer}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByText('NEGOTIATION')).toBeInTheDocument();
        expect(screen.getByText('CLOSED WON')).toBeInTheDocument();
        expect(screen.getByText('CLOSED LOST')).toBeInTheDocument();
      });
    });
  });

  describe('Actions', () => {
    test('delete button visible for sales-write role', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(
        <CustomerDetail
          customer={mockCustomer}
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
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(
        <CustomerDetail
          customer={mockCustomer}
          onClose={mockOnClose}
          canWrite={false}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.queryByTestId('delete-button')).not.toBeInTheDocument();
    });

    test('delete triggers v1.4 confirmation flow', async () => {
      const user = userEvent.setup();

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              status: 'pending_confirmation',
              confirmationId: 'conf-123',
              message: 'Delete customer Acme Corporation?',
            }),
        });

      render(
        <CustomerDetail
          customer={mockCustomer}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      await user.click(screen.getByTestId('delete-button'));

      await waitFor(() => {
        expect(screen.getByTestId('approval-card')).toBeInTheDocument();
      });
    });
  });

  describe('Modal Behavior', () => {
    test('close button dismisses modal', async () => {
      const user = userEvent.setup();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(
        <CustomerDetail
          customer={mockCustomer}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      await user.click(screen.getByTestId('close-button'));
      expect(mockOnClose).toHaveBeenCalled();
    });

    test('escape key closes modal', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(
        <CustomerDetail
          customer={mockCustomer}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Loading and Error States', () => {
    test('shows loading state for opportunities', async () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));

      render(
        <CustomerDetail
          customer={mockCustomer}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId('opportunities-loading')).toBeInTheDocument();
    });

    test('shows empty state when no opportunities', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(
        <CustomerDetail
          customer={mockCustomer}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByTestId('no-opportunities')).toBeInTheDocument();
        expect(screen.getByText('No deals yet')).toBeInTheDocument();
      });
    });

    test('handles opportunities fetch error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Failed to fetch'));

      render(
        <CustomerDetail
          customer={mockCustomer}
          onClose={mockOnClose}
          canWrite={true}
        />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByTestId('opportunities-error')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
      });
    });
  });
});
