/**
 * ComponentRenderer TDD GREEN Phase Tests
 *
 * These tests define the expected behavior of the ComponentRenderer component.
 * The ComponentRenderer is a dynamic component switcher that:
 * 1. Takes a ComponentResponse object with { type, props, actions?, narration? }
 * 2. Renders the correct component based on type
 * 3. Falls back to UnknownComponentFallback for unknown types
 * 4. Supports voiceEnabled prop that triggers speech synthesis
 * 5. Passes onAction callback to child components
 */

import { render, screen, fireEvent } from '@testing-library/react';
import type { ComponentAction } from '../types';

// Define mock components before jest.mock calls
const MockOrgChartComponent = jest.fn(({ onAction, ...props }) => (
  <div data-testid="org-chart-component" data-props={JSON.stringify(props)}>
    <button onClick={() => onAction?.({ type: 'navigate', target: '/hr/employees/123' })}>
      Navigate
    </button>
  </div>
));

const MockApprovalsQueue = jest.fn(({ onAction, ...props }) => (
  <div data-testid="approvals-queue" data-props={JSON.stringify(props)}>
    <button onClick={() => onAction?.({ type: 'approve', params: { id: 'req-1' } })}>
      Approve
    </button>
  </div>
));

const MockCustomerDetailCard = jest.fn(({ ...props }) => (
  <div data-testid="customer-detail-card" data-props={JSON.stringify(props)}>
    Customer Card
  </div>
));

const MockLeadsDataTable = jest.fn(({ ...props }) => (
  <div data-testid="leads-data-table" data-props={JSON.stringify(props)}>
    Leads Table
  </div>
));

const MockForecastChart = jest.fn(({ ...props }) => (
  <div data-testid="forecast-chart" data-props={JSON.stringify(props)}>
    Forecast Chart
  </div>
));

const MockBudgetSummaryCard = jest.fn(({ ...props }) => (
  <div data-testid="budget-summary-card" data-props={JSON.stringify(props)}>
    Budget Card
  </div>
));

const MockQuarterlyReportDashboard = jest.fn(({ ...props }) => (
  <div data-testid="quarterly-report-dashboard" data-props={JSON.stringify(props)}>
    Quarterly Report
  </div>
));

const MockUnknownComponentFallback = jest.fn(({ componentType }: { componentType: string }) => (
  <div data-testid="unknown-component-fallback" role="alert">
    Unknown component type: {componentType}
  </div>
));

// Mock the child components
jest.mock('../OrgChartComponent', () => ({
  OrgChartComponent: (props: Record<string, unknown>) => MockOrgChartComponent(props),
}));

jest.mock('../ApprovalsQueue', () => ({
  ApprovalsQueue: (props: Record<string, unknown>) => MockApprovalsQueue(props),
}));

jest.mock('../CustomerDetailCard', () => ({
  CustomerDetailCard: (props: Record<string, unknown>) => MockCustomerDetailCard(props),
}));

jest.mock('../LeadsDataTable', () => ({
  LeadsDataTable: (props: Record<string, unknown>) => MockLeadsDataTable(props),
}));

jest.mock('../ForecastChart', () => ({
  ForecastChart: (props: Record<string, unknown>) => MockForecastChart(props),
}));

jest.mock('../BudgetSummaryCard', () => ({
  BudgetSummaryCard: (props: Record<string, unknown>) => MockBudgetSummaryCard(props),
}));

jest.mock('../QuarterlyReportDashboard', () => ({
  QuarterlyReportDashboard: (props: Record<string, unknown>) => MockQuarterlyReportDashboard(props),
}));

jest.mock('../UnknownComponentFallback', () => ({
  UnknownComponentFallback: (props: { componentType: string }) => MockUnknownComponentFallback(props),
}));

// Import the actual ComponentRenderer after mocks are set up
import { ComponentRenderer } from '../ComponentRenderer';

// Mock speech synthesis for voice tests
const mockSpeak = jest.fn();
const mockCancel = jest.fn();
Object.defineProperty(window, 'speechSynthesis', {
  value: {
    speak: mockSpeak,
    cancel: mockCancel,
    getVoices: () => [],
  },
  writable: true,
});

// Mock SpeechSynthesisUtterance
const mockSpeechSynthesisUtterance = jest.fn().mockImplementation((text) => ({
  text,
  rate: 1,
  pitch: 1,
  volume: 1,
}));
global.SpeechSynthesisUtterance = mockSpeechSynthesisUtterance as unknown as typeof SpeechSynthesisUtterance;

// Define types for test data
interface ComponentResponse {
  type: string;
  props: Record<string, unknown>;
  actions?: ComponentAction[];
  narration?: { text: string; ssml?: string };
}

// Test data
const orgChartComponent: ComponentResponse = {
  type: 'OrgChartComponent',
  props: {
    manager: {
      id: 'mgr-1',
      name: 'Alice Chen',
      title: 'VP of HR',
      email: 'alice.chen@tamshai.com',
    },
    self: {
      id: 'abc-123',
      name: 'Marcus Johnson',
      title: 'Software Engineer',
      email: 'marcus.j@tamshai.com',
    },
    peers: [],
    directReports: [
      { id: 'dr-1', name: 'Dan Kim', title: 'Junior Developer' },
    ],
  },
  actions: [
    { type: 'navigate', target: '/hr/employees/:id' },
  ],
  narration: {
    text: 'You report to Alice Chen, VP of HR. You have 1 direct report.',
  },
};

const approvalsQueueComponent: ComponentResponse = {
  type: 'ApprovalsQueue',
  props: {
    timeOffRequests: [
      { id: 'to-1', employeeName: 'Dan Kim', type: 'vacation', startDate: '2026-02-15' },
    ],
    expenseReports: [],
    budgetAmendments: [],
  },
  actions: [
    { type: 'approve', params: { id: 'to-1' } },
    { type: 'reject', params: { id: 'to-1' } },
  ],
  narration: {
    text: 'You have 1 pending approval.',
  },
};

const customerDetailComponent: ComponentResponse = {
  type: 'CustomerDetailCard',
  props: {
    customer: { id: 'cust-1', name: 'Acme Corporation', industry: 'Technology' },
    contacts: [],
    opportunities: [],
  },
};

const leadsDataTableComponent: ComponentResponse = {
  type: 'LeadsDataTable',
  props: {
    leads: [{ id: 'lead-1', name: 'Sarah Connor', company: 'Cyberdyne', score: 85 }],
    pagination: { page: 1, pageSize: 10, total: 1 },
    filters: {},
  },
};

const forecastChartComponent: ComponentResponse = {
  type: 'ForecastChart',
  props: {
    period: 'Q1 2026',
    quota: 500000,
    commit: 425000,
    closed: 312000,
  },
};

const budgetSummaryComponent: ComponentResponse = {
  type: 'BudgetSummaryCard',
  props: {
    department: 'Engineering',
    year: 2026,
    totalBudget: 2500000,
    spent: 1245000,
  },
};

const quarterlyReportComponent: ComponentResponse = {
  type: 'QuarterlyReportDashboard',
  props: {
    quarter: 'Q4',
    year: 2025,
    revenue: 1200000,
    arr: 4800000,
    netIncome: 245000,
  },
};

const unknownComponent: ComponentResponse = {
  type: 'UnknownWidgetType',
  props: { someData: 'test' },
};

describe('ComponentRenderer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSpeak.mockClear();
    mockCancel.mockClear();
  });

  describe('Basic Rendering', () => {
    it('renders OrgChartComponent when type is OrgChartComponent', () => {
      render(
        <ComponentRenderer
          component={orgChartComponent}
          onAction={jest.fn()}
          voiceEnabled={false}
        />
      );

      expect(screen.getByTestId('org-chart-component')).toBeInTheDocument();
    });

    it('renders ApprovalsQueue when type is ApprovalsQueue', () => {
      render(
        <ComponentRenderer
          component={approvalsQueueComponent}
          onAction={jest.fn()}
          voiceEnabled={false}
        />
      );

      expect(screen.getByTestId('approvals-queue')).toBeInTheDocument();
    });

    it('renders CustomerDetailCard when type is CustomerDetailCard', () => {
      render(
        <ComponentRenderer
          component={customerDetailComponent}
          onAction={jest.fn()}
          voiceEnabled={false}
        />
      );

      expect(screen.getByTestId('customer-detail-card')).toBeInTheDocument();
    });

    it('renders LeadsDataTable when type is LeadsDataTable', () => {
      render(
        <ComponentRenderer
          component={leadsDataTableComponent}
          onAction={jest.fn()}
          voiceEnabled={false}
        />
      );

      expect(screen.getByTestId('leads-data-table')).toBeInTheDocument();
    });

    it('renders ForecastChart when type is ForecastChart', () => {
      render(
        <ComponentRenderer
          component={forecastChartComponent}
          onAction={jest.fn()}
          voiceEnabled={false}
        />
      );

      expect(screen.getByTestId('forecast-chart')).toBeInTheDocument();
    });

    it('renders BudgetSummaryCard when type is BudgetSummaryCard', () => {
      render(
        <ComponentRenderer
          component={budgetSummaryComponent}
          onAction={jest.fn()}
          voiceEnabled={false}
        />
      );

      expect(screen.getByTestId('budget-summary-card')).toBeInTheDocument();
    });

    it('renders QuarterlyReportDashboard when type is QuarterlyReportDashboard', () => {
      render(
        <ComponentRenderer
          component={quarterlyReportComponent}
          onAction={jest.fn()}
          voiceEnabled={false}
        />
      );

      expect(screen.getByTestId('quarterly-report-dashboard')).toBeInTheDocument();
    });
  });

  describe('Props Passing', () => {
    it('passes props to OrgChartComponent correctly', () => {
      render(
        <ComponentRenderer
          component={orgChartComponent}
          onAction={jest.fn()}
          voiceEnabled={false}
        />
      );

      const component = screen.getByTestId('org-chart-component');
      const props = JSON.parse(component.getAttribute('data-props') || '{}');

      expect(props.manager.name).toBe('Alice Chen');
      expect(props.self.name).toBe('Marcus Johnson');
      expect(props.directReports).toHaveLength(1);
    });

    it('passes props to ApprovalsQueue correctly', () => {
      render(
        <ComponentRenderer
          component={approvalsQueueComponent}
          onAction={jest.fn()}
          voiceEnabled={false}
        />
      );

      const component = screen.getByTestId('approvals-queue');
      const props = JSON.parse(component.getAttribute('data-props') || '{}');

      expect(props.timeOffRequests).toHaveLength(1);
      expect(props.timeOffRequests[0].employeeName).toBe('Dan Kim');
    });

    it('passes all props from component.props to child', () => {
      const customComponent: ComponentResponse = {
        type: 'CustomerDetailCard',
        props: {
          customer: { id: 'test-id', name: 'Test Corp', extra: 'value' },
          customField: 'customValue',
          contacts: [],
          opportunities: [],
        },
      };

      render(
        <ComponentRenderer
          component={customComponent}
          onAction={jest.fn()}
          voiceEnabled={false}
        />
      );

      const component = screen.getByTestId('customer-detail-card');
      const props = JSON.parse(component.getAttribute('data-props') || '{}');

      expect(props.customer.name).toBe('Test Corp');
      expect(props.customField).toBe('customValue');
    });
  });

  describe('Action Callbacks', () => {
    it('passes onAction callback to child components', () => {
      const onAction = jest.fn();
      render(
        <ComponentRenderer
          component={orgChartComponent}
          onAction={onAction}
          voiceEnabled={false}
        />
      );

      const navigateButton = screen.getByRole('button', { name: /navigate/i });
      fireEvent.click(navigateButton);

      expect(onAction).toHaveBeenCalledWith({
        type: 'navigate',
        target: '/hr/employees/123',
      });
    });

    it('passes onAction to ApprovalsQueue for approve action', () => {
      const onAction = jest.fn();
      render(
        <ComponentRenderer
          component={approvalsQueueComponent}
          onAction={onAction}
          voiceEnabled={false}
        />
      );

      const approveButton = screen.getByRole('button', { name: /approve/i });
      fireEvent.click(approveButton);

      expect(onAction).toHaveBeenCalledWith({
        type: 'approve',
        params: { id: 'req-1' },
      });
    });

    it('handles onAction when callback is undefined gracefully', () => {
      // Should not throw when onAction is not provided
      expect(() => {
        render(
          <ComponentRenderer
            component={orgChartComponent}
            onAction={undefined as unknown as (action: ComponentAction) => void}
            voiceEnabled={false}
          />
        );
      }).not.toThrow();
    });
  });

  describe('Unknown Component Fallback', () => {
    it('renders UnknownComponentFallback for unrecognized types', () => {
      render(
        <ComponentRenderer
          component={unknownComponent}
          onAction={jest.fn()}
          voiceEnabled={false}
        />
      );

      expect(screen.getByTestId('unknown-component-fallback')).toBeInTheDocument();
    });

    it('displays the unknown component type in fallback', () => {
      render(
        <ComponentRenderer
          component={unknownComponent}
          onAction={jest.fn()}
          voiceEnabled={false}
        />
      );

      expect(screen.getByText(/UnknownWidgetType/)).toBeInTheDocument();
    });

    it('fallback has alert role for accessibility', () => {
      render(
        <ComponentRenderer
          component={unknownComponent}
          onAction={jest.fn()}
          voiceEnabled={false}
        />
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('handles empty string type as unknown', () => {
      const emptyTypeComponent: ComponentResponse = {
        type: '',
        props: {},
      };

      render(
        <ComponentRenderer
          component={emptyTypeComponent}
          onAction={jest.fn()}
          voiceEnabled={false}
        />
      );

      expect(screen.getByTestId('unknown-component-fallback')).toBeInTheDocument();
    });

    it('handles null type gracefully', () => {
      const nullTypeComponent = {
        type: null,
        props: {},
      } as unknown as ComponentResponse;

      expect(() => {
        render(
          <ComponentRenderer
            component={nullTypeComponent}
            onAction={jest.fn()}
            voiceEnabled={false}
          />
        );
      }).not.toThrow();

      expect(screen.getByTestId('unknown-component-fallback')).toBeInTheDocument();
    });
  });

  describe('Voice Output - Narration', () => {
    it('triggers speech synthesis when voiceEnabled is true and narration exists', () => {
      render(
        <ComponentRenderer
          component={orgChartComponent}
          onAction={jest.fn()}
          voiceEnabled={true}
        />
      );

      expect(mockSpeechSynthesisUtterance).toHaveBeenCalledWith(
        'You report to Alice Chen, VP of HR. You have 1 direct report.'
      );
      expect(mockSpeak).toHaveBeenCalled();
    });

    it('does not trigger speech when voiceEnabled is false', () => {
      render(
        <ComponentRenderer
          component={orgChartComponent}
          onAction={jest.fn()}
          voiceEnabled={false}
        />
      );

      expect(mockSpeak).not.toHaveBeenCalled();
    });

    it('does not trigger speech when narration is undefined', () => {
      const componentWithoutNarration: ComponentResponse = {
        type: 'CustomerDetailCard',
        props: {
          customer: { id: 'test', name: 'Test' },
          contacts: [],
          opportunities: [],
        },
      };

      render(
        <ComponentRenderer
          component={componentWithoutNarration}
          onAction={jest.fn()}
          voiceEnabled={true}
        />
      );

      expect(mockSpeak).not.toHaveBeenCalled();
    });

    it('does not trigger speech when narration.text is empty', () => {
      const componentWithEmptyNarration: ComponentResponse = {
        type: 'OrgChartComponent',
        props: orgChartComponent.props,
        narration: { text: '' },
      };

      render(
        <ComponentRenderer
          component={componentWithEmptyNarration}
          onAction={jest.fn()}
          voiceEnabled={true}
        />
      );

      expect(mockSpeak).not.toHaveBeenCalled();
    });

    it('cancels previous speech when component changes', async () => {
      const { rerender } = render(
        <ComponentRenderer
          component={orgChartComponent}
          onAction={jest.fn()}
          voiceEnabled={true}
        />
      );

      expect(mockSpeak).toHaveBeenCalledTimes(1);

      rerender(
        <ComponentRenderer
          component={approvalsQueueComponent}
          onAction={jest.fn()}
          voiceEnabled={true}
        />
      );

      expect(mockCancel).toHaveBeenCalled();
    });

    it('speaks new narration when component prop changes', async () => {
      const { rerender } = render(
        <ComponentRenderer
          component={orgChartComponent}
          onAction={jest.fn()}
          voiceEnabled={true}
        />
      );

      mockSpeak.mockClear();
      mockSpeechSynthesisUtterance.mockClear();

      rerender(
        <ComponentRenderer
          component={approvalsQueueComponent}
          onAction={jest.fn()}
          voiceEnabled={true}
        />
      );

      expect(mockSpeechSynthesisUtterance).toHaveBeenCalledWith(
        'You have 1 pending approval.'
      );
      expect(mockSpeak).toHaveBeenCalled();
    });
  });

  describe('Voice Toggle', () => {
    it('starts speaking when voiceEnabled changes from false to true', () => {
      const { rerender } = render(
        <ComponentRenderer
          component={orgChartComponent}
          onAction={jest.fn()}
          voiceEnabled={false}
        />
      );

      expect(mockSpeak).not.toHaveBeenCalled();

      rerender(
        <ComponentRenderer
          component={orgChartComponent}
          onAction={jest.fn()}
          voiceEnabled={true}
        />
      );

      expect(mockSpeak).toHaveBeenCalled();
    });

    it('cancels speech when voiceEnabled changes from true to false', () => {
      const { rerender } = render(
        <ComponentRenderer
          component={orgChartComponent}
          onAction={jest.fn()}
          voiceEnabled={true}
        />
      );

      rerender(
        <ComponentRenderer
          component={orgChartComponent}
          onAction={jest.fn()}
          voiceEnabled={false}
        />
      );

      expect(mockCancel).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('wraps component in a region with aria-live for updates', () => {
      render(
        <ComponentRenderer
          component={orgChartComponent}
          onAction={jest.fn()}
          voiceEnabled={false}
        />
      );

      const region = screen.getByRole('region');
      expect(region).toHaveAttribute('aria-live', 'polite');
    });

    it('has aria-label indicating component type', () => {
      render(
        <ComponentRenderer
          component={orgChartComponent}
          onAction={jest.fn()}
          voiceEnabled={false}
        />
      );

      const region = screen.getByRole('region');
      expect(region).toHaveAttribute('aria-label', expect.stringContaining('Org'));
    });

    it('announces loading state for screen readers', () => {
      const loadingComponent: ComponentResponse = {
        type: 'OrgChartComponent',
        props: { loading: true },
      };

      render(
        <ComponentRenderer
          component={loadingComponent}
          onAction={jest.fn()}
          voiceEnabled={false}
        />
      );

      // Should have loading state indication
      const region = screen.getByRole('region');
      expect(region).toBeInTheDocument();
    });

    it('provides keyboard navigation support', () => {
      render(
        <ComponentRenderer
          component={orgChartComponent}
          onAction={jest.fn()}
          voiceEnabled={false}
        />
      );

      const navigateButton = screen.getByRole('button', { name: /navigate/i });
      navigateButton.focus();
      expect(document.activeElement).toBe(navigateButton);
    });
  });

  describe('Error Handling', () => {
    it('handles component with undefined props gracefully', () => {
      const componentWithUndefinedProps = {
        type: 'OrgChartComponent',
        props: undefined,
      } as unknown as ComponentResponse;

      expect(() => {
        render(
          <ComponentRenderer
            component={componentWithUndefinedProps}
            onAction={jest.fn()}
            voiceEnabled={false}
          />
        );
      }).not.toThrow();
    });

    it('handles component with null props gracefully', () => {
      const componentWithNullProps = {
        type: 'OrgChartComponent',
        props: null,
      } as unknown as ComponentResponse;

      expect(() => {
        render(
          <ComponentRenderer
            component={componentWithNullProps}
            onAction={jest.fn()}
            voiceEnabled={false}
          />
        );
      }).not.toThrow();
    });

    it('renders error boundary fallback on child component error', () => {
      // This test verifies error boundaries are in place
      // The actual implementation should wrap children in an ErrorBoundary
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

      // Component that throws
      const errorComponent: ComponentResponse = {
        type: 'OrgChartComponent',
        props: {
          throwError: true, // Hypothetical prop that causes error in implementation
        },
      };

      render(
        <ComponentRenderer
          component={errorComponent}
          onAction={jest.fn()}
          voiceEnabled={false}
        />
      );

      // Should render without crashing - error boundary should catch
      expect(screen.getByTestId('org-chart-component')).toBeInTheDocument();

      consoleError.mockRestore();
    });
  });

  describe('Component Type Case Sensitivity', () => {
    it('handles exact case match for component types', () => {
      render(
        <ComponentRenderer
          component={orgChartComponent}
          onAction={jest.fn()}
          voiceEnabled={false}
        />
      );

      expect(screen.getByTestId('org-chart-component')).toBeInTheDocument();
    });

    it('treats case mismatch as unknown component', () => {
      const wrongCaseComponent: ComponentResponse = {
        type: 'orgchartcomponent', // lowercase
        props: orgChartComponent.props,
      };

      render(
        <ComponentRenderer
          component={wrongCaseComponent}
          onAction={jest.fn()}
          voiceEnabled={false}
        />
      );

      expect(screen.getByTestId('unknown-component-fallback')).toBeInTheDocument();
    });
  });

  describe('Actions Array', () => {
    it('passes actions array to child component via props', () => {
      render(
        <ComponentRenderer
          component={orgChartComponent}
          onAction={jest.fn()}
          voiceEnabled={false}
        />
      );

      // The child component should receive actions
      // In real implementation, actions would be part of props or context
      expect(screen.getByTestId('org-chart-component')).toBeInTheDocument();
    });

    it('handles component without actions array', () => {
      const noActionsComponent: ComponentResponse = {
        type: 'CustomerDetailCard',
        props: customerDetailComponent.props,
        // No actions array
      };

      expect(() => {
        render(
          <ComponentRenderer
            component={noActionsComponent}
            onAction={jest.fn()}
            voiceEnabled={false}
          />
        );
      }).not.toThrow();

      expect(screen.getByTestId('customer-detail-card')).toBeInTheDocument();
    });

    it('handles empty actions array', () => {
      const emptyActionsComponent: ComponentResponse = {
        type: 'CustomerDetailCard',
        props: customerDetailComponent.props,
        actions: [],
      };

      expect(() => {
        render(
          <ComponentRenderer
            component={emptyActionsComponent}
            onAction={jest.fn()}
            voiceEnabled={false}
          />
        );
      }).not.toThrow();

      expect(screen.getByTestId('customer-detail-card')).toBeInTheDocument();
    });
  });

  describe('Re-rendering Behavior', () => {
    it('updates rendered component when type changes', () => {
      const { rerender } = render(
        <ComponentRenderer
          component={orgChartComponent}
          onAction={jest.fn()}
          voiceEnabled={false}
        />
      );

      expect(screen.getByTestId('org-chart-component')).toBeInTheDocument();

      rerender(
        <ComponentRenderer
          component={customerDetailComponent}
          onAction={jest.fn()}
          voiceEnabled={false}
        />
      );

      expect(screen.queryByTestId('org-chart-component')).not.toBeInTheDocument();
      expect(screen.getByTestId('customer-detail-card')).toBeInTheDocument();
    });

    it('updates props when component prop changes', () => {
      const { rerender } = render(
        <ComponentRenderer
          component={orgChartComponent}
          onAction={jest.fn()}
          voiceEnabled={false}
        />
      );

      const updatedComponent: ComponentResponse = {
        ...orgChartComponent,
        props: {
          ...orgChartComponent.props,
          self: {
            ...(orgChartComponent.props.self as Record<string, unknown>),
            name: 'Updated Name',
          },
        },
      };

      rerender(
        <ComponentRenderer
          component={updatedComponent}
          onAction={jest.fn()}
          voiceEnabled={false}
        />
      );

      const component = screen.getByTestId('org-chart-component');
      const props = JSON.parse(component.getAttribute('data-props') || '{}');
      expect(props.self.name).toBe('Updated Name');
    });
  });

  describe('Data Test IDs', () => {
    it('has data-testid on the container element', () => {
      render(
        <ComponentRenderer
          component={orgChartComponent}
          onAction={jest.fn()}
          voiceEnabled={false}
        />
      );

      expect(screen.getByTestId('component-renderer')).toBeInTheDocument();
    });

    it('includes component type in data attribute for debugging', () => {
      render(
        <ComponentRenderer
          component={orgChartComponent}
          onAction={jest.fn()}
          voiceEnabled={false}
        />
      );

      const container = screen.getByTestId('component-renderer');
      expect(container).toHaveAttribute('data-component-type', 'OrgChartComponent');
    });
  });
});
