/**
 * DashboardPage Tests - GREEN PHASE
 *
 * Tests for the Support Dashboard page with ticket metrics,
 * distribution charts, and recent activity.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import DashboardPage from '../pages/DashboardPage';

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

// Mock navigation
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

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

// Mock ticket data for testing
const mockTickets = [
  { id: '1', title: 'Login Issue', status: 'open', priority: 'critical', created_at: '2026-01-01T00:00:00Z' },
  { id: '2', title: 'Password Reset', status: 'open', priority: 'high', created_at: '2026-01-01T00:00:00Z' },
  { id: '3', title: 'Account Access', status: 'in_progress', priority: 'medium', created_at: '2026-01-01T00:00:00Z' },
  { id: '4', title: 'Email Config', status: 'resolved', priority: 'low', created_at: '2026-01-01T00:00:00Z' },
  { id: '5', title: 'VPN Setup', status: 'closed', priority: 'low', created_at: '2026-01-01T00:00:00Z', closed_at: '2026-01-02T00:00:00Z' },
];

const mockKBArticles = [
  { id: '1', title: 'How to Reset Password', category: 'Account', views: 150 },
  { id: '2', title: 'VPN Setup Guide', category: 'Network', views: 120 },
  { id: '3', title: 'Email Configuration', category: 'Email', views: 100 },
];

describe('DashboardPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockNavigate.mockReset();
  });

  describe('Stats Cards', () => {
    test('displays open tickets count', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockTickets }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockKBArticles }),
        });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('open-tickets-card')).toBeInTheDocument();
      });

      expect(screen.getByTestId('open-tickets-count')).toHaveTextContent('2');
    });

    test('displays critical tickets count', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockTickets }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockKBArticles }),
        });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('critical-tickets-card')).toBeInTheDocument();
      });

      expect(screen.getByTestId('critical-tickets-count')).toHaveTextContent('1');
    });

    test('displays average resolution time', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockTickets }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockKBArticles }),
        });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('resolution-time-card')).toBeInTheDocument();
      });

      expect(screen.getByTestId('avg-resolution-time')).toBeInTheDocument();
    });

    test('displays SLA compliance rate', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockTickets }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockKBArticles }),
        });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('sla-compliance-card')).toBeInTheDocument();
      });

      expect(screen.getByTestId('sla-compliance-rate')).toBeInTheDocument();
    });
  });

  describe('Ticket Distribution', () => {
    test('displays ticket count by status', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockTickets }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockKBArticles }),
        });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('status-distribution')).toBeInTheDocument();
      });

      expect(screen.getByTestId('status-open-count')).toHaveTextContent('2');
      expect(screen.getByTestId('status-in_progress-count')).toHaveTextContent('1');
      expect(screen.getByTestId('status-resolved-count')).toHaveTextContent('1');
      expect(screen.getByTestId('status-closed-count')).toHaveTextContent('1');
    });

    test('displays ticket count by priority', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockTickets }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockKBArticles }),
        });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('priority-distribution')).toBeInTheDocument();
      });

      expect(screen.getByTestId('priority-critical-count')).toHaveTextContent('1');
      expect(screen.getByTestId('priority-high-count')).toHaveTextContent('1');
      expect(screen.getByTestId('priority-medium-count')).toHaveTextContent('1');
      expect(screen.getByTestId('priority-low-count')).toHaveTextContent('2');
    });
  });

  describe('Recent Activity', () => {
    test('displays urgent tickets section', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockTickets }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockKBArticles }),
        });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('urgent-tickets')).toBeInTheDocument();
      });
    });

    test('displays top KB articles', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockTickets }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockKBArticles }),
        });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('top-articles')).toBeInTheDocument();
      });

      expect(screen.getByText('How to Reset Password')).toBeInTheDocument();
    });

    test('clicking ticket navigates to ticket detail', async () => {
      const user = userEvent.setup();

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockTickets }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockKBArticles }),
        });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('urgent-ticket-1')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('urgent-ticket-1'));
      expect(mockNavigate).toHaveBeenCalledWith('/tickets/1');
    });
  });

  describe('Loading and Error States', () => {
    test('shows loading state initially', async () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));

      render(<DashboardPage />, { wrapper: createWrapper() });

      expect(screen.getByTestId('loading-state')).toBeInTheDocument();
    });

    test('handles API error gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('API Error'));

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('error-state')).toBeInTheDocument();
      });
    });

    test('shows empty state when no tickets exist', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: [] }),
        });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('empty-state')).toBeInTheDocument();
      });
    });
  });

  describe('Refresh Functionality', () => {
    test('refresh button is visible when data loads', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockTickets }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockKBArticles }),
        });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('refresh-button')).toBeInTheDocument();
      });
    });

    test('refresh button triggers data reload', async () => {
      const user = userEvent.setup();

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockTickets }),
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('refresh-button')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('refresh-button'));

      // Verify fetch was called again for refresh
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(4); // Initial 2 + refresh 2
      });
    });
  });
});
