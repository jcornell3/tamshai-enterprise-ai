# Specification: Tamshai Sample Web Applications

## 1. Business Intent
**User Story:** As an employee, I want to access department-specific dashboards (HR, Finance, Sales) without logging in multiple times, so that I can perform my job duties efficiently.

**Business Value:** Demonstrates Single Sign-On (SSO) and verifies that the backend properly enforces Role-Based Access Control (RBAC) across different domains.

## 2. Access Control & Security (Crucial)
* **Required Role(s):**
  - Portal: All authenticated users
  - HR App: All users (visibility filtered by hr-read/hr-write roles)
  - Finance App: finance-read, finance-write, executive only
  - Sales App: sales-read, sales-write, executive only
* **Data Classification:** Internal / Confidential (Salaries)
* **PII Risks:** Yes - Salary data displayed conditionally
* **RLS Impact:** Web apps query MCP Gateway, which enforces RLS at database level

## 3. Application Scope
We will build a **Single Monorepo** containing these lightweight React applications:

| App Name | Port | Description | Key Feature |
| :--- | :--- | :--- | :--- |
| **Portal** | 4000 | Main launchpad | Links to other apps based on token roles. |
| **HR App** | 4001 | Employee Directory | Shows "Salary" field only if user has `hr-write`. |
| **Finance** | 4002 | Budget Dashboard | Shows Charts. Blocked for non-finance users. |

## 4. Technical Stack
* **Framework:** React (Vite) + TypeScript
* **Auth Library:** `react-oidc-context` (Certified OIDC client)
* **Styling:** Tailwind CSS (for rapid UI)
* **State Management:** React Context (for User/Token state)
* **Monorepo:** Turborepo or Nx
* **v1.4 Additions:**
  - **EventSource API:** For Server-Sent Events (SSE) streaming from Gateway (Section 6.1)
  - **Approval Card Component:** For human-in-the-loop confirmations (Section 5.6)

## 5. User Interaction Scenarios
### v1.3 Scenarios
* **Scenario A (SSO):** User logs into Portal -> Clicks "HR App" -> Automatically logged in without prompt.
* **Scenario B (RBAC UI):** User (Intern) opens HR App -> Sees their own profile -> "Salary" field visible -> Views CEO profile -> "Salary" field hidden/masked.
* **Scenario C (Access Denied):** User (Intern) tries to navigate manually to `localhost:4002` (Finance) -> App checks roles -> Redirects to "Unauthorized" page.

### v1.4 Scenarios
* **Scenario D (SSE Streaming - Section 6.1):**
  - User asks AI query: "Show me all employees in Engineering"
  - UI displays "Thinking..." spinner
  - EventSource connection established to `/api/query` (SSE)
  - UI streams AI response chunks in real-time (30-60 seconds for complex queries)
  - Connection closes when complete ([DONE] message received)
  - No timeout errors during long Claude reasoning

* **Scenario E (Truncation Warning - Section 5.3):**
  - User queries: "List all customers"
  - AI response includes: "⚠️ Showing 50 of 100+ customers. Results are incomplete. Please refine your query with filters."
  - User sees truncation warning clearly displayed
  - User can refine query to get more specific results

* **Scenario F (Write Operation Confirmation - Section 5.6):**
  - User requests: "Delete employee John Doe (ID: 123)"
  - AI returns pending_confirmation with Approval Card:
    ```
    ⚠️ Confirm Action Required

    Delete employee John Doe (john.doe@tamshai.com)?

    This action will permanently delete the employee record and cannot be undone.

    [Approve] [Reject]
    ```
  - User clicks "Approve" -> UI sends `POST /api/confirm/:id` with `{ approved: true }`
  - Gateway executes action and returns success
  - UI displays: "✅ Employee John Doe deleted successfully"

  - If user clicks "Reject" -> UI sends `{ approved: false }`
  - Gateway cancels action
  - UI displays: "❌ Action cancelled"

  - If user waits > 5 minutes -> Confirmation expires
  - UI displays: "⏱️ Confirmation expired. Please retry the operation."

## 6. Success Criteria
### v1.3 Criteria
- [x] Users can log in once and access all apps (SSO)
- [x] Token is stored securely (memory) and refreshed automatically
- [x] HR App correctly renders/hides sensitive columns based on claims
- [x] Finance App blocks non-finance users (PrivateRoute with role guard)
- [x] Portal displays app links based on user roles
- [x] Logout from Portal logs out from all apps
- [x] Page refresh maintains authentication (silent refresh)

### v1.4 Criteria
- [x] **[v1.4] SSE Streaming Works (Section 6.1):**
  - [x] EventSource establishes connection to `/api/query` with SSE
  - [x] UI streams AI response chunks in real-time
  - [x] No timeout errors for queries taking 30-60 seconds
  - [x] Connection closes gracefully on [DONE] message
- [x] **[v1.4] Truncation Warnings Displayed (Section 5.3):**
  - [x] AI-generated truncation warnings render clearly in UI
  - [x] TruncationBadge component displays warning and hint
  - [x] UI encourages query refinement via hint text
- [x] **[v1.4] Approval Card Component (Section 5.6):**
  - [x] pending_confirmation responses render as Approval Cards
  - [x] Approve button sends `POST /api/confirm/:id` with `{ approved: true }`
  - [x] Reject button sends `POST /api/confirm/:id` with `{ approved: false }`
  - [x] Confirmation expiry (5 minutes) handled gracefully
  - [x] Success/failure messages display clearly

## 7. Authentication & Security
* **OIDC Integration:**
  - Implement `AuthProvider` using `react-oidc-context`
  - Configure PKCE flow pointing to Keycloak (`http://localhost:8180`)
  - Implement `PrivateRoute` component to protect routes based on Token Roles
* **Token Management:**
  - Ensure tokens are stored in memory (not localStorage)
  - Implement silent refresh logic using Iframe/RefreshToken rotation

## 8. v1.4 Technical Implementation

### 8.1. SSE Streaming Client (Section 6.1)

**EventSource Integration:**
```typescript
// src/services/ai-query.ts

function streamAIQuery(query: string, token: string): EventSource {
  // IMPORTANT: EventSource does NOT support custom headers (browser API limitation)
  // Token must be passed via query parameter
  const url = new URL('http://localhost:3100/api/query');
  url.searchParams.append('q', query);
  url.searchParams.append('token', token);  // Required for authentication

  const eventSource = new EventSource(url.toString());

  eventSource.onmessage = (event) => {
    if (event.data === '[DONE]') {
      eventSource.close();
      return;
    }

    const chunk = JSON.parse(event.data);
    // Update UI with streaming content
    updateAIResponse(chunk);
  };

  eventSource.onerror = (error) => {
    console.error('SSE connection error:', error);
    eventSource.close();
    showError('Connection lost. Please retry your query.');
  };

  return eventSource;
}
```

**Key Points**:
- Use browser's native `EventSource` API (NOT WebSockets)
- **CRITICAL**: EventSource does NOT support custom headers - pass token via query param
- Handle [DONE] message to close connection
- Display spinner during streaming (30-60 second queries)
- Graceful error handling for connection failures

### 8.2. Approval Card Component (Section 5.6)

**Component Structure:**
```typescript
// src/components/ApprovalCard.tsx

interface ApprovalCardProps {
  confirmationId: string;
  message: string;
  confirmationData: any;
  onComplete: (success: boolean) => void;
}

export const ApprovalCard: React.FC<ApprovalCardProps> = ({
  confirmationId,
  message,
  confirmationData,
  onComplete
}) => {
  const handleApprove = async () => {
    const response = await fetch(
      `http://localhost:3100/api/confirm/${confirmationId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ approved: true })
      }
    );

    if (response.ok) {
      onComplete(true);
      showSuccess('Action completed successfully');
    } else {
      showError('Confirmation expired or failed');
    }
  };

  const handleReject = async () => {
    await fetch(`http://localhost:3100/api/confirm/${confirmationId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ approved: false })
    });

    onComplete(false);
    showInfo('Action cancelled');
  };

  return (
    <div className="border-2 border-yellow-500 bg-yellow-50 p-4 rounded-lg">
      <div className="flex items-center mb-2">
        <WarningIcon className="text-yellow-600 mr-2" />
        <h3 className="font-bold">Confirm Action Required</h3>
      </div>

      <p className="mb-4 whitespace-pre-wrap">{message}</p>

      <div className="flex gap-2">
        <button
          onClick={handleApprove}
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
        >
          Approve
        </button>
        <button
          onClick={handleReject}
          className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
        >
          Reject
        </button>
      </div>
    </div>
  );
};
```

**Usage Pattern:**
```typescript
// src/pages/HRApp.tsx

const response = await queryAI('Delete employee John Doe');

if (response.status === 'pending_confirmation') {
  // Render ApprovalCard component
  setShowApproval(true);
  setApprovalData({
    confirmationId: response.confirmationId,
    message: response.message,
    confirmationData: response.confirmationData
  });
}
```

**Key Features**:
- Yellow warning border for visibility
- Clear action buttons (Approve/Reject)
- Timeout handling (5-minute TTL)
- Success/error messaging

## 9. Turbo Monorepo Structure

### 9.1 Directory Layout

```
apps/web/
├── turbo.json                      # Turbo pipeline configuration
├── package.json                    # Root workspace package
├── packages/
│   ├── auth/                       # @tamshai/auth - Authentication utilities
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts            # Public exports
│   │       ├── AuthProvider.tsx    # OIDC context provider
│   │       ├── PrivateRoute.tsx    # Route guard component
│   │       ├── useAuth.ts          # Authentication hook
│   │       └── types.ts            # Auth types (AuthUser, AuthState)
│   │
│   ├── ui/                         # @tamshai/ui - Shared UI components
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── SSEQueryClient.tsx  # Server-Sent Events client (251 lines)
│   │       ├── ApprovalCard.tsx    # Human-in-the-loop confirmation (205 lines)
│   │       ├── TruncationBadge.tsx # Truncation warning display
│   │       ├── LoadingSpinner.tsx
│   │       └── ErrorBoundary.tsx
│   │
│   ├── tailwind-config/            # @tamshai/tailwind-config - Shared styles
│   │   ├── package.json
│   │   └── tailwind.config.js
│   │
│   └── typescript-config/          # @tamshai/typescript-config
│       ├── package.json
│       ├── base.json               # Base TypeScript settings
│       └── react.json              # React-specific settings
│
└── apps/
    ├── portal/                     # Main launchpad app (port 4000)
    │   ├── package.json
    │   ├── vite.config.ts
    │   ├── tsconfig.json
    │   ├── index.html
    │   └── src/
    │       ├── main.tsx
    │       ├── App.tsx
    │       ├── pages/
    │       │   ├── HomePage.tsx
    │       │   ├── LoginPage.tsx
    │       │   └── UnauthorizedPage.tsx
    │       └── components/
    │           └── AppCard.tsx
    │
    ├── hr/                         # HR Employee Directory (port 4001)
    │   ├── package.json
    │   ├── vite.config.ts
    │   ├── tsconfig.json
    │   ├── index.html
    │   └── src/
    │       ├── main.tsx
    │       ├── App.tsx
    │       ├── pages/
    │       │   ├── EmployeeDirectory.tsx
    │       │   ├── EmployeeDetail.tsx
    │       │   └── AIQueryPage.tsx
    │       └── components/
    │           ├── EmployeeTable.tsx
    │           └── SalaryCell.tsx    # Renders masked or visible salary
    │
    ├── finance/                    # Budget Dashboard (port 4002)
    │   ├── package.json
    │   ├── vite.config.ts
    │   ├── tsconfig.json
    │   ├── index.html
    │   └── src/
    │       ├── main.tsx
    │       ├── App.tsx
    │       ├── pages/
    │       │   ├── BudgetDashboard.tsx
    │       │   ├── InvoiceList.tsx
    │       │   └── AIQueryPage.tsx
    │       └── components/
    │           ├── BudgetChart.tsx
    │           └── InvoiceTable.tsx
    │
    ├── sales/                      # CRM Dashboard (port 4003)
    │   ├── package.json
    │   ├── vite.config.ts
    │   ├── tsconfig.json
    │   ├── index.html
    │   └── src/
    │       ├── main.tsx
    │       ├── App.tsx
    │       ├── pages/
    │       │   ├── PipelineDashboard.tsx
    │       │   ├── OpportunitiesList.tsx
    │       │   ├── CustomerDetail.tsx
    │       │   └── AIQueryPage.tsx
    │       └── components/
    │           ├── PipelineChart.tsx
    │           └── OpportunityCard.tsx
    │
    └── support/                    # Support Dashboard (port 4004)
        ├── package.json
        ├── vite.config.ts
        ├── tsconfig.json
        ├── index.html
        └── src/
            ├── main.tsx
            ├── App.tsx
            ├── pages/
            │   ├── TicketsDashboard.tsx
            │   ├── KnowledgeBase.tsx
            │   └── AIQueryPage.tsx
            └── components/
                ├── TicketTable.tsx
                └── ArticleCard.tsx
```

### 9.2 Turbo Pipeline Configuration

```json
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    }
  }
}
```

### 9.3 Root Package.json

```json
// package.json
{
  "name": "tamshai-web-apps",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "dev:portal": "turbo run dev --filter=portal",
    "dev:hr": "turbo run dev --filter=hr",
    "dev:finance": "turbo run dev --filter=finance",
    "dev:sales": "turbo run dev --filter=sales",
    "dev:support": "turbo run dev --filter=support",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "clean": "turbo run clean && rm -rf node_modules"
  },
  "devDependencies": {
    "turbo": "^2.0.0"
  },
  "engines": {
    "node": ">=18"
  }
}
```

### 9.4 Package Dependencies

```json
// packages/auth/package.json
{
  "name": "@tamshai/auth",
  "version": "1.0.0",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "peerDependencies": {
    "react": "^18.2.0",
    "react-oidc-context": "^3.0.0"
  }
}
```

```json
// apps/hr/package.json
{
  "name": "hr",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --port 4001",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@tamshai/auth": "*",
    "@tamshai/ui": "*",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.20.0"
  },
  "devDependencies": {
    "@tamshai/tailwind-config": "*",
    "@tamshai/typescript-config": "*",
    "@vitejs/plugin-react": "^4.2.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.3.0",
    "vite": "^6.2.0"
  }
}
```

---

## 10. Finance App Specification (Stub → Full)

### 10.1 Required Pages

| Page | Route | Description | MCP Tools Used |
|------|-------|-------------|----------------|
| Budget Dashboard | `/` | Department budget overview | `get_budget`, `list_budgets` |
| Invoice List | `/invoices` | Paginated invoice list | `list_invoices` |
| Invoice Detail | `/invoices/:id` | Single invoice view | `get_invoice` |
| AI Query | `/query` | Natural language interface | All finance tools |

### 10.2 Budget Dashboard Components

```typescript
// apps/finance/src/pages/BudgetDashboard.tsx

interface BudgetDashboardProps {}

export const BudgetDashboard: React.FC = () => {
  const { data: budgets, isLoading } = useQuery({
    queryKey: ['budgets', selectedYear],
    queryFn: () => fetchBudgets(selectedYear)
  });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Department Budgets - FY {selectedYear}</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {budgets?.map(budget => (
          <BudgetCard
            key={budget.budget_id}
            department={budget.department}
            allocated={budget.allocated_amount}
            spent={budget.spent_amount}
            remaining={budget.remaining_amount}
            status={budget.status}
          />
        ))}
      </div>

      <BudgetChart budgets={budgets} />
    </div>
  );
};
```

### 10.3 Invoice List with Pagination

```typescript
// apps/finance/src/pages/InvoiceList.tsx

export const InvoiceList: React.FC = () => {
  const [cursor, setCursor] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data, isLoading, hasMore } = useInvoices({ status: statusFilter, cursor });

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Invoices</h1>
        <StatusFilter value={statusFilter} onChange={setStatusFilter} />
      </div>

      {data?.metadata?.truncated && (
        <TruncationBadge
          message={`Showing ${data.data.length} of ${data.metadata.totalCount} invoices`}
          hint="Use status filter to narrow results"
        />
      )}

      <InvoiceTable invoices={data?.data || []} />

      {data?.metadata?.hasMore && (
        <button
          onClick={() => setCursor(data.metadata.nextCursor)}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
        >
          Load More
        </button>
      )}
    </div>
  );
};
```

### 10.4 Access Control (Article V.1 Compliant)

```typescript
// apps/finance/src/App.tsx

// CORRECT: Route-level guard only, no data-level checks
function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<PrivateRoute requiredRoles={['finance-read', 'executive']} />}>
          <Route path="/" element={<BudgetDashboard />} />
          <Route path="/invoices" element={<InvoiceList />} />
          <Route path="/query" element={<AIQueryPage />} />
        </Route>
        <Route path="/unauthorized" element={<UnauthorizedPage />} />
      </Routes>
    </AuthProvider>
  );
}

// WRONG: Data-level filtering in client (violates Article V.1)
// const filteredInvoices = invoices.filter(i => userRoles.includes('finance-write'));
```

---

## 11. Sales App Specification (Stub → Full)

### 11.1 Required Pages

| Page | Route | Description | MCP Tools Used |
|------|-------|-------------|----------------|
| Pipeline Dashboard | `/` | Sales pipeline visualization | `get_pipeline` |
| Opportunities | `/opportunities` | Deal list with filters | `list_opportunities` |
| Customer Detail | `/customers/:id` | Single customer view | `get_customer` |
| AI Query | `/query` | Natural language interface | All sales tools |

### 11.2 Pipeline Dashboard

```typescript
// apps/sales/src/pages/PipelineDashboard.tsx

export const PipelineDashboard: React.FC = () => {
  const { data: pipeline } = useQuery({
    queryKey: ['pipeline', quarter],
    queryFn: () => fetchPipeline(quarter)
  });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Sales Pipeline - Q{quarter}</h1>

      <div className="grid grid-cols-6 gap-4 mb-8">
        {STAGES.map(stage => (
          <StageColumn
            key={stage}
            stage={stage}
            opportunities={pipeline?.stages[stage] || []}
            totalValue={pipeline?.totals[stage] || 0}
          />
        ))}
      </div>

      <PipelineChart data={pipeline} />
    </div>
  );
};

const STAGES = ['prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];
```

### 11.3 Opportunities with Cursor Pagination

```typescript
// apps/sales/src/pages/OpportunitiesList.tsx

export const OpportunitiesList: React.FC = () => {
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [cursor, setCursor] = useState<string | undefined>();

  const { data, isLoading } = useOpportunities({ stage: stageFilter, cursor });

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Opportunities</h1>
        <StageFilter value={stageFilter} onChange={setStageFilter} />
      </div>

      {data?.metadata?.truncated && (
        <TruncationBadge
          message={data.metadata.warning || `Showing first ${data.data.length} opportunities`}
          hint={data.metadata.hint}
        />
      )}

      <div className="grid gap-4">
        {data?.data.map(opp => (
          <OpportunityCard
            key={opp._id}
            opportunity={opp}
            onClose={(id, outcome) => handleCloseOpportunity(id, outcome)}
          />
        ))}
      </div>

      {data?.metadata?.hasMore && (
        <button onClick={() => setCursor(data.metadata.nextCursor)}>
          Load More
        </button>
      )}
    </div>
  );
};
```

---

## 12. Support App Specification (Stub → Full)

### 12.1 Required Pages

| Page | Route | Description | MCP Tools Used |
|------|-------|-------------|----------------|
| Tickets Dashboard | `/` | Open tickets summary | `search_tickets` |
| Ticket Search | `/tickets` | Full-text ticket search | `search_tickets` |
| Knowledge Base | `/kb` | Article search | `search_knowledge_base` |
| Article Detail | `/kb/:id` | Single KB article | `get_knowledge_article` |
| AI Query | `/query` | Natural language interface | All support tools |

### 12.2 Tickets Dashboard

```typescript
// apps/support/src/pages/TicketsDashboard.tsx

export const TicketsDashboard: React.FC = () => {
  const { data: openTickets } = useQuery({
    queryKey: ['tickets', 'open'],
    queryFn: () => searchTickets({ status: 'open' })
  });

  const { data: criticalTickets } = useQuery({
    queryKey: ['tickets', 'critical'],
    queryFn: () => searchTickets({ priority: 'critical', status: 'open' })
  });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Support Dashboard</h1>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard title="Open Tickets" value={openTickets?.data.length || 0} />
        <StatCard title="Critical" value={criticalTickets?.data.length || 0} color="red" />
        <StatCard title="Pending" value={pendingCount} color="yellow" />
        <StatCard title="Avg Resolution" value="4.2h" />
      </div>

      <h2 className="text-xl font-semibold mb-4">Critical Tickets</h2>
      <TicketTable tickets={criticalTickets?.data || []} />
    </div>
  );
};
```

### 12.3 Knowledge Base Search

```typescript
// apps/support/src/pages/KnowledgeBase.tsx

export const KnowledgeBase: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery] = useDebounce(searchQuery, 300);

  const { data, isLoading } = useQuery({
    queryKey: ['kb', debouncedQuery],
    queryFn: () => searchKnowledgeBase(debouncedQuery),
    enabled: debouncedQuery.length >= 2
  });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Knowledge Base</h1>

      <SearchInput
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search articles..."
      />

      {data?.metadata?.truncated && (
        <TruncationBadge message={data.metadata.warning} />
      )}

      <div className="grid gap-4 mt-6">
        {data?.data.map(article => (
          <ArticleCard
            key={article.article_id}
            article={article}
            relevanceScore={article._score}
          />
        ))}
      </div>
    </div>
  );
};
```

### 12.4 Close Ticket with Confirmation

```typescript
// apps/support/src/components/TicketActions.tsx

export const CloseTicketButton: React.FC<{ ticketId: string }> = ({ ticketId }) => {
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);

  const handleClose = async (resolution: string) => {
    const response = await closeTicket({ ticket_id: ticketId, resolution });

    if (response.status === 'pending_confirmation') {
      setPendingConfirmation({
        confirmationId: response.confirmationId,
        message: response.message,
        confirmationData: response.confirmationData
      });
      setShowConfirmation(true);
    }
  };

  return (
    <>
      <button onClick={() => setShowResolutionModal(true)}>
        Close Ticket
      </button>

      {showConfirmation && pendingConfirmation && (
        <ApprovalCard
          confirmationId={pendingConfirmation.confirmationId}
          message={pendingConfirmation.message}
          confirmationData={pendingConfirmation.confirmationData}
          onComplete={(success) => {
            setShowConfirmation(false);
            if (success) {
              refetchTickets();
            }
          }}
        />
      )}
    </>
  );
};
```

---

## 13. GDPR Subject Access Rights (SAR) - HR App

### 13.1 Overview

The HR App must support GDPR Subject Access Requests (Article 15), enabling employees to request a copy of all personal data held about them.

**Regulatory Context:**
- GDPR Article 15: Right of Access
- Response deadline: 30 days (extendable to 60 for complex requests)
- Format: Machine-readable (JSON/CSV)

### 13.2 SAR Workflow for HR Representatives

**User Story:** As an HR Representative, I need to extract all employee data for a subject access request, so that the organization can comply with GDPR Article 15.

**Scenario - SAR Processing:**
- HR Rep receives SAR via email/ticket
- HR Rep logs into HR App with `hr-write` role
- HR Rep navigates to Employee Profile → Actions → "Generate SAR Export"
- System aggregates data from all sources
- HR Rep reviews data for legal privilege exceptions
- HR Rep downloads sanitized export
- HR Rep sends to employee within 30 days

### 13.3 SAR Export Feature Specification

**Page Location:** `/employees/:id/sar-export`

**Required Role:** `hr-write` or `executive`

**UI Components:**

```typescript
// apps/hr/src/pages/SARExport.tsx

interface SARExportProps {
  employeeId: string;
}

export const SARExport: React.FC<SARExportProps> = ({ employeeId }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['sar-export', employeeId],
    queryFn: () => fetchSARExport(employeeId)
  });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Subject Access Request Export</h1>

      <WarningBanner>
        This export contains personal data protected by GDPR.
        Review for legal privilege before releasing to data subject.
      </WarningBanner>

      <DataCategoryAccordion title="Profile Data" data={data?.profile} />
      <DataCategoryAccordion title="Employment History" data={data?.employment} />
      <DataCategoryAccordion title="Performance Reviews" data={data?.reviews} />
      <DataCategoryAccordion title="Access Logs (90 days)" data={data?.accessLogs} />
      <DataCategoryAccordion title="AI Query History" data={data?.aiQueries} />

      <RetentionSchedule retention={data?.retention} />

      <div className="flex gap-4 mt-6">
        <button onClick={() => downloadJSON(data)}>Download JSON</button>
        <button onClick={() => downloadCSV(data)}>Download CSV</button>
      </div>

      <AuditNotice>
        This action will be logged for compliance purposes.
      </AuditNotice>
    </div>
  );
};
```

### 13.4 SAR Data Categories

| Category | Source | Retention | Notes |
|----------|--------|-----------|-------|
| **Profile** | HR Database | Employment + legal | Name, email, department, title |
| **Compensation** | Finance | 7 years (tax law) | Salary history, benefits |
| **Performance** | HR Database | Employment + 3 years | Reviews, goals, feedback |
| **Access Logs** | Audit System | 90 days | Login times, resources accessed |
| **AI Queries** | MCP Gateway | 1 year | Queries made by employee |
| **Training** | HR Database | Employment + 5 years | Certifications, courses |

### 13.5 Exclusions and Redactions

HR Representatives must review exports for:
- Legal privilege (pending litigation)
- Third-party data (other employees mentioned in reviews)
- Trade secrets
- National security (if applicable)

**Redaction UI:**
```typescript
// Allow HR Rep to redact specific fields before export
<RedactableField
  field="managerComments"
  value={review.managerComments}
  onRedact={(reason) => addRedaction(field, reason)}
/>
```

### 13.6 API Integration

**Endpoint:** `GET /api/gdpr/export?employeeId={id}`

**Backend Implementation (MCP Gateway):**
```typescript
app.get('/api/gdpr/export', authMiddleware, async (req, res) => {
  const { employeeId } = req.query;
  const userRoles = req.userContext.roles;

  // Verify HR write access
  if (!userRoles.includes('hr-write') && !userRoles.includes('executive')) {
    return res.status(403).json({
      error: 'SAR exports require hr-write or executive role'
    });
  }

  // Aggregate data from all MCP servers
  const [profile, employment, reviews, accessLogs, aiQueries] = await Promise.all([
    mcpHR.getEmployee(employeeId),
    mcpHR.getEmploymentHistory(employeeId),
    mcpHR.getPerformanceReviews(employeeId),
    getAuditLogs(employeeId, { days: 90 }),
    getAIQueryHistory(employeeId)
  ]);

  // Log SAR access for compliance
  logger.info('SAR Export Generated', {
    requestedBy: req.userContext.userId,
    subjectId: employeeId,
    timestamp: new Date().toISOString()
  });

  res.json({
    subject: { id: employeeId, ...profile },
    requestDate: new Date().toISOString(),
    data: { profile, employment, reviews, accessLogs, aiQueries },
    retention: HR_RETENTION_SCHEDULE
  });
});
```

### 13.7 Success Criteria

- [ ] HR App includes SAR Export page at `/employees/:id/sar-export`
- [ ] Export aggregates data from HR, Finance, and Audit sources
- [ ] Redaction UI allows HR Rep to exclude privileged content
- [ ] Export available in JSON and CSV formats
- [ ] Action logged for compliance audit
- [ ] Role check enforces `hr-write` or `executive` access
- [ ] UI displays retention schedule for each data category

---

## 14. Constitution Compliance
* **Article V.1:** No authorization logic in client - All data filtering happens at MCP/API layer
* **Article V.2:** Tokens stored in memory only (not localStorage)
* **Article V.3:** OIDC with PKCE flow (no implicit flow)

## Status
**GREEN PHASE COMPLETE ✅** - All sample apps implemented with v1.4 patterns (SSE, ApprovalCard, human-in-the-loop confirmations).

### Implementation Status

| App | Port | Status | Notes |
|-----|------|--------|-------|
| **Portal** | 4000 | ✅ Complete | Role-based app navigation, user profile |
| **HR** | 4001 | ✅ Complete | Employee directory (305 lines), AI query page (217 lines) |
| **Finance** | 4002 | ✅ GREEN Complete | InvoicesPage, ExpenseReportsPage, BudgetsPage, DashboardPage, AIQueryPage with ApprovalCard |
| **Sales** | 4003 | ✅ GREEN Complete | CustomerDetail, CloseOpportunityModal (500+ lines), PipelineDashboard, OpportunitiesList |
| **Support** | 4004 | ✅ GREEN Complete | CloseTicketModal (500+ lines), TicketDetail, ArticleDetailPage, DashboardPage with KB article linking |

### Shared Packages Implemented

| Package | Purpose | Key Components |
|---------|---------|----------------|
| `@tamshai/auth` | Authentication | AuthProvider, PrivateRoute, useAuth hook |
| `@tamshai/ui` | Shared components | SSEQueryClient (251 lines), ApprovalCard (205 lines) |
| `@tamshai/tailwind-config` | Styling | Shared Tailwind configuration |

### Technical Stack
- **Monorepo**: Turbo with npm workspaces
- **Build**: Vite 6.2
- **Framework**: React 18.2 + TypeScript 5.3
- **Styling**: Tailwind CSS 3.4

## Architecture Version
**Updated for**: v1.4 (December 2025)

**v1.4 Changes Applied**:
- ✅ Section 6.1: EventSource API specified for SSE streaming from Gateway
- ✅ Section 5.3: Truncation warning display in UI scenarios
- ✅ Section 5.6: Approval Card component fully specified with React implementation
- ✅ User interaction scenarios updated with v1.4 flows
- ✅ Success criteria expanded with v1.4 requirements

**Constitutional Impact**:
- No changes to Article V (Client-Side Security) - remains fully compliant
- EventSource and Approval Card follow Article V.1 (no client-side authorization)
- No constitutional amendments required
