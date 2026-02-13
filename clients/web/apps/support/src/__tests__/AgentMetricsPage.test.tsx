/**
 * AgentMetricsPage Tests
 *
 * Tests for the Agent Performance page including:
 * - Team summary cards
 * - Agent leaderboard
 * - Sortable columns
 * - Period selection
 * - Truncation warnings
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import AgentMetricsPage from '../pages/AgentMetricsPage';
import type { AgentPerformanceSummary, AgentMetrics } from '../types';

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
const mockAgents: AgentMetrics[] = [
  {
    agent_id: 'agent-001',
    agent_name: 'Alice Support',
    tickets_resolved: 85,
    avg_resolution_minutes: 45,
    avg_first_response_minutes: 8,
    sla_compliance_percent: 98,
    csat_score: 4.8,
    csat_responses: 42,
    reopen_rate: 2.5,
    current_workload: 8,
  },
  {
    agent_id: 'agent-002',
    agent_name: 'Bob Support',
    tickets_resolved: 72,
    avg_resolution_minutes: 60,
    avg_first_response_minutes: 12,
    sla_compliance_percent: 92,
    csat_score: 4.5,
    csat_responses: 38,
    reopen_rate: 4.0,
    current_workload: 12,
  },
  {
    agent_id: 'agent-003',
    agent_name: 'Carol Support',
    tickets_resolved: 65,
    avg_resolution_minutes: 90,
    avg_first_response_minutes: 15,
    sla_compliance_percent: 85,
    csat_score: 4.2,
    csat_responses: 30,
    reopen_rate: 6.0,
    current_workload: 22,
  },
];

const mockPerformance: AgentPerformanceSummary = {
  period: '30d',
  period_label: 'Last 30 Days',
  team_resolved: 222,
  team_avg_resolution_minutes: 65,
  team_sla_compliance: 92,
  team_csat: 4.5,
  agents: mockAgents,
};

describe('AgentMetricsPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('Team Summary Cards', () => {
    test('displays team resolved count', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockPerformance }),
      });

      render(<AgentMetricsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('team-resolved')).toHaveTextContent('222');
      });
    });

    test('displays average resolution time', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockPerformance }),
      });

      render(<AgentMetricsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('team-avg-resolution')).toHaveTextContent('1h 5m');
      });
    });

    test('displays team SLA compliance', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockPerformance }),
      });

      render(<AgentMetricsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('team-sla')).toHaveTextContent('92%');
      });
    });

    test('displays team CSAT score', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockPerformance }),
      });

      render(<AgentMetricsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('team-csat')).toHaveTextContent('4.5');
      });
    });
  });

  describe('Agent Leaderboard', () => {
    test('displays all agents in table', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockPerformance }),
      });

      render(<AgentMetricsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Alice Support')).toBeInTheDocument();
      });

      expect(screen.getByText('Bob Support')).toBeInTheDocument();
      expect(screen.getByText('Carol Support')).toBeInTheDocument();
    });

    test('displays rank badges', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockPerformance }),
      });

      render(<AgentMetricsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('1')).toBeInTheDocument();
        expect(screen.getByText('2')).toBeInTheDocument();
        expect(screen.getByText('3')).toBeInTheDocument();
      });
    });

    test('displays agent metrics', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockPerformance }),
      });

      render(<AgentMetricsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('85')).toBeInTheDocument(); // Alice resolved
      });

      expect(screen.getByText('98%')).toBeInTheDocument(); // Alice SLA
      expect(screen.getByText('4.8')).toBeInTheDocument(); // Alice CSAT
    });

    test('shows empty state when no agents', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          status: 'success',
          data: { ...mockPerformance, agents: [] },
        }),
      });

      render(<AgentMetricsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('empty-state')).toBeInTheDocument();
      });
    });
  });

  describe('Sorting', () => {
    test('sorts by tickets resolved by default', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockPerformance }),
      });

      render(<AgentMetricsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        const agentRows = screen.getAllByTestId('agent-row');
        // Default sort by tickets_resolved descending - Alice (85) first
        expect(agentRows[0]).toHaveTextContent('Alice Support');
        expect(agentRows[1]).toHaveTextContent('Bob Support');
        expect(agentRows[2]).toHaveTextContent('Carol Support');
      });
    });

    test('clicking column header changes sort', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockPerformance }),
      });

      render(<AgentMetricsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Alice Support')).toBeInTheDocument();
      });

      // Click CSAT column to sort by it
      const csatHeader = screen.getByText('CSAT');
      fireEvent.click(csatHeader);

      // Should now be sorted by CSAT (descending - highest first)
      await waitFor(() => {
        const agentRows = screen.getAllByTestId('agent-row');
        expect(agentRows[0]).toHaveTextContent('Alice Support'); // 4.8 CSAT
      });
    });
  });

  describe('Period Selection', () => {
    test('displays period selector', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockPerformance }),
      });

      render(<AgentMetricsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('period-select')).toBeInTheDocument();
      });
    });

    test('allows changing period', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockPerformance }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockPerformance }),
        });

      render(<AgentMetricsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('period-select')).toBeInTheDocument();
      });

      const periodSelect = screen.getByTestId('period-select');
      fireEvent.change(periodSelect, { target: { value: '7d' } });

      expect(periodSelect).toHaveValue('7d');
    });
  });

  describe('Loading and Error States', () => {
    test('shows loading state while fetching', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));

      render(<AgentMetricsPage />, { wrapper: createWrapper() });

      expect(screen.getByTestId('metrics-loading')).toBeInTheDocument();
    });

    test('shows error state on API failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      render(<AgentMetricsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('error-state')).toBeInTheDocument();
      });
    });
  });

  describe('Truncation Warning', () => {
    test('displays truncation warning when data is truncated', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          status: 'success',
          data: mockPerformance,
          metadata: {
            truncated: true,
            totalCount: '50+',
            warning: 'Results truncated to 50 records',
          },
        }),
      });

      render(<AgentMetricsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        // May have multiple truncation warnings from different data sources
        const warnings = screen.queryAllByTestId('truncation-warning');
        expect(warnings.length).toBeGreaterThan(0);
      });
    });
  });
});
