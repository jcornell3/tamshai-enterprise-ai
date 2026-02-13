/**
 * AuditTrail Component Tests - v1.5 Enterprise UX Hardening
 *
 * Tests for the audit trail component following S-OX compliance patterns.
 * Verifies change history display, posted state indicators, and accessibility.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { AuditTrail } from './AuditTrail';
import type { AuditEntryData } from './AuditEntry';

// Sample audit entries for testing
const mockEntries: AuditEntryData[] = [
  {
    id: 'audit-001',
    timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
    userEmail: 'bob@tamshai-playground.local',
    userName: 'Bob Martinez',
    action: 'APPROVE',
    resource: 'invoices',
    targetId: 'inv-001',
    accessDecision: 'ALLOWED',
  },
  {
    id: 'audit-002',
    timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
    userEmail: 'alice@tamshai-playground.local',
    userName: 'Alice Chen',
    action: 'UPDATE',
    resource: 'invoices',
    targetId: 'inv-001',
    previousValue: { status: 'PENDING' },
    newValue: { status: 'APPROVED' },
    accessDecision: 'ALLOWED',
  },
  {
    id: 'audit-003',
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    userEmail: 'carol@tamshai-playground.local',
    action: 'INSERT',
    resource: 'invoices',
    targetId: 'inv-001',
    accessDecision: 'ALLOWED',
  },
  {
    id: 'audit-004',
    timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
    userEmail: 'dan@tamshai-playground.local',
    userName: 'Dan Williams',
    action: 'CREATE',
    resource: 'invoices',
    targetId: 'inv-001',
    accessDecision: 'ALLOWED',
  },
];

describe('AuditTrail Component', () => {
  describe('Basic Rendering', () => {
    test('renders audit trail with entries', () => {
      render(
        <AuditTrail
          entityType="invoice"
          entityId="inv-001"
          entries={mockEntries}
        />
      );

      expect(screen.getByTestId('audit-trail')).toBeInTheDocument();
      expect(screen.getByText('Invoice History')).toBeInTheDocument();
      expect(screen.getByText(/4 entries/)).toBeInTheDocument();
    });

    test('renders each audit entry', () => {
      render(
        <AuditTrail
          entityType="invoice"
          entityId="inv-001"
          entries={mockEntries}
        />
      );

      expect(screen.getByTestId('audit-entry-audit-001')).toBeInTheDocument();
      expect(screen.getByTestId('audit-entry-audit-002')).toBeInTheDocument();
      expect(screen.getByTestId('audit-entry-audit-003')).toBeInTheDocument();
      expect(screen.getByTestId('audit-entry-audit-004')).toBeInTheDocument();
    });

    test('displays formatted date for entries older than 7 days', () => {
      render(
        <AuditTrail
          entityType="invoice"
          entityId="inv-001"
          entries={mockEntries}
        />
      );

      // Entry from 10 days ago should show formatted date instead of "Xd ago"
      const oldEntry = screen.getByTestId('audit-entry-audit-004');
      // Should NOT contain "10d ago" - should show formatted timestamp
      expect(oldEntry).not.toHaveTextContent('10d ago');
      // Should contain Dan Williams who made the old entry
      expect(oldEntry).toHaveTextContent('Dan Williams');
    });

    test('shows user names when provided', () => {
      render(
        <AuditTrail
          entityType="invoice"
          entityId="inv-001"
          entries={mockEntries}
        />
      );

      expect(screen.getByText('Bob Martinez')).toBeInTheDocument();
      expect(screen.getByText('Alice Chen')).toBeInTheDocument();
    });

    test('shows action types with proper styling', () => {
      render(
        <AuditTrail
          entityType="invoice"
          entityId="inv-001"
          entries={mockEntries}
        />
      );

      expect(screen.getByText('APPROVE')).toBeInTheDocument();
      expect(screen.getByText('UPDATE')).toBeInTheDocument();
      expect(screen.getByText('INSERT')).toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    test('shows empty state when no entries', () => {
      render(
        <AuditTrail
          entityType="employee"
          entityId="emp-001"
          entries={[]}
        />
      );

      expect(screen.getByTestId('audit-trail-empty')).toBeInTheDocument();
      expect(screen.getByText('No audit history')).toBeInTheDocument();
      expect(screen.getByText(/No changes have been recorded/)).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    test('shows skeleton when loading with no entries', () => {
      render(
        <AuditTrail
          entityType="invoice"
          entityId="inv-001"
          entries={[]}
          loading={true}
        />
      );

      expect(screen.getByTestId('audit-trail-skeleton')).toBeInTheDocument();
    });

    test('shows entries when loading with existing entries', () => {
      render(
        <AuditTrail
          entityType="invoice"
          entityId="inv-001"
          entries={mockEntries}
          loading={true}
        />
      );

      expect(screen.getByTestId('audit-trail')).toBeInTheDocument();
      expect(screen.queryByTestId('audit-trail-skeleton')).not.toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    test('shows error message when error provided', () => {
      render(
        <AuditTrail
          entityType="invoice"
          entityId="inv-001"
          entries={[]}
          error="Failed to fetch audit logs"
        />
      );

      expect(screen.getByTestId('audit-trail-error')).toBeInTheDocument();
      expect(screen.getByText('Failed to load audit trail')).toBeInTheDocument();
      expect(screen.getByText('Failed to fetch audit logs')).toBeInTheDocument();
    });
  });

  describe('S-OX Compliance - Posted Indicator', () => {
    test('shows posted indicator when record is posted', () => {
      render(
        <AuditTrail
          entityType="invoice"
          entityId="inv-001"
          entries={mockEntries}
          isPosted={true}
          postedAt="2026-01-15T10:00:00Z"
        />
      );

      expect(screen.getByTestId('posted-indicator')).toBeInTheDocument();
      expect(screen.getByText('POSTED')).toBeInTheDocument();
    });

    test('does not show posted indicator when record is not posted', () => {
      render(
        <AuditTrail
          entityType="invoice"
          entityId="inv-001"
          entries={mockEntries}
          isPosted={false}
        />
      );

      expect(screen.queryByTestId('posted-indicator')).not.toBeInTheDocument();
    });
  });

  describe('Details Toggle', () => {
    test('toggles details visibility when button clicked', () => {
      render(
        <AuditTrail
          entityType="invoice"
          entityId="inv-001"
          entries={mockEntries}
          showDetails={false}
        />
      );

      const toggleButton = screen.getByText('Show details');
      fireEvent.click(toggleButton);

      expect(screen.getByText('Hide details')).toBeInTheDocument();
    });
  });

  describe('Load More', () => {
    test('shows load more button when hasMore is true', () => {
      const onLoadMore = jest.fn();

      render(
        <AuditTrail
          entityType="invoice"
          entityId="inv-001"
          entries={mockEntries}
          hasMore={true}
          onLoadMore={onLoadMore}
        />
      );

      expect(screen.getByText('Load more')).toBeInTheDocument();
    });

    test('calls onLoadMore when button clicked', () => {
      const onLoadMore = jest.fn();

      render(
        <AuditTrail
          entityType="invoice"
          entityId="inv-001"
          entries={mockEntries}
          hasMore={true}
          onLoadMore={onLoadMore}
        />
      );

      fireEvent.click(screen.getByText('Load more'));
      expect(onLoadMore).toHaveBeenCalledTimes(1);
    });

    test('does not show load more when hasMore is false', () => {
      render(
        <AuditTrail
          entityType="invoice"
          entityId="inv-001"
          entries={mockEntries}
          hasMore={false}
        />
      );

      expect(screen.queryByText('Load more')).not.toBeInTheDocument();
    });
  });

  describe('Action Filtering', () => {
    test('filters entries by action when actionFilter provided', () => {
      render(
        <AuditTrail
          entityType="invoice"
          entityId="inv-001"
          entries={mockEntries}
          actionFilter={['APPROVE']}
        />
      );

      // Text "1 entry" is part of a larger string with entity ID
      expect(screen.getByText(/1 entry/)).toBeInTheDocument();
      expect(screen.getByText('APPROVE')).toBeInTheDocument();
      expect(screen.queryByText('UPDATE')).not.toBeInTheDocument();
      expect(screen.queryByText('INSERT')).not.toBeInTheDocument();
    });
  });

  describe('Entity Types', () => {
    test.each([
      ['invoice', 'Invoice History'],
      ['employee', 'Employee History'],
      ['ticket', 'Ticket History'],
      ['pay_run', 'Pay Run History'],
      ['budget', 'Budget History'],
      ['expense', 'Expense History'],
    ])('renders correct title for %s entity type', (entityType, expectedTitle) => {
      render(
        <AuditTrail
          entityType={entityType as any}
          entityId="test-001"
          entries={mockEntries}
        />
      );

      expect(screen.getByText(expectedTitle)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    test('action icons have aria-label', () => {
      render(
        <AuditTrail
          entityType="invoice"
          entityId="inv-001"
          entries={mockEntries}
        />
      );

      const icons = screen.getAllByRole('img');
      icons.forEach((icon) => {
        expect(icon).toHaveAttribute('aria-label');
      });
    });
  });
});
