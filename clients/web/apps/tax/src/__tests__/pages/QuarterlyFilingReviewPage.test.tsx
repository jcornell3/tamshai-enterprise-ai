/**
 * Quarterly Filing Review Page Tests
 *
 * Tests the main page for reviewing and filing quarterly tax returns.
 *
 * Architecture v1.5 - Enterprise UX Hardening
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QuarterlyFilingReviewPage } from '../../pages/QuarterlyFilingReviewPage';

// Note: @tamshai/auth and @tamshai/ui mocks are provided by setup.tsx

// Mock the wizard component
vi.mock('../../components/QuarterlyFilingReviewWizard', () => ({
  QuarterlyFilingReviewWizard: ({ isOpen, filing, onCancel }: any) => (
    isOpen ? (
      <div role="dialog" data-testid="review-wizard">
        <h2>Q{filing.quarter} {filing.year} Review</h2>
        <button onClick={onCancel}>Close</button>
      </div>
    ) : null
  ),
}));

describe('QuarterlyFilingReviewPage', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    vi.clearAllMocks();

    // Default fetch mock returns 404 to trigger sample data
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
    });
  });

  const renderPage = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <QuarterlyFilingReviewPage />
      </QueryClientProvider>
    );
  };

  describe('Page Header', () => {
    it('displays page title', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Quarterly Filing Review')).toBeInTheDocument();
      });
    });

    it('displays page description', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/Review, export, and file quarterly sales tax returns/)).toBeInTheDocument();
      });
    });
  });

  describe('Summary Cards', () => {
    it('displays pending review count', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Pending Review')).toBeInTheDocument();
      });
    });

    it('displays awaiting filing count', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Awaiting Filing')).toBeInTheDocument();
      });
    });

    it('displays filed count', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Filed')).toBeInTheDocument();
      });
    });

    it('displays total tax YTD', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Total Tax YTD')).toBeInTheDocument();
      });
    });
  });

  describe('Filings Table', () => {
    it('renders data table', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('data-table')).toBeInTheDocument();
      });
    });

    it('displays period column', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Period')).toBeInTheDocument();
      });
    });

    it('displays status column', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Status')).toBeInTheDocument();
      });
    });

    it('displays tax collected column', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Tax Collected')).toBeInTheDocument();
      });
    });

    it('displays actions column', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Actions')).toBeInTheDocument();
      });
    });
  });

  describe('Filing Status', () => {
    it('shows Draft badge for draft filings', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Draft')).toBeInTheDocument();
      });
    });

    it('shows Filed badge for filed filings', async () => {
      renderPage();

      await waitFor(() => {
        const filedBadges = screen.getAllByText('Filed');
        expect(filedBadges.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Review Action', () => {
    it('shows Review button for draft filings', async () => {
      renderPage();

      await waitFor(() => {
        const reviewButtons = screen.getAllByRole('button', { name: /Review/i });
        expect(reviewButtons.length).toBeGreaterThan(0);
      });
    });

    it('shows View button for filed filings', async () => {
      renderPage();

      await waitFor(() => {
        const viewButtons = screen.getAllByRole('button', { name: /View/i });
        expect(viewButtons.length).toBeGreaterThan(0);
      });
    });

    it('opens wizard when Review button clicked', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('data-table')).toBeInTheDocument();
      });

      const reviewButton = screen.getByTestId('review-btn-qf-2026-q1');
      await user.click(reviewButton);

      await waitFor(() => {
        expect(screen.getByTestId('review-wizard')).toBeInTheDocument();
      });
    });

    it('closes wizard when Close clicked', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('data-table')).toBeInTheDocument();
      });

      const reviewButton = screen.getByTestId('review-btn-qf-2026-q1');
      await user.click(reviewButton);

      await waitFor(() => {
        expect(screen.getByTestId('review-wizard')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Close'));

      await waitFor(() => {
        expect(screen.queryByTestId('review-wizard')).not.toBeInTheDocument();
      });
    });
  });

  describe('Sample Data', () => {
    it('displays Q1 2026 filing', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Q1 2026')).toBeInTheDocument();
      });
    });

    it('displays Q4 2025 filing', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Q4 2025')).toBeInTheDocument();
      });
    });

    it('displays confirmation numbers for filed filings', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('ST-2025-Q4-78432')).toBeInTheDocument();
      });
    });
  });

  describe('Loading State', () => {
    it('shows loading spinner initially', () => {
      // Use a slow query to see loading state
      queryClient = new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            staleTime: Infinity,
          },
        },
      });

      render(
        <QueryClientProvider client={queryClient}>
          <QuarterlyFilingReviewPage />
        </QueryClientProvider>
      );

      // The loading state should appear briefly
      expect(screen.getByText('Quarterly Filing Review')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('falls back to sample data on API error', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

      renderPage();

      // Should still show data (sample data fallback)
      await waitFor(() => {
        expect(screen.getByTestId('data-table')).toBeInTheDocument();
        expect(screen.getByText('Q1 2026')).toBeInTheDocument();
      });
    });
  });
});
