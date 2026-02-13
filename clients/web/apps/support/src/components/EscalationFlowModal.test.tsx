/**
 * Escalation Flow Modal Tests
 *
 * Confirmation modal for escalating support tickets.
 * Includes target selection, reason, and SLA context.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import EscalationFlowModal from './EscalationFlowModal';
import type { SLAStatus, EscalationTarget } from '../types';

// Mock auth module
vi.mock('@tamshai/auth', () => ({
  useAuth: () => ({
    userContext: { sub: 'user-123', roles: ['support-write'] },
    getAccessToken: () => 'test-token',
  }),
  canModifySupport: () => true,
  apiConfig: { mcpGatewayUrl: '' },
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Test data
const mockTicket: SLAStatus = {
  ticket_id: 'TKT-001',
  ticket_title: 'Critical login issue for enterprise customer',
  customer_name: 'Acme Corp',
  customer_tier: 'enterprise',
  priority: 'critical',
  status: 'open',
  assigned_to: 'agent-001',
  created_at: '2026-02-03T08:00:00Z',
  first_response_at: '2026-02-03T08:30:00Z',
  first_response_met: true,
  resolution_deadline: '2026-02-03T16:00:00Z',
  time_remaining_minutes: 45,
  is_breached: false,
  is_at_risk: true,
};

const mockTargets: EscalationTarget[] = [
  {
    id: 'agent-002',
    name: 'Sarah Senior',
    role: 'Senior Support Engineer',
    current_workload: 5,
    avg_resolution_minutes: 45,
  },
  {
    id: 'agent-003',
    name: 'Mike Manager',
    role: 'Support Manager',
    current_workload: 3,
    avg_resolution_minutes: 30,
  },
];

// Test wrapper
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
};

describe('EscalationFlowModal', () => {
  const onClose = vi.fn();
  const onComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('Basic Rendering', () => {
    it('renders modal with ticket information', () => {
      render(
        <EscalationFlowModal
          ticket={mockTicket}
          targets={mockTargets}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByRole('heading', { name: 'Escalate Ticket' })).toBeInTheDocument();
      expect(screen.getByText('TKT-001')).toBeInTheDocument();
      expect(screen.getByText('Critical login issue for enterprise customer')).toBeInTheDocument();
    });

    it('shows SLA countdown for context', () => {
      render(
        <EscalationFlowModal
          ticket={mockTicket}
          targets={mockTargets}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId('sla-countdown')).toBeInTheDocument();
    });

    it('shows customer tier badge', () => {
      render(
        <EscalationFlowModal
          ticket={mockTicket}
          targets={mockTargets}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText('enterprise')).toBeInTheDocument();
    });

    it('renders cancel and escalate buttons', () => {
      render(
        <EscalationFlowModal
          ticket={mockTicket}
          targets={mockTargets}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /escalate/i })).toBeInTheDocument();
    });
  });

  describe('Escalation Level Selection', () => {
    it('displays escalation level options', () => {
      render(
        <EscalationFlowModal
          ticket={mockTicket}
          targets={mockTargets}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText(/Tier 2 Support/i)).toBeInTheDocument();
      expect(screen.getByText(/Management/i)).toBeInTheDocument();
    });

    it('allows selecting escalation level', () => {
      render(
        <EscalationFlowModal
          ticket={mockTicket}
          targets={mockTargets}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      const tier2Option = screen.getByTestId('level-tier2');
      fireEvent.click(tier2Option);

      expect(tier2Option).toHaveClass('selected');
    });
  });

  describe('Target Selection', () => {
    it('displays available escalation targets', () => {
      render(
        <EscalationFlowModal
          ticket={mockTicket}
          targets={mockTargets}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText('Sarah Senior')).toBeInTheDocument();
      expect(screen.getByText('Mike Manager')).toBeInTheDocument();
    });

    it('shows target workload information', () => {
      render(
        <EscalationFlowModal
          ticket={mockTicket}
          targets={mockTargets}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      // Workload indicator
      expect(screen.getByText(/5 tickets/i)).toBeInTheDocument();
      expect(screen.getByText(/3 tickets/i)).toBeInTheDocument();
    });

    it('allows selecting a target', () => {
      render(
        <EscalationFlowModal
          ticket={mockTicket}
          targets={mockTargets}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      const targetOption = screen.getByTestId('target-agent-003');
      fireEvent.click(targetOption);

      expect(targetOption).toHaveClass('selected');
    });

    it('auto-selects first target by default', () => {
      render(
        <EscalationFlowModal
          ticket={mockTicket}
          targets={mockTargets}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      const firstTarget = screen.getByTestId('target-agent-002');
      expect(firstTarget).toHaveClass('selected');
    });
  });

  describe('Reason Selection', () => {
    it('displays predefined escalation reasons', () => {
      render(
        <EscalationFlowModal
          ticket={mockTicket}
          targets={mockTargets}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText(/SLA at risk/i)).toBeInTheDocument();
      expect(screen.getByText(/Technical expertise needed/i)).toBeInTheDocument();
      expect(screen.getByText(/Customer request/i)).toBeInTheDocument();
    });

    it('allows selecting a reason', () => {
      render(
        <EscalationFlowModal
          ticket={mockTicket}
          targets={mockTargets}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      const reasonSelect = screen.getByLabelText(/reason/i);
      fireEvent.change(reasonSelect, { target: { value: 'sla_risk' } });

      expect(reasonSelect).toHaveValue('sla_risk');
    });

    it('allows adding custom notes', () => {
      render(
        <EscalationFlowModal
          ticket={mockTicket}
          targets={mockTargets}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      const notesInput = screen.getByLabelText(/notes/i);
      fireEvent.change(notesInput, { target: { value: 'Customer is VIP, needs immediate attention' } });

      expect(notesInput).toHaveValue('Customer is VIP, needs immediate attention');
    });
  });

  describe('Validation', () => {
    it('requires reason selection', async () => {
      render(
        <EscalationFlowModal
          ticket={mockTicket}
          targets={mockTargets}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      // Clear any default selection
      const reasonSelect = screen.getByLabelText(/reason/i);
      fireEvent.change(reasonSelect, { target: { value: '' } });

      // Try to escalate
      fireEvent.click(screen.getByRole('button', { name: /escalate/i }));

      await waitFor(() => {
        expect(screen.getByText(/reason is required/i)).toBeInTheDocument();
      });
    });

    it('requires target selection for tier2 escalation', async () => {
      render(
        <EscalationFlowModal
          ticket={{ ...mockTicket }}
          targets={[]} // No targets available
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      fireEvent.click(screen.getByTestId('level-tier2'));

      // Should show message about no available targets
      expect(screen.getByText(/no available agents/i)).toBeInTheDocument();
    });
  });

  describe('Submission Flow', () => {
    it('calls escalate API on submit', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          status: 'success',
          data: { escalation_id: 'esc-001', ticket_id: 'TKT-001' },
        }),
      });

      render(
        <EscalationFlowModal
          ticket={mockTicket}
          targets={mockTargets}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      // Fill form
      fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'sla_risk' } });

      // Submit
      fireEvent.click(screen.getByRole('button', { name: /escalate/i }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/mcp/support/escalate_ticket'),
          expect.objectContaining({
            method: 'POST',
            body: expect.any(String),
          })
        );
      });
    });

    it('shows loading state during submission', async () => {
      mockFetch.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'success' }),
        }), 100))
      );

      render(
        <EscalationFlowModal
          ticket={mockTicket}
          targets={mockTargets}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'sla_risk' } });
      fireEvent.click(screen.getByRole('button', { name: /escalate/i }));

      expect(screen.getByText(/Escalating/i)).toBeInTheDocument();
    });

    it('calls onComplete callback on successful escalation', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          status: 'success',
          data: { escalation_id: 'esc-001' },
        }),
      });

      render(
        <EscalationFlowModal
          ticket={mockTicket}
          targets={mockTargets}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'sla_risk' } });
      fireEvent.click(screen.getByRole('button', { name: /escalate/i }));

      await waitFor(() => {
        expect(onComplete).toHaveBeenCalled();
      });
    });

    it('displays error message on escalation failure', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          status: 'error',
          message: 'Target agent is not available',
          suggestedAction: 'Select a different escalation target',
        }),
      });

      render(
        <EscalationFlowModal
          ticket={mockTicket}
          targets={mockTargets}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'sla_risk' } });
      fireEvent.click(screen.getByRole('button', { name: /escalate/i }));

      await waitFor(() => {
        expect(screen.getByText(/Target agent is not available/i)).toBeInTheDocument();
      });
    });
  });

  describe('Cancel Flow', () => {
    it('calls onClose when cancel clicked', () => {
      render(
        <EscalationFlowModal
          ticket={mockTicket}
          targets={mockTargets}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
      expect(onClose).toHaveBeenCalled();
    });

    it('closes on escape key', () => {
      render(
        <EscalationFlowModal
          ticket={mockTicket}
          targets={mockTargets}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA attributes on modal', () => {
      render(
        <EscalationFlowModal
          ticket={mockTicket}
          targets={mockTargets}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-labelledby');
    });

    it('focuses first interactive element on open', () => {
      render(
        <EscalationFlowModal
          ticket={mockTicket}
          targets={mockTargets}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      // First focusable element should be focused
      const reasonSelect = screen.getByLabelText(/reason/i);
      expect(document.activeElement).toBe(reasonSelect);
    });
  });

  describe('Breached Ticket Handling', () => {
    it('shows breach warning for breached tickets', () => {
      const breachedTicket: SLAStatus = {
        ...mockTicket,
        time_remaining_minutes: -30,
        is_breached: true,
        is_at_risk: false,
      };

      render(
        <EscalationFlowModal
          ticket={breachedTicket}
          targets={mockTargets}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      // Check for the breach warning message (more specific than just "SLA breached")
      expect(screen.getByText(/SLA breached - Immediate escalation required/i)).toBeInTheDocument();
    });

    it('pre-selects SLA breach as reason for breached tickets', () => {
      const breachedTicket: SLAStatus = {
        ...mockTicket,
        time_remaining_minutes: -30,
        is_breached: true,
        is_at_risk: false,
      };

      render(
        <EscalationFlowModal
          ticket={breachedTicket}
          targets={mockTargets}
          onClose={onClose}
          onComplete={onComplete}
        />,
        { wrapper: createWrapper() }
      );

      const reasonSelect = screen.getByLabelText(/reason/i);
      expect(reasonSelect).toHaveValue('sla_breach');
    });
  });
});
