/**
 * Component Registry - Full Implementation
 *
 * The registry maps domain:component pairs (e.g., "hr:org_chart") to their
 * component definitions including:
 * - type: The React component type name
 * - domain: The domain (hr, sales, finance, approvals)
 * - component: The component identifier
 * - mcpCalls: Array of MCP server calls needed to populate the component
 * - transform: Function to transform MCP responses to component props
 * - generateNarration: Function to generate AI narration for the component
 */

import { ComponentDefinition } from '../types/component';

const componentRegistry: Record<string, ComponentDefinition> = {
  'hr:org_chart': {
    type: 'OrgChartComponent',
    domain: 'hr',
    component: 'org_chart',
    description: 'Displays organizational hierarchy centered on the current user',
    mcpCalls: [
      { server: 'hr', tool: 'get_org_chart', paramMap: { rootEmployeeId: 'userId', maxDepth: 'depth' } },
    ],
    transform: (data: unknown): Record<string, unknown> => {
      // get_org_chart returns an array of tree nodes
      // Find the root node (the employee we're viewing)
      const nodes = (data as Array<any>) || [];
      const rootNode = nodes.find(n => n.level === 0) || null;

      // Map employee_id → id for component compatibility
      const mapEmployee = (emp: any) => emp ? { ...emp, id: emp.employee_id } : null;

      return {
        manager: null,  // get_org_chart doesn't return manager info (TODO: enhance tool)
        self: mapEmployee(rootNode),
        peers: [],  // get_org_chart doesn't return peers (TODO: enhance tool)
        directReports: (rootNode?.direct_reports || []).map(mapEmployee),
      };
    },
    generateNarration: (props: unknown, params: Record<string, string>): { text: string } => {
      // props is the transformed data: { manager, self, peers, directReports }
      const p = props as Record<string, unknown>;
      const self = p.self as Record<string, unknown> | null;
      const directReports = (p.directReports as Array<unknown>) || [];
      const manager = p.manager as Record<string, unknown> | null;
      const reportCount = directReports.length;
      const managerInfo = manager ? `You report to ${manager.name || 'your manager'}.` : 'You report to no one.';
      return {
        text: `${managerInfo} You have ${reportCount} direct report${reportCount !== 1 ? 's' : ''}.`,
      };
    },
  },

  'sales:customer': {
    type: 'CustomerDetailCard',
    domain: 'sales',
    component: 'customer',
    description: 'Shows detailed customer information with contacts and opportunities',
    mcpCalls: [
      { server: 'sales', tool: 'get_customer', paramMap: { customerId: 'customerId' } },
    ],
    transform: (data: unknown): Record<string, unknown> => {
      const d = data as Record<string, unknown>;

      // get_customer returns customer with nested contacts array
      // Extract contacts and map _id → id for component compatibility
      const contacts = (d.contacts as Array<any>) || [];
      const mappedContacts = contacts.map(contact => ({
        ...contact,
        id: contact._id || contact.id,
      }));

      // Extract customer without nested contacts
      const { contacts: _, ...customer } = d;

      return {
        customer,  // Already has id field from MCP server
        contacts: mappedContacts,
        opportunities: [],  // TODO: Add second MCP call for opportunities
      };
    },
    generateNarration: (props: unknown, params: Record<string, string>): { text: string } => {
      // props is the transformed data: { customer, contacts, opportunities }
      const p = props as Record<string, unknown>;
      const customer = p.customer as Record<string, unknown> | undefined;
      const contacts = (p.contacts as unknown[]) || [];
      const opportunities = (p.opportunities as unknown[]) || [];
      const name = customer?.name || 'Unknown';
      const contactCount = contacts.length;
      const oppCount = opportunities.length;
      return {
        text: `${name} has ${contactCount} contact${contactCount !== 1 ? 's' : ''} and ${oppCount} active opportunit${oppCount !== 1 ? 'ies' : 'y'}.`,
      };
    },
  },

  'sales:leads': {
    type: 'LeadsDataTable',
    domain: 'sales',
    component: 'leads',
    description: 'Displays a filterable table of sales leads',
    mcpCalls: [
      { server: 'sales', tool: 'list_leads', paramMap: { status: 'status', limit: 'limit' } },
    ],
    transform: (data: unknown): Record<string, unknown> => {
      // list_leads returns array of leads - map MCP field names to component props
      const rawLeads = (data as Array<any>) || [];
      const leads = rawLeads.map((lead: any) => ({
        id: lead.id || lead._id,
        name: lead.contact_name || lead.name || 'Unknown',
        email: lead.contact_email || lead.email || '',
        company: lead.company_name || lead.company || 'Unknown',
        status: (lead.status || 'new').toLowerCase(),
        source: (lead.source || 'website').toLowerCase(),
        score: lead.score?.total || lead.score || 0,
        createdAt: lead.created_at || lead.createdAt || new Date().toISOString(),
        lastActivity: lead.updated_at || lead.lastActivity || new Date().toISOString(),
      }));
      return {
        leads,
        totalCount: leads.length,
        filters: {},
      };
    },
    generateNarration: (props: unknown, params: Record<string, string>): { text: string } => {
      // props is the transformed data: { leads, totalCount, filters }
      const p = props as Record<string, unknown>;
      const leads = (p.leads as Array<any>) || [];
      const count = leads.length;
      const status = params.status || 'all';
      // Count leads by status for richer narration
      const hotLeads = leads.filter(l => l.score >= 70).length;
      const qualifiedLeads = leads.filter(l => l.status === 'qualified').length;
      let narration = `Showing ${count} ${status !== 'all' ? status + ' ' : ''}lead${count !== 1 ? 's' : ''}.`;
      if (hotLeads > 0) {
        narration += ` ${hotLeads} hot lead${hotLeads !== 1 ? 's' : ''} with high scores.`;
      }
      if (qualifiedLeads > 0) {
        narration += ` ${qualifiedLeads} qualified.`;
      }
      return { text: narration };
    },
  },

  'sales:forecast': {
    type: 'ForecastChart',
    domain: 'sales',
    component: 'forecast',
    description: 'Displays sales forecast chart for a period',
    mcpCalls: [
      { server: 'sales', tool: 'get_forecast', paramMap: { period: 'period' } },
    ],
    transform: (data: unknown): Record<string, unknown> => {
      const d = data as Record<string, unknown>;
      return {
        forecast: d.forecast,
        actual: d.actual,
        period: d.period,
      };
    },
    generateNarration: (props: unknown, params: Record<string, string>): { text: string } => {
      // props is the transformed data: { forecast, actual, period }
      const p = props as Record<string, unknown>;
      const period = (p.period as string) || params.period || 'current period';
      const forecast = Number(p.forecast) || 0;
      const actual = Number(p.actual) || 0;
      const performance = forecast > 0 ? Math.round((actual / forecast) * 100) : 0;
      if (forecast > 0 && actual > 0) {
        return {
          text: `Sales forecast for ${period}: ${performance}% of target achieved.`,
        };
      }
      return {
        text: `Sales forecast for ${period}.`,
      };
    },
  },

  'finance:budget': {
    type: 'BudgetSummaryCard',
    domain: 'finance',
    component: 'budget',
    description: 'Shows budget summary for a department',
    mcpCalls: [
      { server: 'finance', tool: 'get_budget', paramMap: { department: 'department', year: 'year' } },
    ],
    transform: (data: unknown): Record<string, unknown> => {
      const d = data as Record<string, unknown>;
      const budgets = (d.budgets as Array<any>) || [];

      // Map department budgets to category spending structure
      const categories = budgets.map(b => ({
        name: b.category_id || 'General',
        allocated: Number(b.budgeted_amount) || 0,
        spent: Number(b.actual_amount) || 0,
        percentage: Number(b.budgeted_amount) > 0
          ? Math.round((Number(b.actual_amount) / Number(b.budgeted_amount)) * 100)
          : 0,
      }));

      const allocated = Number(d.total_budgeted) || 0;
      const spent = Number(d.total_actual) || 0;

      return {
        budget: {
          departmentName: String(d.department),
          fiscalYear: Number(d.fiscal_year),
          allocated,
          spent,
          remaining: allocated - spent,
          categories,
        },
      };
    },
    generateNarration: (props: unknown, params: Record<string, string>): { text: string } => {
      // props is the transformed data: { budget: { departmentName, fiscalYear, allocated, spent, remaining, categories } }
      const p = props as Record<string, unknown>;
      const budget = p.budget as Record<string, unknown> | undefined;
      const dept = (budget?.departmentName as string) || params.department || 'department';
      const allocated = Number(budget?.allocated) || 0;
      const spent = Number(budget?.spent) || 0;
      const remaining = Number(budget?.remaining) || 0;
      const percentUsed = allocated > 0 ? Math.round((spent / allocated) * 100) : 0;
      return {
        text: `${dept} budget: ${percentUsed}% used. $${remaining.toLocaleString()} remaining of $${allocated.toLocaleString()} allocated.`,
      };
    },
  },

  'approvals:pending': {
    type: 'ApprovalsQueue',
    domain: 'approvals',
    component: 'pending',
    description: 'Shows pending approvals across HR and Finance with employee name resolution',
    mcpCalls: [
      { server: 'hr', tool: 'get_pending_time_off', paramMap: {}, dataField: 'timeOffRequests' },
      { server: 'finance', tool: 'get_pending_expenses', paramMap: {}, dataField: 'expenseReports' },
      { server: 'finance', tool: 'get_pending_budgets', paramMap: {}, dataField: 'budgetAmendments' },
      { server: 'hr', tool: 'list_employees', paramMap: {}, dataField: 'employees' },
    ],
    transform: (data: unknown): Record<string, unknown> => {
      // Multiple MCP calls return merged object with arrays
      const d = data as Record<string, unknown>;

      // Build employee name lookup map from list_employees result
      const employees = (d.employees as Array<any>) || [];
      console.log(`[APPROVALS TRANSFORM] Employees count: ${employees.length}`);
      console.log(`[APPROVALS TRANSFORM] ExpenseReports count: ${((d.expenseReports as Array<any>) || []).length}`);
      const employeeNameMap = new Map<string, string>();
      employees.forEach((emp: any) => {
        const fullName = `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || 'Unknown';
        // Index by both employee_id (UUID) and id fields
        if (emp.employee_id) employeeNameMap.set(emp.employee_id, fullName);
        if (emp.id) employeeNameMap.set(emp.id, fullName);
      });
      console.log(`[APPROVALS TRANSFORM] Employee map size: ${employeeNameMap.size}`);

      // Map time-off requests: requestId → id, typeCode → type, notes → reason
      // Resolve employee names from employeeId
      const timeOffRequests = ((d.timeOffRequests as Array<any>) || []).map((req: any) => ({
        id: req.requestId || req.id,
        employeeName: employeeNameMap.get(req.employeeId) || req.employeeName || 'Unknown',
        startDate: req.startDate,
        endDate: req.endDate,
        type: (req.typeCode || req.type || 'other').toLowerCase(),
        reason: req.notes || req.reason || '',
      }));

      // Map expense reports: totalAmount → amount, title → description, submissionDate → date
      // Resolve employee names from employeeId (which is currently stored in employeeName field)
      const expenseReports = ((d.expenseReports as Array<any>) || []).map((exp: any) => ({
        id: exp.id,
        employeeName: employeeNameMap.get(exp.employeeId) || employeeNameMap.get(exp.employeeName) || 'Unknown',
        amount: Number(exp.totalAmount) || 0,
        date: exp.submissionDate || exp.submittedAt?.split('T')[0] || new Date().toISOString().split('T')[0],
        description: exp.title || exp.description || 'No description',
        itemCount: exp.itemCount || 0,
      }));

      // Map budget amendments: budgetedAmount → requestedBudget
      // Resolve submitter names from submittedBy field
      const budgetAmendments = ((d.budgetAmendments as Array<any>) || []).map((bud: any) => ({
        id: bud.id,
        department: bud.department || bud.departmentCode,
        currentBudget: Number(bud.currentBudget) || 0,
        requestedBudget: Number(bud.budgetedAmount) || 0,
        reason: bud.categoryName || bud.reason || 'Budget request',
        submittedBy: employeeNameMap.get(bud.submittedBy) || 'Unknown',
      }));

      return {
        timeOffRequests,
        expenseReports,
        budgetAmendments,
      };
    },
    generateNarration: (props: unknown, params: Record<string, string>): { text: string } => {
      // props is the transformed data: { timeOffRequests, expenseReports, budgetAmendments }
      const p = props as Record<string, unknown>;
      const timeOffRequests = (p.timeOffRequests as unknown[]) || [];
      const expenseReports = (p.expenseReports as unknown[]) || [];
      const budgetAmendments = (p.budgetAmendments as unknown[]) || [];
      const timeOff = timeOffRequests.length;
      const expenses = expenseReports.length;
      const budgets = budgetAmendments.length;
      const total = timeOff + expenses + budgets;
      if (total === 0) {
        return { text: 'No pending approvals.' };
      }
      const parts: string[] = [];
      if (timeOff > 0) parts.push(`${timeOff} time off request${timeOff !== 1 ? 's' : ''}`);
      if (expenses > 0) parts.push(`${expenses} expense report${expenses !== 1 ? 's' : ''}`);
      if (budgets > 0) parts.push(`${budgets} budget amendment${budgets !== 1 ? 's' : ''}`);
      return {
        text: `You have ${total} pending approval${total !== 1 ? 's' : ''}: ${parts.join(', ')}.`,
      };
    },
  },

  'finance:quarterly_report': {
    type: 'QuarterlyReportDashboard',
    domain: 'finance',
    component: 'quarterly_report',
    description: 'Displays quarterly financial report dashboard',
    mcpCalls: [
      { server: 'finance', tool: 'get_quarterly_report', paramMap: { quarter: 'quarter', year: 'year' } },
    ],
    transform: (data: unknown): Record<string, unknown> => {
      const d = data as Record<string, unknown>;

      // get_quarterly_report returns complete QuarterlyReport structure
      // Component expects report object with quarter, year, kpis, arrWaterfall, highlights
      return {
        report: {
          quarter: d.quarter,
          year: d.year,
          kpis: d.kpis || [],
          arrWaterfall: d.arrWaterfall || [],
          highlights: d.highlights || [],
        },
      };
    },
    generateNarration: (props: unknown, params: Record<string, string>): { text: string } => {
      // props is the transformed data: { report: { quarter, year, kpis, arrWaterfall, highlights } }
      const p = props as Record<string, unknown>;
      const report = p.report as Record<string, unknown> | undefined;
      const quarter = (report?.quarter as string) || params.quarter || 'Q1';
      const year = (report?.year as number) || params.year || '2026';
      const highlights = (report?.highlights as string[]) || [];

      // Generate summary from highlights if available
      if (highlights.length > 0) {
        return {
          text: `${quarter} ${year} quarterly report. ${highlights[0]}`,
        };
      }

      return {
        text: `Quarterly report for ${quarter} ${year}.`,
      };
    },
  },

  'support:tickets': {
    type: 'TicketListView',
    domain: 'support',
    component: 'tickets',
    description: 'Displays support tickets filtered by priority, status, or assignee',
    mcpCalls: [
      {
        server: 'support',
        tool: 'list_tickets',
        paramMap: {
          priority: 'priority',
          status: 'status',
          assignedTo: 'assignedTo',
          limit: 'limit'
        }
      },
    ],
    transform: (data: unknown): Record<string, unknown> => {
      const tickets = (data as Array<any>) || [];

      return {
        tickets: tickets.map((ticket: any) => ({
          id: ticket.ticket_id || ticket.id,
          title: ticket.title || ticket.subject,
          description: ticket.description || ticket.issue,
          priority: ticket.priority?.toLowerCase() || 'medium',
          status: ticket.status?.toLowerCase() || 'open',
          customer: {
            name: ticket.customer_name || ticket.requester_name || 'Unknown',
            email: ticket.customer_email || ticket.requester_email || '',
          },
          assignedTo: ticket.assigned_to_name || 'Unassigned',
          createdAt: ticket.created_at || ticket.submission_date,
          updatedAt: ticket.updated_at || ticket.last_modified,
          resolutionDeadline: ticket.resolution_deadline,
          tags: ticket.tags || [],
        })),
      };
    },
    generateNarration: (props: unknown, params: Record<string, string>): { text: string } => {
      // props is the transformed data: { tickets: [...] }
      const p = props as Record<string, unknown>;
      const tickets = (p.tickets as Array<any>) || [];
      const priority = params.priority || 'all';
      const status = params.status || 'all';

      if (tickets.length === 0) {
        return { text: `No ${priority !== 'all' ? priority + ' priority ' : ''}${status !== 'all' ? status + ' ' : ''}tickets found.` };
      }

      const highPriority = tickets.filter(t => t.priority === 'high' || t.priority === 'critical').length;

      return {
        text: `Found ${tickets.length} ticket${tickets.length !== 1 ? 's' : ''}${priority !== 'all' ? ` (${priority} priority)` : ''}${highPriority > 0 ? `, including ${highPriority} high/critical` : ''}.`,
      };
    },
  },

  'payroll:pay_stub': {
    type: 'PayStubDetailCard',
    domain: 'payroll',
    component: 'pay_stub',
    description: 'Displays detailed pay stub information for a specific employee and pay period',
    mcpCalls: [
      {
        server: 'payroll',
        tool: 'get_pay_stub',
        paramMap: {
          payStubId: 'payStubId'
        }
      },
    ],
    transform: (data: unknown): Record<string, unknown> => {
      const stub = data as any;

      return {
        payStubId: stub.pay_stub_id,
        employee: {
          id: stub.employee_id,
          name: stub.employee_name,
        },
        payPeriod: {
          start: stub.pay_period_start,
          end: stub.pay_period_end,
          payDate: stub.pay_date,
        },
        grossPay: Number(stub.gross_pay) || 0,
        netPay: Number(stub.net_pay) || 0,
        totalTaxes: Number(stub.total_taxes) || 0,
        totalDeductions: Number(stub.total_deductions) || 0,
        hoursWorked: stub.hours_worked,
        overtimeHours: stub.overtime_hours,
        earnings: stub.earnings || [],
        taxes: stub.taxes || [],
        deductions: stub.deductions || [],
        ytd: {
          gross: Number(stub.ytd_gross) || 0,
          net: Number(stub.ytd_net) || 0,
          taxes: Number(stub.ytd_taxes) || 0,
        },
      };
    },
    generateNarration: (props: unknown, params: Record<string, string>): { text: string } => {
      // props is the transformed data: { payStubId, employee, payPeriod, grossPay, netPay, ... }
      const p = props as Record<string, unknown>;
      const employee = p.employee as Record<string, unknown> | undefined;
      const payPeriod = p.payPeriod as Record<string, unknown> | undefined;
      const employeeName = (employee?.name as string) || 'Employee';
      const netPay = Number(p.netPay) || 0;
      const payDate = (payPeriod?.payDate as string) || 'unknown date';

      return {
        text: `Pay stub for ${employeeName}: $${netPay.toFixed(2)} net pay for period ending ${payDate}.`,
      };
    },
  },

  'payroll:pay_runs': {
    type: 'PayRunListView',
    domain: 'payroll',
    component: 'pay_runs',
    description: 'Displays payroll runs filtered by status or date range',
    mcpCalls: [
      {
        server: 'payroll',
        tool: 'list_pay_runs',
        paramMap: {
          status: 'status',
          payPeriodStart: 'payPeriodStart',
          payPeriodEnd: 'payPeriodEnd',
          limit: 'limit'
        }
      },
    ],
    transform: (data: unknown): Record<string, unknown> => {
      const runs = (data as Array<any>) || [];

      return {
        payRuns: runs.map((run: any) => ({
          id: run.pay_run_id,
          payPeriodStart: run.pay_period_start,
          payPeriodEnd: run.pay_period_end,
          payDate: run.pay_date,
          payFrequency: run.pay_frequency,
          status: run.status?.toLowerCase() || 'draft',
          employeeCount: Number(run.employee_count) || 0,
          totalGross: Number(run.total_gross) || 0,
          totalNet: Number(run.total_net) || 0,
          totalTaxes: Number(run.total_taxes) || 0,
          totalDeductions: Number(run.total_deductions) || 0,
          createdAt: run.created_at,
          processedAt: run.processed_at,
        })),
      };
    },
    generateNarration: (props: unknown, params: Record<string, string>): { text: string } => {
      // props is the transformed data: { payRuns: [...] }
      const p = props as Record<string, unknown>;
      const runs = (p.payRuns as Array<any>) || [];
      const status = params.status || 'all';

      if (runs.length === 0) {
        return { text: `No ${status !== 'all' ? status + ' ' : ''}pay runs found.` };
      }

      const totalEmployees = runs.reduce((sum, r) => sum + (Number(r.employeeCount) || 0), 0);
      const totalPayout = runs.reduce((sum, r) => sum + (Number(r.totalNet) || 0), 0);

      return {
        text: `Found ${runs.length} pay run${runs.length !== 1 ? 's' : ''} covering ${totalEmployees} employee${totalEmployees !== 1 ? 's' : ''} with total payout of $${totalPayout.toLocaleString()}.`,
      };
    },
  },

  'tax:quarterly_estimate': {
    type: 'TaxEstimateBreakdown',
    domain: 'tax',
    component: 'quarterly_estimate',
    description: 'Displays quarterly tax estimate with federal, state, and local calculations',
    mcpCalls: [
      {
        server: 'tax',
        tool: 'list_quarterly_estimates',
        paramMap: {
          quarter: 'quarter',
          year: 'year',
          limit: 'limit'
        }
      },
    ],
    transform: (data: unknown): Record<string, unknown> => {
      // list_quarterly_estimates returns an array, but we filter for one quarter/year
      const estimates = (data as Array<any>) || [];
      const estimate = estimates[0] || {};

      return {
        period: {
          quarter: `Q${estimate.quarter || 1}`,
          year: Number(estimate.year) || new Date().getFullYear(),
          dueDate: estimate.due_date,
        },
        federal: {
          estimatedTax: Number(estimate.federal_estimate) || 0,
        },
        state: {
          estimatedTax: Number(estimate.state_estimate) || 0,
        },
        local: {
          estimatedTax: Number(estimate.local_estimate) || 0,
        },
        total: {
          estimatedTax: Number(estimate.total_estimate) || 0,
          paid: Number(estimate.paid_amount) || 0,
          owed: Math.max(0, (Number(estimate.total_estimate) || 0) - (Number(estimate.paid_amount) || 0)),
        },
        status: estimate.status || 'pending',
        paidDate: estimate.paid_date,
        paymentReference: estimate.payment_reference,
      };
    },
    generateNarration: (props: unknown, params: Record<string, string>): { text: string } => {
      // props is the transformed data: { period, federal, state, local, total, status, paidDate, paymentReference }
      const p = props as Record<string, unknown>;
      const period = p.period as Record<string, unknown> | undefined;
      const total = p.total as Record<string, unknown> | undefined;
      const quarter = (period?.quarter as string) || params.quarter || 'Q1';
      const year = (period?.year as number) || params.year || new Date().getFullYear();
      const dueDate = period?.dueDate as string;
      const totalEstimate = Number(total?.estimatedTax) || 0;
      const paidAmount = Number(total?.paid) || 0;
      const owed = Number(total?.owed) || Math.max(0, totalEstimate - paidAmount);
      const status = (p.status as string) || 'pending';

      if (status === 'paid') {
        return {
          text: `${quarter} ${year} tax estimate: Fully paid ($${totalEstimate.toLocaleString()}).`,
        };
      } else if (status === 'partial') {
        return {
          text: `${quarter} ${year} tax estimate: $${owed.toLocaleString()} remaining of $${totalEstimate.toLocaleString()} total. Payment due by ${dueDate || 'unknown'}.`,
        };
      } else if (status === 'overdue') {
        return {
          text: `${quarter} ${year} tax estimate: $${owed.toLocaleString()} OVERDUE. Payment was due ${dueDate || 'unknown'}.`,
        };
      } else {
        return {
          text: `${quarter} ${year} tax estimate: $${totalEstimate.toLocaleString()} estimated. Payment due by ${dueDate || 'unknown'}.`,
        };
      }
    },
  },
};

/**
 * Get a component definition by domain and component name.
 *
 * @param domain - The domain (hr, sales, finance, approvals)
 * @param component - The component identifier (org_chart, customer, etc.)
 * @returns ComponentDefinition if found, undefined otherwise
 */
export function getComponentDefinition(
  domain: string,
  component: string
): ComponentDefinition | undefined {
  if (!domain || !component) return undefined;
  return componentRegistry[`${domain}:${component}`];
}

/**
 * List all registered component definitions.
 *
 * @returns Array of all ComponentDefinition objects
 */
export function listComponents(): ComponentDefinition[] {
  return Object.values(componentRegistry);
}

// Re-export ComponentDefinition type for convenience
export { ComponentDefinition };
