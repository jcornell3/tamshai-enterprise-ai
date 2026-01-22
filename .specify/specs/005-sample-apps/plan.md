# Implementation Plan: Tamshai Sample Web Applications

## Phase 1: Project Scaffolding
* [x] **Monorepo Setup:**
    * Initialize a Turborepo or Nx workspace in `clients/web`
    * Create shared libraries: `ui-kit` (Tailwind components), `auth-client` (OIDC logic)
* [x] **Application Shells:**
    * Scaffold `apps/portal` (Main launchpad)
    * Scaffold `apps/hr` (HR Dashboard)
    * Scaffold `apps/finance` (Finance Dashboard)

## Phase 2: Authentication & Security
* [x] **OIDC Integration:**
    * Implement `AuthProvider` using `react-oidc-context`
    * Configure PKCE flow pointing to Keycloak (`http://localhost:8180`)
    * Implement `PrivateRoute` component to protect routes based on Token Roles
* [x] **Token Management:**
    * Ensure tokens are stored in memory (not localStorage)
    * Implement silent refresh logic using Iframe/RefreshToken rotation

## Phase 3: HR Application Features
* [x] **Profile View:**
    * Fetch user profile from `/api/user`
    * Display basic info (Name, Role, Department)
* [x] **Employee Directory (RBAC Demo):**
    * Fetch employee list from MCP Gateway (proxying to HR Service)
    * **Crucial:** Implement conditional rendering for the "Salary" column
        * `if (roles.includes('hr-write'))` -> Show Salary
        * `else` -> Show `*** (Hidden)`

## Phase 4: Finance Application Features
* [x] **Dashboard:**
    * Fetch budget data
    * Render Chart.js / Recharts visualization of Q4 Spend
* [x] **Access Control Test:**
    * Verify that non-finance users are redirected to `portal` or `403` page

## Phase 5: v1.4 - SSE Streaming Client (Section 6.1)
* [x] **EventSource Integration:**
    * Create `src/services/ai-query.ts` with streamAIQuery function
    * Use browser's native EventSource API (NOT WebSockets)
    * Set Authorization header with Bearer token
* [x] **Streaming UI Components:**
    * Create `AIQueryInput` component with text input
    * Create `StreamingResponse` component with real-time updates
    * Display "Thinking..." spinner during query processing
* [x] **Event Handling:**
    * Handle `onmessage` events to update UI with chunks
    * Handle [DONE] message to close EventSource connection
    * Handle `onerror` events with retry logic
* [x] **Testing:**
    * Test long-running queries (30-60 seconds) without timeouts
    * Test connection close on completion
    * Test error handling for network failures

## Phase 6: v1.4 - Approval Card Component (Section 5.6)
* [x] **Component Implementation:**
    * Create `src/components/ApprovalCard.tsx`
    * Implement yellow warning border (Tailwind: border-yellow-500, bg-yellow-50)
    * Add Approve/Reject buttons
* [x] **Approval Flow:**
    * Detect `status: 'pending_confirmation'` in AI responses
    * Render ApprovalCard with confirmationId, message, confirmationData
    * Implement `handleApprove`: POST /api/confirm/:id with { approved: true }
    * Implement `handleReject`: POST /api/confirm/:id with { approved: false }
* [x] **User Feedback:**
    * Show success toast: "✅ Action completed successfully"
    * Show cancellation toast: "❌ Action cancelled"
    * Show timeout error: "⏱️ Confirmation expired. Please retry the operation."
* [x] **Testing:**
    * Test approval flow with delete_employee write tool
    * Test rejection flow
    * Test timeout handling (wait 6 minutes after confirmation request)

## Phase 7: v1.4 - Truncation Warning Display (Section 5.3)
* [x] **Warning Detection:**
    * Parse AI response metadata for truncation warnings
    * Extract warning message from MCP tool responses
* [x] **UI Rendering:**
    * Create `TruncationWarning` component with yellow alert style
    * Display warning message: "⚠️ Showing X of Y+ records. Results are incomplete."
    * Add suggestion: "Please refine your query with filters."
* [x] **Testing:**
    * Test with query returning 100+ employees (should show 50)
    * Verify warning is visible and actionable

## Verification Checklist
### v1.3 Criteria
- [x] Does the "Salary" field disappear for non-HR users?
- [x] Can I log out from Portal and be logged out of HR App?
- [x] Does a page refresh keep me logged in (Silent Refresh)?

### v1.4 Criteria
- [x] **SSE Streaming:**
    - [x] EventSource establishes connection to /api/query
    - [x] UI updates in real-time during streaming
    - [x] No timeout errors for 30-60 second queries
    - [x] Connection closes on [DONE] message
- [x] **Approval Card:**
    - [x] pending_confirmation responses render as Approval Cards
    - [x] Approve button executes write operation
    - [x] Reject button cancels operation
    - [x] Timeout (5 minutes) handled gracefully
- [x] **Truncation Warnings:**
    - [x] Warnings display clearly in UI
    - [x] Users understand results are incomplete

## Status
**COMPLETED ✅** - All phases implemented (GREEN phase complete)

## Architecture Version
**Updated for**: v1.4 (January 2026)

**v1.4 Phases Completed**:
- ✅ Phase 5: EventSource SSE client implementation (Section 6.1)
- ✅ Phase 6: Approval Card component with confirmation flow (Section 5.6)
- ✅ Phase 7: Truncation warning display (Section 5.3)

**Constitutional Compliance**:
- All v1.4 features comply with Article V (Client-Side Security)
- No authorization logic in frontend - all enforcement at Gateway/MCP layer
- EventSource and fetch use Bearer tokens from memory (not localStorage)
