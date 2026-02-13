/**
 * SLAPage Tests
 *
 * Tests for the SLA Tracking page including:
 * - SLA compliance summary cards
 * - Compliance by tier breakdown
 * - At-risk tickets list
 * - Assign/escalate actions
 * - Truncation warnings
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import SLAPage from '../pages/SLAPage';
import type { SLASummary, SLAStatus } from '../types';

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
const mockSLASummary: SLASummary = {
  overall_compliance: 92,
  tickets_within_sla: 46,
  tickets_at_risk: 3,
  tickets_breached: 1,
  by_tier: [
    { tier: 'enterprise', compliance: 98, total: 20, breached: 0 },
    { tier: 'professional', compliance: 94, total: 20, breached: 1 },
    { tier: 'starter', compliance: 85, total: 10, breached: 0 },
  ],
  breach_reasons: [
    { reason: 'Agent overload', count: 2 },
    { reason: 'Complex issue', count: 1 },
  ],
};

const mockSLATickets: SLAStatus[] = [
  {
    ticket_id: 'TKT-001',
    ticket_title: 'Login issues after update',
    customer_name: 'Acme Corp',
    customer_tier: 'enterprise',
    priority: 'critical',
    time_remaining_minutes: 30,
    is_breached: false,
    is_at_risk: true,
    assigned_to: null,
    created_at: '2026-02-01T10:00:00Z',
  },
  {
    ticket_id: 'TKT-002',
    ticket_title: 'Performance degradation',
    customer_name: 'Beta Inc',
    customer_tier: 'professional',
    priority: 'high',
    time_remaining_minutes: -60,
    is_breached: true,
    is_at_risk: false,
    assigned_to: 'agent-001',
    created_at: '2026-02-01T08:00:00Z',
  },
  {
    ticket_id: 'TKT-003',
    ticket_title: 'Feature request',
    customer_name: 'Gamma LLC',
    customer_tier: 'starter',
    priority: 'medium',
    time_remaining_minutes: 120,
    is_breached: false,
    is_at_risk: true,
    assigned_to: null,
    created_at: '2026-02-01T09:00:00Z',
  },
];

describe('SLAPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('Summary Cards', () => {
    test('displays overall compliance', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockSLASummary }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockSLATickets }),
        });

      render(<SLAPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('overall-compliance')).toHaveTextContent('92%');
      });
    });

    test('displays tickets within SLA', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockSLASummary }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockSLATickets }),
        });

      render(<SLAPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('tickets-within-sla')).toHaveTextContent('46');
      });
    });

    test('displays at-risk and breached counts', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockSLASummary }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockSLATickets }),
        });

      render(<SLAPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('tickets-at-risk')).toHaveTextContent('3');
      });

      expect(screen.getByTestId('tickets-breached')).toHaveTextContent('1');
    });
  });

  describe('Compliance by Tier', () => {
    test('displays SLA policies for each tier', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockSLASummary }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockSLATickets }),
        });

      render(<SLAPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        // Tier names may appear in multiple places (summary, breakdown, tickets)
        expect(screen.getAllByText('Starter').length).toBeGreaterThan(0);
      });

      expect(screen.getAllByText('Professional').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Enterprise').length).toBeGreaterThan(0);
    });

    test('displays compliance percentage by tier', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockSLASummary }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockSLATickets }),
        });

      render(<SLAPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('98% compliant')).toBeInTheDocument();
      });

      expect(screen.getByText('94% compliant')).toBeInTheDocument();
      expect(screen.getByText('85% compliant')).toBeInTheDocument();
    });
  });

  describe('At-Risk Tickets Table', () => {
    test('displays tickets requiring attention', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockSLASummary }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockSLATickets }),
        });

      render(<SLAPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('TKT-001')).toBeInTheDocument();
      });

      expect(screen.getByText('Login issues after update')).toBeInTheDocument();
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });

    test('shows breached status for overdue tickets', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockSLASummary }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockSLATickets }),
        });

      render(<SLAPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        // Multiple tickets can show "Breached" status
        expect(screen.getAllByText('Breached').length).toBeGreaterThan(0);
      });
    });

    test('shows empty state when all tickets are on track', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockSLASummary }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: [] }),
        });

      render(<SLAPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('empty-state')).toBeInTheDocument();
      });

      expect(screen.getByText('All tickets are on track')).toBeInTheDocument();
    });
  });

  describe('Filtering', () => {
    test('filters by status', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockSLASummary }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockSLATickets }),
        });

      render(<SLAPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('status-filter')).toBeInTheDocument();
      });

      const statusFilter = screen.getByTestId('status-filter');
      fireEvent.change(statusFilter, { target: { value: 'breached' } });

      // Verify filter is set
      expect(statusFilter).toHaveValue('breached');
    });

    test('filters by tier', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockSLASummary }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockSLATickets }),
        });

      render(<SLAPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('tier-filter')).toBeInTheDocument();
      });

      const tierFilter = screen.getByTestId('tier-filter');
      fireEvent.change(tierFilter, { target: { value: 'enterprise' } });

      expect(tierFilter).toHaveValue('enterprise');
    });
  });

  describe('Actions', () => {
    test('shows assign button for unassigned tickets', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockSLASummary }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockSLATickets }),
        });

      render(<SLAPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getAllByTestId('assign-button')).toHaveLength(2);
      });
    });

    test('shows escalate button for all tickets', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockSLASummary }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockSLATickets }),
        });

      render(<SLAPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getAllByTestId('escalate-button')).toHaveLength(3);
      });
    });
  });

  describe('Loading and Error States', () => {
    test('shows loading state while fetching', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));

      render(<SLAPage />, { wrapper: createWrapper() });

      expect(screen.getByTestId('sla-loading')).toBeInTheDocument();
    });

    test('shows error state on API failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      render(<SLAPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('error-state')).toBeInTheDocument();
      });
    });
  });

  describe('Truncation Warning', () => {
    test('displays truncation warning when data is truncated', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockSLASummary }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            status: 'success',
            data: mockSLATickets,
            metadata: {
              truncated: true,
              totalCount: '50+',
              warning: 'Results truncated to 50 records',
            },
          }),
        });

      render(<SLAPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        // May have multiple truncation warnings from different data sources
        const warnings = screen.queryAllByTestId('truncation-warning');
        expect(warnings.length).toBeGreaterThan(0);
      });
    });
  });
});
