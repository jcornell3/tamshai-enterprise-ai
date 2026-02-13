/**
 * AIQueryPage Tests
 *
 * Tests for the AI Query chat interface including:
 * - Chat UI display
 * - Message input
 * - Example prompts
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import AIQueryPage from '../pages/AIQueryPage';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock crypto.randomUUID
vi.stubGlobal('crypto', {
  randomUUID: () => 'test-uuid-' + Math.random().toString(36).substring(7),
});

// Test wrapper
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

describe('AIQueryPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('Page Rendering', () => {
    test('displays page title', () => {
      render(<AIQueryPage />, { wrapper: createWrapper() });

      expect(screen.getByText('AI Query')).toBeInTheDocument();
    });

    test('displays page description', () => {
      render(<AIQueryPage />, { wrapper: createWrapper() });

      expect(screen.getByText(/ask questions about payroll data/i)).toBeInTheDocument();
    });
  });

  describe('Chat Interface', () => {
    test('displays empty state with example prompts', () => {
      render(<AIQueryPage />, { wrapper: createWrapper() });

      expect(screen.getByText(/ask me about payroll/i)).toBeInTheDocument();
      expect(screen.getByText(/show my last pay stub/i)).toBeInTheDocument();
    });

    test('displays message input field', () => {
      render(<AIQueryPage />, { wrapper: createWrapper() });

      expect(screen.getByPlaceholderText(/ask about payroll/i)).toBeInTheDocument();
    });

    test('displays send button', () => {
      render(<AIQueryPage />, { wrapper: createWrapper() });

      expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
    });

    test('send button is disabled when input is empty', () => {
      render(<AIQueryPage />, { wrapper: createWrapper() });

      const sendButton = screen.getByRole('button', { name: /send/i });
      expect(sendButton).toBeDisabled();
    });

    test('send button is enabled when input has text', () => {
      render(<AIQueryPage />, { wrapper: createWrapper() });

      const input = screen.getByPlaceholderText(/ask about payroll/i);
      fireEvent.change(input, { target: { value: 'Test query' } });

      const sendButton = screen.getByRole('button', { name: /send/i });
      expect(sendButton).not.toBeDisabled();
    });
  });

  describe('Message Submission', () => {
    test('clears input after submitting message', async () => {
      // Mock a streaming response
      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('data: {"type":"content_block_delta","delta":{"text":"Hello"}}\n\n'),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => mockReader,
        },
      });

      render(<AIQueryPage />, { wrapper: createWrapper() });

      const input = screen.getByPlaceholderText(/ask about payroll/i);
      fireEvent.change(input, { target: { value: 'Test query' } });

      const sendButton = screen.getByRole('button', { name: /send/i });
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(input).toHaveValue('');
      });
    });

    test('displays user message after submission', async () => {
      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('data: {"type":"content_block_delta","delta":{"text":"Response"}}\n\n'),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => mockReader,
        },
      });

      render(<AIQueryPage />, { wrapper: createWrapper() });

      const input = screen.getByPlaceholderText(/ask about payroll/i);
      fireEvent.change(input, { target: { value: 'What is my salary?' } });

      const sendButton = screen.getByRole('button', { name: /send/i });
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(screen.getByText('What is my salary?')).toBeInTheDocument();
      });
    });
  });

  describe('Loading State', () => {
    test('shows loading indicator while waiting for response', async () => {
      // Mock a slow response
      mockFetch.mockImplementation(() => new Promise(() => {}));

      render(<AIQueryPage />, { wrapper: createWrapper() });

      const input = screen.getByPlaceholderText(/ask about payroll/i);
      fireEvent.change(input, { target: { value: 'Test query' } });

      const sendButton = screen.getByRole('button', { name: /send/i });
      fireEvent.click(sendButton);

      // Loading indicator should appear (bouncing dots)
      await waitFor(() => {
        // Check that input is disabled during loading
        expect(input).toBeDisabled();
      });
    });
  });

  describe('Error Handling', () => {
    test('displays error message on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      });

      render(<AIQueryPage />, { wrapper: createWrapper() });

      const input = screen.getByPlaceholderText(/ask about payroll/i);
      fireEvent.change(input, { target: { value: 'Test query' } });

      const sendButton = screen.getByRole('button', { name: /send/i });
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(screen.getByText(/error processing your request/i)).toBeInTheDocument();
      });
    });
  });

  describe('Example Prompts', () => {
    test('displays example about pay stubs', () => {
      render(<AIQueryPage />, { wrapper: createWrapper() });

      expect(screen.getByText(/show my last pay stub/i)).toBeInTheDocument();
    });

    test('displays example about total payroll', () => {
      render(<AIQueryPage />, { wrapper: createWrapper() });

      expect(screen.getByText(/total payroll this month/i)).toBeInTheDocument();
    });

    test('displays example about employee listing', () => {
      render(<AIQueryPage />, { wrapper: createWrapper() });

      expect(screen.getByText(/list employees in california/i)).toBeInTheDocument();
    });
  });
});
