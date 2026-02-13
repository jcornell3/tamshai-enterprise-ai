/**
 * CustomersPage Tests - GREEN PHASE
 *
 * Tests for the Customers list page with search, filter, and actions.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import CustomersPage from '../pages/CustomersPage';
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
const mockCustomers: Customer[] = [
  {
    _id: 'cust-001',
    company_name: 'Acme Corporation',
    industry: 'Technology',
    website: 'https://acme.com',
    primary_contact: { name: 'John Smith', email: 'john@acme.com', phone: '+1-555-0101' },
    address: { city: 'San Francisco', state: 'CA', country: 'USA' },
    created_at: '2025-06-15T10:00:00Z',
    updated_at: '2026-01-02T14:30:00Z',
  },
  {
    _id: 'cust-002',
    company_name: 'TechStart Inc',
    industry: 'Technology',
    website: 'https://techstart.io',
    primary_contact: { name: 'Jane Doe', email: 'jane@techstart.io' },
    address: { city: 'Austin', state: 'TX', country: 'USA' },
    created_at: '2025-09-01T08:00:00Z',
    updated_at: '2026-01-01T10:00:00Z',
  },
  {
    _id: 'cust-003',
    company_name: 'Global Industries',
    industry: 'Manufacturing',
    primary_contact: { name: 'Bob Johnson', email: 'bob@globalind.com', phone: '+1-555-0303' },
    address: { city: 'Chicago', state: 'IL', country: 'USA' },
    created_at: '2025-03-20T12:00:00Z',
    updated_at: '2025-12-15T16:00:00Z',
  },
  {
    _id: 'cust-004',
    company_name: 'Healthcare Plus',
    industry: 'Healthcare',
    primary_contact: { name: 'Sarah Wilson', email: 'sarah@healthcareplus.org' },
    address: { city: 'Boston', state: 'MA', country: 'USA' },
    created_at: '2025-11-10T09:00:00Z',
    updated_at: '2026-01-03T11:00:00Z',
  },
];

// Mock opportunities for revenue
const mockOpportunities: Opportunity[] = [
  { _id: 'opp-1', customer_id: 'cust-001', customer_name: 'Acme Corporation', title: 'Deal 1', value: 150000, stage: 'CLOSED_WON', probability: 100, owner_id: 'u1', created_at: '', updated_at: '' },
  { _id: 'opp-3', customer_id: 'cust-003', customer_name: 'Global Industries', title: 'Deal 3', value: 500000, stage: 'CLOSED_WON', probability: 100, owner_id: 'u2', created_at: '', updated_at: '' },
];

describe('CustomersPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('Customer List', () => {
    test('displays customer table with correct columns', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'success', data: mockCustomers }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'success', data: mockOpportunities }) });

      render(<CustomersPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        // Use getAllByRole to find table headers specifically, as some text appears in multiple places
        const headers = screen.getAllByRole('columnheader');
        const headerTexts = headers.map(h => h.textContent);
        expect(headerTexts).toContain('Company Name');
        expect(headerTexts).toContain('Industry');
        expect(headerTexts).toContain('Primary Contact');
        expect(headerTexts).toContain('Location');
        expect(headerTexts).toContain('Actions');
      });
    });

    test('displays all customers from API', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'success', data: mockCustomers }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'success', data: mockOpportunities }) });

      render(<CustomersPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Acme Corporation')).toBeInTheDocument();
        expect(screen.getByText('TechStart Inc')).toBeInTheDocument();
        expect(screen.getByText('Global Industries')).toBeInTheDocument();
        expect(screen.getByText('Healthcare Plus')).toBeInTheDocument();
      });
    });

    test('displays company name as clickable link', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'success', data: mockCustomers }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'success', data: mockOpportunities }) });

      render(<CustomersPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('company-link-cust-001')).toBeInTheDocument();
      });
    });

    test('displays primary contact email', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'success', data: mockCustomers }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'success', data: mockOpportunities }) });

      render(<CustomersPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        const emailLink = screen.getByText('john@acme.com');
        expect(emailLink).toHaveAttribute('href', 'mailto:john@acme.com');
      });
    });

    test('displays location as city, state', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'success', data: mockCustomers }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'success', data: mockOpportunities }) });

      render(<CustomersPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('San Francisco, CA')).toBeInTheDocument();
        expect(screen.getByText('Austin, TX')).toBeInTheDocument();
      });
    });
  });

  describe('Search and Filter', () => {
    test('searches customers by company name', async () => {
      const user = userEvent.setup();

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'success', data: mockCustomers }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'success', data: mockOpportunities }) });

      render(<CustomersPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Acme Corporation')).toBeInTheDocument();
      });

      await user.type(screen.getByTestId('search-input'), 'Acme');

      expect(screen.getByText('Acme Corporation')).toBeInTheDocument();
      expect(screen.queryByText('TechStart Inc')).not.toBeInTheDocument();
    });

    test('filters customers by industry', async () => {
      const user = userEvent.setup();

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'success', data: mockCustomers }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'success', data: mockOpportunities }) });

      render(<CustomersPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Acme Corporation')).toBeInTheDocument();
      });

      await user.selectOptions(screen.getByTestId('industry-filter'), 'Healthcare');

      expect(screen.getByText('Healthcare Plus')).toBeInTheDocument();
      expect(screen.queryByText('Acme Corporation')).not.toBeInTheDocument();
    });

    test('shows no results message when search has no matches', async () => {
      const user = userEvent.setup();

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'success', data: mockCustomers }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'success', data: mockOpportunities }) });

      render(<CustomersPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Acme Corporation')).toBeInTheDocument();
      });

      await user.type(screen.getByTestId('search-input'), 'ZZZZNONEXISTENT');

      expect(screen.getByTestId('no-results')).toBeInTheDocument();
    });

    test('clear filters button resets all filters', async () => {
      const user = userEvent.setup();

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'success', data: mockCustomers }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'success', data: mockOpportunities }) });

      render(<CustomersPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Acme Corporation')).toBeInTheDocument();
      });

      await user.type(screen.getByTestId('search-input'), 'Acme');

      await user.click(screen.getByTestId('clear-filters'));

      await waitFor(() => {
        expect(screen.getByText('TechStart Inc')).toBeInTheDocument();
      });
    });
  });

  describe('Stats Cards', () => {
    test('displays total customers count', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'success', data: mockCustomers }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'success', data: mockOpportunities }) });

      render(<CustomersPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('total-customers-card')).toBeInTheDocument();
        expect(screen.getByText('4 Customers')).toBeInTheDocument();
      });
    });

    test('displays total revenue from won deals', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'success', data: mockCustomers }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'success', data: mockOpportunities }) });

      render(<CustomersPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('total-revenue-card')).toBeInTheDocument();
        // 150000 + 500000 = 650000
        expect(screen.getByText('$650,000')).toBeInTheDocument();
      });
    });

    test('displays industry breakdown', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'success', data: mockCustomers }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'success', data: mockOpportunities }) });

      render(<CustomersPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('industry-breakdown-card')).toBeInTheDocument();
      });
    });
  });

  describe('Actions', () => {
    test('view details button opens customer detail', async () => {
      const user = userEvent.setup();

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'success', data: mockCustomers }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'success', data: mockOpportunities }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'success', data: [] }) });

      render(<CustomersPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('view-details-cust-001')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('view-details-cust-001'));

      await waitFor(() => {
        expect(screen.getByTestId('customer-detail-modal')).toBeInTheDocument();
      });
    });
  });

  describe('Pagination', () => {
    test('displays truncation warning for 50+ customers', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            status: 'success',
            data: mockCustomers,
            metadata: { truncated: true, totalCount: '50+', returnedCount: 50, hasMore: true },
          }),
        })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'success', data: mockOpportunities }) });

      render(<CustomersPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('truncation-warning')).toBeInTheDocument();
      });
    });

    test('Load More button fetches next page', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            status: 'success',
            data: mockCustomers.slice(0, 2),
            metadata: { hasMore: true, nextCursor: 'cursor-2' },
          }),
        })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'success', data: mockOpportunities }) });

      render(<CustomersPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('load-more')).toBeInTheDocument();
      });
    });
  });

  describe('Loading and Error States', () => {
    test('shows loading skeleton while fetching', async () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));

      render(<CustomersPage />, { wrapper: createWrapper() });

      expect(screen.getByTestId('loading')).toBeInTheDocument();
    });

    test('shows error state on API failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      render(<CustomersPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('error')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
      });
    });

    test('shows empty state when no customers exist', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(<CustomersPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('empty-state')).toBeInTheDocument();
        expect(screen.getByText('No customers found')).toBeInTheDocument();
      });
    });
  });
});
