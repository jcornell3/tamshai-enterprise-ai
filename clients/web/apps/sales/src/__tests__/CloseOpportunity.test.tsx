/**
 * CloseOpportunityModal Tests - GREEN PHASE
 *
 * Tests for the Close Opportunity modal with v1.4 confirmation flow
 * for marking deals as Won or Lost.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import CloseOpportunityModal from '../components/CloseOpportunityModal';
import type { Opportunity } from '../types';

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

// Mock open opportunity
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

describe('CloseOpportunityModal', () => {
  const mockOnClose = vi.fn();
  const mockOnSuccess = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    mockOnClose.mockReset();
    mockOnSuccess.mockReset();
  });

  describe('Modal Display', () => {
    test('modal is visible with proper role', async () => {
      render(
        <CloseOpportunityModal
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />,
        { wrapper: createWrapper() }
      );

      const modal = screen.getByRole('dialog');
      expect(modal).toBeInTheDocument();
      expect(modal).toHaveAttribute('aria-modal', 'true');
    });

    test('displays opportunity title in header', async () => {
      render(
        <CloseOpportunityModal
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText('Close Deal')).toBeInTheDocument();
      expect(screen.getByText('Enterprise License Deal')).toBeInTheDocument();
    });

    test('displays opportunity summary with customer and value', async () => {
      render(
        <CloseOpportunityModal
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText('Acme Corporation')).toBeInTheDocument();
      expect(screen.getByText('$150,000')).toBeInTheDocument();
      expect(screen.getByText('Current stage: NEGOTIATION')).toBeInTheDocument();
    });

    test('asks Won or Lost with radio buttons', async () => {
      render(
        <CloseOpportunityModal
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId('radio-won')).toBeInTheDocument();
      expect(screen.getByTestId('radio-lost')).toBeInTheDocument();
      expect(screen.getByText('Mark as Won')).toBeInTheDocument();
      expect(screen.getByText('Mark as Lost')).toBeInTheDocument();
    });

    test('neither Won nor Lost selected by default', async () => {
      render(
        <CloseOpportunityModal
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId('radio-won')).not.toBeChecked();
      expect(screen.getByTestId('radio-lost')).not.toBeChecked();
    });

    test('optional close reason field available', async () => {
      render(
        <CloseOpportunityModal
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId('close-reason')).toBeInTheDocument();
      expect(screen.getByText('Notes (optional)')).toBeInTheDocument();
    });

    test('confirm button disabled until Won/Lost selected', async () => {
      render(
        <CloseOpportunityModal
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId('confirm-button')).toBeDisabled();
    });
  });

  describe('Close as Won', () => {
    test('selecting Won enables confirm button', async () => {
      const user = userEvent.setup();

      render(
        <CloseOpportunityModal
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />,
        { wrapper: createWrapper() }
      );

      await user.click(screen.getByTestId('radio-won'));

      expect(screen.getByTestId('radio-won')).toBeChecked();
      expect(screen.getByTestId('confirm-button')).not.toBeDisabled();
      expect(screen.getByTestId('confirm-button')).toHaveTextContent('Confirm Won');
    });

    test('closing as Won triggers v1.4 confirmation', async () => {
      const user = userEvent.setup();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'pending_confirmation',
            confirmationId: 'conf-won-123',
            message: 'Mark "Enterprise License Deal" as WON for $150,000?',
          }),
      });

      render(
        <CloseOpportunityModal
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />,
        { wrapper: createWrapper() }
      );

      await user.click(screen.getByTestId('radio-won'));
      await user.click(screen.getByTestId('confirm-button'));

      await waitFor(() => {
        expect(screen.getByTestId('approval-card')).toBeInTheDocument();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/mcp/sales/update_opportunity'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('CLOSED_WON'),
        })
      );
    });

    test('confirming Won calls onSuccess', async () => {
      const user = userEvent.setup();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'success',
            data: { ...mockOpenOpportunity, stage: 'CLOSED_WON', probability: 100 },
          }),
      });

      render(
        <CloseOpportunityModal
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />,
        { wrapper: createWrapper() }
      );

      await user.click(screen.getByTestId('radio-won'));
      await user.click(screen.getByTestId('confirm-button'));

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalled();
      });
    });

    test('Won sets probability to 100%', async () => {
      const user = userEvent.setup();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'success',
            data: { ...mockOpenOpportunity, stage: 'CLOSED_WON', probability: 100 },
          }),
      });

      render(
        <CloseOpportunityModal
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />,
        { wrapper: createWrapper() }
      );

      await user.click(screen.getByTestId('radio-won'));
      await user.click(screen.getByTestId('confirm-button'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: expect.stringContaining('"probability":100'),
          })
        );
      });
    });
  });

  describe('Close as Lost', () => {
    test('selecting Lost enables confirm button', async () => {
      const user = userEvent.setup();

      render(
        <CloseOpportunityModal
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />,
        { wrapper: createWrapper() }
      );

      await user.click(screen.getByTestId('radio-lost'));

      expect(screen.getByTestId('radio-lost')).toBeChecked();
      expect(screen.getByTestId('confirm-button')).not.toBeDisabled();
      expect(screen.getByTestId('confirm-button')).toHaveTextContent('Confirm Lost');
    });

    test('closing as Lost triggers v1.4 confirmation', async () => {
      const user = userEvent.setup();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'pending_confirmation',
            confirmationId: 'conf-lost-123',
            message: 'Mark "Enterprise License Deal" as LOST?',
          }),
      });

      render(
        <CloseOpportunityModal
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />,
        { wrapper: createWrapper() }
      );

      await user.click(screen.getByTestId('radio-lost'));
      await user.click(screen.getByTestId('confirm-button'));

      await waitFor(() => {
        expect(screen.getByTestId('approval-card')).toBeInTheDocument();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/mcp/sales/update_opportunity'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('CLOSED_LOST'),
        })
      );
    });

    test('confirming Lost calls onSuccess', async () => {
      const user = userEvent.setup();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'success',
            data: { ...mockOpenOpportunity, stage: 'CLOSED_LOST', probability: 0 },
          }),
      });

      render(
        <CloseOpportunityModal
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />,
        { wrapper: createWrapper() }
      );

      await user.click(screen.getByTestId('radio-lost'));
      await user.click(screen.getByTestId('confirm-button'));

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalled();
      });
    });

    test('Lost sets probability to 0%', async () => {
      const user = userEvent.setup();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'success',
            data: { ...mockOpenOpportunity, stage: 'CLOSED_LOST', probability: 0 },
          }),
      });

      render(
        <CloseOpportunityModal
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />,
        { wrapper: createWrapper() }
      );

      await user.click(screen.getByTestId('radio-lost'));
      await user.click(screen.getByTestId('confirm-button'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: expect.stringContaining('"probability":0'),
          })
        );
      });
    });

    test('Lost reason is saved when provided', async () => {
      const user = userEvent.setup();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'success',
            data: { ...mockOpenOpportunity, stage: 'CLOSED_LOST', probability: 0 },
          }),
      });

      render(
        <CloseOpportunityModal
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />,
        { wrapper: createWrapper() }
      );

      await user.click(screen.getByTestId('radio-lost'));
      await user.type(screen.getByTestId('close-reason'), 'Budget constraints');
      await user.click(screen.getByTestId('confirm-button'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: expect.stringContaining('Budget constraints'),
          })
        );
      });
    });
  });

  describe('Cancellation', () => {
    test('Cancel button closes modal without changes', async () => {
      const user = userEvent.setup();

      render(
        <CloseOpportunityModal
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />,
        { wrapper: createWrapper() }
      );

      await user.click(screen.getByTestId('cancel-button'));

      expect(mockOnClose).toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('escape key closes modal', async () => {
      render(
        <CloseOpportunityModal
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />,
        { wrapper: createWrapper() }
      );

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(mockOnClose).toHaveBeenCalled();
    });

    test('X button closes modal', async () => {
      const user = userEvent.setup();

      render(
        <CloseOpportunityModal
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />,
        { wrapper: createWrapper() }
      );

      await user.click(screen.getByTestId('close-modal-button'));

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    test('shows error on API failure', async () => {
      const user = userEvent.setup();

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      render(
        <CloseOpportunityModal
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />,
        { wrapper: createWrapper() }
      );

      await user.click(screen.getByTestId('radio-won'));
      await user.click(screen.getByTestId('confirm-button'));

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toBeInTheDocument();
      });

      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    test('allows retry after error', async () => {
      const user = userEvent.setup();

      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              status: 'success',
              data: { ...mockOpenOpportunity, stage: 'CLOSED_WON' },
            }),
        });

      render(
        <CloseOpportunityModal
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />,
        { wrapper: createWrapper() }
      );

      await user.click(screen.getByTestId('radio-won'));
      await user.click(screen.getByTestId('confirm-button'));

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toBeInTheDocument();
      });

      // Retry
      await user.click(screen.getByTestId('confirm-button'));

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalled();
      });
    });

    test('shows loading state during API call', async () => {
      const user = userEvent.setup();

      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(
        <CloseOpportunityModal
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />,
        { wrapper: createWrapper() }
      );

      await user.click(screen.getByTestId('radio-won'));
      await user.click(screen.getByTestId('confirm-button'));

      expect(screen.getByText('Processing...')).toBeInTheDocument();
      expect(screen.getByTestId('confirm-button')).toBeDisabled();
    });
  });

  describe('Accessibility', () => {
    test('radio buttons are keyboard accessible', async () => {
      const user = userEvent.setup();

      render(
        <CloseOpportunityModal
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />,
        { wrapper: createWrapper() }
      );

      const wonRadio = screen.getByTestId('radio-won');

      // Tab to and select radio button
      wonRadio.focus();
      await user.keyboard(' ');

      expect(wonRadio).toBeChecked();
    });

    test('modal has proper ARIA attributes', async () => {
      render(
        <CloseOpportunityModal
          opportunity={mockOpenOpportunity}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />,
        { wrapper: createWrapper() }
      );

      const modal = screen.getByRole('dialog');
      expect(modal).toHaveAttribute('aria-modal', 'true');
      expect(modal).toHaveAttribute('aria-labelledby', 'close-opportunity-title');
    });
  });
});
