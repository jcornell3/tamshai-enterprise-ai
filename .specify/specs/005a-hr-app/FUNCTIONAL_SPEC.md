# HR Application Functional Specification

## 1. Overview

**Application**: Tamshai HR App
**Port**: 4001
**Style Reference**: Zoho People / Workday
**Primary Users**: HR Representatives, Managers, Employees (Self-Service)

The HR App provides employee lifecycle management, organizational visibility, and self-service capabilities. It supports both administrative functions for HR staff and self-service features for all employees.

---

## 2. Business Context

### 2.1 Company Profile

Tamshai Corp is a SaaS-focused LLC providing financial management services. All employees are US-based remote workers across multiple states, with California (CA) being the primary location.

### 2.2 User Roles

| Role | Description | Capabilities |
|------|-------------|--------------|
| `hr-read` | HR Viewer | View all employee profiles, org chart, time-off balances |
| `hr-write` | HR Admin | All read + edit employee data, approve time-off, manage documents |
| `executive` | Executive | All read access across departments |
| `manager` | Department Manager | View team members, approve team time-off |
| `user` | Employee | Self-service: own profile, time-off requests, documents |

### 2.3 Access Control (Article V.1 Compliant)

- **Route-level guards only**: PrivateRoute enforces role requirements
- **No client-side data filtering**: MCP server + RLS handles data authorization
- **Salary visibility**: Controlled by `hr-write` role in MCP server response, not client logic

---

## 2.4 PRIMARY FLOW: Time-Off Request Wizard

**Hero Flow**: Multi-step time-off request with balance check, conflict detection, and approval

**Complexity**: Multi-step wizard with manager approval workflow

**Pattern Reference**: `.specify/specs/005-sample-apps/WIZARD_PATTERN.md`

**Steps**:
1. **Type Selection**: Choose time-off type (PTO, Sick, Personal, Bereavement, Jury Duty)
2. **Date Selection**: Calendar picker with real-time balance display showing remaining days
3. **Conflict Check**: Display any overlapping team requests or blackout periods
4. **Review & Submit**: Summary with manager name, balance impact, approval routing

**Acceptance Criteria**:
- [ ] Balance updates in real-time as dates are selected
- [ ] Conflict check shows team calendar overlay
- [ ] Cannot proceed if balance would go negative
- [ ] Manager receives notification immediately upon submission
- [ ] Employee sees request status on dashboard

**Test Scenarios**:
```typescript
test.describe('Time-Off Request Wizard', () => {
  test('prevents request exceeding available balance', async ({ page }) => {
    // Select dates that would exceed balance
    // Verify "Next" button disabled with tooltip
  });

  test('shows team conflicts before submission', async ({ page }) => {
    // Select dates overlapping with team member
    // Verify conflict warning displayed
    // Verify can still proceed with acknowledgment
  });

  test('breadcrumb navigation preserves entered data', async ({ page }) => {
    // Complete steps 1-3
    // Navigate back to step 1
    // Verify all data preserved
  });
});
```

---

## 3. Feature Specifications

### 3.1 Dashboard

**Route**: `/hr`
**Required Role**: Any authenticated user

**Components**:

| Metric Card | Description | Data Source |
|-------------|-------------|-------------|
| Total Employees | Active employee count | `mcp-hr/list-employees` |
| New This Month | Employees with start date in current month | `mcp-hr/list-employees?hired_after=` |
| Open Positions | Unfilled requisitions | `mcp-hr/list-requisitions` |
| Pending Time-Off | Requests awaiting approval | `mcp-hr/list-time-off?status=pending` |

**Quick Actions**:
- View Org Chart
- Submit Time-Off Request
- View My Profile
- AI Query

### 3.2 Employee Directory

**Route**: `/hr/employees`
**Required Role**: `hr-read` or higher

**Features**:

1. **Search & Filter**
   - Full-text search (name, email, title)
   - Filter by department, location, employment status
   - Sort by name, hire date, department

2. **Employee Table**
   | Column | Always Visible | Conditional |
   |--------|----------------|-------------|
   | Name | Yes | - |
   | Email | Yes | - |
   | Title | Yes | - |
   | Department | Yes | - |
   | Location | Yes | - |
   | Hire Date | Yes | - |
   | Salary | No | `hr-write` only (MCP response controlled) |
   | Actions | Yes | Edit (hr-write), View Profile |

3. **Bulk Actions** (hr-write only)
   - Export to CSV
   - Send announcement email
   - Update department assignment

4. **Pagination**
   - 25 employees per page (default)
   - Cursor-based pagination via MCP
   - Truncation warning when >50 results

### 3.3 Employee Profile

**Route**: `/hr/employees/:id`
**Required Role**: `hr-read` (own profile always accessible)

**Tabs**:

| Tab | Content | Required Role |
|-----|---------|---------------|
| Overview | Contact info, reporting chain, work info | hr-read |
| Employment | History, promotions, terminations | hr-read |
| Compensation | Salary, bonuses, equity (masked for hr-read) | hr-write for full |
| Documents | W-4, I-9, offer letters, reviews | hr-read (own), hr-write (all) |
| Time Off | Balances, history, pending requests | user (own), manager (team) |
| Performance | Reviews, goals, feedback | hr-read |

**Actions**:
- Edit Profile (hr-write) - triggers `pending_confirmation`
- Generate SAR Export (hr-write) - GDPR compliance
- Terminate Employee (hr-write) - triggers `pending_confirmation`

### 3.4 Organizational Chart

**Route**: `/hr/org-chart`
**Required Role**: Any authenticated user

**Visualization**:
- Hierarchical tree view (default)
- Collapsible levels by management tier
- Click employee to view profile
- Search to highlight employee in tree

**Interaction**:
```
                   ┌──────────────┐
                   │   CEO        │
                   │ Eve Thompson │
                   └──────┬───────┘
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌──────────────┐┌──────────────┐┌──────────────┐
    │ VP of HR     ││ Finance Dir  ││ VP of Sales  │
    │ Alice Chen   ││ Bob Martinez ││ Carol Johnson│
    └──────┬───────┘└──────────────┘└──────┬───────┘
           ▼                               ▼
    ┌──────────────┐                ┌──────────────┐
    │ HR Manager   │                │ Sales Manager│
    │ ...          │                │ ...          │
    └──────────────┘                └──────────────┘
```

**Data Requirements**:
- Manager relationship (`manager_id` field)
- Department hierarchy
- Dotted-line relationships (optional)

### 3.5 Time-Off Management

**Route**: `/hr/time-off`
**Required Role**: `user` (own), `manager` (team), `hr-write` (all)

**Sub-pages**:

#### 3.5.1 My Time Off (All Users)
- Current balances by type (Vacation, Sick, Personal)
- Request history
- Submit new request form

**Time-Off Request Form**:
```typescript
interface TimeOffRequest {
  type: 'vacation' | 'sick' | 'personal' | 'bereavement' | 'jury_duty';
  start_date: string;      // ISO date
  end_date: string;        // ISO date
  half_day_start?: boolean;
  half_day_end?: boolean;
  notes?: string;
}
```

#### 3.5.2 Team Time Off (Managers)
- Calendar view of team availability
- Pending requests for direct reports
- Approve/Reject with comments

**Approval Flow**:
1. Employee submits request
2. Manager receives notification
3. Manager approves/rejects in app
4. Employee notified of decision
5. Balances updated automatically

#### 3.5.3 All Time Off (HR Admin)
- Company-wide calendar
- Override approvals
- Adjust balances manually
- Policy configuration

### 3.6 Employee Self-Service Portal

**Route**: `/hr/me`
**Required Role**: Any authenticated user

**Features**:

1. **Profile Management**
   - Update contact info (address, phone, emergency contact)
   - Upload profile photo
   - View reporting chain

2. **Documents**
   - View own documents (W-4, I-9, offer letter)
   - Upload new documents
   - E-sign pending documents

3. **Direct Deposit**
   - View current bank info (masked)
   - Update bank account
   - Request paper check option

4. **Tax Withholdings**
   - View current W-4 elections
   - Submit W-4 changes (links to Payroll)

### 3.7 Performance Reviews

**Route**: `/hr/performance`
**Required Role**: `user` (own), `manager` (team), `hr-write` (all)

**Review Cycle**:
1. **Goal Setting** (Q1)
2. **Mid-Year Check-in** (Q2)
3. **Self-Assessment** (Q4)
4. **Manager Review** (Q4)
5. **Calibration** (Q4 - HR only)
6. **Final Ratings** (Q4)

**Review Form Components**:
- Goals with measurable outcomes
- Self-rating (1-5 scale)
- Manager rating (1-5 scale)
- Written feedback
- Development plan

### 3.8 Document Management

**Route**: `/hr/documents`
**Required Role**: `hr-write`

**Document Types**:
| Type | Required | Retention |
|------|----------|-----------|
| W-4 | Employment | Employment + 4 years |
| I-9 | Employment | Employment + 3 years |
| Offer Letter | Onboarding | Permanent |
| Performance Review | Annual | 7 years |
| Disciplinary Notice | As needed | 7 years |
| Termination Letter | Termination | Permanent |

**Features**:
- Document upload with OCR categorization
- Version history
- E-signature integration
- Expiration alerts (I-9 re-verification)

---

## 4. AI Query Integration

**Route**: `/hr/query`
**Component**: `<SSEQueryClient />`

### 4.1 Sample Queries

| Query | MCP Tools Used | Response |
|-------|----------------|----------|
| "List all employees in Engineering" | `list-employees` | Employee table with truncation warning |
| "Show me Alice Chen's profile" | `get-employee` | Employee detail card |
| "Who reports to Bob Martinez?" | `list-employees` | Org tree subset |
| "What's the average salary in Sales?" | `list-employees` | Aggregated stat (if hr-write) |
| "Delete employee John Doe" | `delete-employee` | `pending_confirmation` Approval Card |

### 4.2 Write Operations with Confirmation

```typescript
// Example: Update salary
const response = await queryAI("Give Marcus Johnson a 10% raise");

// Response type: pending_confirmation
{
  status: 'pending_confirmation',
  confirmationId: 'abc-123',
  message: `Update salary for Marcus Johnson?

Current: $95,000
New: $104,500 (+10%)

This change will be effective next pay period.`,
  confirmationData: {
    employeeId: 'emp-456',
    field: 'salary',
    oldValue: 95000,
    newValue: 104500
  }
}
```

### 4.3 Truncation Handling

```typescript
// Query: "List all employees"
// If >50 employees, response includes:
{
  status: 'success',
  data: [...50 employees],
  metadata: {
    truncated: true,
    totalCount: '127+',
    warning: 'TRUNCATION WARNING: Only 50 of 127+ employees shown. Filter by department or location for complete results.'
  }
}
```

---

## 5. MCP Tool Requirements

### 5.1 Existing Tools (mcp-hr)

| Tool | Purpose | Parameters |
|------|---------|------------|
| `list-employees` | Get employee list | `department?`, `status?`, `cursor?`, `limit?` |
| `get-employee` | Get single employee | `employee_id` |
| `update-employee` | Update employee data | `employee_id`, `fields` |
| `delete-employee` | Terminate employee | `employee_id`, `termination_date`, `reason` |
| `update-salary` | Modify compensation | `employee_id`, `new_salary`, `effective_date` |

### 5.2 New Tools Required

| Tool | Purpose | Parameters |
|------|---------|------------|
| `list-time-off-requests` | Get time-off requests | `employee_id?`, `status?`, `from?`, `to?` |
| `create-time-off-request` | Submit request | `employee_id`, `type`, `start`, `end`, `notes?` |
| `approve-time-off` | Approve/reject | `request_id`, `approved`, `comments?` |
| `get-time-off-balance` | Get balances | `employee_id` |
| `list-documents` | Get employee docs | `employee_id?`, `type?` |
| `upload-document` | Add document | `employee_id`, `type`, `file_data` |
| `get-org-chart` | Get org structure | `root_id?`, `depth?` |
| `export-sar` | GDPR export | `employee_id` |

---

## 6. Data Integrations

### 6.1 Cross-App Links

| From HR | To App | Use Case |
|---------|--------|----------|
| Employee Profile | Payroll | View pay stubs, update withholdings |
| Employee Profile | Finance | View expense reports |
| Employee Profile | Sales | View deals (for sales reps) |
| Employee Profile | Support | View tickets (for support agents) |

### 6.2 Sample Navigation

```tsx
// From HR employee profile to Payroll
<Link to={`/payroll/pay-stubs?employee_id=${employee.id}`}>
  View Pay Stubs
</Link>

// From HR to Finance expense reports
<Link to={`/finance/expenses?submitted_by=${employee.id}`}>
  View Expense Reports
</Link>
```

---

## 7. User Scenarios

### Scenario 1: HR Admin Reviews New Hire

1. HR Admin logs into HR App
2. Navigates to Employee Directory
3. Filters by "Hired this month"
4. Opens new hire profile
5. Verifies I-9 completion
6. Assigns to department via AI Query: "Move John to Engineering"
7. Approves pending_confirmation

### Scenario 2: Manager Approves Time Off

1. Manager logs into HR App
2. Sees "3 Pending Requests" badge on dashboard
3. Navigates to Team Time Off
4. Reviews request details and team calendar
5. Approves request with comment
6. Employee notified automatically

### Scenario 3: Employee Submits Time Off

1. Employee logs into HR App
2. Clicks "Submit Time-Off Request" on dashboard
3. Selects type, dates, adds notes
4. System shows balance impact preview
5. Employee submits request
6. Manager receives notification

### Scenario 4: GDPR Subject Access Request

1. HR Admin receives SAR via email
2. Logs into HR App as hr-write user
3. Navigates to employee profile
4. Clicks "Generate SAR Export"
5. Reviews data categories (profile, employment, reviews)
6. Redacts privileged information if needed
7. Downloads JSON/CSV export
8. Sends to employee within 30 days

---

## 8. Success Criteria

### 8.1 Core Functionality
- [ ] Employee directory with search, filter, sort
- [ ] Employee profile with all tabs functional
- [ ] Org chart visualization with clickable nodes
- [ ] Time-off request and approval workflow
- [ ] Document viewing and upload
- [ ] Self-service portal for all employees

### 8.2 AI Integration
- [ ] SSE streaming for all queries
- [ ] Truncation warnings displayed correctly
- [ ] Write operations trigger Approval Card
- [ ] Confirmation flow completes successfully

### 8.3 RBAC Compliance
- [ ] Salary only visible to hr-write users
- [ ] Managers can only see direct reports' details
- [ ] Self-service limited to own data
- [ ] No client-side authorization logic

### 8.4 Performance
- [ ] Employee directory loads in <500ms (cached)
- [ ] Org chart renders <1000 employees smoothly
- [ ] Time-off calendar handles 12-month view

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Jan 2026 | Initial HR app specification |
| 1.1 | Feb 2026 | Added time-off management, performance reviews |
