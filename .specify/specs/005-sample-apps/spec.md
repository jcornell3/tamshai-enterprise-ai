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
- [ ] Finance App blocks non-finance users (stub only)
- [x] Portal displays app links based on user roles
- [x] Logout from Portal logs out from all apps
- [x] Page refresh maintains authentication (silent refresh)

### v1.4 Criteria
- [x] **[v1.4] SSE Streaming Works (Section 6.1):**
  - [x] EventSource establishes connection to `/api/query` with SSE
  - [x] UI streams AI response chunks in real-time
  - [x] No timeout errors for queries taking 30-60 seconds
  - [x] Connection closes gracefully on [DONE] message
- [ ] **[v1.4] Truncation Warnings Displayed (Section 5.3):**
  - [x] AI-generated truncation warnings render clearly in UI
  - [ ] Users understand results are incomplete (needs UX testing)
  - [ ] UI encourages query refinement
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

## 9. Constitution Compliance
* **Article V.1:** No authorization logic in client - All data filtering happens at MCP/API layer
* **Article V.2:** Tokens stored in memory only (not localStorage)
* **Article V.3:** OIDC with PKCE flow (no implicit flow)

## Status
**IN PROGRESS ⚡** - Portal and HR apps complete; Finance/Sales/Support are stubs.

### Implementation Status

| App | Port | Status | Notes |
|-----|------|--------|-------|
| **Portal** | 4000 | ✅ Complete | Role-based app navigation, user profile |
| **HR** | 4001 | ✅ Complete | Employee directory (305 lines), AI query page (217 lines) |
| **Finance** | 4002 | ⚠️ Stub | Dashboard cards only (150 lines) |
| **Sales** | 4003 | ⚠️ Stub | Opportunities page skeleton (343 lines) |
| **Support** | 4004 | ⚠️ Stub | Tickets/KB page skeletons (379 lines) |

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
