/**
 * LeadsDataTable Component Tests - TDD RED Phase
 *
 * Tests for the generative UI leads data table component.
 * Displays CRM leads with filtering, sorting, and bulk actions.
 *
 * These tests are written BEFORE the component implementation (TDD RED phase).
 * All tests should FAIL until the component is implemented.
 */
import { render, screen, fireEvent, within } from '@testing-library/react';
import { LeadsDataTable } from '../LeadsDataTable';
import type { Lead, LeadStatus, Filters } from '../LeadsDataTable';

// Test data for leads
const mockLeads: Lead[] = [
  {
    id: 'lead-001',
    name: 'John Smith',
    email: 'john.smith@acme.com',
    company: 'Acme Corporation',
    status: 'new',
    source: 'website',
    score: 85,
    createdAt: '2026-01-15T10:30:00Z',
    lastActivity: '2026-02-01T14:20:00Z',
  },
  {
    id: 'lead-002',
    name: 'Sarah Johnson',
    email: 'sarah.j@globex.com',
    company: 'Globex Industries',
    status: 'contacted',
    source: 'referral',
    score: 72,
    createdAt: '2026-01-20T09:15:00Z',
    lastActivity: '2026-02-05T11:45:00Z',
  },
  {
    id: 'lead-003',
    name: 'Michael Chen',
    email: 'm.chen@techstart.io',
    company: 'TechStart Inc',
    status: 'qualified',
    source: 'linkedin',
    score: 92,
    createdAt: '2026-01-10T16:00:00Z',
    lastActivity: '2026-02-06T09:30:00Z',
  },
  {
    id: 'lead-004',
    name: 'Emily Davis',
    email: 'emily.davis@innovate.co',
    company: 'Innovate Co',
    status: 'proposal',
    source: 'trade_show',
    score: 45,
    createdAt: '2026-01-25T13:45:00Z',
    lastActivity: '2026-01-30T16:15:00Z',
  },
  {
    id: 'lead-005',
    name: 'Robert Wilson',
    email: 'r.wilson@enterprise.com',
    company: 'Enterprise Solutions',
    status: 'won',
    source: 'cold_call',
    score: 95,
    createdAt: '2025-12-01T08:00:00Z',
    lastActivity: '2026-02-07T10:00:00Z',
  },
  {
    id: 'lead-006',
    name: 'Lisa Brown',
    email: 'lisa.b@startup.io',
    company: 'Startup Labs',
    status: 'lost',
    source: 'website',
    score: 28,
    createdAt: '2026-01-05T11:30:00Z',
    lastActivity: '2026-01-20T15:00:00Z',
  },
];

describe('LeadsDataTable Component', () => {
  describe('Basic Rendering', () => {
    it('renders the leads data table container', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      expect(screen.getByTestId('leads-data-table')).toBeInTheDocument();
    });

    it('renders table with correct column headers', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      expect(screen.getByRole('columnheader', { name: /name/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /company/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /status/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /score/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /source/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /last activity/i })).toBeInTheDocument();
    });

    it('renders all lead rows', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      expect(screen.getByText('John Smith')).toBeInTheDocument();
      expect(screen.getByText('Sarah Johnson')).toBeInTheDocument();
      expect(screen.getByText('Michael Chen')).toBeInTheDocument();
      expect(screen.getByText('Emily Davis')).toBeInTheDocument();
      expect(screen.getByText('Robert Wilson')).toBeInTheDocument();
      expect(screen.getByText('Lisa Brown')).toBeInTheDocument();
    });

    it('renders correct number of rows', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      const rows = screen.getAllByRole('row');
      // 1 header row + 6 data rows
      expect(rows).toHaveLength(7);
    });

    it('displays lead details correctly', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      const johnRow = screen.getByTestId('lead-row-lead-001');
      expect(within(johnRow).getByText('John Smith')).toBeInTheDocument();
      expect(within(johnRow).getByText('john.smith@acme.com')).toBeInTheDocument();
      expect(within(johnRow).getByText('Acme Corporation')).toBeInTheDocument();
      expect(within(johnRow).getByText('new')).toBeInTheDocument();
      expect(within(johnRow).getByText('website')).toBeInTheDocument();
      expect(within(johnRow).getByText('85')).toBeInTheDocument();
    });
  });

  describe('Score Badge Rendering', () => {
    it('renders hot score badge for scores >= 80', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      const johnRow = screen.getByTestId('lead-row-lead-001');
      const scoreBadge = within(johnRow).getByTestId('score-badge');
      expect(scoreBadge).toHaveClass('score-hot');
    });

    it('renders warm score badge for scores >= 50 and < 80', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      const sarahRow = screen.getByTestId('lead-row-lead-002');
      const scoreBadge = within(sarahRow).getByTestId('score-badge');
      expect(scoreBadge).toHaveClass('score-warm');
    });

    it('renders cold score badge for scores < 50', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      const lisaRow = screen.getByTestId('lead-row-lead-006');
      const scoreBadge = within(lisaRow).getByTestId('score-badge');
      expect(scoreBadge).toHaveClass('score-cold');
    });

    it('displays score value inside badge', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      const michaelRow = screen.getByTestId('lead-row-lead-003');
      const scoreBadge = within(michaelRow).getByTestId('score-badge');
      expect(scoreBadge).toHaveTextContent('92');
    });

    it('applies correct color coding to hot badge', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      const johnRow = screen.getByTestId('lead-row-lead-001');
      const scoreBadge = within(johnRow).getByTestId('score-badge');
      // Hot leads typically use red/orange styling
      expect(scoreBadge).toHaveAttribute('aria-label', expect.stringContaining('hot'));
    });
  });

  describe('Status Column', () => {
    it('renders status badge for each status type', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      // Check each status type is rendered
      expect(screen.getByTestId('status-badge-new')).toBeInTheDocument();
      expect(screen.getByTestId('status-badge-contacted')).toBeInTheDocument();
      expect(screen.getByTestId('status-badge-qualified')).toBeInTheDocument();
      expect(screen.getByTestId('status-badge-proposal')).toBeInTheDocument();
      expect(screen.getByTestId('status-badge-won')).toBeInTheDocument();
      expect(screen.getByTestId('status-badge-lost')).toBeInTheDocument();
    });

    it('applies correct styling to won status', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      const robertRow = screen.getByTestId('lead-row-lead-005');
      const statusBadge = within(robertRow).getByTestId('status-badge-won');
      expect(statusBadge).toHaveClass('status-won');
    });

    it('applies correct styling to lost status', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      const lisaRow = screen.getByTestId('lead-row-lead-006');
      const statusBadge = within(lisaRow).getByTestId('status-badge-lost');
      expect(statusBadge).toHaveClass('status-lost');
    });
  });

  describe('Empty State', () => {
    it('renders empty state when no leads provided', () => {
      render(<LeadsDataTable leads={[]} />);

      expect(screen.getByTestId('leads-empty-state')).toBeInTheDocument();
      expect(screen.getByText('No leads found')).toBeInTheDocument();
    });

    it('displays helpful message in empty state', () => {
      render(<LeadsDataTable leads={[]} />);

      expect(screen.getByText(/add your first lead/i)).toBeInTheDocument();
    });

    it('renders empty state when filters return no results', () => {
      const filters: Filters = {
        status: ['won'],
        scoreRange: { min: 100, max: 100 }, // Impossible range
      };

      render(<LeadsDataTable leads={mockLeads} filters={filters} />);

      expect(screen.getByTestId('leads-empty-state')).toBeInTheDocument();
      expect(screen.getByText(/no leads match your filters/i)).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('renders skeleton loader when loading', () => {
      render(<LeadsDataTable leads={[]} loading={true} />);

      expect(screen.getByTestId('leads-table-skeleton')).toBeInTheDocument();
    });

    it('does not render lead rows when loading', () => {
      render(<LeadsDataTable leads={mockLeads} loading={true} />);

      expect(screen.queryByText('John Smith')).not.toBeInTheDocument();
    });

    it('renders skeleton rows matching expected data count', () => {
      render(<LeadsDataTable leads={[]} loading={true} skeletonRowCount={5} />);

      const skeletonRows = screen.getAllByTestId('skeleton-row');
      expect(skeletonRows).toHaveLength(5);
    });
  });

  describe('Filter Bar', () => {
    it('renders filter bar', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      expect(screen.getByTestId('leads-filter-bar')).toBeInTheDocument();
    });

    it('renders status filter dropdown', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      const statusFilter = screen.getByRole('combobox', { name: /status/i });
      expect(statusFilter).toBeInTheDocument();
    });

    it('renders all status options in dropdown', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      const statusFilter = screen.getByRole('combobox', { name: /status/i });
      fireEvent.click(statusFilter);

      expect(screen.getByRole('option', { name: /all/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /new/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /contacted/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /qualified/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /proposal/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /won/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /lost/i })).toBeInTheDocument();
    });

    it('renders score range filter', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      expect(screen.getByLabelText(/min score/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/max score/i)).toBeInTheDocument();
    });

    it('renders date range filter', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      expect(screen.getByLabelText(/start date/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/end date/i)).toBeInTheDocument();
    });

    it('calls onFilterChange when status filter changes', () => {
      const onFilterChange = jest.fn();
      render(<LeadsDataTable leads={mockLeads} onFilterChange={onFilterChange} />);

      const statusFilter = screen.getByRole('combobox', { name: /status/i });
      fireEvent.change(statusFilter, { target: { value: 'qualified' } });

      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ['qualified'],
        })
      );
    });

    it('calls onFilterChange when score range changes', () => {
      const onFilterChange = jest.fn();
      render(<LeadsDataTable leads={mockLeads} onFilterChange={onFilterChange} />);

      const minScoreInput = screen.getByLabelText(/min score/i);
      fireEvent.change(minScoreInput, { target: { value: '50' } });

      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({
          scoreRange: expect.objectContaining({ min: 50 }),
        })
      );
    });

    it('calls onFilterChange when date range changes', () => {
      const onFilterChange = jest.fn();
      render(<LeadsDataTable leads={mockLeads} onFilterChange={onFilterChange} />);

      const startDateInput = screen.getByLabelText(/start date/i);
      fireEvent.change(startDateInput, { target: { value: '2026-01-01' } });

      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({
          dateRange: expect.objectContaining({ start: '2026-01-01' }),
        })
      );
    });

    it('renders clear filters button when filters are active', () => {
      const filters: Filters = { status: ['new'] };
      render(<LeadsDataTable leads={mockLeads} filters={filters} />);

      expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument();
    });

    it('calls onFilterChange with empty filters when clear button clicked', () => {
      const onFilterChange = jest.fn();
      const filters: Filters = { status: ['new'] };
      render(
        <LeadsDataTable
          leads={mockLeads}
          filters={filters}
          onFilterChange={onFilterChange}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /clear filters/i }));

      expect(onFilterChange).toHaveBeenCalledWith({});
    });

    it('displays active filter count', () => {
      const filters: Filters = {
        status: ['new', 'qualified'],
        scoreRange: { min: 50, max: 100 },
      };
      render(<LeadsDataTable leads={mockLeads} filters={filters} />);

      expect(screen.getByText('2 filters active')).toBeInTheDocument();
    });
  });

  describe('Sorting', () => {
    it('renders sortable column headers', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      const nameHeader = screen.getByRole('columnheader', { name: /name/i });
      expect(nameHeader).toHaveAttribute('aria-sort', 'none');
    });

    it('calls onSort when clicking sortable column header', () => {
      const onSort = jest.fn();
      render(<LeadsDataTable leads={mockLeads} onSort={onSort} />);

      fireEvent.click(screen.getByRole('columnheader', { name: /score/i }));

      expect(onSort).toHaveBeenCalledWith('score', 'asc');
    });

    it('toggles sort direction on repeated header clicks', () => {
      const onSort = jest.fn();
      render(
        <LeadsDataTable
          leads={mockLeads}
          onSort={onSort}
          sortedBy="score"
          sortDirection="asc"
        />
      );

      fireEvent.click(screen.getByRole('columnheader', { name: /score/i }));

      expect(onSort).toHaveBeenCalledWith('score', 'desc');
    });

    it('displays ascending sort indicator', () => {
      render(
        <LeadsDataTable
          leads={mockLeads}
          sortedBy="score"
          sortDirection="asc"
        />
      );

      const scoreHeader = screen.getByRole('columnheader', { name: /score/i });
      expect(scoreHeader).toHaveAttribute('aria-sort', 'ascending');
    });

    it('displays descending sort indicator', () => {
      render(
        <LeadsDataTable
          leads={mockLeads}
          sortedBy="score"
          sortDirection="desc"
        />
      );

      const scoreHeader = screen.getByRole('columnheader', { name: /score/i });
      expect(scoreHeader).toHaveAttribute('aria-sort', 'descending');
    });

    it('allows sorting by name column', () => {
      const onSort = jest.fn();
      render(<LeadsDataTable leads={mockLeads} onSort={onSort} />);

      fireEvent.click(screen.getByRole('columnheader', { name: /name/i }));

      expect(onSort).toHaveBeenCalledWith('name', 'asc');
    });

    it('allows sorting by last activity column', () => {
      const onSort = jest.fn();
      render(<LeadsDataTable leads={mockLeads} onSort={onSort} />);

      fireEvent.click(screen.getByRole('columnheader', { name: /last activity/i }));

      expect(onSort).toHaveBeenCalledWith('lastActivity', 'asc');
    });
  });

  describe('Row Click', () => {
    it('calls onLeadClick when row is clicked', () => {
      const onLeadClick = jest.fn();
      render(<LeadsDataTable leads={mockLeads} onLeadClick={onLeadClick} />);

      const johnRow = screen.getByTestId('lead-row-lead-001');
      fireEvent.click(johnRow);

      expect(onLeadClick).toHaveBeenCalledWith('lead-001');
    });

    it('calls onLeadClick with correct id for each row', () => {
      const onLeadClick = jest.fn();
      render(<LeadsDataTable leads={mockLeads} onLeadClick={onLeadClick} />);

      const sarahRow = screen.getByTestId('lead-row-lead-002');
      fireEvent.click(sarahRow);

      expect(onLeadClick).toHaveBeenCalledWith('lead-002');
    });

    it('applies clickable styling to rows when onLeadClick provided', () => {
      const onLeadClick = jest.fn();
      render(<LeadsDataTable leads={mockLeads} onLeadClick={onLeadClick} />);

      const johnRow = screen.getByTestId('lead-row-lead-001');
      expect(johnRow).toHaveClass('cursor-pointer');
    });

    it('does not apply clickable styling when onLeadClick not provided', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      const johnRow = screen.getByTestId('lead-row-lead-001');
      expect(johnRow).not.toHaveClass('cursor-pointer');
    });
  });

  describe('Row Selection', () => {
    it('hides selection checkboxes by default', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('shows selection checkboxes when selectable is true', () => {
      render(<LeadsDataTable leads={mockLeads} selectable={true} />);

      const checkboxes = screen.getAllByRole('checkbox');
      // 1 header checkbox + 6 row checkboxes
      expect(checkboxes).toHaveLength(7);
    });

    it('selects a single lead on checkbox click', () => {
      const onSelectionChange = jest.fn();
      render(
        <LeadsDataTable
          leads={mockLeads}
          selectable={true}
          onSelectionChange={onSelectionChange}
        />
      );

      const rowCheckboxes = screen.getAllByRole('checkbox');
      fireEvent.click(rowCheckboxes[1]); // First data row

      expect(onSelectionChange).toHaveBeenCalledWith(['lead-001']);
    });

    it('selects all leads on header checkbox click', () => {
      const onSelectionChange = jest.fn();
      render(
        <LeadsDataTable
          leads={mockLeads}
          selectable={true}
          onSelectionChange={onSelectionChange}
        />
      );

      const headerCheckbox = screen.getAllByRole('checkbox')[0];
      fireEvent.click(headerCheckbox);

      expect(onSelectionChange).toHaveBeenCalledWith([
        'lead-001',
        'lead-002',
        'lead-003',
        'lead-004',
        'lead-005',
        'lead-006',
      ]);
    });

    it('deselects all when header checkbox clicked with all selected', () => {
      const onSelectionChange = jest.fn();
      render(
        <LeadsDataTable
          leads={mockLeads}
          selectable={true}
          selectedLeads={['lead-001', 'lead-002', 'lead-003', 'lead-004', 'lead-005', 'lead-006']}
          onSelectionChange={onSelectionChange}
        />
      );

      const headerCheckbox = screen.getAllByRole('checkbox')[0];
      fireEvent.click(headerCheckbox);

      expect(onSelectionChange).toHaveBeenCalledWith([]);
    });

    it('shows indeterminate state when some leads selected', () => {
      render(
        <LeadsDataTable
          leads={mockLeads}
          selectable={true}
          selectedLeads={['lead-001', 'lead-002']}
        />
      );

      const headerCheckbox = screen.getAllByRole('checkbox')[0] as HTMLInputElement;
      expect(headerCheckbox.indeterminate).toBe(true);
    });

    it('applies selected styling to selected rows', () => {
      render(
        <LeadsDataTable
          leads={mockLeads}
          selectable={true}
          selectedLeads={['lead-001']}
        />
      );

      const johnRow = screen.getByTestId('lead-row-lead-001');
      expect(johnRow).toHaveClass('bg-primary-50');
    });
  });

  describe('Bulk Actions', () => {
    it('hides bulk action toolbar when no leads selected', () => {
      render(
        <LeadsDataTable leads={mockLeads} selectable={true} />
      );

      expect(screen.queryByTestId('bulk-action-toolbar')).not.toBeInTheDocument();
    });

    it('shows bulk action toolbar when leads are selected', () => {
      render(
        <LeadsDataTable
          leads={mockLeads}
          selectable={true}
          selectedLeads={['lead-001']}
        />
      );

      expect(screen.getByTestId('bulk-action-toolbar')).toBeInTheDocument();
    });

    it('displays correct selection count', () => {
      render(
        <LeadsDataTable
          leads={mockLeads}
          selectable={true}
          selectedLeads={['lead-001', 'lead-002', 'lead-003']}
        />
      );

      expect(screen.getByText('3 leads selected')).toBeInTheDocument();
    });

    it('renders Assign bulk action button', () => {
      render(
        <LeadsDataTable
          leads={mockLeads}
          selectable={true}
          selectedLeads={['lead-001']}
        />
      );

      expect(screen.getByRole('button', { name: /assign/i })).toBeInTheDocument();
    });

    it('renders Update Status bulk action button', () => {
      render(
        <LeadsDataTable
          leads={mockLeads}
          selectable={true}
          selectedLeads={['lead-001']}
        />
      );

      expect(screen.getByRole('button', { name: /update status/i })).toBeInTheDocument();
    });

    it('renders Export bulk action button', () => {
      render(
        <LeadsDataTable
          leads={mockLeads}
          selectable={true}
          selectedLeads={['lead-001']}
        />
      );

      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
    });

    it('renders Delete bulk action button', () => {
      render(
        <LeadsDataTable
          leads={mockLeads}
          selectable={true}
          selectedLeads={['lead-001']}
        />
      );

      expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    });

    it('calls onBulkAction with assign action and selected leads', () => {
      const onBulkAction = jest.fn();
      render(
        <LeadsDataTable
          leads={mockLeads}
          selectable={true}
          selectedLeads={['lead-001', 'lead-002']}
          onBulkAction={onBulkAction}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /assign/i }));

      expect(onBulkAction).toHaveBeenCalledWith('assign', [mockLeads[0], mockLeads[1]]);
    });

    it('calls onBulkAction with update_status action', () => {
      const onBulkAction = jest.fn();
      render(
        <LeadsDataTable
          leads={mockLeads}
          selectable={true}
          selectedLeads={['lead-001']}
          onBulkAction={onBulkAction}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /update status/i }));

      expect(onBulkAction).toHaveBeenCalledWith('update_status', [mockLeads[0]]);
    });

    it('calls onBulkAction with export action', () => {
      const onBulkAction = jest.fn();
      render(
        <LeadsDataTable
          leads={mockLeads}
          selectable={true}
          selectedLeads={['lead-001', 'lead-003']}
          onBulkAction={onBulkAction}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /export/i }));

      expect(onBulkAction).toHaveBeenCalledWith('export', [mockLeads[0], mockLeads[2]]);
    });

    it('calls onBulkAction with delete action', () => {
      const onBulkAction = jest.fn();
      render(
        <LeadsDataTable
          leads={mockLeads}
          selectable={true}
          selectedLeads={['lead-006']}
          onBulkAction={onBulkAction}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /delete/i }));

      expect(onBulkAction).toHaveBeenCalledWith('delete', [mockLeads[5]]);
    });

    it('has clear selection button in toolbar', () => {
      const onSelectionChange = jest.fn();
      render(
        <LeadsDataTable
          leads={mockLeads}
          selectable={true}
          selectedLeads={['lead-001', 'lead-002']}
          onSelectionChange={onSelectionChange}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /clear/i }));

      expect(onSelectionChange).toHaveBeenCalledWith([]);
    });
  });

  describe('Last Activity Formatting', () => {
    it('displays last activity as relative time', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      // Should show something like "2 days ago" or formatted date
      const johnRow = screen.getByTestId('lead-row-lead-001');
      const lastActivityCell = within(johnRow).getByTestId('last-activity-cell');
      expect(lastActivityCell).toHaveTextContent(/ago|Feb/);
    });

    it('displays full date on hover', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      const johnRow = screen.getByTestId('lead-row-lead-001');
      const lastActivityCell = within(johnRow).getByTestId('last-activity-cell');
      expect(lastActivityCell).toHaveAttribute('title', expect.stringContaining('2026'));
    });
  });

  describe('Accessibility', () => {
    it('has proper table ARIA attributes', () => {
      render(<LeadsDataTable leads={mockLeads} selectable={true} />);

      const table = screen.getByRole('grid');
      expect(table).toHaveAttribute('aria-multiselectable', 'true');
    });

    it('row checkboxes have proper aria-labels', () => {
      render(<LeadsDataTable leads={mockLeads} selectable={true} />);

      const rowCheckboxes = screen.getAllByRole('checkbox');
      expect(rowCheckboxes[1]).toHaveAttribute('aria-label', 'Select lead: John Smith');
    });

    it('bulk toolbar has toolbar role', () => {
      render(
        <LeadsDataTable
          leads={mockLeads}
          selectable={true}
          selectedLeads={['lead-001']}
        />
      );

      expect(screen.getByRole('toolbar')).toBeInTheDocument();
    });

    it('has aria-label on filter bar', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      expect(screen.getByRole('region', { name: /filter/i })).toBeInTheDocument();
    });

    it('score badge has accessible label', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      const johnRow = screen.getByTestId('lead-row-lead-001');
      const scoreBadge = within(johnRow).getByTestId('score-badge');
      expect(scoreBadge).toHaveAttribute('aria-label', 'Lead score: 85 (hot)');
    });

    it('status badge has accessible label', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      const johnRow = screen.getByTestId('lead-row-lead-001');
      const statusBadge = within(johnRow).getByTestId('status-badge-new');
      expect(statusBadge).toHaveAttribute('aria-label', 'Lead status: new');
    });
  });

  describe('Pagination', () => {
    const manyLeads: Lead[] = Array.from({ length: 50 }, (_, i) => ({
      id: `lead-${String(i + 1).padStart(3, '0')}`,
      name: `Lead ${i + 1}`,
      email: `lead${i + 1}@example.com`,
      company: `Company ${i + 1}`,
      status: 'new' as LeadStatus,
      source: 'website',
      score: Math.floor(Math.random() * 100),
      createdAt: '2026-01-15T10:30:00Z',
      lastActivity: '2026-02-01T14:20:00Z',
    }));

    it('renders pagination controls when configured', () => {
      render(
        <LeadsDataTable
          leads={manyLeads.slice(0, 10)}
          pagination={{
            pageSize: 10,
            currentPage: 1,
            totalItems: 50,
            onPageChange: jest.fn(),
          }}
        />
      );

      expect(screen.getByTestId('pagination')).toBeInTheDocument();
    });

    it('calls onPageChange when next page clicked', () => {
      const onPageChange = jest.fn();
      render(
        <LeadsDataTable
          leads={manyLeads.slice(0, 10)}
          pagination={{
            pageSize: 10,
            currentPage: 1,
            totalItems: 50,
            onPageChange,
          }}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /next/i }));

      expect(onPageChange).toHaveBeenCalledWith(2);
    });

    it('displays page info correctly', () => {
      render(
        <LeadsDataTable
          leads={manyLeads.slice(0, 10)}
          pagination={{
            pageSize: 10,
            currentPage: 1,
            totalItems: 50,
            onPageChange: jest.fn(),
          }}
        />
      );

      expect(screen.getByText(/1-10 of 50/)).toBeInTheDocument();
    });

    it('disables previous button on first page', () => {
      render(
        <LeadsDataTable
          leads={manyLeads.slice(0, 10)}
          pagination={{
            pageSize: 10,
            currentPage: 1,
            totalItems: 50,
            onPageChange: jest.fn(),
          }}
        />
      );

      expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
    });

    it('disables next button on last page', () => {
      render(
        <LeadsDataTable
          leads={manyLeads.slice(40, 50)}
          pagination={{
            pageSize: 10,
            currentPage: 5,
            totalItems: 50,
            onPageChange: jest.fn(),
          }}
        />
      );

      expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
    });
  });

  describe('Source Column', () => {
    it('displays source with proper formatting', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      // cold_call should display as "Cold Call" or "cold call"
      const robertRow = screen.getByTestId('lead-row-lead-005');
      expect(within(robertRow).getByText(/cold.?call/i)).toBeInTheDocument();
    });

    it('displays all source types correctly', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      // Use getAllByText since some sources appear multiple times in the mock data
      expect(screen.getAllByText(/website/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/referral/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/linkedin/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/trade.?show/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/cold.?call/i).length).toBeGreaterThan(0);
    });
  });

  describe('Controlled Filters', () => {
    it('applies provided filters prop', () => {
      const filters: Filters = {
        status: ['new'],
      };

      render(<LeadsDataTable leads={mockLeads} filters={filters} />);

      const statusFilter = screen.getByRole('combobox', { name: /status/i });
      expect(statusFilter).toHaveValue('new');
    });

    it('applies score range filter from props', () => {
      const filters: Filters = {
        scoreRange: { min: 70, max: 90 },
      };

      render(<LeadsDataTable leads={mockLeads} filters={filters} />);

      const minScoreInput = screen.getByLabelText(/min score/i);
      const maxScoreInput = screen.getByLabelText(/max score/i);
      expect(minScoreInput).toHaveValue(70);
      expect(maxScoreInput).toHaveValue(90);
    });

    it('applies date range filter from props', () => {
      const filters: Filters = {
        dateRange: { start: '2026-01-01', end: '2026-01-31' },
      };

      render(<LeadsDataTable leads={mockLeads} filters={filters} />);

      const startDateInput = screen.getByLabelText(/start date/i);
      const endDateInput = screen.getByLabelText(/end date/i);
      expect(startDateInput).toHaveValue('2026-01-01');
      expect(endDateInput).toHaveValue('2026-01-31');
    });
  });

  describe('Source Filter', () => {
    it('renders source filter dropdown', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      const sourceFilter = screen.getByRole('combobox', { name: /source/i });
      expect(sourceFilter).toBeInTheDocument();
    });

    it('calls onFilterChange when source filter changes', () => {
      const onFilterChange = jest.fn();
      render(<LeadsDataTable leads={mockLeads} onFilterChange={onFilterChange} />);

      const sourceFilter = screen.getByRole('combobox', { name: /source/i });
      fireEvent.change(sourceFilter, { target: { value: 'referral' } });

      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({
          source: ['referral'],
        })
      );
    });
  });

  describe('Multi-Select Status Filter', () => {
    it('allows selecting multiple statuses', () => {
      const onFilterChange = jest.fn();
      render(<LeadsDataTable leads={mockLeads} onFilterChange={onFilterChange} />);

      const statusFilter = screen.getByRole('combobox', { name: /status/i });

      // Open dropdown and select multiple
      fireEvent.click(statusFilter);
      fireEvent.click(screen.getByRole('option', { name: /new/i }));
      fireEvent.click(screen.getByRole('option', { name: /qualified/i }));

      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({
          status: expect.arrayContaining(['new', 'qualified']),
        })
      );
    });
  });

  describe('Keyboard Navigation', () => {
    it('supports keyboard navigation on rows', () => {
      const onLeadClick = jest.fn();
      render(<LeadsDataTable leads={mockLeads} onLeadClick={onLeadClick} />);

      const johnRow = screen.getByTestId('lead-row-lead-001');
      fireEvent.keyDown(johnRow, { key: 'Enter' });

      expect(onLeadClick).toHaveBeenCalledWith('lead-001');
    });

    it('supports space key to toggle selection', () => {
      const onSelectionChange = jest.fn();
      render(
        <LeadsDataTable
          leads={mockLeads}
          selectable={true}
          onSelectionChange={onSelectionChange}
        />
      );

      const johnRow = screen.getByTestId('lead-row-lead-001');
      fireEvent.keyDown(johnRow, { key: ' ' });

      expect(onSelectionChange).toHaveBeenCalledWith(['lead-001']);
    });
  });

  describe('Row Checkbox Deselection', () => {
    it('deselects a lead when checkbox is clicked while selected', () => {
      const onSelectionChange = jest.fn();
      render(
        <LeadsDataTable
          leads={mockLeads}
          selectable={true}
          selectedLeads={['lead-001', 'lead-002']}
          onSelectionChange={onSelectionChange}
        />
      );

      // Find the checkbox for lead-001 and click to deselect
      const rowCheckboxes = screen.getAllByRole('checkbox');
      // rowCheckboxes[0] is header, [1] is lead-001
      fireEvent.click(rowCheckboxes[1]);

      // Should call with lead-002 only (lead-001 removed)
      expect(onSelectionChange).toHaveBeenCalledWith(['lead-002']);
    });

    it('does not call onSelectionChange when handler not provided', () => {
      render(
        <LeadsDataTable
          leads={mockLeads}
          selectable={true}
          selectedLeads={['lead-001']}
        />
      );

      const rowCheckboxes = screen.getAllByRole('checkbox');
      // Should not throw
      expect(() => fireEvent.click(rowCheckboxes[1])).not.toThrow();
    });
  });

  describe('Source Filter Clearing', () => {
    it('clears source filter when "Any Source" is selected', () => {
      const onFilterChange = jest.fn();
      const filters: Filters = { source: ['website'] };
      render(
        <LeadsDataTable
          leads={mockLeads}
          filters={filters}
          onFilterChange={onFilterChange}
        />
      );

      const sourceFilter = screen.getByRole('combobox', { name: /source/i });
      fireEvent.change(sourceFilter, { target: { value: 'all' } });

      // Should remove source from filters
      expect(onFilterChange).toHaveBeenCalledWith({});
    });
  });

  describe('Status Filter Clearing', () => {
    it('clears status filter when "All" is selected', () => {
      const onFilterChange = jest.fn();
      const filters: Filters = { status: ['new'] };
      render(
        <LeadsDataTable
          leads={mockLeads}
          filters={filters}
          onFilterChange={onFilterChange}
        />
      );

      const statusFilter = screen.getByRole('combobox', { name: /status/i });
      fireEvent.change(statusFilter, { target: { value: 'all' } });

      // Should remove status from filters
      expect(onFilterChange).toHaveBeenCalledWith({});
    });
  });

  describe('Max Score Filter', () => {
    it('calls onFilterChange when max score changes', () => {
      const onFilterChange = jest.fn();
      render(<LeadsDataTable leads={mockLeads} onFilterChange={onFilterChange} />);

      const maxScoreInput = screen.getByLabelText(/max score/i);
      fireEvent.change(maxScoreInput, { target: { value: '80' } });

      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({
          scoreRange: expect.objectContaining({ max: 80 }),
        })
      );
    });

    it('clears max score when input is empty', () => {
      const onFilterChange = jest.fn();
      const filters: Filters = { scoreRange: { max: 80 } };
      render(
        <LeadsDataTable
          leads={mockLeads}
          filters={filters}
          onFilterChange={onFilterChange}
        />
      );

      const maxScoreInput = screen.getByLabelText(/max score/i);
      fireEvent.change(maxScoreInput, { target: { value: '' } });

      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({
          scoreRange: expect.objectContaining({ max: undefined }),
        })
      );
    });
  });

  describe('End Date Filter', () => {
    it('calls onFilterChange when end date changes', () => {
      const onFilterChange = jest.fn();
      render(<LeadsDataTable leads={mockLeads} onFilterChange={onFilterChange} />);

      const endDateInput = screen.getByLabelText(/end date/i);
      fireEvent.change(endDateInput, { target: { value: '2026-02-28' } });

      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({
          dateRange: expect.objectContaining({ end: '2026-02-28' }),
        })
      );
    });

    it('clears end date when input is empty', () => {
      const onFilterChange = jest.fn();
      const filters: Filters = { dateRange: { end: '2026-02-28' } };
      render(
        <LeadsDataTable
          leads={mockLeads}
          filters={filters}
          onFilterChange={onFilterChange}
        />
      );

      const endDateInput = screen.getByLabelText(/end date/i);
      fireEvent.change(endDateInput, { target: { value: '' } });

      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({
          dateRange: expect.objectContaining({ end: undefined }),
        })
      );
    });
  });

  describe('Filter Application', () => {
    it('filters leads by status', () => {
      const filters: Filters = { status: ['new'] };
      render(<LeadsDataTable leads={mockLeads} filters={filters} />);

      // Only John Smith has 'new' status
      expect(screen.getByText('John Smith')).toBeInTheDocument();
      expect(screen.queryByText('Sarah Johnson')).not.toBeInTheDocument();
      expect(screen.queryByText('Michael Chen')).not.toBeInTheDocument();
    });

    it('filters leads by score range', () => {
      const filters: Filters = { scoreRange: { min: 90, max: 100 } };
      render(<LeadsDataTable leads={mockLeads} filters={filters} />);

      // Only Michael Chen (92) and Robert Wilson (95) have scores >= 90
      expect(screen.getByText('Michael Chen')).toBeInTheDocument();
      expect(screen.getByText('Robert Wilson')).toBeInTheDocument();
      expect(screen.queryByText('John Smith')).not.toBeInTheDocument();
    });

    it('filters leads by source', () => {
      const filters: Filters = { source: ['referral'] };
      render(<LeadsDataTable leads={mockLeads} filters={filters} />);

      // Only Sarah Johnson has 'referral' source
      expect(screen.getByText('Sarah Johnson')).toBeInTheDocument();
      expect(screen.queryByText('John Smith')).not.toBeInTheDocument();
    });

    it('filters leads by date range start only', () => {
      const filters: Filters = {
        dateRange: {
          start: '2026-02-01'
        }
      };
      render(<LeadsDataTable leads={mockLeads} filters={filters} />);

      // John Smith (2026-02-01), Sarah (2026-02-05), Michael (2026-02-06), Robert (2026-02-07) are in range
      expect(screen.getByText('John Smith')).toBeInTheDocument();
      expect(screen.getByText('Sarah Johnson')).toBeInTheDocument();
      expect(screen.getByText('Michael Chen')).toBeInTheDocument();
      expect(screen.getByText('Robert Wilson')).toBeInTheDocument();
      // Emily (2026-01-30), Lisa (2026-01-20) should be filtered out
      expect(screen.queryByText('Emily Davis')).not.toBeInTheDocument();
      expect(screen.queryByText('Lisa Brown')).not.toBeInTheDocument();
    });

    it('filters leads by date range end only', () => {
      const filters: Filters = {
        dateRange: {
          end: '2026-01-31'
        }
      };
      render(<LeadsDataTable leads={mockLeads} filters={filters} />);

      // Emily (2026-01-30), Lisa (2026-01-20) are in range (before Jan 31)
      expect(screen.getByText('Emily Davis')).toBeInTheDocument();
      expect(screen.getByText('Lisa Brown')).toBeInTheDocument();
      // John (2026-02-01), Sarah (2026-02-05), Michael (2026-02-06), Robert (2026-02-07) are after Jan 31
      expect(screen.queryByText('John Smith')).not.toBeInTheDocument();
      expect(screen.queryByText('Sarah Johnson')).not.toBeInTheDocument();
      expect(screen.queryByText('Michael Chen')).not.toBeInTheDocument();
      expect(screen.queryByText('Robert Wilson')).not.toBeInTheDocument();
    });
  });

  describe('Last Activity Date Formatting', () => {
    it('displays "Today" for activities from today', () => {
      const todayLead: Lead = {
        ...mockLeads[0],
        id: 'lead-today',
        lastActivity: new Date().toISOString(),
      };
      render(<LeadsDataTable leads={[todayLead]} />);

      const row = screen.getByTestId('lead-row-lead-today');
      const lastActivityCell = within(row).getByTestId('last-activity-cell');
      expect(lastActivityCell).toHaveTextContent('Today');
    });

    it('displays "1 day ago" for activities from yesterday', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayLead: Lead = {
        ...mockLeads[0],
        id: 'lead-yesterday',
        lastActivity: yesterday.toISOString(),
      };
      render(<LeadsDataTable leads={[yesterdayLead]} />);

      const row = screen.getByTestId('lead-row-lead-yesterday');
      const lastActivityCell = within(row).getByTestId('last-activity-cell');
      expect(lastActivityCell).toHaveTextContent('1 day ago');
    });

    it('displays "X days ago" for activities within a week', () => {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const threeDaysLead: Lead = {
        ...mockLeads[0],
        id: 'lead-3days',
        lastActivity: threeDaysAgo.toISOString(),
      };
      render(<LeadsDataTable leads={[threeDaysLead]} />);

      const row = screen.getByTestId('lead-row-lead-3days');
      const lastActivityCell = within(row).getByTestId('last-activity-cell');
      expect(lastActivityCell).toHaveTextContent('3 days ago');
    });

    it('displays "1 week ago" for activities from a week ago', () => {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const weekLead: Lead = {
        ...mockLeads[0],
        id: 'lead-week',
        lastActivity: oneWeekAgo.toISOString(),
      };
      render(<LeadsDataTable leads={[weekLead]} />);

      const row = screen.getByTestId('lead-row-lead-week');
      const lastActivityCell = within(row).getByTestId('last-activity-cell');
      expect(lastActivityCell).toHaveTextContent('1 week ago');
    });

    it('displays "X weeks ago" for activities within a month', () => {
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      const twoWeeksLead: Lead = {
        ...mockLeads[0],
        id: 'lead-2weeks',
        lastActivity: twoWeeksAgo.toISOString(),
      };
      render(<LeadsDataTable leads={[twoWeeksLead]} />);

      const row = screen.getByTestId('lead-row-lead-2weeks');
      const lastActivityCell = within(row).getByTestId('last-activity-cell');
      expect(lastActivityCell).toHaveTextContent('2 weeks ago');
    });

    it('displays formatted date for activities older than a month', () => {
      const oldLead: Lead = {
        ...mockLeads[0],
        id: 'lead-old',
        lastActivity: '2025-01-15T10:00:00Z',
      };
      render(<LeadsDataTable leads={[oldLead]} />);

      const row = screen.getByTestId('lead-row-lead-old');
      const lastActivityCell = within(row).getByTestId('last-activity-cell');
      // Should show formatted date like "Jan 15, 2025"
      expect(lastActivityCell).toHaveTextContent(/Jan.*15.*2025/);
    });
  });

  describe('Row Click With Checkbox', () => {
    it('does not trigger row click when clicking checkbox', () => {
      const onLeadClick = jest.fn();
      const onSelectionChange = jest.fn();
      render(
        <LeadsDataTable
          leads={mockLeads}
          selectable={true}
          onLeadClick={onLeadClick}
          onSelectionChange={onSelectionChange}
        />
      );

      const rowCheckboxes = screen.getAllByRole('checkbox');
      // Click on the checkbox itself
      fireEvent.click(rowCheckboxes[1]);

      // onLeadClick should NOT be called
      expect(onLeadClick).not.toHaveBeenCalled();
      // onSelectionChange should be called
      expect(onSelectionChange).toHaveBeenCalled();
    });
  });

  describe('Pagination Edge Cases', () => {
    const manyLeads: Lead[] = Array.from({ length: 50 }, (_, i) => ({
      id: `lead-${String(i + 1).padStart(3, '0')}`,
      name: `Lead ${i + 1}`,
      email: `lead${i + 1}@example.com`,
      company: `Company ${i + 1}`,
      status: 'new' as LeadStatus,
      source: 'website',
      score: Math.floor(Math.random() * 100),
      createdAt: '2026-01-15T10:30:00Z',
      lastActivity: '2026-02-01T14:20:00Z',
    }));

    it('calls onPageChange with previous page number', () => {
      const onPageChange = jest.fn();
      render(
        <LeadsDataTable
          leads={manyLeads.slice(10, 20)}
          pagination={{
            pageSize: 10,
            currentPage: 2,
            totalItems: 50,
            onPageChange,
          }}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /previous/i }));

      expect(onPageChange).toHaveBeenCalledWith(1);
    });

    it('displays correct page info for middle page', () => {
      render(
        <LeadsDataTable
          leads={manyLeads.slice(20, 30)}
          pagination={{
            pageSize: 10,
            currentPage: 3,
            totalItems: 50,
            onPageChange: jest.fn(),
          }}
        />
      );

      expect(screen.getByText(/21-30 of 50/)).toBeInTheDocument();
    });

    it('displays correct page info for partial last page', () => {
      render(
        <LeadsDataTable
          leads={manyLeads.slice(45, 50)}
          pagination={{
            pageSize: 10,
            currentPage: 5,
            totalItems: 47,
            onPageChange: jest.fn(),
          }}
        />
      );

      // 41-47 of 47
      expect(screen.getByText(/41-47 of 47/)).toBeInTheDocument();
    });
  });

  describe('Sort Direction Toggle', () => {
    it('starts with ascending when clicking unsorted column', () => {
      const onSort = jest.fn();
      render(<LeadsDataTable leads={mockLeads} onSort={onSort} />);

      fireEvent.click(screen.getByRole('columnheader', { name: /company/i }));

      expect(onSort).toHaveBeenCalledWith('company', 'asc');
    });

    it('resets to ascending when switching to different column', () => {
      const onSort = jest.fn();
      render(
        <LeadsDataTable
          leads={mockLeads}
          onSort={onSort}
          sortedBy="name"
          sortDirection="desc"
        />
      );

      fireEvent.click(screen.getByRole('columnheader', { name: /company/i }));

      expect(onSort).toHaveBeenCalledWith('company', 'asc');
    });
  });

  describe('Header Checkbox Without Selection Handler', () => {
    it('does not throw when clicking header checkbox without onSelectionChange', () => {
      render(
        <LeadsDataTable
          leads={mockLeads}
          selectable={true}
        />
      );

      const headerCheckbox = screen.getAllByRole('checkbox')[0];
      expect(() => fireEvent.click(headerCheckbox)).not.toThrow();
    });
  });

  describe('Singular/Plural Selection Count', () => {
    it('displays "1 lead selected" for single selection', () => {
      render(
        <LeadsDataTable
          leads={mockLeads}
          selectable={true}
          selectedLeads={['lead-001']}
        />
      );

      expect(screen.getByText('1 lead selected')).toBeInTheDocument();
    });

    it('displays "2 leads selected" for multiple selection', () => {
      render(
        <LeadsDataTable
          leads={mockLeads}
          selectable={true}
          selectedLeads={['lead-001', 'lead-002']}
        />
      );

      expect(screen.getByText('2 leads selected')).toBeInTheDocument();
    });
  });

  describe('Table Without Pagination', () => {
    it('does not render pagination when not configured', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      expect(screen.queryByTestId('pagination')).not.toBeInTheDocument();
    });
  });

  describe('Default Skeleton Row Count', () => {
    it('renders 5 skeleton rows by default', () => {
      render(<LeadsDataTable leads={[]} loading={true} />);

      const skeletonRows = screen.getAllByTestId('skeleton-row');
      expect(skeletonRows).toHaveLength(5);
    });
  });

  describe('Source Formatting Display', () => {
    it('displays trade_show source formatted as readable text', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      // Emily Davis has trade_show source
      const emilyRow = screen.getByTestId('lead-row-lead-004');
      expect(within(emilyRow).getByText(/trade_show/i)).toBeInTheDocument();
    });

    it('displays cold_call source in table', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      // Robert Wilson has cold_call source
      const robertRow = screen.getByTestId('lead-row-lead-005');
      expect(within(robertRow).getByText(/cold_call/i)).toBeInTheDocument();
    });
  });

  describe('Min Score Filter Clearing', () => {
    it('clears min score when input is empty', () => {
      const onFilterChange = jest.fn();
      const filters: Filters = { scoreRange: { min: 50 } };
      render(
        <LeadsDataTable
          leads={mockLeads}
          filters={filters}
          onFilterChange={onFilterChange}
        />
      );

      const minScoreInput = screen.getByLabelText(/min score/i);
      fireEvent.change(minScoreInput, { target: { value: '' } });

      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({
          scoreRange: expect.objectContaining({ min: undefined }),
        })
      );
    });
  });

  describe('Start Date Filter Clearing', () => {
    it('clears start date when input is empty', () => {
      const onFilterChange = jest.fn();
      const filters: Filters = { dateRange: { start: '2026-01-01' } };
      render(
        <LeadsDataTable
          leads={mockLeads}
          filters={filters}
          onFilterChange={onFilterChange}
        />
      );

      const startDateInput = screen.getByLabelText(/start date/i);
      fireEvent.change(startDateInput, { target: { value: '' } });

      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({
          dateRange: expect.objectContaining({ start: undefined }),
        })
      );
    });
  });

  describe('Sort Indicator Rendering', () => {
    it('renders default sort indicator for unsorted columns', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      // All column headers should have aria-sort="none" by default
      const nameHeader = screen.getByRole('columnheader', { name: /name/i });
      expect(nameHeader).toHaveAttribute('aria-sort', 'none');
    });

    it('renders descending sort indicator', () => {
      render(
        <LeadsDataTable
          leads={mockLeads}
          sortedBy="name"
          sortDirection="desc"
        />
      );

      const nameHeader = screen.getByRole('columnheader', { name: /name/i });
      expect(nameHeader).toHaveAttribute('aria-sort', 'descending');
    });
  });

  describe('Filter Without Handler', () => {
    it('does not throw when changing status filter without handler', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      const statusFilter = screen.getByRole('combobox', { name: /status/i });
      expect(() => fireEvent.change(statusFilter, { target: { value: 'new' } })).not.toThrow();
    });

    it('does not throw when changing source filter without handler', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      const sourceFilter = screen.getByRole('combobox', { name: /source/i });
      expect(() => fireEvent.change(sourceFilter, { target: { value: 'website' } })).not.toThrow();
    });

    it('does not throw when changing min score without handler', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      const minScoreInput = screen.getByLabelText(/min score/i);
      expect(() => fireEvent.change(minScoreInput, { target: { value: '50' } })).not.toThrow();
    });

    it('does not throw when changing max score without handler', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      const maxScoreInput = screen.getByLabelText(/max score/i);
      expect(() => fireEvent.change(maxScoreInput, { target: { value: '100' } })).not.toThrow();
    });

    it('does not throw when changing start date without handler', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      const startDateInput = screen.getByLabelText(/start date/i);
      expect(() => fireEvent.change(startDateInput, { target: { value: '2026-01-01' } })).not.toThrow();
    });

    it('does not throw when changing end date without handler', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      const endDateInput = screen.getByLabelText(/end date/i);
      expect(() => fireEvent.change(endDateInput, { target: { value: '2026-12-31' } })).not.toThrow();
    });

    it('does not throw when clicking clear filters without handler', () => {
      const filters: Filters = { status: ['new'] };
      render(<LeadsDataTable leads={mockLeads} filters={filters} />);

      const clearButton = screen.getByRole('button', { name: /clear filters/i });
      expect(() => fireEvent.click(clearButton)).not.toThrow();
    });
  });

  describe('Bulk Action Without Handler', () => {
    it('does not throw when clicking bulk action without handler', () => {
      render(
        <LeadsDataTable
          leads={mockLeads}
          selectable={true}
          selectedLeads={['lead-001']}
        />
      );

      const assignButton = screen.getByRole('button', { name: /assign/i });
      expect(() => fireEvent.click(assignButton)).not.toThrow();
    });
  });

  describe('Sort Without Handler', () => {
    it('does not throw when clicking sortable column without handler', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      const nameHeader = screen.getByRole('columnheader', { name: /name/i });
      expect(() => fireEvent.click(nameHeader)).not.toThrow();
    });
  });

  describe('Empty State With Active Filters Message', () => {
    it('shows filter adjustment message when filters result in empty', () => {
      const filters: Filters = {
        status: ['won'],
        scoreRange: { min: 100 },
      };
      render(<LeadsDataTable leads={mockLeads} filters={filters} />);

      expect(screen.getByText(/try adjusting your filter criteria/i)).toBeInTheDocument();
    });

    it('shows add lead message when no leads and no filters', () => {
      render(<LeadsDataTable leads={[]} />);

      expect(screen.getByText(/add your first lead/i)).toBeInTheDocument();
    });
  });

  describe('Selected Row Styling', () => {
    it('applies aria-selected attribute to selected rows', () => {
      render(
        <LeadsDataTable
          leads={mockLeads}
          selectable={true}
          selectedLeads={['lead-001']}
        />
      );

      const johnRow = screen.getByTestId('lead-row-lead-001');
      expect(johnRow).toHaveAttribute('aria-selected', 'true');
    });

    it('applies aria-selected false to unselected rows', () => {
      render(
        <LeadsDataTable
          leads={mockLeads}
          selectable={true}
          selectedLeads={['lead-001']}
        />
      );

      const sarahRow = screen.getByTestId('lead-row-lead-002');
      expect(sarahRow).toHaveAttribute('aria-selected', 'false');
    });
  });

  describe('Table Without onLeadClick', () => {
    it('rows are not focusable when onLeadClick not provided', () => {
      render(<LeadsDataTable leads={mockLeads} />);

      const johnRow = screen.getByTestId('lead-row-lead-001');
      expect(johnRow).not.toHaveAttribute('tabIndex');
    });

    it('rows are focusable when onLeadClick is provided', () => {
      const onLeadClick = jest.fn();
      render(<LeadsDataTable leads={mockLeads} onLeadClick={onLeadClick} />);

      const johnRow = screen.getByTestId('lead-row-lead-001');
      expect(johnRow).toHaveAttribute('tabIndex', '0');
    });
  });

  describe('Keyboard Navigation Edge Cases', () => {
    it('does not trigger selection on other key presses', () => {
      const onSelectionChange = jest.fn();
      render(
        <LeadsDataTable
          leads={mockLeads}
          selectable={true}
          onSelectionChange={onSelectionChange}
        />
      );

      const johnRow = screen.getByTestId('lead-row-lead-001');
      fireEvent.keyDown(johnRow, { key: 'Escape' });

      expect(onSelectionChange).not.toHaveBeenCalled();
    });

    it('does not trigger lead click on Space when not selectable', () => {
      const onLeadClick = jest.fn();
      render(<LeadsDataTable leads={mockLeads} onLeadClick={onLeadClick} />);

      const johnRow = screen.getByTestId('lead-row-lead-001');
      fireEvent.keyDown(johnRow, { key: ' ' });

      // Space should not trigger lead click when not selectable
      expect(onLeadClick).not.toHaveBeenCalled();
    });
  });
});
