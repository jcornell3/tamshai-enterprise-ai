/**
 * Confirm Dialog Tests
 *
 * Tests for the modal confirmation dialog component.
 * Verifies E2E test selectors are present.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders nothing when isOpen is false', () => {
      render(
        <ConfirmDialog
          isOpen={false}
          title="Confirm Action"
          message="Are you sure?"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders dialog when isOpen is true', () => {
      render(
        <ConfirmDialog
          isOpen={true}
          title="Confirm Action"
          message="Are you sure?"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('displays title and message', () => {
      render(
        <ConfirmDialog
          isOpen={true}
          title="Delete Items"
          message="Are you sure you want to delete 3 items?"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      expect(screen.getByText('Delete Items')).toBeInTheDocument();
      expect(screen.getByText('Are you sure you want to delete 3 items?')).toBeInTheDocument();
    });

    it('uses default button labels', () => {
      render(
        <ConfirmDialog
          isOpen={true}
          title="Confirm"
          message="Are you sure?"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    it('uses custom button labels', () => {
      render(
        <ConfirmDialog
          isOpen={true}
          title="Confirm"
          message="Are you sure?"
          confirmLabel="Yes, delete"
          cancelLabel="No, keep"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      expect(screen.getByRole('button', { name: 'Yes, delete' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'No, keep' })).toBeInTheDocument();
    });
  });

  describe('Test IDs for E2E', () => {
    it('has data-testid="confirm-dialog" on dialog', () => {
      render(
        <ConfirmDialog
          isOpen={true}
          title="Confirm"
          message="Are you sure?"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });

    it('has data-testid="confirm-action" on confirm button', () => {
      render(
        <ConfirmDialog
          isOpen={true}
          title="Confirm"
          message="Are you sure?"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      expect(screen.getByTestId('confirm-action')).toBeInTheDocument();
    });

    it('has data-testid="cancel-action" on cancel button', () => {
      render(
        <ConfirmDialog
          isOpen={true}
          title="Confirm"
          message="Are you sure?"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      expect(screen.getByTestId('cancel-action')).toBeInTheDocument();
    });

    it('has role="dialog" for accessibility', () => {
      render(
        <ConfirmDialog
          isOpen={true}
          title="Confirm"
          message="Are you sure?"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('data-testid', 'confirm-dialog');
    });
  });

  describe('User Interactions', () => {
    it('calls onConfirm when confirm button is clicked', () => {
      render(
        <ConfirmDialog
          isOpen={true}
          title="Confirm"
          message="Are you sure?"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      fireEvent.click(screen.getByTestId('confirm-action'));
      expect(onConfirm).toHaveBeenCalled();
    });

    it('calls onCancel when cancel button is clicked', () => {
      render(
        <ConfirmDialog
          isOpen={true}
          title="Confirm"
          message="Are you sure?"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      fireEvent.click(screen.getByTestId('cancel-action'));
      expect(onCancel).toHaveBeenCalled();
    });

    it('calls onCancel when escape key is pressed', () => {
      render(
        <ConfirmDialog
          isOpen={true}
          title="Confirm"
          message="Are you sure?"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onCancel).toHaveBeenCalled();
    });

    it('calls onCancel when backdrop is clicked', () => {
      render(
        <ConfirmDialog
          isOpen={true}
          title="Confirm"
          message="Are you sure?"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      // Click the backdrop (presentation wrapper)
      const backdrop = screen.getByRole('presentation');
      fireEvent.click(backdrop);
      expect(onCancel).toHaveBeenCalled();
    });
  });

  describe('Loading State', () => {
    it('disables buttons when isLoading is true', () => {
      render(
        <ConfirmDialog
          isOpen={true}
          title="Confirm"
          message="Are you sure?"
          isLoading={true}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      expect(screen.getByTestId('confirm-action')).toBeDisabled();
      expect(screen.getByTestId('cancel-action')).toBeDisabled();
    });

    it('shows loading text on confirm button when isLoading is true', () => {
      render(
        <ConfirmDialog
          isOpen={true}
          title="Confirm"
          message="Are you sure?"
          isLoading={true}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      expect(screen.getByText('Processing...')).toBeInTheDocument();
    });

    it('does not call onCancel on escape when loading', () => {
      render(
        <ConfirmDialog
          isOpen={true}
          title="Confirm"
          message="Are you sure?"
          isLoading={true}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onCancel).not.toHaveBeenCalled();
    });
  });

  describe('Reason Input', () => {
    it('shows reason input when showReasonInput is true', () => {
      render(
        <ConfirmDialog
          isOpen={true}
          title="Reject"
          message="Are you sure you want to reject?"
          showReasonInput={true}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      expect(screen.getByTestId('reason-input')).toBeInTheDocument();
    });

    it('does not show reason input when showReasonInput is false', () => {
      render(
        <ConfirmDialog
          isOpen={true}
          title="Approve"
          message="Are you sure you want to approve?"
          showReasonInput={false}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      expect(screen.queryByTestId('reason-input')).not.toBeInTheDocument();
    });

    it('passes reason to onConfirm when provided', () => {
      render(
        <ConfirmDialog
          isOpen={true}
          title="Reject"
          message="Are you sure?"
          showReasonInput={true}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      const reasonInput = screen.getByTestId('reason-input');
      fireEvent.change(reasonInput, { target: { value: 'Invalid data' } });
      fireEvent.click(screen.getByTestId('confirm-action'));

      expect(onConfirm).toHaveBeenCalledWith('Invalid data');
    });
  });

  describe('Details Display', () => {
    it('displays details when provided', () => {
      render(
        <ConfirmDialog
          isOpen={true}
          title="Confirm"
          message="Are you sure?"
          details={{
            count: 3,
            totalAmount: '$1,500.00',
          }}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      expect(screen.getByText('count:')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('total Amount:')).toBeInTheDocument();
      expect(screen.getByText('$1,500.00')).toBeInTheDocument();
    });
  });

  describe('Variants', () => {
    it('applies primary variant styling', () => {
      render(
        <ConfirmDialog
          isOpen={true}
          title="Confirm"
          message="Are you sure?"
          variant="primary"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      const confirmButton = screen.getByTestId('confirm-action');
      expect(confirmButton).toHaveClass('bg-primary-500');
    });

    it('applies destructive variant styling', () => {
      render(
        <ConfirmDialog
          isOpen={true}
          title="Delete"
          message="Are you sure?"
          variant="destructive"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      const confirmButton = screen.getByTestId('confirm-action');
      expect(confirmButton).toHaveClass('bg-danger-500');
    });

    it('applies warning variant styling', () => {
      render(
        <ConfirmDialog
          isOpen={true}
          title="Warning"
          message="Are you sure?"
          variant="warning"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      const confirmButton = screen.getByTestId('confirm-action');
      expect(confirmButton).toHaveClass('bg-warning-500');
    });
  });
});
