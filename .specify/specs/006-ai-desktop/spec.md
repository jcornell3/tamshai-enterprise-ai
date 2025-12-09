# Specification: AI Desktop Client (Electron)

## 1. Business Intent
**User Story:** As an employee, I want a dedicated desktop assistant that can answer questions about enterprise data, so that I don't have to switch between multiple dashboards.

**Business Value:** Provides a unified "Natural Language Interface" to the enterprise, increasing productivity.

## 2. Access Control & Security (Crucial)
* **Required Role(s):** Any authenticated user
* **Data Classification:** All classifications (queries routed through MCP Gateway)
* **PII Risks:** No - Desktop app is a client; PII handled by backend
* **RLS Impact:** Desktop app queries MCP Gateway, which enforces all security policies

## 3. Security Requirements
* **Authentication:** OIDC via Keycloak (PKCE)
* **Storage:** Refresh Tokens must be stored in the OS Keychain (Mac/Windows/Linux) using Electron's `safeStorage`
* **Transport:** All AI queries must be sent to the **MCP Gateway** (`https://gateway.tamshai.internal/api/ai/query`), NOT directly to Claude

## 4. Features
### v1.3 Features
1. **Chat Interface:**
   - Markdown rendering (tables, lists)
   - Code block highlighting
2. **Context Awareness:**
   - Display "Thinking..." indicators when MCP tools are being called
   - Show "Citations" (e.g., "Source: HR Database")

### v1.4 Features (Critical)
1. **SSE Streaming (Section 6.1):**
   - **EventSource API** for Server-Sent Events from MCP Gateway
   - Real-time streaming of Claude responses (prevents 30-60 second timeouts)
   - Connection management with [DONE] message handling
   - "Thinking..." spinner during long reasoning periods

2. **Approval Cards (Section 5.6):**
   - Render yellow warning cards for `pending_confirmation` responses
   - Display action details (employee name, salary amount, etc.)
   - Approve/Reject buttons
   - Confirmation timeout handling (5-minute TTL)
   - Success/failure messaging

3. **Truncation Warnings (Section 5.3):**
   - Display AI-generated truncation warnings
   - Alert users when results are incomplete (50+ records)
   - Suggest query refinement

## 5. Technical Stack
* **Runtime:** Electron (Main Process + Renderer)
* **Frontend:** React + TypeScript + Tailwind
* **State:** Zustand or TanStack Query
* **v1.4 Streaming:** EventSource API for SSE (NOT fetch ReadableStream, NOT WebSockets)
* **Security:** Electron `safeStorage` API for token storage in system keychain

## 6. User Interaction Scenarios
### v1.3 Scenarios
* **Scenario A (Login):** User opens app -> App checks for stored refresh token -> If none, opens system browser for OIDC login -> Callback captured via deep link -> Tokens stored in keychain.
* **Scenario B (Basic Query):** User types "Who is my manager?" -> App sends to MCP Gateway with access token -> App displays response with markdown formatting.
* **Scenario D (Logout):** User clicks "Logout" -> App clears access token from memory -> Deletes refresh token from keychain -> Returns to login screen.

### v1.4 Scenarios
* **Scenario E (SSE Streaming - Section 6.1):**
  - User asks: "Show me all employees in Engineering department"
  - App displays "Thinking..." spinner
  - EventSource connection established to `/api/query`
  - Response streams in real-time over 30-60 seconds (no timeout)
  - Connection closes on [DONE] message
  - Full response rendered with markdown formatting

* **Scenario F (Truncation Warning - Section 5.3):**
  - User queries: "List all sales opportunities"
  - AI response includes: "⚠️ Showing 50 of 100+ opportunities. Results are incomplete. Please refine your query with filters (e.g., stage, owner, date range)."
  - App displays warning with yellow alert banner
  - User can refine query based on suggestion

* **Scenario G (Write Operation Approval - Section 5.6):**
  - User requests: "Delete employee Marcus Johnson (ID: emp-456)"
  - Gateway returns `pending_confirmation` response
  - App renders Approval Card:
    ```
    ⚠️ Confirm Action Required

    Delete employee Marcus Johnson (marcus.johnson@tamshai.com)?

    Department: Engineering
    Position: Software Engineer

    This action will permanently delete the employee record and cannot be undone.

    [Approve] [Reject]
    ```
  - User clicks "Approve" -> App sends `POST /api/confirm/:confirmationId` with `{ approved: true }`
  - Gateway executes deletion and returns success
  - App displays: "✅ Employee Marcus Johnson deleted successfully"

  - **Alternative: User Rejects**
    - User clicks "Reject" -> App sends `{ approved: false }`
    - App displays: "❌ Action cancelled"

  - **Alternative: Timeout Expires**
    - User waits > 5 minutes without clicking
    - App attempts to approve -> Gateway returns 404 (confirmation expired)
    - App displays: "⏱️ Confirmation expired. Please retry the operation."

## 7. Success Criteria
### v1.3 Criteria
- [ ] App launches and performs OIDC login via System Browser
- [ ] Refresh token stored securely in OS keychain (Electron `safeStorage`)
- [ ] Markdown rendering works (tables, code blocks, lists)
- [ ] Closing the app clears Access Token from memory
- [ ] Citations displayed for data sources
- [ ] "Thinking..." indicator shown during MCP tool execution

### v1.4 Criteria
- [ ] **[v1.4] SSE Streaming Works (Section 6.1):**
  - [ ] EventSource establishes connection to `/api/query`
  - [ ] UI streams Claude response chunks in real-time
  - [ ] No timeout errors for 30-60 second queries
  - [ ] Connection closes gracefully on [DONE] message
  - [ ] Error handling for connection failures
- [ ] **[v1.4] Approval Card Component (Section 5.6):**
  - [ ] `pending_confirmation` responses render as Approval Cards
  - [ ] Yellow warning border and styling (Tailwind)
  - [ ] Approve button sends POST /api/confirm/:id with { approved: true }
  - [ ] Reject button sends POST /api/confirm/:id with { approved: false }
  - [ ] Confirmation timeout (5 minutes) handled gracefully
  - [ ] Success/failure messages display clearly
- [ ] **[v1.4] Truncation Warnings Display (Section 5.3):**
  - [ ] AI-generated truncation warnings render with yellow alert banner
  - [ ] Users understand results are incomplete
  - [ ] UI encourages query refinement

## 8. v1.4 Technical Implementation

### 8.1. SSE Streaming with EventSource (Section 6.1)

**Renderer Process Implementation:**
```typescript
// src/renderer/services/ai-stream.ts

function streamAIQuery(query: string, accessToken: string): EventSource {
  const eventSource = new EventSource(
    `https://gateway.tamshai.internal/api/query?q=${encodeURIComponent(query)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );

  eventSource.onmessage = (event) => {
    if (event.data === '[DONE]') {
      eventSource.close();
      setStreamingComplete(true);
      return;
    }

    const chunk = JSON.parse(event.data);
    appendToMessageStream(chunk);
  };

  eventSource.onerror = (error) => {
    console.error('SSE connection error:', error);
    eventSource.close();
    showErrorNotification('Connection lost. Please retry your query.');
  };

  return eventSource;
}
```

**Key Points:**
- Use EventSource API (NOT fetch or WebSockets)
- Handle [DONE] message to close connection
- Display "Thinking..." spinner for 30-60 second queries
- Graceful error handling with retry option

### 8.2. Approval Card Component (Section 5.6)

**React Component:**
```typescript
// src/renderer/components/ApprovalCard.tsx

interface ApprovalCardProps {
  confirmationId: string;
  message: string;
  confirmationData: {
    action: string;
    employeeName?: string;
    employeeEmail?: string;
    department?: string;
  };
}

export const ApprovalCard: React.FC<ApprovalCardProps> = ({
  confirmationId,
  message,
  confirmationData
}) => {
  const handleApprove = async () => {
    try {
      const response = await fetch(
        `https://gateway.tamshai.internal/api/confirm/${confirmationId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${await getAccessToken()}`
          },
          body: JSON.stringify({ approved: true })
        }
      );

      if (response.ok) {
        showNotification('Action completed successfully', 'success');
      } else if (response.status === 404) {
        showNotification('Confirmation expired. Please retry.', 'error');
      } else {
        showNotification('Confirmation failed', 'error');
      }
    } catch (error) {
      showNotification('Network error. Please check connection.', 'error');
    }
  };

  const handleReject = async () => {
    await fetch(
      `https://gateway.tamshai.internal/api/confirm/${confirmationId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await getAccessToken()}`
        },
        body: JSON.stringify({ approved: false })
      }
    );

    showNotification('Action cancelled', 'info');
  };

  return (
    <div className="border-2 border-yellow-500 bg-yellow-50 p-4 rounded-lg shadow-lg my-4">
      <div className="flex items-center mb-3">
        <svg className="w-6 h-6 text-yellow-600 mr-2" /* Warning Icon */ />
        <h3 className="text-lg font-bold text-gray-800">Confirm Action Required</h3>
      </div>

      <p className="text-gray-700 mb-4 whitespace-pre-wrap">{message}</p>

      {confirmationData.employeeName && (
        <div className="bg-white p-3 rounded mb-4 text-sm">
          <div><strong>Employee:</strong> {confirmationData.employeeName}</div>
          {confirmationData.employeeEmail && (
            <div><strong>Email:</strong> {confirmationData.employeeEmail}</div>
          )}
          {confirmationData.department && (
            <div><strong>Department:</strong> {confirmationData.department}</div>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleApprove}
          className="flex-1 bg-green-600 text-white px-4 py-2 rounded font-medium hover:bg-green-700 transition"
        >
          Approve
        </button>
        <button
          onClick={handleReject}
          className="flex-1 bg-red-600 text-white px-4 py-2 rounded font-medium hover:bg-red-700 transition"
        >
          Reject
        </button>
      </div>

      <p className="text-xs text-gray-500 mt-2 text-center">
        This confirmation will expire in 5 minutes
      </p>
    </div>
  );
};
```

**Confirmation ID Storage:**
```typescript
// src/renderer/store/confirmations.ts

interface PendingConfirmation {
  confirmationId: string;
  timestamp: number;
  expiresAt: number; // timestamp + 5 minutes
}

// Store in memory (Zustand or similar)
const useConfirmationStore = create<{
  pending: PendingConfirmation[];
  addConfirmation: (id: string) => void;
  removeConfirmation: (id: string) => void;
  isExpired: (id: string) => boolean;
}>((set, get) => ({
  pending: [],

  addConfirmation: (id) => {
    const now = Date.now();
    set((state) => ({
      pending: [
        ...state.pending,
        { confirmationId: id, timestamp: now, expiresAt: now + 5 * 60 * 1000 }
      ]
    }));
  },

  removeConfirmation: (id) => {
    set((state) => ({
      pending: state.pending.filter((c) => c.confirmationId !== id)
    }));
  },

  isExpired: (id) => {
    const confirmation = get().pending.find((c) => c.confirmationId === id);
    return confirmation ? Date.now() > confirmation.expiresAt : true;
  }
}));
```

### 8.3. Truncation Warning Banner (Section 5.3)

**Component:**
```typescript
// src/renderer/components/TruncationWarning.tsx

export const TruncationWarning: React.FC<{ message: string }> = ({ message }) => {
  return (
    <div className="border-l-4 border-yellow-500 bg-yellow-50 p-4 my-3">
      <div className="flex items-start">
        <svg className="w-5 h-5 text-yellow-600 mt-0.5 mr-2" /* Warning Icon */ />
        <div>
          <p className="text-sm font-medium text-yellow-800">{message}</p>
          <p className="text-xs text-yellow-700 mt-1">
            Tip: Refine your query with specific filters to get complete results.
          </p>
        </div>
      </div>
    </div>
  );
};
```

**Usage in Chat:**
```typescript
// Detect truncation in AI response metadata
if (response.metadata?.truncated) {
  return (
    <>
      <TruncationWarning message={response.metadata.warning} />
      <MarkdownRenderer content={response.content} />
    </>
  );
}
```

## 9. Constitution Compliance
* **Article V.1:** No authorization logic in client
* **Article V.2:** Refresh tokens in system keychain via `safeStorage`
* **Article V.3:** OIDC with PKCE (no implicit flow)

## Status
**PLANNED 🔲** - Implementation after Web Apps completion.

## Architecture Version
**Updated for**: v1.4 (December 2024)

**v1.4 Changes Applied**:
- ✅ Section 6.1: EventSource API specified for SSE streaming (replaces fetch ReadableStream)
- ✅ Section 5.6: Approval Card component with Electron-compatible React implementation
- ✅ Section 5.3: Truncation warning banner component
- ✅ User interaction scenarios updated with v1.4 flows
- ✅ Success criteria expanded with v1.4 requirements
- ✅ Confirmation ID storage pattern with expiry tracking

**Constitutional Impact**:
- No changes to Article V (Client-Side Security) - remains fully compliant
- EventSource and Approval Card follow Article V.1 (no client-side authorization)
- Confirmation storage in memory only (not localStorage)
- No constitutional amendments required
