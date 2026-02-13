/**
 * AuditLogPage Tests
 *
 * Tests for the Tax Audit Log page showing compliance tracking.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditLogPage } from '../../pages/AuditLogPage';
import { AuditLogEntry } from '../../types';

const mockAuditLogs: AuditLogEntry[] = [
  {
    id: 'log-1',
    timestamp: '2026-02-01T14:30:00Z',
    action: 'submit',
    entityType: 'filing',
    entityId: 'filing-1',
    userId: 'user-001',
    userName: 'Alice Chen',
    newValue: { status: 'filed', confirmationNumber: 'IRS-123' },
    ipAddress: '192.168.1.100',
  },
  {
    id: 'log-2',
    timestamp: '2026-01-31T10:15:00Z',
    action: 'create',
    entityType: 'filing',
    entityId: 'filing-1',
    userId: 'user-001',
    userName: 'Alice Chen',
    newValue: { entityName: 'Acme LLC', amount: 85000 },
  },
  {
    id: 'log-3',
    timestamp: '2026-01-28T09:00:00Z',
    action: 'update',
    entityType: 'estimate',
    entityId: 'est-1',
    userId: 'user-002',
    userName: 'Bob Martinez',
    previousValue: { federalEstimate: 14000 },
    newValue: { federalEstimate: 15000 },
    notes: 'Adjusted based on Q4 income',
  },
  {
    id: 'log-4',
    timestamp: '2026-01-25T16:45:00Z',
    action: 'approve',
    entityType: 'registration',
    entityId: 'reg-1',
    userId: 'user-003',
    userName: 'Carol Johnson',
    previousValue: { status: 'pending' },
    newValue: { status: 'active' },
  },
];

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

describe('AuditLogPage', () => {
  beforeEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
  });

  it('renders the page title', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockAuditLogs }),
    });

    renderWithProviders(<AuditLogPage />);

    expect(screen.getByText('Audit Log')).toBeInTheDocument();
  });

  it('displays loading state while fetching data', () => {
    global.fetch = vi.fn().mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    renderWithProviders(<AuditLogPage />);

    expect(screen.getByText('Loading audit log...')).toBeInTheDocument();
  });

  it('displays table headers', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockAuditLogs }),
    });

    renderWithProviders(<AuditLogPage />);

    await waitFor(() => {
      expect(screen.getByText('Timestamp')).toBeInTheDocument();
      expect(screen.getByText('Action')).toBeInTheDocument();
      expect(screen.getByText('Entity Type')).toBeInTheDocument();
      expect(screen.getByText('User')).toBeInTheDocument();
      expect(screen.getByText('Details')).toBeInTheDocument();
    });
  });

  it('displays audit log entries', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockAuditLogs }),
    });

    renderWithProviders(<AuditLogPage />);

    await waitFor(() => {
      // Alice Chen appears multiple times (created and submitted filing)
      const aliceEntries = screen.getAllByText('Alice Chen');
      expect(aliceEntries.length).toBeGreaterThan(0);
      expect(screen.getByText('Bob Martinez')).toBeInTheDocument();
      expect(screen.getByText('Carol Johnson')).toBeInTheDocument();
    });
  });

  it('displays action types correctly', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockAuditLogs }),
    });

    renderWithProviders(<AuditLogPage />);

    await waitFor(() => {
      expect(screen.getByText('Submit')).toBeInTheDocument();
      expect(screen.getByText('Create')).toBeInTheDocument();
      expect(screen.getByText('Update')).toBeInTheDocument();
      expect(screen.getByText('Approve')).toBeInTheDocument();
    });
  });

  it('displays entity types correctly', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockAuditLogs }),
    });

    renderWithProviders(<AuditLogPage />);

    await waitFor(() => {
      const filingEntries = screen.getAllByText('Filing');
      expect(filingEntries.length).toBe(2);
      expect(screen.getByText('Estimate')).toBeInTheDocument();
      expect(screen.getByText('Registration')).toBeInTheDocument();
    });
  });

  it('displays IP address when available', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockAuditLogs }),
    });

    renderWithProviders(<AuditLogPage />);

    await waitFor(() => {
      expect(screen.getByText('192.168.1.100')).toBeInTheDocument();
    });
  });

  it('displays notes when available', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockAuditLogs }),
    });

    renderWithProviders(<AuditLogPage />);

    await waitFor(() => {
      expect(screen.getByText('Adjusted based on Q4 income')).toBeInTheDocument();
    });
  });

  it('displays error message on fetch failure', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'error',
          code: 'FETCH_ERROR',
          message: 'Failed to load audit log',
        }),
    });

    renderWithProviders(<AuditLogPage />);

    await waitFor(() => {
      expect(screen.getByText('Error loading audit log')).toBeInTheDocument();
    });
  });

  it('displays timestamps in readable format', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockAuditLogs }),
    });

    renderWithProviders(<AuditLogPage />);

    await waitFor(() => {
      // Should display formatted timestamps
      expect(screen.getByText(/Feb 1, 2026/)).toBeInTheDocument();
    });
  });
});
