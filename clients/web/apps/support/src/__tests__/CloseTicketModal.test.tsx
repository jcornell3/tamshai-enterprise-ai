/**
 * CloseTicketModal Tests - TDD GREEN PHASE
 *
 * These tests verify the CloseTicketModal component behaves as expected.
 * The component implements v1.4 confirmation flow for closing tickets.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import type { Ticket } from '../types';
import { CloseTicketModal } from '../components/CloseTicketModal';

// Mock @tamshai/auth
vi.mock('@tamshai/auth', () => ({
  useAuth: () => ({
    getAccessToken: () => 'mock-token',
    userContext: { roles: ['support-write'] },
  }),
  apiConfig: {
    mcpGatewayUrl: '',
  },
}));

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

// Mock ticket for testing
const mockTicket: Ticket = {
  id: 'ticket-001',
  title: 'Cannot access VPN from home',
  description: 'User unable to connect to company VPN.',
  status: 'open',
  priority: 'high',
  created_by: 'john.doe',
  assigned_to: 'support-team',
  tags: ['vpn', 'network'],
  created_at: '2026-01-01T10:00:00Z',
  updated_at: '2026-01-02T14:30:00Z',
};

// Mock KB articles for linking
const mockKBArticles = [
  { id: 'kb-1', title: 'VPN Troubleshooting Guide', category: 'Network' },
  { id: 'kb-2', title: 'Remote Access Setup', category: 'Getting Started' },
];

describe('CloseTicketModal', () => {
  const mockOnClose = vi.fn();
  const mockOnConfirm = vi.fn();

  const renderModal = (props = {}) => {
    const Wrapper = createWrapper();
    return render(
      <Wrapper>
        <CloseTicketModal
          ticket={mockTicket}
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          {...props}
        />
      </Wrapper>
    );
  };

  beforeEach(() => {
    mockFetch.mockReset();
    mockOnClose.mockReset();
    mockOnConfirm.mockReset();
  });

  describe('Modal Display', () => {
    test('displays ticket summary in modal header', async () => {
      renderModal();

      // Modal shows ticket ID and title in header
      expect(screen.getByTestId('modal-title')).toHaveTextContent('Close Ticket #ticket-0');
      expect(screen.getByTestId('ticket-title-summary')).toHaveTextContent('Cannot access VPN from home');
    });

    test('displays ticket status and priority badges', async () => {
      renderModal();

      // Current status "Open" and priority "High" shown
      expect(screen.getByTestId('ticket-status-badge')).toHaveTextContent('open');
      expect(screen.getByTestId('ticket-priority-badge')).toHaveTextContent('high');
    });

    test('displays warning about irreversible action', async () => {
      renderModal();

      // Warning text about closing ticket
      expect(screen.getByTestId('warning-message')).toBeInTheDocument();
      expect(screen.getByText('This action is irreversible')).toBeInTheDocument();
    });
  });

  describe('Resolution Input', () => {
    test('requires resolution text before closing', async () => {
      renderModal();

      // Confirm button disabled when resolution empty
      const confirmButton = screen.getByTestId('confirm-close-button');
      expect(confirmButton).toBeDisabled();
    });

    test('shows validation error for empty resolution', async () => {
      const user = userEvent.setup();
      renderModal();

      // Type and then clear to trigger validation
      const textarea = screen.getByTestId('resolution-textarea');
      await user.type(textarea, 'test');
      await user.clear(textarea);

      // Confirm button should still be disabled
      expect(screen.getByTestId('confirm-close-button')).toBeDisabled();
    });

    test('resolution textarea accepts user input', async () => {
      const user = userEvent.setup();
      renderModal();

      const textarea = screen.getByTestId('resolution-textarea');
      await user.type(textarea, 'Issue resolved by resetting the VPN configuration.');

      expect(textarea).toHaveValue('Issue resolved by resetting the VPN configuration.');
    });

    test('resolution has minimum length requirement', async () => {
      const user = userEvent.setup();
      renderModal();

      // Type short text (< 10 chars)
      const textarea = screen.getByTestId('resolution-textarea');
      await user.type(textarea, 'Fixed');

      // Confirm button should still be disabled
      expect(screen.getByTestId('confirm-close-button')).toBeDisabled();
    });
  });

  describe('Resolution Templates', () => {
    test('displays resolution template dropdown', async () => {
      renderModal();

      // Dropdown with resolution templates exists
      expect(screen.getByTestId('resolution-template-select')).toBeInTheDocument();
    });

    test('selecting template fills resolution textarea', async () => {
      const user = userEvent.setup();
      renderModal();

      const select = screen.getByTestId('resolution-template-select');
      await user.selectOptions(select, 'resolved-by-user');

      const textarea = screen.getByTestId('resolution-textarea');
      expect(textarea).toHaveValue('Issue resolved by user following provided instructions.');
    });

    test('template text can be edited after selection', async () => {
      const user = userEvent.setup();
      renderModal();

      const select = screen.getByTestId('resolution-template-select');
      await user.selectOptions(select, 'config-fix');

      const textarea = screen.getByTestId('resolution-textarea');
      await user.type(textarea, ' Additional notes added.');

      expect(textarea).toHaveValue('Configuration issue identified and corrected. Additional notes added.');
    });

    test('templates include common resolutions', async () => {
      renderModal();

      const select = screen.getByTestId('resolution-template-select');

      // Check that options include expected templates
      expect(select).toContainHTML('resolved-by-user');
      expect(select).toContainHTML('config-fix');
      expect(select).toContainHTML('password-reset');
    });
  });

  describe('KB Article Linking', () => {
    test('displays option to link KB article', async () => {
      renderModal();

      // "Link to KB Article" button exists
      expect(screen.getByTestId('link-article-button')).toBeInTheDocument();
      expect(screen.getByText('Link to KB Article')).toBeInTheDocument();
    });

    test('KB article search dropdown appears on click', async () => {
      const user = userEvent.setup();

      // Mock KB articles search
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          status: 'success',
          data: mockKBArticles,
        }),
      });

      renderModal();

      const linkButton = screen.getByTestId('link-article-button');
      await user.click(linkButton);

      // Search dropdown should appear
      await waitFor(() => {
        expect(screen.getByTestId('article-search-dropdown')).toBeInTheDocument();
      });
    });

    test('selecting KB article adds reference to resolution', async () => {
      const user = userEvent.setup();

      // Mock KB articles search
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          status: 'success',
          data: mockKBArticles,
        }),
      });

      renderModal();

      // Click to open KB search
      const linkButton = screen.getByTestId('link-article-button');
      await user.click(linkButton);

      // Wait for articles to load and select one
      await waitFor(() => {
        expect(screen.getByTestId('article-option-kb-1')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('article-option-kb-1'));

      // Linked article should be shown
      expect(screen.getByTestId('linked-article')).toBeInTheDocument();
      expect(screen.getByText('VPN Troubleshooting Guide')).toBeInTheDocument();
    });

    test('linked KB article can be removed', async () => {
      const user = userEvent.setup();

      // Mock KB articles search
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          status: 'success',
          data: mockKBArticles,
        }),
      });

      renderModal();

      // Link an article first
      const linkButton = screen.getByTestId('link-article-button');
      await user.click(linkButton);

      await waitFor(() => {
        expect(screen.getByTestId('article-option-kb-1')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('article-option-kb-1'));

      // Remove the linked article
      const removeButton = screen.getByTestId('remove-article-button');
      await user.click(removeButton);

      // Article should be removed
      expect(screen.queryByTestId('linked-article')).not.toBeInTheDocument();
    });
  });

  describe('v1.4 Confirmation Flow', () => {
    test('clicking Confirm triggers pending_confirmation API call', async () => {
      const user = userEvent.setup();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          status: 'pending_confirmation',
          confirmationId: 'conf-123',
          message: 'Please confirm closing ticket #ticket-001',
        }),
      });

      renderModal();

      // Fill resolution
      const textarea = screen.getByTestId('resolution-textarea');
      await user.type(textarea, 'Issue resolved by resetting VPN configuration.');

      // Click confirm
      const confirmButton = screen.getByTestId('confirm-close-button');
      await user.click(confirmButton);

      // API should be called
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/mcp/support/close_ticket'),
          expect.objectContaining({
            method: 'POST',
          })
        );
      });
    });

    test('displays confirmation dialog with ticket details', async () => {
      const user = userEvent.setup();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          status: 'pending_confirmation',
          confirmationId: 'conf-123',
          message: 'Please confirm closing ticket #ticket-001',
        }),
      });

      renderModal();

      // Fill resolution and submit
      const textarea = screen.getByTestId('resolution-textarea');
      await user.type(textarea, 'Issue resolved by resetting VPN configuration.');
      await user.click(screen.getByTestId('confirm-close-button'));

      // Confirmation dialog should appear
      await waitFor(() => {
        expect(screen.getByTestId('confirmation-dialog')).toBeInTheDocument();
      });

      expect(screen.getByTestId('confirmation-message')).toHaveTextContent('Please confirm closing ticket #ticket-001');
    });

    test('confirming sends approval with confirmationId', async () => {
      const user = userEvent.setup();

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            status: 'pending_confirmation',
            confirmationId: 'conf-123',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            status: 'success',
            data: { ...mockTicket, status: 'closed' },
          }),
        });

      renderModal();

      // Fill resolution and submit
      const textarea = screen.getByTestId('resolution-textarea');
      await user.type(textarea, 'Issue resolved by resetting VPN configuration.');
      await user.click(screen.getByTestId('confirm-close-button'));

      // Wait for confirmation dialog
      await waitFor(() => {
        expect(screen.getByTestId('confirmation-dialog')).toBeInTheDocument();
      });

      // Confirm
      await user.click(screen.getByTestId('confirm-yes-button'));

      // API should be called with confirmationId
      await waitFor(() => {
        expect(mockFetch).toHaveBeenLastCalledWith(
          expect.stringContaining('/api/confirm/conf-123'),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ approved: true }),
          })
        );
      });
    });

    test('canceling confirmation does not close ticket', async () => {
      const user = userEvent.setup();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          status: 'pending_confirmation',
          confirmationId: 'conf-123',
          message: 'Please confirm closing ticket',
        }),
      });

      renderModal();

      // Fill resolution and submit
      const textarea = screen.getByTestId('resolution-textarea');
      await user.type(textarea, 'Issue resolved by resetting VPN configuration.');
      await user.click(screen.getByTestId('confirm-close-button'));

      // Wait for confirmation dialog
      await waitFor(() => {
        expect(screen.getByTestId('confirmation-dialog')).toBeInTheDocument();
      });

      // Cancel
      await user.click(screen.getByTestId('confirm-no-button'));

      // Confirmation dialog should close, resolution form should be visible again
      await waitFor(() => {
        expect(screen.queryByTestId('confirmation-dialog')).not.toBeInTheDocument();
      });

      // onConfirm should not have been called
      expect(mockOnConfirm).not.toHaveBeenCalled();
    });

    test('shows success message after ticket is closed', async () => {
      const user = userEvent.setup();

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            status: 'pending_confirmation',
            confirmationId: 'conf-123',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            status: 'success',
            data: { ...mockTicket, status: 'closed' },
          }),
        });

      renderModal();

      // Fill resolution and submit
      const textarea = screen.getByTestId('resolution-textarea');
      await user.type(textarea, 'Issue resolved by resetting VPN configuration.');
      await user.click(screen.getByTestId('confirm-close-button'));

      // Wait for confirmation and confirm
      await waitFor(() => {
        expect(screen.getByTestId('confirmation-dialog')).toBeInTheDocument();
      });
      await user.click(screen.getByTestId('confirm-yes-button'));

      // Success message should appear
      await waitFor(() => {
        expect(screen.getByTestId('success-message')).toBeInTheDocument();
      });
      expect(screen.getByText('Ticket closed successfully')).toBeInTheDocument();
    });
  });

  describe('Modal Actions', () => {
    test('Cancel button closes modal without saving', async () => {
      const user = userEvent.setup();
      renderModal();

      const cancelButton = screen.getByTestId('cancel-button');
      await user.click(cancelButton);

      // onClose should be called
      expect(mockOnClose).toHaveBeenCalled();
      // No API call should have been made
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('X button closes modal', async () => {
      const user = userEvent.setup();
      renderModal();

      const xButton = screen.getByTestId('x-close-button');
      await user.click(xButton);

      // onClose should be called
      expect(mockOnClose).toHaveBeenCalled();
    });

    test('escape key closes modal', async () => {
      renderModal();

      // Press ESC key
      fireEvent.keyDown(document, { key: 'Escape' });

      // onClose should be called
      expect(mockOnClose).toHaveBeenCalled();
    });

    test('clicking backdrop closes modal', async () => {
      const user = userEvent.setup();
      renderModal();

      const backdrop = screen.getByTestId('close-ticket-modal-backdrop');
      await user.click(backdrop);

      // onClose should be called
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Loading and Error States', () => {
    test('shows loading state during API call', async () => {
      const user = userEvent.setup();

      // Never resolving promise to keep loading state
      mockFetch.mockImplementation(() => new Promise(() => {}));

      renderModal();

      // Fill resolution
      const textarea = screen.getByTestId('resolution-textarea');
      await user.type(textarea, 'Issue resolved by resetting VPN configuration.');

      // Click confirm
      const confirmButton = screen.getByTestId('confirm-close-button');
      await user.click(confirmButton);

      // Button should show loading state
      await waitFor(() => {
        expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
      });
    });

    test('handles API error gracefully', async () => {
      const user = userEvent.setup();

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      renderModal();

      // Fill resolution and submit
      const textarea = screen.getByTestId('resolution-textarea');
      await user.type(textarea, 'Issue resolved by resetting VPN configuration.');
      await user.click(screen.getByTestId('confirm-close-button'));

      // Error message should be displayed
      await waitFor(() => {
        expect(screen.getByTestId('api-error')).toBeInTheDocument();
      });
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    test('allows retry after error', async () => {
      const user = userEvent.setup();

      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            status: 'pending_confirmation',
            confirmationId: 'conf-123',
          }),
        });

      renderModal();

      // Fill resolution and submit (first attempt - fails)
      const textarea = screen.getByTestId('resolution-textarea');
      await user.type(textarea, 'Issue resolved by resetting VPN configuration.');
      await user.click(screen.getByTestId('confirm-close-button'));

      // Wait for error
      await waitFor(() => {
        expect(screen.getByTestId('api-error')).toBeInTheDocument();
      });

      // Retry (second attempt - succeeds)
      await user.click(screen.getByTestId('confirm-close-button'));

      // Confirmation dialog should appear
      await waitFor(() => {
        expect(screen.getByTestId('confirmation-dialog')).toBeInTheDocument();
      });
    });

    test('handles confirmation timeout', async () => {
      const user = userEvent.setup();

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            status: 'pending_confirmation',
            confirmationId: 'conf-123',
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({
            status: 'error',
            code: 'CONFIRMATION_EXPIRED',
            message: 'Confirmation expired. Please try again.',
          }),
        });

      renderModal();

      // Fill resolution and submit
      const textarea = screen.getByTestId('resolution-textarea');
      await user.type(textarea, 'Issue resolved by resetting VPN configuration.');
      await user.click(screen.getByTestId('confirm-close-button'));

      // Wait for confirmation dialog and confirm
      await waitFor(() => {
        expect(screen.getByTestId('confirmation-dialog')).toBeInTheDocument();
      });
      await user.click(screen.getByTestId('confirm-yes-button'));

      // Expiration error should be shown
      await waitFor(() => {
        expect(screen.getByTestId('api-error')).toBeInTheDocument();
      });
      expect(screen.getByText('Confirmation expired. Please try again.')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    test('modal traps focus', async () => {
      renderModal();

      // X button should be focused initially (first focusable element)
      const xButton = screen.getByTestId('x-close-button');
      expect(xButton).toHaveFocus();
    });

    test('modal has proper ARIA attributes', async () => {
      renderModal();

      const modal = screen.getByTestId('close-ticket-modal');
      expect(modal).toHaveAttribute('role', 'dialog');
      expect(modal).toHaveAttribute('aria-modal', 'true');
      expect(modal).toHaveAttribute('aria-labelledby', 'close-ticket-title');
    });

    test('confirm button has aria-describedby for context', async () => {
      renderModal();

      const confirmButton = screen.getByTestId('confirm-close-button');
      expect(confirmButton).toHaveAttribute('aria-describedby', 'confirm-button-description');
    });
  });
});
