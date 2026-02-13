/**
 * ArticleDetail Tests - GREEN PHASE
 *
 * Tests for the KB Article Detail page with markdown rendering,
 * related articles, and feedback functionality.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ArticleDetailPage from '../pages/ArticleDetailPage';
import type { KBArticle } from '../types';

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

// Mock window.print
const mockPrint = vi.fn();
Object.defineProperty(window, 'print', { value: mockPrint, configurable: true });

// Mock clipboard - define as a writable mock that can be reassigned
const mockWriteText = vi.fn().mockResolvedValue(undefined);

// Mock fetch for API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Test wrapper with providers and router
const createWrapper = (initialRoute = '/knowledge-base/article-001') => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="/knowledge-base/:articleId" element={children} />
          <Route path="/knowledge-base" element={<div>KB List</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

// Mock article data for testing
const mockArticle: KBArticle = {
  id: 'article-001',
  title: 'VPN Troubleshooting Guide',
  content: `# VPN Troubleshooting Guide

## Common Issues

### Connection Timeout
If you experience connection timeouts:
1. Check your internet connection
2. Verify VPN server is reachable
3. Try a different VPN server

### Authentication Failed
If authentication fails:
- Verify your credentials
- Check if MFA is required
- Contact IT support if issues persist

## Advanced Troubleshooting

\`\`\`bash
# Check VPN status
vpnclient status

# Reset VPN connection
vpnclient disconnect && vpnclient connect
\`\`\`

For more help, contact support@company.com`,
  category: 'Network',
  tags: ['vpn', 'troubleshooting', 'remote-access', 'network'],
  author: 'IT Support Team',
  created_at: '2025-06-15T10:00:00Z',
  updated_at: '2025-12-20T14:30:00Z',
};

const mockRelatedArticles = [
  { id: 'article-002', title: 'Remote Access Setup', category: 'Getting Started' },
  { id: 'article-003', title: 'Network Security Best Practices', category: 'Security' },
  { id: 'article-004', title: 'Two-Factor Authentication Guide', category: 'Security' },
];

describe('ArticleDetailPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockPrint.mockReset();
    mockWriteText.mockReset();
    mockWriteText.mockResolvedValue(undefined);
    // Ensure clipboard is properly mocked for each test
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: mockWriteText },
      configurable: true,
      writable: true,
    });
  });

  describe('Content Display', () => {
    test('displays article title', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockArticle }),
      });

      render(<ArticleDetailPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('article-title')).toBeInTheDocument();
      });

      // Title appears in multiple places (breadcrumb, h1, markdown content), so use getByTestId
      expect(screen.getByTestId('article-title')).toHaveTextContent('VPN Troubleshooting Guide');
    });

    test('renders article content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockArticle }),
      });

      render(<ArticleDetailPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('article-body')).toBeInTheDocument();
      });
    });

    test('displays category badge', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockArticle }),
      });

      render(<ArticleDetailPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('article-category')).toBeInTheDocument();
      });

      // Category badge should contain the text
      expect(screen.getByTestId('article-category')).toHaveTextContent('Network');
    });

    test('displays article tags', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockArticle }),
      });

      render(<ArticleDetailPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('article-tags')).toBeInTheDocument();
      });

      expect(screen.getByText('vpn')).toBeInTheDocument();
      expect(screen.getByText('troubleshooting')).toBeInTheDocument();
    });

    test('displays author information', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockArticle }),
      });

      render(<ArticleDetailPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('article-author')).toBeInTheDocument();
      });

      expect(screen.getByText(/IT Support Team/)).toBeInTheDocument();
    });

    test('displays last updated date', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockArticle }),
      });

      render(<ArticleDetailPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('article-updated')).toBeInTheDocument();
      });

      expect(screen.getByText(/December 20, 2025/)).toBeInTheDocument();
    });
  });

  describe('Related Articles', () => {
    test('displays related articles section', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockArticle }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockRelatedArticles }),
        });

      render(<ArticleDetailPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('related-articles')).toBeInTheDocument();
      });
    });

    test('displays related article titles', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockArticle }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockRelatedArticles }),
        });

      render(<ArticleDetailPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Remote Access Setup')).toBeInTheDocument();
      });
    });

    test('shows message when no related articles', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockArticle }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: [] }),
        });

      render(<ArticleDetailPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('no-related-articles')).toBeInTheDocument();
      });
    });
  });

  describe('Navigation', () => {
    test('back button exists', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockArticle }),
      });

      render(<ArticleDetailPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('back-to-kb')).toBeInTheDocument();
      });
    });

    test('breadcrumb navigation exists', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockArticle }),
      });

      render(<ArticleDetailPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
      });
    });
  });

  describe('Feedback', () => {
    test('displays feedback prompt', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockArticle }),
      });

      render(<ArticleDetailPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('feedback-prompt')).toBeInTheDocument();
      });

      expect(screen.getByText('Was this article helpful?')).toBeInTheDocument();
    });

    test('has thumbs up button', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockArticle }),
      });

      render(<ArticleDetailPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('thumbs-up')).toBeInTheDocument();
      });
    });

    test('has thumbs down button', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockArticle }),
      });

      render(<ArticleDetailPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('thumbs-down')).toBeInTheDocument();
      });
    });

    test('shows thank you message after feedback', async () => {
      const user = userEvent.setup();

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: mockArticle }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: [] }), // related articles
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'success' }), // feedback submission
        });

      render(<ArticleDetailPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('thumbs-up')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('thumbs-up'));

      await waitFor(() => {
        expect(screen.getByTestId('feedback-thanks')).toBeInTheDocument();
      });

      expect(screen.getByText('Thank you for your feedback!')).toBeInTheDocument();
    });
  });

  describe('Loading and Error States', () => {
    test('shows loading state while fetching article', async () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));

      render(<ArticleDetailPage />, { wrapper: createWrapper() });

      expect(screen.getByTestId('loading-state')).toBeInTheDocument();
    });

    test('shows error state when article not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'error',
            code: 'ARTICLE_NOT_FOUND',
            message: 'Article not found',
          }),
      });

      render(<ArticleDetailPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('error-state')).toBeInTheDocument();
      });

      expect(screen.getByText('Article not found')).toBeInTheDocument();
    });

    test('shows error state on API failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      render(<ArticleDetailPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('error-state')).toBeInTheDocument();
      });
    });

    test('has back button in error state', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      render(<ArticleDetailPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('back-button')).toBeInTheDocument();
      });
    });
  });

  describe('Print and Share', () => {
    test('print button triggers print', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockArticle }),
      });

      render(<ArticleDetailPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('print-button')).toBeInTheDocument();
      });

      // Use fireEvent instead of userEvent to avoid potential conflicts
      fireEvent.click(screen.getByTestId('print-button'));
      expect(mockPrint).toHaveBeenCalled();
    });

    test('copy link button copies URL', async () => {
      mockWriteText.mockResolvedValue(undefined);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockArticle }),
      });

      render(<ArticleDetailPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('copy-link-button')).toBeInTheDocument();
      });

      // Use fireEvent instead of userEvent to avoid clipboard mock conflict
      fireEvent.click(screen.getByTestId('copy-link-button'));

      await waitFor(() => {
        expect(mockWriteText).toHaveBeenCalled();
      });
    });
  });
});
