/**
 * AIQueryPage Tests
 *
 * Tests for the AI Query page with Claude integration.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIQueryPage } from '../../pages/AIQueryPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const renderWithProviders = (component: React.ReactNode) => {
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{component}</BrowserRouter>
    </QueryClientProvider>
  );
};

describe('AIQueryPage', () => {
  beforeEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
  });

  it('renders the page title', () => {
    renderWithProviders(<AIQueryPage />);
    expect(screen.getByText('AI Tax Assistant')).toBeInTheDocument();
  });

  it('renders the query input field', () => {
    renderWithProviders(<AIQueryPage />);
    expect(screen.getByPlaceholderText(/ask about tax/i)).toBeInTheDocument();
  });

  it('renders the submit button', () => {
    renderWithProviders(<AIQueryPage />);
    expect(screen.getByRole('button', { name: /send|ask|submit/i })).toBeInTheDocument();
  });

  it('displays example queries', () => {
    renderWithProviders(<AIQueryPage />);

    // Should show example tax-related queries
    expect(screen.getByText(/quarterly estimate/i)).toBeInTheDocument();
  });

  it('submits query when button is clicked', async () => {
    const user = userEvent.setup();

    // Mock SSE response
    const mockEventSource = {
      onmessage: null as ((event: MessageEvent) => void) | null,
      onerror: null as ((event: Event) => void) | null,
      close: vi.fn(),
    };

    global.fetch = vi.fn().mockImplementation(() => {
      // Simulate SSE stream
      setTimeout(() => {
        if (mockEventSource.onmessage) {
          mockEventSource.onmessage(new MessageEvent('message', {
            data: JSON.stringify({ type: 'content_block_delta', delta: { text: 'Your Q1 ' } }),
          }));
          mockEventSource.onmessage(new MessageEvent('message', {
            data: JSON.stringify({ type: 'content_block_delta', delta: { text: 'estimated tax is $15,000.' } }),
          }));
          mockEventSource.onmessage(new MessageEvent('message', {
            data: '[DONE]',
          }));
        }
      }, 100);

      return Promise.resolve({
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn().mockResolvedValue({ done: true }),
          }),
        },
      });
    });

    renderWithProviders(<AIQueryPage />);

    const input = screen.getByPlaceholderText(/ask about tax/i);
    await user.type(input, 'What is my Q1 estimated tax?');

    const submitButton = screen.getByRole('button', { name: /send|ask|submit/i });
    await user.click(submitButton);

    // Should show the query in the message list
    await waitFor(() => {
      expect(screen.getByText('What is my Q1 estimated tax?')).toBeInTheDocument();
    });
  });

  it('displays loading indicator while streaming response', async () => {
    const user = userEvent.setup();

    global.fetch = vi.fn().mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    renderWithProviders(<AIQueryPage />);

    const input = screen.getByPlaceholderText(/ask about tax/i);
    await user.type(input, 'What are my tax obligations?');

    const submitButton = screen.getByRole('button', { name: /send|ask|submit/i });
    await user.click(submitButton);

    // The input should be disabled while loading
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/ask about tax/i)).toBeDisabled();
    });
  });

  it('clears input after submitting', async () => {
    const user = userEvent.setup();

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      body: {
        getReader: () => ({
          read: vi.fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode('data: {"type":"content_block_delta","delta":{"text":"Response"}}\n\n')
            })
            .mockResolvedValueOnce({ done: true }),
        }),
      },
    });

    renderWithProviders(<AIQueryPage />);

    const input = screen.getByPlaceholderText(/ask about tax/i) as HTMLInputElement;
    await user.type(input, 'Test query');

    const submitButton = screen.getByRole('button', { name: /send|ask|submit/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(input.value).toBe('');
    });
  });

  it('handles keyboard enter to submit', async () => {
    const user = userEvent.setup();

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      body: {
        getReader: () => ({
          read: vi.fn().mockResolvedValue({ done: true }),
        }),
      },
    });

    renderWithProviders(<AIQueryPage />);

    const input = screen.getByPlaceholderText(/ask about tax/i);
    await user.type(input, 'Test query{enter}');

    await waitFor(() => {
      expect(screen.getByText('Test query')).toBeInTheDocument();
    });
  });

  it('displays error message on API failure', async () => {
    const user = userEvent.setup();

    global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

    renderWithProviders(<AIQueryPage />);

    const input = screen.getByPlaceholderText(/ask about tax/i);
    await user.type(input, 'Test query');

    const submitButton = screen.getByRole('button', { name: /send|ask|submit/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('disables submit button when input is empty', () => {
    renderWithProviders(<AIQueryPage />);

    const submitButton = screen.getByRole('button', { name: /send|ask|submit/i });
    expect(submitButton).toBeDisabled();
  });

  it('enables submit button when input has text', async () => {
    const user = userEvent.setup();

    renderWithProviders(<AIQueryPage />);

    const input = screen.getByPlaceholderText(/ask about tax/i);
    await user.type(input, 'Test');

    const submitButton = screen.getByRole('button', { name: /send|ask|submit/i });
    expect(submitButton).not.toBeDisabled();
  });

  it('displays approval card when confirmation is required', async () => {
    const user = userEvent.setup();

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      body: {
        getReader: () => ({
          read: vi.fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode(
                'data: {"type":"pending_confirmation","confirmationId":"conf-123","message":"Confirm filing submission?"}\n\n'
              ),
            })
            .mockResolvedValueOnce({ done: true }),
        }),
      },
    });

    renderWithProviders(<AIQueryPage />);

    const input = screen.getByPlaceholderText(/ask about tax/i);
    await user.type(input, 'Submit my Q1 tax filing');

    const submitButton = screen.getByRole('button', { name: /send|ask|submit/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByTestId('approval-card')).toBeInTheDocument();
    });
  });
});
