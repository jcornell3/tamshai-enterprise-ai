/**
 * Lead Conversion Wizard Tests
 *
 * Multi-step wizard for converting qualified leads to opportunities.
 * Follows Salesforce-style lead conversion pattern.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import LeadConversionWizard from './LeadConversionWizard';
import type { Lead, Customer } from '../types';

// Mock auth module
vi.mock('@tamshai/auth', () => ({
  useAuth: () => ({
    userContext: { sub: 'user-123', roles: ['sales-write'] },
    getAccessToken: () => 'test-token',
  }),
  canModifySales: () => true,
  apiConfig: { mcpGatewayUrl: '' },
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Test data
const mockLead: Lead = {
  _id: 'lead-001',
  company_name: 'Acme Corp',
  contact_name: 'John Doe',
  contact_email: 'john.doe@acme.com',
  contact_phone: '555-0100',
  status: 'QUALIFIED',
  source: 'Website',
  score: {
    total: 85,
    factors: {
      company_size: 20,
      industry_fit: 25,
      engagement: 20,
      timing: 20,
    },
  },
  owner_id: 'user-123',
  owner_name: 'Sales Rep',
  industry: 'Technology',
  company_size: '50-200',
  notes: 'High potential lead',
  created_at: '2026-01-15T10:00:00Z',
  updated_at: '2026-02-01T14:30:00Z',
};

const mockCustomers: Customer[] = [
  {
    _id: 'cust-001',
    company_name: 'Existing Corp',
    industry: 'Finance',
    primary_contact: { name: 'Jane Smith', email: 'jane@existing.com' },
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
  {
    _id: 'cust-002',
    company_name: 'Another Inc',
    industry: 'Healthcare',
    primary_contact: { name: 'Bob Wilson', email: 'bob@another.com' },
    created_at: '2025-02-01T00:00:00Z',
    updated_at: '2025-02-01T00:00:00Z',
  },
];

// Test wrapper
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
};

describe('LeadConversionWizard', () => {
  const onClose = vi.fn();
  const onComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('Basic Rendering', () => {
    it('renders wizard with lead information', () => {
      render(
        <LeadConversionWizard lead={mockLead} onClose={onClose} onComplete={onComplete} />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText('Convert Lead')).toBeInTheDocument();
      expect(screen.getByText(/Acme Corp/)).toBeInTheDocument();
    });

    it('shows step indicator', () => {
      render(
        <LeadConversionWizard lead={mockLead} onClose={onClose} onComplete={onComplete} />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText(/Step 1 of/)).toBeInTheDocument();
    });

    it('renders cancel button', () => {
      render(
        <LeadConversionWizard lead={mockLead} onClose={onClose} onComplete={onComplete} />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });
  });

  describe('Step 1: Verify Lead', () => {
    it('displays lead details for verification', () => {
      render(
        <LeadConversionWizard lead={mockLead} onClose={onClose} onComplete={onComplete} />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('john.doe@acme.com')).toBeInTheDocument();
      expect(screen.getByText(/85/)).toBeInTheDocument(); // Score
    });

    it('shows lead score factors', () => {
      render(
        <LeadConversionWizard lead={mockLead} onClose={onClose} onComplete={onComplete} />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText(/Company Size/)).toBeInTheDocument();
      expect(screen.getByText(/Industry Fit/)).toBeInTheDocument();
    });

    it('proceeds to next step when Next clicked', async () => {
      render(
        <LeadConversionWizard lead={mockLead} onClose={onClose} onComplete={onComplete} />,
        { wrapper: createWrapper() }
      );

      fireEvent.click(screen.getByRole('button', { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText(/Step 2 of/)).toBeInTheDocument();
      });
    });
  });

  describe('Step 2: Create Opportunity', () => {
    beforeEach(async () => {
      render(
        <LeadConversionWizard lead={mockLead} onClose={onClose} onComplete={onComplete} />,
        { wrapper: createWrapper() }
      );
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
      await waitFor(() => {
        expect(screen.getByText(/Step 2 of/)).toBeInTheDocument();
      });
    });

    it('displays opportunity form with pre-filled title', () => {
      expect(screen.getByLabelText(/opportunity title/i)).toHaveValue('Acme Corp - New Business');
    });

    it('allows entering opportunity value', () => {
      const valueInput = screen.getByLabelText(/opportunity value/i);
      fireEvent.change(valueInput, { target: { value: '50000' } });
      expect(valueInput).toHaveValue(50000);
    });

    it('allows selecting opportunity stage', () => {
      const stageSelect = screen.getByLabelText(/stage/i);
      fireEvent.change(stageSelect, { target: { value: 'QUALIFIED' } });
      expect(stageSelect).toHaveValue('QUALIFIED');
    });

    it('validates required fields before proceeding', async () => {
      // Clear the title to trigger validation
      const titleInput = screen.getByLabelText(/opportunity title/i);
      fireEvent.change(titleInput, { target: { value: '' } });

      fireEvent.click(screen.getByRole('button', { name: /next/i }));

      await waitFor(() => {
        // Use getAllByText since error shows in both wizard and inline
        const errorMessages = screen.getAllByText(/title is required/i);
        expect(errorMessages.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Step 3: Customer Selection', () => {
    beforeEach(async () => {
      // Mock customers fetch
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockCustomers }),
      });

      render(
        <LeadConversionWizard lead={mockLead} onClose={onClose} onComplete={onComplete} />,
        { wrapper: createWrapper() }
      );

      // Navigate to step 3
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
      await waitFor(() => {
        expect(screen.getByText(/Step 2 of/)).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
      await waitFor(() => {
        expect(screen.getByText(/Step 3 of/)).toBeInTheDocument();
      });
    });

    it('displays customer selection options', () => {
      expect(screen.getByText(/Create new customer/i)).toBeInTheDocument();
      expect(screen.getByText(/Link to existing/i)).toBeInTheDocument();
    });

    it('pre-selects create new customer by default', () => {
      const newCustomerRadio = screen.getByRole('radio', { name: /create new customer/i });
      expect(newCustomerRadio).toBeChecked();
    });

    it('shows new customer form when create new selected', () => {
      // Company name should be pre-filled in the new customer form
      const companyInput = screen.getByLabelText(/company name/i);
      expect(companyInput).toHaveValue('Acme Corp');
    });

    it('shows existing customer list when link existing selected', async () => {
      const linkExistingRadio = screen.getByRole('radio', { name: /link to existing/i });
      fireEvent.click(linkExistingRadio);

      await waitFor(() => {
        expect(screen.getByText('Existing Corp')).toBeInTheDocument();
        expect(screen.getByText('Another Inc')).toBeInTheDocument();
      });
    });
  });

  describe('Step 4: Review & Convert', () => {
    beforeEach(async () => {
      // Mock customers fetch
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockCustomers }),
      });

      render(
        <LeadConversionWizard lead={mockLead} onClose={onClose} onComplete={onComplete} />,
        { wrapper: createWrapper() }
      );

      // Navigate through all steps
      for (let i = 0; i < 3; i++) {
        fireEvent.click(screen.getByRole('button', { name: /next/i }));
        await waitFor(() => {
          expect(screen.getByText(new RegExp(`Step ${i + 2} of`))).toBeInTheDocument();
        });
      }
    });

    it('displays summary of conversion', () => {
      // Multiple elements contain "Review"
      const reviewElements = screen.getAllByText(/Review/i);
      expect(reviewElements.length).toBeGreaterThan(0);
      // Company name appears in summary
      const companyNames = screen.getAllByText('Acme Corp');
      expect(companyNames.length).toBeGreaterThan(0);
    });

    it('shows convert button instead of next on final step', () => {
      expect(screen.getByRole('button', { name: /convert/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument();
    });

    it('allows navigating back to previous steps', async () => {
      fireEvent.click(screen.getByRole('button', { name: /previous/i }));

      await waitFor(() => {
        expect(screen.getByText(/Step 3 of/)).toBeInTheDocument();
      });
    });
  });

  describe('Conversion Flow', () => {
    it('calls convert API on submit', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          status: 'success',
          data: { leadId: 'lead-001', opportunityId: 'opp-001', customerId: 'cust-new' },
        }),
      });

      render(
        <LeadConversionWizard lead={mockLead} onClose={onClose} onComplete={onComplete} />,
        { wrapper: createWrapper() }
      );

      // Navigate through all steps and submit
      for (let i = 0; i < 3; i++) {
        fireEvent.click(screen.getByRole('button', { name: /next/i }));
        await waitFor(() => {
          expect(screen.getByText(new RegExp(`Step ${i + 2} of`))).toBeInTheDocument();
        });
      }

      fireEvent.click(screen.getByRole('button', { name: /convert/i }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/mcp/sales/convert_lead'),
          expect.objectContaining({
            method: 'POST',
            body: expect.any(String),
          })
        );
      });
    });

    it('shows loading state during conversion', async () => {
      mockFetch.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'success' }),
        }), 100))
      );

      render(
        <LeadConversionWizard lead={mockLead} onClose={onClose} onComplete={onComplete} />,
        { wrapper: createWrapper() }
      );

      // Navigate through all steps
      for (let i = 0; i < 3; i++) {
        fireEvent.click(screen.getByRole('button', { name: /next/i }));
        await waitFor(() => {
          expect(screen.getByText(new RegExp(`Step ${i + 2} of`))).toBeInTheDocument();
        });
      }

      fireEvent.click(screen.getByRole('button', { name: /convert/i }));

      expect(screen.getByText(/Converting/i)).toBeInTheDocument();
    });

    it('calls onComplete callback on successful conversion', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          status: 'success',
          data: { leadId: 'lead-001', opportunityId: 'opp-001' },
        }),
      });

      render(
        <LeadConversionWizard lead={mockLead} onClose={onClose} onComplete={onComplete} />,
        { wrapper: createWrapper() }
      );

      // Navigate through all steps
      for (let i = 0; i < 3; i++) {
        fireEvent.click(screen.getByRole('button', { name: /next/i }));
        await waitFor(() => {
          expect(screen.getByText(new RegExp(`Step ${i + 2} of`))).toBeInTheDocument();
        });
      }

      fireEvent.click(screen.getByRole('button', { name: /convert/i }));

      await waitFor(() => {
        expect(onComplete).toHaveBeenCalled();
      });
    });

    it('displays error message on conversion failure', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          status: 'error',
          message: 'Failed to convert lead',
          suggestedAction: 'Please try again',
        }),
      });

      render(
        <LeadConversionWizard lead={mockLead} onClose={onClose} onComplete={onComplete} />,
        { wrapper: createWrapper() }
      );

      // Navigate through all steps
      for (let i = 0; i < 3; i++) {
        fireEvent.click(screen.getByRole('button', { name: /next/i }));
        await waitFor(() => {
          expect(screen.getByText(new RegExp(`Step ${i + 2} of`))).toBeInTheDocument();
        });
      }

      fireEvent.click(screen.getByRole('button', { name: /convert/i }));

      await waitFor(() => {
        expect(screen.getByText(/Failed to convert lead/)).toBeInTheDocument();
      });
    });
  });

  describe('Cancel Flow', () => {
    it('calls onClose when cancel clicked', () => {
      render(
        <LeadConversionWizard lead={mockLead} onClose={onClose} onComplete={onComplete} />,
        { wrapper: createWrapper() }
      );

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
      expect(onClose).toHaveBeenCalled();
    });

    it('closes on escape key', () => {
      render(
        <LeadConversionWizard lead={mockLead} onClose={onClose} onComplete={onComplete} />,
        { wrapper: createWrapper() }
      );

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA attributes on wizard container', () => {
      render(
        <LeadConversionWizard lead={mockLead} onClose={onClose} onComplete={onComplete} />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-labelledby');
    });

    it('step content has live region for updates', () => {
      render(
        <LeadConversionWizard lead={mockLead} onClose={onClose} onComplete={onComplete} />,
        { wrapper: createWrapper() }
      );

      const main = screen.getByRole('main');
      expect(main).toHaveAttribute('aria-live', 'polite');
    });
  });
});
