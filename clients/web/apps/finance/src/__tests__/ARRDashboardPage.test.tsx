/**
 * ARRDashboardPage Tests
 *
 * Tests for the ARR Dashboard page including:
 * - SaaS metrics display (ARR, MRR, NRR, GRR, ARPU)
 * - ARR movement table
 * - Cohort retention analysis
 * - At-risk subscriptions
 * - Truncation warnings
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ARRDashboardPage } from '../pages/ARRDashboardPage';
import type { ARRMetrics, ARRMovement, CustomerCohort, Subscription } from '../types';

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
const mockARRMetrics: ARRMetrics = {
  arr: 1500000,
  mrr: 125000,
  net_new_arr: 45000,
  gross_revenue_retention: 92,
  net_revenue_retention: 108,
  arpu: 15000,
  active_subscriptions: 100,
  as_of_date: '2026-02-01',
};

const mockARRMovement: ARRMovement[] = [
  {
    period: '2026-01',
    period_label: 'January 2026',
    starting_arr: 1400000,
    new_arr: 60000,
    expansion_arr: 25000,
    churn_arr: 30000,
    net_new_arr: 55000,
    ending_arr: 1455000,
  },
  {
    period: '2026-02',
    period_label: 'February 2026',
    starting_arr: 1455000,
    new_arr: 50000,
    expansion_arr: 20000,
    churn_arr: 25000,
    net_new_arr: 45000,
    ending_arr: 1500000,
  },
];

const mockCohorts: CustomerCohort[] = [
  {
    cohort_month: '2025-01',
    cohort_label: 'Jan 2025',
    customer_count: 20,
    initial_arr: 200000,
    months: [
      { month_offset: 1, remaining_customers: 19, retention_percent: 95, arr_retained: 190000, revenue_retention_percent: 95 },
      { month_offset: 2, remaining_customers: 18, retention_percent: 90, arr_retained: 185000, revenue_retention_percent: 92.5 },
      { month_offset: 3, remaining_customers: 17, retention_percent: 85, arr_retained: 180000, revenue_retention_percent: 90 },
    ],
  },
];

const mockAtRiskSubscriptions: Subscription[] = [
  {
    subscription_id: 'sub-001',
    customer_id: 'cust-001',
    customer_name: 'Acme Corp',
    plan_name: 'Enterprise',
    plan_tier: 'enterprise',
    billing_cycle: 'annual',
    mrr: 5000,
    arr: 60000,
    start_date: '2025-02-01',
    renewal_date: '2026-02-01',
    status: 'active',
    churn_reason: 'Low engagement',
  },
];

describe('ARRDashboardPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('Key Metrics Cards', () => {
    test('displays ARR with proper formatting', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockARRMetrics }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockARRMovement }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockCohorts }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockAtRiskSubscriptions }),
        });

      render(<ARRDashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('arr-value')).toHaveTextContent('$1.50M');
      });
    });

    test('displays MRR with active subscription count', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockARRMetrics }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockARRMovement }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockCohorts }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockAtRiskSubscriptions }),
        });

      render(<ARRDashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('mrr-value')).toHaveTextContent('$125K');
      });

      expect(screen.getByText('100 active subscriptions')).toBeInTheDocument();
    });

    test('displays Net New ARR with correct color', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockARRMetrics }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockARRMovement }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockCohorts }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockAtRiskSubscriptions }),
        });

      render(<ARRDashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('net-new-arr-value')).toHaveTextContent('$45K');
      });
    });

    test('displays NRR with growth indicator when >= 100%', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockARRMetrics }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockARRMovement }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockCohorts }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockAtRiskSubscriptions }),
        });

      render(<ARRDashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('nrr-value')).toHaveTextContent('108.0%');
      });

      expect(screen.getByText('Growing existing base')).toBeInTheDocument();
    });

    test('displays ARPU', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockARRMetrics }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockARRMovement }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockCohorts }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockAtRiskSubscriptions }),
        });

      render(<ARRDashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('arpu-value')).toHaveTextContent('$15,000');
      });
    });

    test('shows GRR warning when below 90%', async () => {
      const lowGRRMetrics = { ...mockARRMetrics, gross_revenue_retention: 85 };
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: lowGRRMetrics }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockARRMovement }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockCohorts }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: [] }),
        });

      render(<ARRDashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Below benchmark (90%)')).toBeInTheDocument();
      });
    });
  });

  describe('ARR Movement Table', () => {
    test('displays movement data for each period', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockARRMetrics }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockARRMovement }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockCohorts }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockAtRiskSubscriptions }),
        });

      render(<ARRDashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('January 2026')).toBeInTheDocument();
      });

      expect(screen.getByText('February 2026')).toBeInTheDocument();
    });

    test('shows new, expansion, and churn columns', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockARRMetrics }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockARRMovement }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockCohorts }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockAtRiskSubscriptions }),
        });

      render(<ARRDashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('New ARR')).toBeInTheDocument();
      });

      expect(screen.getByText('Expansion')).toBeInTheDocument();
      expect(screen.getByText('Churn')).toBeInTheDocument();
    });
  });

  describe('Cohort Analysis', () => {
    test('displays cohort retention table', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockARRMetrics }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockARRMovement }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockCohorts }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockAtRiskSubscriptions }),
        });

      render(<ARRDashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Cohort Retention Analysis')).toBeInTheDocument();
      });

      expect(screen.getByText('Jan 2025')).toBeInTheDocument();
    });

    test('toggles between customer and revenue view', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockARRMetrics }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockARRMovement }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockCohorts }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockAtRiskSubscriptions }),
        });

      render(<ARRDashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Customer' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Revenue' }));

      // Should show revenue retention percentages now
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Revenue' })).toHaveClass('btn-primary');
      });
    });
  });

  describe('At-Risk Subscriptions', () => {
    test('displays at-risk subscriptions table', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockARRMetrics }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockARRMovement }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockCohorts }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockAtRiskSubscriptions }),
        });

      render(<ARRDashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Acme Corp')).toBeInTheDocument();
      });

      expect(screen.getByText('Low engagement')).toBeInTheDocument();
    });

    test('shows success message when no at-risk subscriptions', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockARRMetrics }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockARRMovement }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockCohorts }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: [] }),
        });

      render(<ARRDashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('No at-risk subscriptions')).toBeInTheDocument();
      });
    });
  });

  describe('Loading and Error States', () => {
    test('shows loading skeleton while fetching', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));

      render(<ARRDashboardPage />, { wrapper: createWrapper() });

      expect(screen.getByTestId('arr-dashboard-loading')).toBeInTheDocument();
    });

    test('shows error state on API failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      render(<ARRDashboardPage />, { wrapper: createWrapper() });

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
          json: () => Promise.resolve({ status: 'success', data: mockARRMetrics }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockARRMovement }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockCohorts }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            status: 'success',
            data: mockAtRiskSubscriptions,
            metadata: {
              truncated: true,
              totalCount: '50+',
              warning: 'Results truncated to 50 records',
            },
          }),
        });

      render(<ARRDashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        // May have multiple truncation warnings if multiple APIs return truncated data
        const warnings = screen.queryAllByTestId('truncation-warning');
        expect(warnings.length).toBeGreaterThan(0);
      });
    });
  });
});
