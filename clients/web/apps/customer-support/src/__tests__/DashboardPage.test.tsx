import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DashboardPage from '../pages/DashboardPage';

// Mock useCustomerAuth
vi.mock('../auth', () => ({
  useCustomerAuth: () => ({
    customerProfile: {
      userId: 'user-123',
      firstName: 'Jane',
      lastName: 'Smith',
      name: 'Jane Smith',
      email: 'jane.smith@acme.com',
      organizationId: 'org-acme-001',
      organizationName: 'Acme Corporation',
      roles: ['lead-customer'],
      isLeadContact: true,
    },
    accessToken: 'mock-token',
    isLeadContact: true,
    organizationName: 'Acme Corporation',
  }),
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

const renderWithProviders = (component: React.ReactNode) => {
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{component}</BrowserRouter>
    </QueryClientProvider>
  );
};

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders welcome message with user name', () => {
    renderWithProviders(<DashboardPage />);
    expect(screen.getByText(/Welcome back, Jane!/)).toBeInTheDocument();
  });

  it('displays organization name', () => {
    renderWithProviders(<DashboardPage />);
    expect(screen.getByText(/Acme Corporation/)).toBeInTheDocument();
  });

  it('shows Lead Contact badge for lead users', () => {
    renderWithProviders(<DashboardPage />);
    expect(screen.getByText('Lead Contact')).toBeInTheDocument();
  });

  it('renders quick action cards', () => {
    renderWithProviders(<DashboardPage />);
    expect(screen.getByText('Create New Ticket')).toBeInTheDocument();
    expect(screen.getByText('View My Tickets')).toBeInTheDocument();
    expect(screen.getByText('Knowledge Base')).toBeInTheDocument();
  });

  it('renders stat cards', () => {
    renderWithProviders(<DashboardPage />);
    expect(screen.getByText('Open Tickets')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Resolved (30d)')).toBeInTheDocument();
    expect(screen.getByText('Total Tickets')).toBeInTheDocument();
  });

  it('renders recent activity section', () => {
    renderWithProviders(<DashboardPage />);
    expect(screen.getByText('Recent Activity')).toBeInTheDocument();
  });
});
