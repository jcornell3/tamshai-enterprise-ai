/**
 * OrgChartPage Tests
 *
 * Tests for the Organization Chart page including:
 * - Hierarchical tree display
 * - Expand/collapse functionality
 * - Search
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import OrgChartPage from '../pages/OrgChartPage';
import type { OrgChartNode } from '../types';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

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

// Mock data - API returns an array of root nodes (typically one CEO)
const mockOrgChartNode: OrgChartNode = {
  employee_id: 'emp-ceo',
  name: 'Jane CEO',
  title: 'Chief Executive Officer',
  department: 'Executive',
  profile_photo_url: null,
  direct_reports: [
    {
      employee_id: 'emp-vp-eng',
      name: 'Bob Engineering',
      title: 'VP Engineering',
      department: 'Engineering',
      profile_photo_url: null,
      direct_reports: [],
    },
  ],
};

// API returns array of OrgChartNode
const mockOrgChart: OrgChartNode[] = [mockOrgChartNode];

describe('OrgChartPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('Page Rendering', () => {
    test('displays page title', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockOrgChart }),
      });

      render(<OrgChartPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Organization Chart')).toBeInTheDocument();
    });

    test('displays page subtitle', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockOrgChart }),
      });

      render(<OrgChartPage />, { wrapper: createWrapper() });

      expect(screen.getByText('View company structure and reporting relationships')).toBeInTheDocument();
    });
  });

  describe('Org Chart Display', () => {
    test('displays root node name when data loads', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockOrgChart }),
      });

      render(<OrgChartPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Jane CEO')).toBeInTheDocument();
      });
    });

    test('displays root node title', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockOrgChart }),
      });

      render(<OrgChartPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Chief Executive Officer')).toBeInTheDocument();
      });
    });

    test('displays loading state while fetching', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));

      render(<OrgChartPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Loading organization chart...')).toBeInTheDocument();
    });
  });

  describe('Expand/Collapse Buttons', () => {
    test('displays Expand All button', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockOrgChart }),
      });

      render(<OrgChartPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Expand All')).toBeInTheDocument();
    });

    test('displays Collapse All button', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockOrgChart }),
      });

      render(<OrgChartPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Collapse All')).toBeInTheDocument();
    });
  });

  describe('Search', () => {
    test('displays search input', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockOrgChart }),
      });

      render(<OrgChartPage />, { wrapper: createWrapper() });

      expect(screen.getByPlaceholderText(/search by name/i)).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    test('shows error message on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      });

      render(<OrgChartPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/error loading org chart/i)).toBeInTheDocument();
      });
    });

    test('shows empty state when no data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: null }),
      });

      render(<OrgChartPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('No organization data available')).toBeInTheDocument();
      });
    });
  });
});
