/**
 * Quarterly Filing Review Wizard Tests
 *
 * Tests the multi-step wizard for reviewing and filing quarterly tax returns.
 *
 * Architecture v1.5 - Enterprise UX Hardening
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuarterlyFilingReviewWizard } from '../../components/QuarterlyFilingReviewWizard';
import type { QuarterlyFiling } from '../../types';

// Note: @tamshai/ui mocks are provided by setup.tsx

const mockFiling: QuarterlyFiling = {
  id: 'qf-2026-q1',
  year: 2026,
  quarter: 1,
  jurisdictions: [
    {
      state: 'California',
      stateCode: 'CA',
      grossSales: 125000,
      taxableSales: 110000,
      exemptSales: 15000,
      taxCollected: 7975,
      taxRate: 0.0725,
      transactionCount: 450,
    },
    {
      state: 'New York',
      stateCode: 'NY',
      grossSales: 85000,
      taxableSales: 75000,
      exemptSales: 10000,
      taxCollected: 6000,
      taxRate: 0.08,
      transactionCount: 280,
    },
  ],
  totals: {
    grossSales: 210000,
    taxableSales: 185000,
    exemptSales: 25000,
    taxCollected: 13975,
  },
  status: 'draft',
  auditTrail: [
    {
      id: 'at-1',
      timestamp: '2026-01-01T00:00:00Z',
      action: 'created',
      userId: 'system',
      userName: 'System',
      details: 'Quarterly filing generated',
    },
  ],
};

describe('QuarterlyFilingReviewWizard', () => {
  const mockOnComplete = vi.fn();
  const mockOnCancel = vi.fn();
  const mockOnExport = vi.fn().mockResolvedValue(undefined);
  const mockOnMarkReviewed = vi.fn().mockResolvedValue(undefined);
  const mockOnMarkFiled = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderWizard = (props: Partial<Parameters<typeof QuarterlyFilingReviewWizard>[0]> = {}) => {
    return render(
      <QuarterlyFilingReviewWizard
        filing={mockFiling}
        isOpen={true}
        onComplete={mockOnComplete}
        onCancel={mockOnCancel}
        onExport={mockOnExport}
        onMarkReviewed={mockOnMarkReviewed}
        onMarkFiled={mockOnMarkFiled}
        {...props}
      />
    );
  };

  describe('Wizard Initialization', () => {
    it('renders wizard when isOpen is true', () => {
      renderWizard();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('does not render wizard when isOpen is false', () => {
      renderWizard({ isOpen: false });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('displays correct title with quarter', () => {
      renderWizard();
      expect(screen.getByText('Q1 2026 Quarterly Filing Review')).toBeInTheDocument();
    });

    it('shows breadcrumbs with all steps', () => {
      renderWizard();
      // First step title appears in both breadcrumb and content
      expect(screen.getAllByText('Review Summary').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Export Reports')).toBeInTheDocument();
      expect(screen.getByText('Mark Reviewed')).toBeInTheDocument();
      expect(screen.getByText('File & Confirm')).toBeInTheDocument();
    });
  });

  describe('Step 1: Review Summary', () => {
    it('displays jurisdiction table', () => {
      renderWizard();
      expect(screen.getByTestId('jurisdiction-table')).toBeInTheDocument();
    });

    it('shows all jurisdictions', () => {
      renderWizard();
      expect(screen.getByText('California')).toBeInTheDocument();
      expect(screen.getByText('New York')).toBeInTheDocument();
    });

    it('displays total tax collected', () => {
      renderWizard();
      // Total appears in summary card and table footer
      const taxAmounts = screen.getAllByText('$13,975.00');
      expect(taxAmounts.length).toBeGreaterThanOrEqual(1);
    });

    it('shows transaction count', () => {
      renderWizard();
      expect(screen.getByText('450')).toBeInTheDocument();
      expect(screen.getByText('280')).toBeInTheDocument();
    });
  });

  describe('Step 2: Export Reports', () => {
    it('renders export buttons for all formats', async () => {
      renderWizard();

      // Navigate to export step
      fireEvent.click(screen.getByText('Next'));

      await waitFor(() => {
        expect(screen.getByTestId('export-csv')).toBeInTheDocument();
        expect(screen.getByTestId('export-pdf')).toBeInTheDocument();
        expect(screen.getByTestId('export-json')).toBeInTheDocument();
      });
    });

    it('calls onExport when export button clicked', async () => {
      const user = userEvent.setup();
      renderWizard();

      fireEvent.click(screen.getByText('Next'));

      await waitFor(() => {
        expect(screen.getByTestId('export-csv')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('export-csv'));

      expect(mockOnExport).toHaveBeenCalledWith('csv');
    });

    it('shows loading state during export', async () => {
      const slowExport = vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
      renderWizard({ onExport: slowExport });

      fireEvent.click(screen.getByText('Next'));

      await waitFor(() => {
        expect(screen.getByTestId('export-csv')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('export-csv'));

      expect(screen.getByText('Exporting...')).toBeInTheDocument();
    });
  });

  describe('Step 3: Mark Reviewed', () => {
    it('requires reviewer name and acknowledgment', async () => {
      renderWizard();

      // Navigate to review step
      fireEvent.click(screen.getByText('Next'));
      fireEvent.click(screen.getByText('Next'));

      await waitFor(() => {
        expect(screen.getByTestId('reviewer-name')).toBeInTheDocument();
      });

      const markReviewedBtn = screen.getByTestId('mark-reviewed-btn');
      expect(markReviewedBtn).toBeDisabled();
    });

    it('enables button when form is complete', async () => {
      const user = userEvent.setup();
      renderWizard();

      fireEvent.click(screen.getByText('Next'));
      fireEvent.click(screen.getByText('Next'));

      await waitFor(() => {
        expect(screen.getByTestId('reviewer-name')).toBeInTheDocument();
      });

      await user.type(screen.getByTestId('reviewer-name'), 'John Doe');
      await user.click(screen.getByTestId('acknowledge-checkbox'));

      expect(screen.getByTestId('mark-reviewed-btn')).not.toBeDisabled();
    });

    it('calls onMarkReviewed when submitted', async () => {
      const user = userEvent.setup();
      renderWizard();

      fireEvent.click(screen.getByText('Next'));
      fireEvent.click(screen.getByText('Next'));

      await waitFor(() => {
        expect(screen.getByTestId('reviewer-name')).toBeInTheDocument();
      });

      await user.type(screen.getByTestId('reviewer-name'), 'John Doe');
      await user.click(screen.getByTestId('acknowledge-checkbox'));
      await user.click(screen.getByTestId('mark-reviewed-btn'));

      expect(mockOnMarkReviewed).toHaveBeenCalledWith('John Doe');
    });
  });

  describe('Step 4: File & Confirm', () => {
    const reviewedFiling: QuarterlyFiling = {
      ...mockFiling,
      status: 'reviewed',
      reviewedBy: 'John Doe',
      reviewedAt: '2026-01-15T10:00:00Z',
    };

    it('shows state portal links', async () => {
      renderWizard({ filing: reviewedFiling });

      // Navigate to file step
      fireEvent.click(screen.getByText('Next'));
      fireEvent.click(screen.getByText('Next'));
      fireEvent.click(screen.getByText('Next'));

      await waitFor(() => {
        expect(screen.getByTestId('confirmation-number')).toBeInTheDocument();
      });

      expect(screen.getByText('California')).toBeInTheDocument();
      expect(screen.getByText('New York')).toBeInTheDocument();
    });

    it('requires confirmation number to file', async () => {
      renderWizard({ filing: reviewedFiling });

      fireEvent.click(screen.getByText('Next'));
      fireEvent.click(screen.getByText('Next'));
      fireEvent.click(screen.getByText('Next'));

      await waitFor(() => {
        expect(screen.getByTestId('confirmation-number')).toBeInTheDocument();
      });

      expect(screen.getByTestId('mark-filed-btn')).toBeDisabled();
    });

    it('calls onMarkFiled when submitted', async () => {
      const user = userEvent.setup();
      renderWizard({ filing: reviewedFiling });

      fireEvent.click(screen.getByText('Next'));
      fireEvent.click(screen.getByText('Next'));
      fireEvent.click(screen.getByText('Next'));

      await waitFor(() => {
        expect(screen.getByTestId('confirmation-number')).toBeInTheDocument();
      });

      await user.type(screen.getByTestId('confirmation-number'), 'ST-2026-Q1-12345');
      await user.click(screen.getByTestId('mark-filed-btn'));

      expect(mockOnMarkFiled).toHaveBeenCalledWith('ST-2026-Q1-12345');
    });
  });

  describe('Navigation', () => {
    it('hides Previous button on first step', () => {
      renderWizard();
      expect(screen.queryByText('Previous')).not.toBeInTheDocument();
    });

    it('shows Previous button after first step', () => {
      renderWizard();
      fireEvent.click(screen.getByText('Next'));
      expect(screen.getByText('Previous')).toBeInTheDocument();
    });

    it('calls onCancel when Cancel clicked', () => {
      renderWizard();
      fireEvent.click(screen.getByText('Cancel'));
      expect(mockOnCancel).toHaveBeenCalled();
    });
  });

  describe('Audit Trail', () => {
    it('displays audit trail entries', () => {
      renderWizard();
      expect(screen.getByTestId('audit-trail')).toBeInTheDocument();
      expect(screen.getByText(/created - System/)).toBeInTheDocument();
    });
  });

  describe('Filed State', () => {
    const filedFiling: QuarterlyFiling = {
      ...mockFiling,
      status: 'filed',
      reviewedBy: 'John Doe',
      reviewedAt: '2026-01-15T10:00:00Z',
      filedAt: '2026-01-20T14:00:00Z',
      confirmationNumber: 'ST-2026-Q1-78432',
    };

    it('shows completion message for filed status', async () => {
      renderWizard({ filing: filedFiling });

      fireEvent.click(screen.getByText('Next'));
      fireEvent.click(screen.getByText('Next'));
      fireEvent.click(screen.getByText('Next'));

      await waitFor(() => {
        expect(screen.getByText('Filing Complete!')).toBeInTheDocument();
      });

      expect(screen.getByText('ST-2026-Q1-78432')).toBeInTheDocument();
    });
  });
});
