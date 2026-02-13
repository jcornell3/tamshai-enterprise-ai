/**
 * TicketDetail Tests - GREEN PHASE
 *
 * Tests for the Ticket Detail modal showing ticket information,
 * actions, and related KB articles.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import TicketDetail from '../components/TicketDetail';
import type { Ticket } from '../types';

// Mock auth module with canModifySupport function
vi.mock('@tamshai/auth', () => ({
  useAuth: () => ({
    getAccessToken: () => 'mock-token',
    isAuthenticated: true,
    userContext: { roles: ['support-write'] },
  }),
  canModifySupport: (ctx: any) => ctx?.roles?.includes('support-write'),
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
const mockOpenTicket: Ticket = {
  id: 'ticket-001',
  title: 'Cannot access VPN from home',
  description: 'I am unable to connect to the company VPN when working from home. The client shows "connection timeout" after 30 seconds.',
  status: 'open',
  priority: 'high',
  created_by: 'john.doe',
  assigned_to: 'support-team',
  tags: ['vpn', 'remote-access', 'network'],
  created_at: '2026-01-01T10:00:00Z',
  updated_at: '2026-01-02T14:30:00Z',
};

const mockClosedTicket: Ticket = {
  id: 'ticket-002',
  title: 'Password reset request',
  description: 'User requested password reset for their email account.',
  status: 'closed',
  priority: 'medium',
  created_by: 'jane.smith',
  assigned_to: 'support-team',
  tags: ['password', 'email'],
  created_at: '2026-01-01T08:00:00Z',
  updated_at: '2026-01-01T09:30:00Z',
  resolution: 'Password reset completed. User verified access via test email.',
  closed_at: '2026-01-01T09:30:00Z',
  closed_by: 'alice.support',
};

const mockKBSuggestions = [
  { id: 'kb-1', title: 'VPN Troubleshooting Guide', category: 'Network' },
  { id: 'kb-2', title: 'Remote Access Setup', category: 'Getting Started' },
];

describe('TicketDetail', () => {
  const mockOnClose = vi.fn();
  const mockOnTicketUpdated = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    mockOnClose.mockReset();
    mockOnTicketUpdated.mockReset();
    mockNavigate.mockReset();
  });

  describe('Display - Open Ticket', () => {
    test('displays ticket title', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(
        <TicketDetail
          ticket={mockOpenTicket}
          isOpen={true}
          onClose={mockOnClose}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId('ticket-title')).toBeInTheDocument();
      expect(screen.getByText('Cannot access VPN from home')).toBeInTheDocument();
    });

    test('displays ticket description', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(
        <TicketDetail
          ticket={mockOpenTicket}
          isOpen={true}
          onClose={mockOnClose}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId('ticket-description')).toBeInTheDocument();
      expect(screen.getByText(/connection timeout/)).toBeInTheDocument();
    });

    test('displays status badge for open ticket', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(
        <TicketDetail
          ticket={mockOpenTicket}
          isOpen={true}
          onClose={mockOnClose}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId('ticket-status-badge')).toBeInTheDocument();
      expect(screen.getByText('open')).toBeInTheDocument();
    });

    test('displays priority badge for high priority', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(
        <TicketDetail
          ticket={mockOpenTicket}
          isOpen={true}
          onClose={mockOnClose}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId('ticket-priority-badge')).toBeInTheDocument();
      expect(screen.getByText('high')).toBeInTheDocument();
    });

    test('displays created date', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(
        <TicketDetail
          ticket={mockOpenTicket}
          isOpen={true}
          onClose={mockOnClose}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId('ticket-created-date')).toBeInTheDocument();
      expect(screen.getByText(/January 1, 2026/)).toBeInTheDocument();
    });

    test('displays updated date', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(
        <TicketDetail
          ticket={mockOpenTicket}
          isOpen={true}
          onClose={mockOnClose}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId('ticket-updated-date')).toBeInTheDocument();
      expect(screen.getByText(/January 2, 2026/)).toBeInTheDocument();
    });

    test('displays assigned to information', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(
        <TicketDetail
          ticket={mockOpenTicket}
          isOpen={true}
          onClose={mockOnClose}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId('ticket-assigned-to')).toBeInTheDocument();
      expect(screen.getByText('support-team')).toBeInTheDocument();
    });

    test('displays ticket tags', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(
        <TicketDetail
          ticket={mockOpenTicket}
          isOpen={true}
          onClose={mockOnClose}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId('ticket-tags')).toBeInTheDocument();
      expect(screen.getByText('vpn')).toBeInTheDocument();
      expect(screen.getByText('remote-access')).toBeInTheDocument();
      expect(screen.getByText('network')).toBeInTheDocument();
    });
  });

  describe('Display - Closed Ticket', () => {
    test('displays resolution when ticket is closed', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(
        <TicketDetail
          ticket={mockClosedTicket}
          isOpen={true}
          onClose={mockOnClose}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId('ticket-resolution')).toBeInTheDocument();
      expect(screen.getByText(/Password reset completed/)).toBeInTheDocument();
    });

    test('displays closed date when ticket is closed', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(
        <TicketDetail
          ticket={mockClosedTicket}
          isOpen={true}
          onClose={mockOnClose}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId('ticket-closed-date')).toBeInTheDocument();
    });

    test('displays closed by information', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(
        <TicketDetail
          ticket={mockClosedTicket}
          isOpen={true}
          onClose={mockOnClose}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId('ticket-closed-by')).toBeInTheDocument();
      expect(screen.getByText(/alice.support/)).toBeInTheDocument();
    });

    test('displays status badge for closed ticket', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(
        <TicketDetail
          ticket={mockClosedTicket}
          isOpen={true}
          onClose={mockOnClose}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId('ticket-status-badge')).toHaveTextContent('closed');
    });
  });

  describe('Actions - Open Ticket', () => {
    test('Close Ticket button visible for open tickets', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(
        <TicketDetail
          ticket={mockOpenTicket}
          isOpen={true}
          onClose={mockOnClose}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId('close-ticket-button')).toBeInTheDocument();
    });

    test('Close Ticket button hidden for closed tickets', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(
        <TicketDetail
          ticket={mockClosedTicket}
          isOpen={true}
          onClose={mockOnClose}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.queryByTestId('close-ticket-button')).not.toBeInTheDocument();
    });
  });

  describe('Actions - Closed Ticket', () => {
    test('Reopen button visible for closed tickets', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(
        <TicketDetail
          ticket={mockClosedTicket}
          isOpen={true}
          onClose={mockOnClose}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId('reopen-ticket-button')).toBeInTheDocument();
    });

    test('Reopen button triggers confirmation flow', async () => {
      const user = userEvent.setup();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(
        <TicketDetail
          ticket={mockClosedTicket}
          isOpen={true}
          onClose={mockOnClose}
        />,
        { wrapper: createWrapper() }
      );

      const reopenButton = screen.getByTestId('reopen-ticket-button');
      expect(reopenButton).toHaveTextContent('Reopen Ticket');

      await user.click(reopenButton);

      // After first click, should show confirmation
      expect(reopenButton).toHaveTextContent('Confirm Reopen');
    });
  });

  describe('Related Content', () => {
    test('displays suggested KB articles based on ticket content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockKBSuggestions }),
      });

      render(
        <TicketDetail
          ticket={mockOpenTicket}
          isOpen={true}
          onClose={mockOnClose}
        />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByTestId('kb-suggestions')).toBeInTheDocument();
      });

      expect(screen.getByText('VPN Troubleshooting Guide')).toBeInTheDocument();
    });

    test('clicking KB article navigates to article detail', async () => {
      const user = userEvent.setup();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockKBSuggestions }),
      });

      render(
        <TicketDetail
          ticket={mockOpenTicket}
          isOpen={true}
          onClose={mockOnClose}
        />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByTestId('kb-suggestion-kb-1')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('kb-suggestion-kb-1'));
      expect(mockNavigate).toHaveBeenCalledWith('/knowledge-base/kb-1');
    });
  });

  describe('Modal Behavior', () => {
    test('close button dismisses the modal', async () => {
      const user = userEvent.setup();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(
        <TicketDetail
          ticket={mockOpenTicket}
          isOpen={true}
          onClose={mockOnClose}
        />,
        { wrapper: createWrapper() }
      );

      await user.click(screen.getByTestId('close-modal-button'));
      expect(mockOnClose).toHaveBeenCalled();
    });

    test('clicking outside modal closes it', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(
        <TicketDetail
          ticket={mockOpenTicket}
          isOpen={true}
          onClose={mockOnClose}
        />,
        { wrapper: createWrapper() }
      );

      const backdrop = screen.getByTestId('ticket-detail-backdrop');
      fireEvent.click(backdrop);
      expect(mockOnClose).toHaveBeenCalled();
    });

    test('escape key closes modal', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(
        <TicketDetail
          ticket={mockOpenTicket}
          isOpen={true}
          onClose={mockOnClose}
        />,
        { wrapper: createWrapper() }
      );

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(mockOnClose).toHaveBeenCalled();
    });

    test('modal has proper ARIA attributes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      });

      render(
        <TicketDetail
          ticket={mockOpenTicket}
          isOpen={true}
          onClose={mockOnClose}
        />,
        { wrapper: createWrapper() }
      );

      const modal = screen.getByTestId('ticket-detail-modal');
      expect(modal).toHaveAttribute('role', 'dialog');
      expect(modal).toHaveAttribute('aria-modal', 'true');
    });

    test('does not render when isOpen is false', async () => {
      render(
        <TicketDetail
          ticket={mockOpenTicket}
          isOpen={false}
          onClose={mockOnClose}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.queryByTestId('ticket-detail-modal')).not.toBeInTheDocument();
    });
  });
});
