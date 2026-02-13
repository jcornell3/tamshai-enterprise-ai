/**
 * ApprovalCard Tests
 *
 * Tests for the human-in-the-loop approval card component
 * that displays pending confirmation requests.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock the auth module
jest.mock('@tamshai/auth', () => {
  const mockGetAccessToken = jest.fn(() => 'mock-token-12345');
  return {
    useAuth: () => ({
      getAccessToken: mockGetAccessToken,
    }),
    apiConfig: {
      mcpGatewayUrl: 'http://localhost:3100',
    },
  };
});

import { ApprovalCard } from '../ApprovalCard';

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('ApprovalCard', () => {
  const defaultProps = {
    confirmationId: 'confirm-uuid-123',
    message: 'Delete employee Alice Chen?',
    confirmationData: {
      action: 'delete_employee',
      employeeName: 'Alice Chen',
      employeeEmail: 'alice.chen@tamshai.com',
      department: 'Engineering',
    },
    onComplete: jest.fn(),
  };

  beforeEach(() => {
    mockFetch.mockReset();
    defaultProps.onComplete.mockReset();
  });

  describe('rendering', () => {
    it('renders the approval card container', () => {
      render(<ApprovalCard {...defaultProps} />);

      const container = document.querySelector('.approval-card');
      expect(container).toBeInTheDocument();
    });

    it('displays "Approval Required" header', () => {
      render(<ApprovalCard {...defaultProps} />);

      expect(screen.getByText('Approval Required')).toBeInTheDocument();
    });

    it('displays the confirmation message', () => {
      render(<ApprovalCard {...defaultProps} />);

      expect(screen.getByText('Delete employee Alice Chen?')).toBeInTheDocument();
    });

    it('displays confirmation data details', () => {
      render(<ApprovalCard {...defaultProps} />);

      expect(screen.getByText('action:')).toBeInTheDocument();
      expect(screen.getByText('delete_employee')).toBeInTheDocument();
      expect(screen.getByText('employee Name:')).toBeInTheDocument();
      expect(screen.getByText('Alice Chen')).toBeInTheDocument();
      expect(screen.getByText('employee Email:')).toBeInTheDocument();
      expect(screen.getByText('alice.chen@tamshai.com')).toBeInTheDocument();
      expect(screen.getByText('department:')).toBeInTheDocument();
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });

    it('displays Approve button', () => {
      render(<ApprovalCard {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    });

    it('displays Reject button', () => {
      render(<ApprovalCard {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
    });

    it('displays expiration warning', () => {
      render(<ApprovalCard {...defaultProps} />);

      expect(
        screen.getByText('This confirmation will expire in 5 minutes')
      ).toBeInTheDocument();
    });

    it('renders warning icon SVG', () => {
      render(<ApprovalCard {...defaultProps} />);

      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });
  });

  describe('approve action', () => {
    it('calls API with approved: true when Approve is clicked', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success' }),
      });

      render(<ApprovalCard {...defaultProps} />);

      await userEvent.click(screen.getByRole('button', { name: 'Approve' }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:3100/api/confirm/confirm-uuid-123',
          expect.objectContaining({
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer mock-token-12345',
            },
            body: JSON.stringify({ approved: true }),
          })
        );
      });
    });

    it('calls onComplete with true on successful approval', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success' }),
      });

      render(<ApprovalCard {...defaultProps} />);

      await userEvent.click(screen.getByRole('button', { name: 'Approve' }));

      await waitFor(() => {
        expect(defaultProps.onComplete).toHaveBeenCalledWith(true);
      });
    });

    it('shows loading state while processing', async () => {
      mockFetch.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      render(<ApprovalCard {...defaultProps} />);

      await userEvent.click(screen.getByRole('button', { name: 'Approve' }));

      expect(screen.getByText('Processing...')).toBeInTheDocument();
    });

    it('disables buttons while processing', async () => {
      mockFetch.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      render(<ApprovalCard {...defaultProps} />);

      await userEvent.click(screen.getByRole('button', { name: 'Approve' }));

      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toBeDisabled();
      });
    });
  });

  describe('reject action', () => {
    it('calls API with approved: false when Reject is clicked', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'cancelled' }),
      });

      render(<ApprovalCard {...defaultProps} />);

      await userEvent.click(screen.getByRole('button', { name: 'Reject' }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:3100/api/confirm/confirm-uuid-123',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ approved: false }),
          })
        );
      });
    });

    it('calls onComplete with true on successful rejection', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'cancelled' }),
      });

      render(<ApprovalCard {...defaultProps} />);

      await userEvent.click(screen.getByRole('button', { name: 'Reject' }));

      await waitFor(() => {
        expect(defaultProps.onComplete).toHaveBeenCalledWith(true);
      });
    });
  });

  describe('error handling', () => {
    it('displays error message on 404 (expired)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      render(<ApprovalCard {...defaultProps} />);

      await userEvent.click(screen.getByRole('button', { name: 'Approve' }));

      await waitFor(() => {
        expect(
          screen.getByText('Error: Confirmation expired (5-minute timeout)')
        ).toBeInTheDocument();
      });
    });

    it('displays error message on 403 (wrong user)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      });

      render(<ApprovalCard {...defaultProps} />);

      await userEvent.click(screen.getByRole('button', { name: 'Approve' }));

      await waitFor(() => {
        expect(
          screen.getByText('Error: This confirmation belongs to a different user')
        ).toBeInTheDocument();
      });
    });

    it('displays generic error message on other failures', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal server error' }),
      });

      render(<ApprovalCard {...defaultProps} />);

      await userEvent.click(screen.getByRole('button', { name: 'Approve' }));

      await waitFor(() => {
        expect(screen.getByText('Error: Internal server error')).toBeInTheDocument();
      });
    });

    it('calls onComplete with false after error timeout', async () => {
      jest.useFakeTimers();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      render(<ApprovalCard {...defaultProps} />);

      // Use fireEvent instead of userEvent with fake timers
      fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

      // Flush microtasks and timers
      await jest.runAllTimersAsync();

      expect(defaultProps.onComplete).toHaveBeenCalledWith(false);

      jest.useRealTimers();
    });
  });

  describe('different confirmation data', () => {
    it('handles empty confirmation data', () => {
      render(
        <ApprovalCard
          {...defaultProps}
          confirmationData={{ action: 'test' }}
        />
      );

      expect(screen.getByText('action:')).toBeInTheDocument();
      expect(screen.getByText('test')).toBeInTheDocument();
    });

    it('handles nested confirmation data values', () => {
      render(
        <ApprovalCard
          {...defaultProps}
          confirmationData={{
            action: 'update',
            details: { nested: 'value' },
          }}
        />
      );

      // Objects get stringified
      expect(screen.getByText('[object Object]')).toBeInTheDocument();
    });

    it('formats camelCase keys with spaces', () => {
      render(
        <ApprovalCard
          {...defaultProps}
          confirmationData={{
            action: 'test',
            someVeryLongKeyName: 'value',
          }}
        />
      );

      expect(screen.getByText('some Very Long Key Name:')).toBeInTheDocument();
    });
  });

  describe('styling', () => {
    it('approve button has success styling', () => {
      render(<ApprovalCard {...defaultProps} />);

      const approveBtn = screen.getByRole('button', { name: 'Approve' });
      expect(approveBtn).toHaveClass('btn-success');
    });

    it('reject button has danger styling', () => {
      render(<ApprovalCard {...defaultProps} />);

      const rejectBtn = screen.getByRole('button', { name: 'Reject' });
      expect(rejectBtn).toHaveClass('btn-danger');
    });
  });
});
