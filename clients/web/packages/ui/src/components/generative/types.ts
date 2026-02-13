/**
 * Generative UI Component Types
 *
 * Type definitions for the ComponentRenderer and related generative UI components.
 * Based on the Generative UI Specification v1.0.
 */

/**
 * Narration object for voice output
 */
export interface Narration {
  /** Plain text narration for speech synthesis */
  text: string;
  /** Optional SSML markup for enhanced speech control */
  ssml?: string;
}

/**
 * Action types supported by generative UI components
 */
export type ActionType = 'navigate' | 'drilldown' | 'approve' | 'reject';

/**
 * Component action definition
 */
export interface ComponentAction {
  /** The type of action */
  type: ActionType;
  /** Navigation target path (for navigate/drilldown) */
  target?: string;
  /** Additional parameters for the action */
  params?: Record<string, string>;
}

/**
 * Component response from MCP UI Service
 */
export interface ComponentResponse {
  /** The component type to render (e.g., 'OrgChartComponent', 'ApprovalsQueue') */
  type: string;
  /** Props to pass to the component */
  props: Record<string, unknown>;
  /** Available actions for the component */
  actions?: ComponentAction[];
  /** Voice narration for the component */
  narration?: Narration;
}

/**
 * Props for the ComponentRenderer
 */
export interface ComponentRendererProps {
  /** The component response from MCP UI Service */
  component: ComponentResponse;
  /** Callback when a component action is triggered */
  onAction: (action: ComponentAction) => void;
  /** Whether voice output is enabled */
  voiceEnabled: boolean;
}

/**
 * Known component types
 */
export type KnownComponentType =
  | 'OrgChartComponent'
  | 'ApprovalsQueue'
  | 'CustomerDetailCard'
  | 'LeadsDataTable'
  | 'ForecastChart'
  | 'BudgetSummaryCard'
  | 'QuarterlyReportDashboard';

/**
 * Props for OrgChartComponent
 */
export interface Employee {
  id: string;
  name: string;
  title: string;
  email?: string;
  avatarUrl?: string;
}

export interface OrgChartProps {
  manager?: Employee;
  self: Employee;
  peers: Employee[];
  directReports: Employee[];
  onEmployeeClick?: (employee: Employee) => void;
}

/**
 * Props for ApprovalsQueue
 */
export interface TimeOffRequest {
  id: string;
  employeeName: string;
  type: string;
  startDate: string;
  endDate?: string;
  reason?: string;
}

export interface ExpenseReport {
  id: string;
  employeeName: string;
  amount: number;
  date: string;
  description?: string;
}

export interface BudgetAmendment {
  id: string;
  department: string;
  amount: number;
  reason: string;
  submittedBy: string;
}

export interface ApprovalsQueueProps {
  timeOffRequests: TimeOffRequest[];
  expenseReports: ExpenseReport[];
  budgetAmendments: BudgetAmendment[];
  onApprove?: (type: string, id: string) => void;
  onReject?: (type: string, id: string, reason?: string) => void;
  onViewDetails?: (type: string, id: string) => void;
}

/**
 * Props for CustomerDetailCard
 */
export interface Contact {
  id: string;
  name: string;
  email: string;
  phone?: string;
  title?: string;
  isPrimary?: boolean;
}

export interface OpportunitySummary {
  id: string;
  name: string;
  value: number;
  stage: string;
}

export interface Customer {
  id: string;
  name: string;
  industry?: string;
  revenue?: number;
  employees?: number;
  website?: string;
}

export interface CustomerDetailCardProps {
  customer: Customer;
  contacts: Contact[];
  opportunities: OpportunitySummary[];
  onOpportunityClick?: (id: string) => void;
  onContactClick?: (id: string) => void;
}

/**
 * Props for LeadsDataTable
 */
export interface Lead {
  id: string;
  name: string;
  company: string;
  score: number;
  status: string;
  source?: string;
}

export interface LeadsDataTableProps {
  leads: Lead[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
  filters: Record<string, string>;
  onFilterChange?: (filters: Record<string, string>) => void;
  onPageChange?: (page: number) => void;
  onRowClick?: (lead: Lead) => void;
}

/**
 * Props for ForecastChart
 */
export interface RepForecast {
  name: string;
  closed: number;
  quota: number;
}

export interface PipelineStage {
  stage: string;
  value: number;
  count: number;
}

export interface ForecastChartProps {
  period: string;
  quota: number;
  commit: number;
  bestCase?: number;
  closed: number;
  byRep?: RepForecast[];
  pipeline?: PipelineStage[];
}

/**
 * Props for BudgetSummaryCard
 */
export interface BudgetCategory {
  name: string;
  budget: number;
  spent: number;
}

export interface BudgetSummaryCardProps {
  department: string;
  year: number;
  totalBudget: number;
  spent: number;
  remaining?: number;
  categories?: BudgetCategory[];
  warnings?: string[];
  onCategoryClick?: (category: string) => void;
}

/**
 * Props for QuarterlyReportDashboard
 */
export interface ARRMovement {
  starting: number;
  new: number;
  expansion: number;
  churn: number;
  contraction: number;
  ending: number;
}

export interface SegmentRevenue {
  segment: string;
  revenue: number;
  percentage: number;
}

export interface QuarterlyReportDashboardProps {
  quarter: string;
  year: number;
  revenue: number;
  arr: number;
  netIncome: number;
  arrMovement?: ARRMovement;
  revenueBySegment?: SegmentRevenue[];
  comparePeriod?: QuarterlyReportDashboardProps;
}

/**
 * Props for UnknownComponentFallback
 */
export interface UnknownComponentFallbackProps {
  componentType: string;
}
