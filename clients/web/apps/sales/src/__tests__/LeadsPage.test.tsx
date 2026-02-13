/**
 * LeadsPage Tests
 *
 * Tests for the Lead Management page including:
 * - Lead list display
 * - Status filtering and search
 * - Score visualization
 * - Convert to Opportunity action
 * - Truncation warnings
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import LeadsPage from '../pages/LeadsPage';
import type { Lead } from '../types';

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

// Mock data with correct LeadScore structure
const mockLeads: Lead[] = [
  {
    _id: 'lead-001',
    company_name: 'Acme Corp',
    contact_name: 'John Smith',
    contact_email: 'john@acme.com',
    status: 'QUALIFIED',
    source: 'Website',
    score: {
      total: 85,
      factors: {
        company_size: 20,
        industry_fit: 25,
        engagement: 20,
        timing: 20,
      },
    },
    owner_id: 'user-001',
    owner_name: 'Test User',
    industry: 'Technology',
    created_at: '2026-01-15T10:00:00Z',
    updated_at: '2026-01-20T10:00:00Z',
    last_activity_date: '2026-01-20T10:00:00Z',
  },
  {
    _id: 'lead-002',
    company_name: 'Beta Inc',
    contact_name: 'Jane Doe',
    contact_email: 'jane@beta.com',
    status: 'NEW',
    source: 'Referral',
    score: {
      total: 45,
      factors: {
        company_size: 10,
        industry_fit: 15,
        engagement: 10,
        timing: 10,
      },
    },
    owner_id: 'user-001',
    owner_name: 'Test User',
    industry: 'Finance',
    created_at: '2026-01-10T10:00:00Z',
    updated_at: '2026-01-15T10:00:00Z',
  },
  {
    _id: 'lead-003',
    company_name: 'Gamma LLC',
    contact_name: 'Bob Wilson',
    contact_email: 'bob@gamma.com',
    status: 'CONTACTED',
    source: 'Trade Show',
    score: {
      total: 25,
      factors: {
        company_size: 5,
        industry_fit: 5,
        engagement: 10,
        timing: 5,
      },
    },
    owner_id: 'user-002',
    owner_name: 'Another User',
    created_at: '2026-01-05T10:00:00Z',
    updated_at: '2026-01-08T10:00:00Z',
  },
];

describe('LeadsPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('Lead List Display', () => {
    test('displays leads table with company and contact info', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockLeads }),
      });

      render(<LeadsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Acme Corp')).toBeInTheDocument();
      });

      expect(screen.getByText('John Smith')).toBeInTheDocument();
      expect(screen.getByText('john@acme.com')).toBeInTheDocument();
      expect(screen.getByText('Beta Inc')).toBeInTheDocument();
      expect(screen.getByText('Gamma LLC')).toBeInTheDocument();
    });

    test('shows loading state while fetching', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));

      render(<LeadsPage />, { wrapper: createWrapper() });

      expect(screen.getByTestId('leads-loading')).toBeInTheDocument();
    });

    test('shows error state on API failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      render(<LeadsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('error-state')).toBeInTheDocument();
      });
    });
  });

  describe('Stats Summary', () => {
    test('displays lead statistics', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockLeads }),
      });

      render(<LeadsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('total-leads')).toHaveTextContent('3');
      });

      expect(screen.getByTestId('new-leads')).toHaveTextContent('1');
      expect(screen.getByTestId('qualified-leads')).toHaveTextContent('1');
    });

    test('displays average score', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockLeads }),
      });

      render(<LeadsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        // Average: (85 + 45 + 25) / 3 = 52
        expect(screen.getByTestId('avg-score')).toHaveTextContent('52');
      });
    });
  });

  describe('Filtering', () => {
    test('filters by status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockLeads }),
      });

      render(<LeadsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Acme Corp')).toBeInTheDocument();
      });

      const statusFilter = screen.getByTestId('status-filter');
      fireEvent.change(statusFilter, { target: { value: 'QUALIFIED' } });

      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
      expect(screen.queryByText('Beta Inc')).not.toBeInTheDocument();
      expect(screen.queryByText('Gamma LLC')).not.toBeInTheDocument();
    });

    test('filters by search query', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockLeads }),
      });

      render(<LeadsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Acme Corp')).toBeInTheDocument();
      });

      const searchFilter = screen.getByTestId('search-filter');
      fireEvent.change(searchFilter, { target: { value: 'jane' } });

      expect(screen.queryByText('Acme Corp')).not.toBeInTheDocument();
      expect(screen.getByText('Beta Inc')).toBeInTheDocument();
    });

    test('filters by score range', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockLeads }),
      });

      render(<LeadsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Acme Corp')).toBeInTheDocument();
      });

      const scoreFilter = screen.getByTestId('score-filter');
      fireEvent.change(scoreFilter, { target: { value: 'high' } });

      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
      expect(screen.queryByText('Beta Inc')).not.toBeInTheDocument();
      expect(screen.queryByText('Gamma LLC')).not.toBeInTheDocument();
    });

    test('shows empty state when no leads match filters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockLeads }),
      });

      render(<LeadsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Acme Corp')).toBeInTheDocument();
      });

      const searchFilter = screen.getByTestId('search-filter');
      fireEvent.change(searchFilter, { target: { value: 'nonexistent' } });

      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
  });

  describe('Lead Score Visualization', () => {
    test('displays score values for each lead', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockLeads }),
      });

      render(<LeadsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('85')).toBeInTheDocument();
      });

      expect(screen.getByText('45')).toBeInTheDocument();
      expect(screen.getByText('25')).toBeInTheDocument();
    });
  });

  describe('Convert to Opportunity', () => {
    test('shows convert button for qualified leads', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockLeads }),
      });

      render(<LeadsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Acme Corp')).toBeInTheDocument();
      });

      // Only qualified leads should have convert button
      const convertButtons = screen.getAllByTestId('convert-button');
      expect(convertButtons).toHaveLength(1);
    });

    test('opens conversion wizard when convert button clicked', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockLeads }),
      });

      render(<LeadsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Acme Corp')).toBeInTheDocument();
      });

      const convertButton = screen.getByTestId('convert-button');
      fireEvent.click(convertButton);

      // Wizard dialog should appear
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('Convert Lead')).toBeInTheDocument();
      });
    });
  });

  describe('Truncation Warning', () => {
    test('displays truncation warning when data is truncated', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          status: 'success',
          data: mockLeads,
          metadata: {
            truncated: true,
            totalCount: '50+',
            warning: 'Results truncated to 50 records',
          },
        }),
      });

      render(<LeadsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        // May have multiple truncation warnings from different data sources
        const warnings = screen.queryAllByTestId('truncation-warning');
        expect(warnings.length).toBeGreaterThan(0);
      });
    });
  });
});
