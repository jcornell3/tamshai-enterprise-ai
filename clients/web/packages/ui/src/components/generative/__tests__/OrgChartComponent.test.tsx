/**
 * OrgChartComponent Tests - TDD RED Phase
 *
 * Tests for the organizational chart component that displays hierarchical
 * employee relationships. These tests define the expected behavior before
 * implementation (RED phase of TDD).
 *
 * Component Structure:
 * - 3 rows: manager (top), self+peers (middle), direct reports (bottom)
 * - Each employee shown as EmployeeCard with name, title, avatar
 * - Self card is visually highlighted
 * - onEmployeeClick callback for navigation
 */
import { render, screen, fireEvent, within } from '@testing-library/react';
import { OrgChartComponent } from '../OrgChartComponent';
import type { Employee, OrgChartComponentProps } from '../OrgChartComponent';

// Test data
const mockManager: Employee = {
  id: 'mgr-001',
  name: 'Eve Thompson',
  title: 'VP of Engineering',
  email: 'eve.thompson@tamshai.com',
  avatarUrl: 'https://example.com/avatars/eve.jpg',
};

const mockSelf: Employee = {
  id: 'emp-001',
  name: 'Alice Chen',
  title: 'Senior Software Engineer',
  email: 'alice.chen@tamshai.com',
  avatarUrl: 'https://example.com/avatars/alice.jpg',
};

const mockPeers: Employee[] = [
  {
    id: 'peer-001',
    name: 'Bob Martinez',
    title: 'Senior Software Engineer',
    email: 'bob.martinez@tamshai.com',
    avatarUrl: 'https://example.com/avatars/bob.jpg',
  },
  {
    id: 'peer-002',
    name: 'Carol Johnson',
    title: 'Senior DevOps Engineer',
    email: 'carol.johnson@tamshai.com',
  },
];

const mockDirectReports: Employee[] = [
  {
    id: 'report-001',
    name: 'Dan Williams',
    title: 'Software Engineer',
    email: 'dan.williams@tamshai.com',
    avatarUrl: 'https://example.com/avatars/dan.jpg',
  },
  {
    id: 'report-002',
    name: 'Nina Patel',
    title: 'Junior Developer',
    email: 'nina.patel@tamshai.com',
  },
  {
    id: 'report-003',
    name: 'Marcus Johnson',
    title: 'QA Engineer',
  },
];

describe('OrgChartComponent', () => {
  describe('Basic Rendering', () => {
    it('renders the org chart container', () => {
      render(
        <OrgChartComponent
          self={mockSelf}
          peers={[]}
          directReports={[]}
        />
      );

      expect(screen.getByTestId('org-chart')).toBeInTheDocument();
    });

    it('renders self employee card', () => {
      render(
        <OrgChartComponent
          self={mockSelf}
          peers={[]}
          directReports={[]}
        />
      );

      expect(screen.getByText('Alice Chen')).toBeInTheDocument();
      expect(screen.getByText('Senior Software Engineer')).toBeInTheDocument();
    });

    it('renders manager when provided', () => {
      render(
        <OrgChartComponent
          manager={mockManager}
          self={mockSelf}
          peers={[]}
          directReports={[]}
        />
      );

      expect(screen.getByText('Eve Thompson')).toBeInTheDocument();
      expect(screen.getByText('VP of Engineering')).toBeInTheDocument();
    });

    it('renders peer employees', () => {
      render(
        <OrgChartComponent
          self={mockSelf}
          peers={mockPeers}
          directReports={[]}
        />
      );

      expect(screen.getByText('Bob Martinez')).toBeInTheDocument();
      expect(screen.getByText('Carol Johnson')).toBeInTheDocument();
    });

    it('renders direct reports', () => {
      render(
        <OrgChartComponent
          self={mockSelf}
          peers={[]}
          directReports={mockDirectReports}
        />
      );

      expect(screen.getByText('Dan Williams')).toBeInTheDocument();
      expect(screen.getByText('Nina Patel')).toBeInTheDocument();
      expect(screen.getByText('Marcus Johnson')).toBeInTheDocument();
    });
  });

  describe('Layout Structure', () => {
    it('renders three rows for manager, self/peers, and reports', () => {
      render(
        <OrgChartComponent
          manager={mockManager}
          self={mockSelf}
          peers={mockPeers}
          directReports={mockDirectReports}
        />
      );

      expect(screen.getByTestId('org-chart-manager-row')).toBeInTheDocument();
      expect(screen.getByTestId('org-chart-self-row')).toBeInTheDocument();
      expect(screen.getByTestId('org-chart-reports-row')).toBeInTheDocument();
    });

    it('places manager in top row', () => {
      render(
        <OrgChartComponent
          manager={mockManager}
          self={mockSelf}
          peers={[]}
          directReports={[]}
        />
      );

      const managerRow = screen.getByTestId('org-chart-manager-row');
      expect(within(managerRow).getByText('Eve Thompson')).toBeInTheDocument();
    });

    it('places self and peers in middle row', () => {
      render(
        <OrgChartComponent
          self={mockSelf}
          peers={mockPeers}
          directReports={[]}
        />
      );

      const selfRow = screen.getByTestId('org-chart-self-row');
      expect(within(selfRow).getByText('Alice Chen')).toBeInTheDocument();
      expect(within(selfRow).getByText('Bob Martinez')).toBeInTheDocument();
      expect(within(selfRow).getByText('Carol Johnson')).toBeInTheDocument();
    });

    it('places direct reports in bottom row', () => {
      render(
        <OrgChartComponent
          self={mockSelf}
          peers={[]}
          directReports={mockDirectReports}
        />
      );

      const reportsRow = screen.getByTestId('org-chart-reports-row');
      expect(within(reportsRow).getByText('Dan Williams')).toBeInTheDocument();
      expect(within(reportsRow).getByText('Nina Patel')).toBeInTheDocument();
    });
  });

  describe('Employee Cards', () => {
    it('renders employee card with name and title', () => {
      render(
        <OrgChartComponent
          self={mockSelf}
          peers={[]}
          directReports={[]}
        />
      );

      const card = screen.getByTestId('employee-card-emp-001');
      expect(within(card).getByText('Alice Chen')).toBeInTheDocument();
      expect(within(card).getByText('Senior Software Engineer')).toBeInTheDocument();
    });

    it('renders avatar when avatarUrl provided', () => {
      render(
        <OrgChartComponent
          self={mockSelf}
          peers={[]}
          directReports={[]}
        />
      );

      const card = screen.getByTestId('employee-card-emp-001');
      const avatar = within(card).getByRole('img');
      expect(avatar).toHaveAttribute('src', 'https://example.com/avatars/alice.jpg');
      expect(avatar).toHaveAttribute('alt', 'Alice Chen');
    });

    it('renders default avatar when no avatarUrl', () => {
      render(
        <OrgChartComponent
          self={mockSelf}
          peers={[]}
          directReports={mockDirectReports}
        />
      );

      // Marcus Johnson has no avatarUrl
      const card = screen.getByTestId('employee-card-report-003');
      const avatar = within(card).getByTestId('default-avatar');
      expect(avatar).toBeInTheDocument();
    });

    it('shows email when provided', () => {
      render(
        <OrgChartComponent
          self={mockSelf}
          peers={[]}
          directReports={[]}
        />
      );

      expect(screen.getByText('alice.chen@tamshai.com')).toBeInTheDocument();
    });
  });

  describe('Self Highlighting', () => {
    it('applies highlighted styling to self card', () => {
      render(
        <OrgChartComponent
          self={mockSelf}
          peers={mockPeers}
          directReports={[]}
        />
      );

      const selfCard = screen.getByTestId('employee-card-emp-001');
      expect(selfCard).toHaveClass('highlighted');
    });

    it('does not apply highlighted styling to peer cards', () => {
      render(
        <OrgChartComponent
          self={mockSelf}
          peers={mockPeers}
          directReports={[]}
        />
      );

      const peerCard = screen.getByTestId('employee-card-peer-001');
      expect(peerCard).not.toHaveClass('highlighted');
    });

    it('does not apply highlighted styling to manager card', () => {
      render(
        <OrgChartComponent
          manager={mockManager}
          self={mockSelf}
          peers={[]}
          directReports={[]}
        />
      );

      const managerCard = screen.getByTestId('employee-card-mgr-001');
      expect(managerCard).not.toHaveClass('highlighted');
    });

    it('does not apply highlighted styling to report cards', () => {
      render(
        <OrgChartComponent
          self={mockSelf}
          peers={[]}
          directReports={mockDirectReports}
        />
      );

      const reportCard = screen.getByTestId('employee-card-report-001');
      expect(reportCard).not.toHaveClass('highlighted');
    });

    it('shows "You" badge on self card', () => {
      render(
        <OrgChartComponent
          self={mockSelf}
          peers={mockPeers}
          directReports={[]}
        />
      );

      const selfCard = screen.getByTestId('employee-card-emp-001');
      expect(within(selfCard).getByText('You')).toBeInTheDocument();
    });
  });

  describe('Empty States', () => {
    it('hides manager row when no manager provided', () => {
      render(
        <OrgChartComponent
          self={mockSelf}
          peers={[]}
          directReports={[]}
        />
      );

      expect(screen.queryByTestId('org-chart-manager-row')).not.toBeInTheDocument();
    });

    it('shows empty state message in manager row when manager is undefined', () => {
      render(
        <OrgChartComponent
          self={mockSelf}
          peers={[]}
          directReports={[]}
          showEmptyStates={true}
        />
      );

      expect(screen.getByText('No manager assigned')).toBeInTheDocument();
    });

    it('shows empty state message when no direct reports', () => {
      render(
        <OrgChartComponent
          self={mockSelf}
          peers={[]}
          directReports={[]}
          showEmptyStates={true}
        />
      );

      expect(screen.getByText('No direct reports')).toBeInTheDocument();
    });

    it('shows empty state message when no peers', () => {
      render(
        <OrgChartComponent
          self={mockSelf}
          peers={[]}
          directReports={[]}
          showEmptyStates={true}
        />
      );

      expect(screen.getByText('No peers')).toBeInTheDocument();
    });

    it('hides reports row when no reports and showEmptyStates is false', () => {
      render(
        <OrgChartComponent
          self={mockSelf}
          peers={[]}
          directReports={[]}
          showEmptyStates={false}
        />
      );

      expect(screen.queryByTestId('org-chart-reports-row')).not.toBeInTheDocument();
    });
  });

  describe('Click Interactions', () => {
    it('calls onEmployeeClick when clicking employee card', () => {
      const handleClick = jest.fn();

      render(
        <OrgChartComponent
          self={mockSelf}
          peers={mockPeers}
          directReports={[]}
          onEmployeeClick={handleClick}
        />
      );

      fireEvent.click(screen.getByTestId('employee-card-peer-001'));

      expect(handleClick).toHaveBeenCalledWith(mockPeers[0]);
    });

    it('calls onEmployeeClick with manager data when clicking manager', () => {
      const handleClick = jest.fn();

      render(
        <OrgChartComponent
          manager={mockManager}
          self={mockSelf}
          peers={[]}
          directReports={[]}
          onEmployeeClick={handleClick}
        />
      );

      fireEvent.click(screen.getByTestId('employee-card-mgr-001'));

      expect(handleClick).toHaveBeenCalledWith(mockManager);
    });

    it('calls onEmployeeClick with self data when clicking self card', () => {
      const handleClick = jest.fn();

      render(
        <OrgChartComponent
          self={mockSelf}
          peers={[]}
          directReports={[]}
          onEmployeeClick={handleClick}
        />
      );

      fireEvent.click(screen.getByTestId('employee-card-emp-001'));

      expect(handleClick).toHaveBeenCalledWith(mockSelf);
    });

    it('calls onEmployeeClick with report data when clicking direct report', () => {
      const handleClick = jest.fn();

      render(
        <OrgChartComponent
          self={mockSelf}
          peers={[]}
          directReports={mockDirectReports}
          onEmployeeClick={handleClick}
        />
      );

      fireEvent.click(screen.getByTestId('employee-card-report-002'));

      expect(handleClick).toHaveBeenCalledWith(mockDirectReports[1]);
    });

    it('does not throw when onEmployeeClick is not provided', () => {
      render(
        <OrgChartComponent
          self={mockSelf}
          peers={mockPeers}
          directReports={[]}
        />
      );

      expect(() => {
        fireEvent.click(screen.getByTestId('employee-card-peer-001'));
      }).not.toThrow();
    });

    it('applies clickable styling when onEmployeeClick provided', () => {
      const handleClick = jest.fn();

      render(
        <OrgChartComponent
          self={mockSelf}
          peers={mockPeers}
          directReports={[]}
          onEmployeeClick={handleClick}
        />
      );

      const peerCard = screen.getByTestId('employee-card-peer-001');
      expect(peerCard).toHaveClass('cursor-pointer');
    });
  });

  describe('Loading State', () => {
    it('renders skeleton loader when loading', () => {
      render(
        <OrgChartComponent
          self={mockSelf}
          peers={[]}
          directReports={[]}
          loading={true}
        />
      );

      expect(screen.getByTestId('org-chart-skeleton')).toBeInTheDocument();
    });

    it('does not render employee cards when loading', () => {
      render(
        <OrgChartComponent
          manager={mockManager}
          self={mockSelf}
          peers={mockPeers}
          directReports={mockDirectReports}
          loading={true}
        />
      );

      expect(screen.queryByText('Alice Chen')).not.toBeInTheDocument();
      expect(screen.queryByText('Eve Thompson')).not.toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('renders error message when error provided', () => {
      render(
        <OrgChartComponent
          self={mockSelf}
          peers={[]}
          directReports={[]}
          error="Failed to load org chart"
        />
      );

      expect(screen.getByTestId('org-chart-error')).toBeInTheDocument();
      expect(screen.getByText('Failed to load org chart')).toBeInTheDocument();
    });

    it('does not render employee cards when error', () => {
      render(
        <OrgChartComponent
          manager={mockManager}
          self={mockSelf}
          peers={mockPeers}
          directReports={mockDirectReports}
          error="Network error"
        />
      );

      expect(screen.queryByText('Alice Chen')).not.toBeInTheDocument();
    });
  });

  describe('Connection Lines', () => {
    it('renders connection line from manager to self', () => {
      render(
        <OrgChartComponent
          manager={mockManager}
          self={mockSelf}
          peers={[]}
          directReports={[]}
        />
      );

      expect(screen.getByTestId('connection-line-manager-self')).toBeInTheDocument();
    });

    it('renders connection lines from self to direct reports', () => {
      render(
        <OrgChartComponent
          self={mockSelf}
          peers={[]}
          directReports={mockDirectReports}
        />
      );

      expect(screen.getByTestId('connection-line-self-reports')).toBeInTheDocument();
    });

    it('does not render manager connection when no manager', () => {
      render(
        <OrgChartComponent
          self={mockSelf}
          peers={[]}
          directReports={[]}
        />
      );

      expect(screen.queryByTestId('connection-line-manager-self')).not.toBeInTheDocument();
    });

    it('does not render reports connection when no reports', () => {
      render(
        <OrgChartComponent
          self={mockSelf}
          peers={[]}
          directReports={[]}
        />
      );

      expect(screen.queryByTestId('connection-line-self-reports')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper heading structure', () => {
      render(
        <OrgChartComponent
          manager={mockManager}
          self={mockSelf}
          peers={mockPeers}
          directReports={mockDirectReports}
        />
      );

      expect(screen.getByRole('heading', { name: /organization chart/i })).toBeInTheDocument();
    });

    it('employee cards are keyboard accessible', () => {
      const handleClick = jest.fn();

      render(
        <OrgChartComponent
          self={mockSelf}
          peers={mockPeers}
          directReports={[]}
          onEmployeeClick={handleClick}
        />
      );

      const peerCard = screen.getByTestId('employee-card-peer-001');
      expect(peerCard).toHaveAttribute('tabIndex', '0');
    });

    it('triggers click on Enter key press', () => {
      const handleClick = jest.fn();

      render(
        <OrgChartComponent
          self={mockSelf}
          peers={mockPeers}
          directReports={[]}
          onEmployeeClick={handleClick}
        />
      );

      const peerCard = screen.getByTestId('employee-card-peer-001');
      fireEvent.keyDown(peerCard, { key: 'Enter' });

      expect(handleClick).toHaveBeenCalledWith(mockPeers[0]);
    });

    it('triggers click on Space key press', () => {
      const handleClick = jest.fn();

      render(
        <OrgChartComponent
          self={mockSelf}
          peers={mockPeers}
          directReports={[]}
          onEmployeeClick={handleClick}
        />
      );

      const peerCard = screen.getByTestId('employee-card-peer-001');
      fireEvent.keyDown(peerCard, { key: ' ' });

      expect(handleClick).toHaveBeenCalledWith(mockPeers[0]);
    });

    it('employee cards have aria-label with name and title', () => {
      render(
        <OrgChartComponent
          self={mockSelf}
          peers={[]}
          directReports={[]}
        />
      );

      const selfCard = screen.getByTestId('employee-card-emp-001');
      expect(selfCard).toHaveAttribute('aria-label', 'Alice Chen, Senior Software Engineer');
    });

    it('self card has aria-current="true"', () => {
      render(
        <OrgChartComponent
          self={mockSelf}
          peers={mockPeers}
          directReports={[]}
        />
      );

      const selfCard = screen.getByTestId('employee-card-emp-001');
      expect(selfCard).toHaveAttribute('aria-current', 'true');
    });

    it('rows have proper section labels', () => {
      render(
        <OrgChartComponent
          manager={mockManager}
          self={mockSelf}
          peers={mockPeers}
          directReports={mockDirectReports}
        />
      );

      expect(screen.getByRole('region', { name: /manager/i })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: /team members/i })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: /direct reports/i })).toBeInTheDocument();
    });
  });

  describe('Custom Styling', () => {
    it('applies custom className to container', () => {
      render(
        <OrgChartComponent
          self={mockSelf}
          peers={[]}
          directReports={[]}
          className="custom-class"
        />
      );

      const container = screen.getByTestId('org-chart');
      expect(container).toHaveClass('custom-class');
    });

    it('applies compact mode when specified', () => {
      render(
        <OrgChartComponent
          self={mockSelf}
          peers={mockPeers}
          directReports={mockDirectReports}
          compact={true}
        />
      );

      const container = screen.getByTestId('org-chart');
      expect(container).toHaveClass('compact');
    });
  });

  describe('Count Indicators', () => {
    it('shows peer count in self row header', () => {
      render(
        <OrgChartComponent
          self={mockSelf}
          peers={mockPeers}
          directReports={[]}
        />
      );

      expect(screen.getByText('Team (3)')).toBeInTheDocument(); // self + 2 peers
    });

    it('shows direct report count in reports row header', () => {
      render(
        <OrgChartComponent
          self={mockSelf}
          peers={[]}
          directReports={mockDirectReports}
        />
      );

      expect(screen.getByText('Direct Reports (3)')).toBeInTheDocument();
    });
  });
});
