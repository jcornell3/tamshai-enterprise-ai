import { render, screen, fireEvent, within } from '@testing-library/react';
import { CustomerDetailCard, Customer, Contact, Opportunity } from '../CustomerDetailCard';

// Test data
const testCustomer: Customer = {
  id: 'cust-001',
  name: 'Acme Corporation',
  industry: 'Technology',
  website: 'https://acme.com',
  address: '123 Main Street, San Francisco, CA 94102',
  annualRevenue: 5000000,
  status: 'active',
};

const testContacts: Contact[] = [
  {
    id: 'contact-001',
    name: 'Jane Smith',
    email: 'jane.smith@acme.com',
    phone: '+1 (555) 123-4567',
    role: 'VP of Engineering',
    isPrimary: true,
  },
  {
    id: 'contact-002',
    name: 'Bob Johnson',
    email: 'bob.johnson@acme.com',
    phone: '+1 (555) 987-6543',
    role: 'Procurement Manager',
    isPrimary: false,
  },
  {
    id: 'contact-003',
    name: 'Alice Williams',
    email: 'alice.williams@acme.com',
    phone: '+1 (555) 456-7890',
    role: 'CTO',
    isPrimary: false,
  },
];

const testOpportunities: Opportunity[] = [
  {
    id: 'opp-001',
    name: 'Enterprise License Deal',
    amount: 150000,
    stage: 'Negotiation',
    probability: 75,
    closeDate: '2026-03-15',
  },
  {
    id: 'opp-002',
    name: 'Support Contract Renewal',
    amount: 25000,
    stage: 'Proposal',
    probability: 90,
    closeDate: '2026-02-28',
  },
  {
    id: 'opp-003',
    name: 'Training Services',
    amount: 8000,
    stage: 'Qualification',
    probability: 40,
    closeDate: '2026-04-30',
  },
];

describe('CustomerDetailCard', () => {
  describe('Customer Header Rendering', () => {
    it('renders customer name prominently', () => {
      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
        />
      );

      expect(screen.getByRole('heading', { name: 'Acme Corporation' })).toBeInTheDocument();
    });

    it('renders industry badge', () => {
      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
        />
      );

      const industryBadge = screen.getByTestId('industry-badge');
      expect(industryBadge).toHaveTextContent('Technology');
    });

    it('renders active status indicator with correct styling', () => {
      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
        />
      );

      const statusIndicator = screen.getByTestId('status-indicator');
      expect(statusIndicator).toHaveTextContent('active');
      expect(statusIndicator).toHaveClass('bg-green-100', 'text-green-800');
    });

    it('renders inactive status indicator with correct styling', () => {
      const inactiveCustomer: Customer = {
        ...testCustomer,
        status: 'inactive',
      };

      render(
        <CustomerDetailCard
          customer={inactiveCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
        />
      );

      const statusIndicator = screen.getByTestId('status-indicator');
      expect(statusIndicator).toHaveTextContent('inactive');
      expect(statusIndicator).toHaveClass('bg-gray-100', 'text-gray-800');
    });

    it('renders prospect status indicator with correct styling', () => {
      const prospectCustomer: Customer = {
        ...testCustomer,
        status: 'prospect',
      };

      render(
        <CustomerDetailCard
          customer={prospectCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
        />
      );

      const statusIndicator = screen.getByTestId('status-indicator');
      expect(statusIndicator).toHaveTextContent('prospect');
      expect(statusIndicator).toHaveClass('bg-blue-100', 'text-blue-800');
    });

    it('renders website link', () => {
      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
        />
      );

      const websiteLink = screen.getByRole('link', { name: /acme\.com/i });
      expect(websiteLink).toHaveAttribute('href', 'https://acme.com');
      expect(websiteLink).toHaveAttribute('target', '_blank');
    });

    it('renders address', () => {
      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
        />
      );

      expect(screen.getByText('123 Main Street, San Francisco, CA 94102')).toBeInTheDocument();
    });

    it('renders formatted annual revenue', () => {
      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
        />
      );

      // Should display as $5,000,000 or $5M
      expect(screen.getByText(/\$5,000,000|\$5M/)).toBeInTheDocument();
    });
  });

  describe('Contacts Section Rendering', () => {
    it('renders contacts section heading', () => {
      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
        />
      );

      expect(screen.getByRole('heading', { name: /contacts/i })).toBeInTheDocument();
    });

    it('renders all contacts', () => {
      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
        />
      );

      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
      expect(screen.getByText('Alice Williams')).toBeInTheDocument();
    });

    it('highlights primary contact', () => {
      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
        />
      );

      const primaryContactCard = screen.getByTestId('contact-contact-001');
      expect(primaryContactCard).toHaveClass('border-primary-500', 'bg-primary-50');
      expect(within(primaryContactCard).getByText(/primary/i)).toBeInTheDocument();
    });

    it('renders contact email addresses', () => {
      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
        />
      );

      expect(screen.getByText('jane.smith@acme.com')).toBeInTheDocument();
      expect(screen.getByText('bob.johnson@acme.com')).toBeInTheDocument();
    });

    it('renders contact phone numbers', () => {
      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
        />
      );

      expect(screen.getByText('+1 (555) 123-4567')).toBeInTheDocument();
      expect(screen.getByText('+1 (555) 987-6543')).toBeInTheDocument();
    });

    it('renders contact roles', () => {
      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
        />
      );

      expect(screen.getByText('VP of Engineering')).toBeInTheDocument();
      expect(screen.getByText('Procurement Manager')).toBeInTheDocument();
      expect(screen.getByText('CTO')).toBeInTheDocument();
    });

    it('renders empty state when no contacts', () => {
      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={[]}
          opportunities={testOpportunities}
        />
      );

      expect(screen.getByText(/no contacts/i)).toBeInTheDocument();
    });
  });

  describe('Opportunities Pipeline Section Rendering', () => {
    it('renders opportunities section heading', () => {
      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
        />
      );

      expect(screen.getByRole('heading', { name: /opportunities|pipeline/i })).toBeInTheDocument();
    });

    it('renders all opportunities', () => {
      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
        />
      );

      expect(screen.getByText('Enterprise License Deal')).toBeInTheDocument();
      expect(screen.getByText('Support Contract Renewal')).toBeInTheDocument();
      expect(screen.getByText('Training Services')).toBeInTheDocument();
    });

    it('renders opportunity amounts', () => {
      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
        />
      );

      expect(screen.getByText(/\$150,000/)).toBeInTheDocument();
      expect(screen.getByText(/\$25,000/)).toBeInTheDocument();
      expect(screen.getByText(/\$8,000/)).toBeInTheDocument();
    });

    it('renders stage badges with correct styling', () => {
      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
        />
      );

      const negotiationBadge = screen.getByTestId('stage-badge-opp-001');
      expect(negotiationBadge).toHaveTextContent('Negotiation');
      expect(negotiationBadge).toHaveClass('bg-yellow-100', 'text-yellow-800');

      const proposalBadge = screen.getByTestId('stage-badge-opp-002');
      expect(proposalBadge).toHaveTextContent('Proposal');
      expect(proposalBadge).toHaveClass('bg-purple-100', 'text-purple-800');

      const qualificationBadge = screen.getByTestId('stage-badge-opp-003');
      expect(qualificationBadge).toHaveTextContent('Qualification');
      expect(qualificationBadge).toHaveClass('bg-blue-100', 'text-blue-800');
    });

    it('renders probability percentages', () => {
      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
        />
      );

      expect(screen.getByText('75%')).toBeInTheDocument();
      expect(screen.getByText('90%')).toBeInTheDocument();
      expect(screen.getByText('40%')).toBeInTheDocument();
    });

    it('renders close dates', () => {
      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
        />
      );

      // Should display formatted dates
      expect(screen.getByText(/Mar 15, 2026|2026-03-15|03\/15\/2026/)).toBeInTheDocument();
    });

    it('renders empty state when no opportunities', () => {
      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={[]}
        />
      );

      expect(screen.getByText(/no opportunities/i)).toBeInTheDocument();
    });

    it('calculates and displays total pipeline value', () => {
      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
        />
      );

      // Total: 150000 + 25000 + 8000 = 183000
      expect(screen.getByTestId('total-pipeline-value')).toHaveTextContent('$183,000');
    });

    it('calculates and displays weighted pipeline value', () => {
      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
        />
      );

      // Weighted: (150000 * 0.75) + (25000 * 0.90) + (8000 * 0.40) = 112500 + 22500 + 3200 = 138200
      expect(screen.getByTestId('weighted-pipeline-value')).toHaveTextContent('$138,200');
    });
  });

  describe('Contact Click Callback', () => {
    it('calls onContactClick when contact card is clicked', () => {
      const onContactClick = jest.fn();

      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
          onContactClick={onContactClick}
        />
      );

      const contactCard = screen.getByTestId('contact-contact-001');
      fireEvent.click(contactCard);

      expect(onContactClick).toHaveBeenCalledWith('contact-001');
    });

    it('calls onContactClick with correct id for each contact', () => {
      const onContactClick = jest.fn();

      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
          onContactClick={onContactClick}
        />
      );

      const secondContact = screen.getByTestId('contact-contact-002');
      fireEvent.click(secondContact);

      expect(onContactClick).toHaveBeenCalledWith('contact-002');
    });

    it('does not call onContactClick when callback not provided', () => {
      // Should not throw when clicking without handler
      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
        />
      );

      const contactCard = screen.getByTestId('contact-contact-001');
      expect(() => fireEvent.click(contactCard)).not.toThrow();
    });
  });

  describe('Opportunity Click Callback', () => {
    it('calls onOpportunityClick when opportunity row is clicked', () => {
      const onOpportunityClick = jest.fn();

      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
          onOpportunityClick={onOpportunityClick}
        />
      );

      const opportunityRow = screen.getByTestId('opportunity-opp-001');
      fireEvent.click(opportunityRow);

      expect(onOpportunityClick).toHaveBeenCalledWith('opp-001');
    });

    it('calls onOpportunityClick with correct id for each opportunity', () => {
      const onOpportunityClick = jest.fn();

      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
          onOpportunityClick={onOpportunityClick}
        />
      );

      const thirdOpportunity = screen.getByTestId('opportunity-opp-003');
      fireEvent.click(thirdOpportunity);

      expect(onOpportunityClick).toHaveBeenCalledWith('opp-003');
    });

    it('does not call onOpportunityClick when callback not provided', () => {
      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
        />
      );

      const opportunityRow = screen.getByTestId('opportunity-opp-001');
      expect(() => fireEvent.click(opportunityRow)).not.toThrow();
    });
  });

  describe('Quick Actions', () => {
    it('renders quick action buttons', () => {
      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
        />
      );

      expect(screen.getByRole('button', { name: /call/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /email/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /schedule meeting/i })).toBeInTheDocument();
    });

    it('calls onAction with "call" when call button is clicked', () => {
      const onAction = jest.fn();

      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
          onAction={onAction}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /call/i }));

      expect(onAction).toHaveBeenCalledWith('call');
    });

    it('calls onAction with "email" when email button is clicked', () => {
      const onAction = jest.fn();

      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
          onAction={onAction}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /email/i }));

      expect(onAction).toHaveBeenCalledWith('email');
    });

    it('calls onAction with "schedule_meeting" when schedule meeting button is clicked', () => {
      const onAction = jest.fn();

      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
          onAction={onAction}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /schedule meeting/i }));

      expect(onAction).toHaveBeenCalledWith('schedule_meeting');
    });

    it('disables action buttons when onAction not provided', () => {
      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
        />
      );

      expect(screen.getByRole('button', { name: /call/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /email/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /schedule meeting/i })).toBeDisabled();
    });
  });

  describe('Loading State', () => {
    it('renders skeleton loader when loading', () => {
      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
          loading={true}
        />
      );

      expect(screen.getByTestId('customer-detail-skeleton')).toBeInTheDocument();
    });

    it('does not render customer data when loading', () => {
      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
          loading={true}
        />
      );

      expect(screen.queryByText('Acme Corporation')).not.toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('renders error message when error prop is provided', () => {
      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
          error="Failed to load customer data"
        />
      );

      expect(screen.getByText('Failed to load customer data')).toBeInTheDocument();
      expect(screen.getByTestId('error-state')).toBeInTheDocument();
    });

    it('renders retry button on error', () => {
      const onRetry = jest.fn();

      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
          error="Failed to load customer data"
          onRetry={onRetry}
        />
      );

      const retryButton = screen.getByRole('button', { name: /retry/i });
      fireEvent.click(retryButton);

      expect(onRetry).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('has proper article role for customer card', () => {
      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
        />
      );

      expect(screen.getByRole('article')).toBeInTheDocument();
    });

    it('has proper heading hierarchy', () => {
      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
        />
      );

      const headings = screen.getAllByRole('heading');
      // Customer name (h2), Contacts (h3), Opportunities (h3)
      expect(headings.length).toBeGreaterThanOrEqual(3);
    });

    it('contact cards have proper aria-labels', () => {
      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
        />
      );

      const primaryContact = screen.getByTestId('contact-contact-001');
      expect(primaryContact).toHaveAttribute('aria-label', 'Contact: Jane Smith (Primary)');
    });

    it('opportunity rows have proper aria-labels', () => {
      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
        />
      );

      const opportunity = screen.getByTestId('opportunity-opp-001');
      expect(opportunity).toHaveAttribute('aria-label', 'Opportunity: Enterprise License Deal');
    });

    it('quick action buttons are keyboard accessible', () => {
      const onAction = jest.fn();

      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
          onAction={onAction}
        />
      );

      const callButton = screen.getByRole('button', { name: /call/i });
      callButton.focus();
      fireEvent.keyDown(callButton, { key: 'Enter' });

      expect(onAction).toHaveBeenCalledWith('call');
    });

    it('email button responds to Enter key', () => {
      const onAction = jest.fn();

      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
          onAction={onAction}
        />
      );

      const emailButton = screen.getByRole('button', { name: /email/i });
      emailButton.focus();
      fireEvent.keyDown(emailButton, { key: 'Enter' });

      expect(onAction).toHaveBeenCalledWith('email');
    });

    it('email button responds to Space key', () => {
      const onAction = jest.fn();

      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
          onAction={onAction}
        />
      );

      const emailButton = screen.getByRole('button', { name: /email/i });
      emailButton.focus();
      fireEvent.keyDown(emailButton, { key: ' ' });

      expect(onAction).toHaveBeenCalledWith('email');
    });

    it('schedule meeting button responds to Enter key', () => {
      const onAction = jest.fn();

      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
          onAction={onAction}
        />
      );

      const scheduleButton = screen.getByRole('button', { name: /schedule meeting/i });
      scheduleButton.focus();
      fireEvent.keyDown(scheduleButton, { key: 'Enter' });

      expect(onAction).toHaveBeenCalledWith('schedule_meeting');
    });

    it('schedule meeting button responds to Space key', () => {
      const onAction = jest.fn();

      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
          onAction={onAction}
        />
      );

      const scheduleButton = screen.getByRole('button', { name: /schedule meeting/i });
      scheduleButton.focus();
      fireEvent.keyDown(scheduleButton, { key: ' ' });

      expect(onAction).toHaveBeenCalledWith('schedule_meeting');
    });

    it('contact card responds to Enter key', () => {
      const onContactClick = jest.fn();

      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
          onContactClick={onContactClick}
        />
      );

      const contactCard = screen.getByTestId('contact-contact-001');
      fireEvent.keyDown(contactCard, { key: 'Enter' });

      expect(onContactClick).toHaveBeenCalledWith('contact-001');
    });

    it('contact card responds to Space key', () => {
      const onContactClick = jest.fn();

      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
          onContactClick={onContactClick}
        />
      );

      const contactCard = screen.getByTestId('contact-contact-001');
      fireEvent.keyDown(contactCard, { key: ' ' });

      expect(onContactClick).toHaveBeenCalledWith('contact-001');
    });

    it('opportunity row responds to Enter key', () => {
      const onOpportunityClick = jest.fn();

      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
          onOpportunityClick={onOpportunityClick}
        />
      );

      const opportunityRow = screen.getByTestId('opportunity-opp-001');
      fireEvent.keyDown(opportunityRow, { key: 'Enter' });

      expect(onOpportunityClick).toHaveBeenCalledWith('opp-001');
    });

    it('opportunity row responds to Space key', () => {
      const onOpportunityClick = jest.fn();

      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
          onOpportunityClick={onOpportunityClick}
        />
      );

      const opportunityRow = screen.getByTestId('opportunity-opp-001');
      fireEvent.keyDown(opportunityRow, { key: ' ' });

      expect(onOpportunityClick).toHaveBeenCalledWith('opp-001');
    });

    it('contact card has button role when clickable', () => {
      const onContactClick = jest.fn();

      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
          onContactClick={onContactClick}
        />
      );

      const contactCard = screen.getByTestId('contact-contact-001');
      expect(contactCard).toHaveAttribute('role', 'button');
      expect(contactCard).toHaveAttribute('tabIndex', '0');
    });

    it('opportunity row has button role when clickable', () => {
      const onOpportunityClick = jest.fn();

      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
          onOpportunityClick={onOpportunityClick}
        />
      );

      const opportunityRow = screen.getByTestId('opportunity-opp-001');
      expect(opportunityRow).toHaveAttribute('role', 'button');
      expect(opportunityRow).toHaveAttribute('tabIndex', '0');
    });

    it('contact card does not have button role when not clickable', () => {
      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
        />
      );

      const contactCard = screen.getByTestId('contact-contact-001');
      expect(contactCard).not.toHaveAttribute('role', 'button');
    });

    it('opportunity row does not have button role when not clickable', () => {
      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
        />
      );

      const opportunityRow = screen.getByTestId('opportunity-opp-001');
      expect(opportunityRow).not.toHaveAttribute('role', 'button');
    });
  });

  describe('Closed-Won Stage', () => {
    it('renders closed-won stage with success styling', () => {
      const wonOpportunity: Opportunity = {
        id: 'opp-won',
        name: 'Won Deal',
        amount: 100000,
        stage: 'Closed Won',
        probability: 100,
        closeDate: '2026-01-15',
      };

      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={[wonOpportunity]}
        />
      );

      const stageBadge = screen.getByTestId('stage-badge-opp-won');
      expect(stageBadge).toHaveTextContent('Closed Won');
      expect(stageBadge).toHaveClass('bg-green-100', 'text-green-800');
    });
  });

  describe('Closed-Lost Stage', () => {
    it('renders closed-lost stage with error styling', () => {
      const lostOpportunity: Opportunity = {
        id: 'opp-lost',
        name: 'Lost Deal',
        amount: 50000,
        stage: 'Closed Lost',
        probability: 0,
        closeDate: '2026-01-10',
      };

      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={[lostOpportunity]}
        />
      );

      const stageBadge = screen.getByTestId('stage-badge-opp-lost');
      expect(stageBadge).toHaveTextContent('Closed Lost');
      expect(stageBadge).toHaveClass('bg-red-100', 'text-red-800');
    });
  });

  describe('Discovery Stage', () => {
    it('renders discovery stage with cyan styling', () => {
      const discoveryOpportunity: Opportunity = {
        id: 'opp-discovery',
        name: 'Discovery Deal',
        amount: 75000,
        stage: 'Discovery',
        probability: 30,
        closeDate: '2026-05-15',
      };

      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={[discoveryOpportunity]}
        />
      );

      const stageBadge = screen.getByTestId('stage-badge-opp-discovery');
      expect(stageBadge).toHaveTextContent('Discovery');
      expect(stageBadge).toHaveClass('bg-cyan-100', 'text-cyan-800');
    });
  });

  describe('Unknown Stage', () => {
    it('renders unknown stage with default gray styling', () => {
      const unknownStageOpportunity: Opportunity = {
        id: 'opp-unknown',
        name: 'Unknown Stage Deal',
        amount: 50000,
        stage: 'Custom Stage',
        probability: 50,
        closeDate: '2026-06-01',
      };

      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={[unknownStageOpportunity]}
        />
      );

      const stageBadge = screen.getByTestId('stage-badge-opp-unknown');
      expect(stageBadge).toHaveTextContent('Custom Stage');
      expect(stageBadge).toHaveClass('bg-gray-100', 'text-gray-800');
    });
  });

  describe('Customer Without Optional Fields', () => {
    it('renders customer without website', () => {
      const customerNoWebsite: Customer = {
        id: 'cust-002',
        name: 'No Website Corp',
        industry: 'Finance',
        status: 'active',
      };

      render(
        <CustomerDetailCard
          customer={customerNoWebsite}
          contacts={testContacts}
          opportunities={testOpportunities}
        />
      );

      expect(screen.getByText('No Website Corp')).toBeInTheDocument();
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it('renders customer without address', () => {
      const customerNoAddress: Customer = {
        id: 'cust-003',
        name: 'No Address Corp',
        industry: 'Healthcare',
        status: 'prospect',
      };

      render(
        <CustomerDetailCard
          customer={customerNoAddress}
          contacts={testContacts}
          opportunities={testOpportunities}
        />
      );

      expect(screen.getByText('No Address Corp')).toBeInTheDocument();
      expect(screen.queryByText(/123 Main Street/)).not.toBeInTheDocument();
    });

    it('renders customer without annual revenue', () => {
      const customerNoRevenue: Customer = {
        id: 'cust-004',
        name: 'Startup Inc',
        industry: 'Technology',
        status: 'prospect',
      };

      render(
        <CustomerDetailCard
          customer={customerNoRevenue}
          contacts={testContacts}
          opportunities={testOpportunities}
        />
      );

      expect(screen.getByText('Startup Inc')).toBeInTheDocument();
      expect(screen.queryByText(/Annual Revenue/)).not.toBeInTheDocument();
    });
  });

  describe('Contact Without Phone', () => {
    it('renders contact without phone number', () => {
      const contactsNoPhone: Contact[] = [
        {
          id: 'contact-no-phone',
          name: 'Email Only Person',
          email: 'emailonly@company.com',
          role: 'Manager',
          isPrimary: false,
        },
      ];

      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={contactsNoPhone}
          opportunities={testOpportunities}
        />
      );

      expect(screen.getByText('Email Only Person')).toBeInTheDocument();
      expect(screen.getByText('emailonly@company.com')).toBeInTheDocument();
      // Phone should not be rendered
      expect(screen.queryByText(/\+1 \(555\)/)).not.toBeInTheDocument();
    });
  });

  describe('Error State Without Retry', () => {
    it('renders error state without retry button when onRetry not provided', () => {
      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
          error="Network error occurred"
        />
      );

      expect(screen.getByText('Network error occurred')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    });
  });

  describe('Non-Primary Contact Styling', () => {
    it('renders non-primary contact without primary badge', () => {
      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
        />
      );

      const nonPrimaryContact = screen.getByTestId('contact-contact-002');
      expect(nonPrimaryContact).toHaveClass('border-secondary-200', 'bg-white');
      expect(within(nonPrimaryContact).queryByText(/primary/i)).not.toBeInTheDocument();
    });

    it('non-primary contact has correct aria-label without Primary suffix', () => {
      render(
        <CustomerDetailCard
          customer={testCustomer}
          contacts={testContacts}
          opportunities={testOpportunities}
        />
      );

      const nonPrimaryContact = screen.getByTestId('contact-contact-002');
      expect(nonPrimaryContact).toHaveAttribute('aria-label', 'Contact: Bob Johnson');
    });
  });
});
