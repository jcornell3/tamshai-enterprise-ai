# Tasks: Sample Web Apps Implementation

## Group 1: Infrastructure (Frontend)
- [ ] Initialize Turborepo in `clients/web`. [P]
- [ ] Configure Tailwind CSS preset in `packages/ui-kit`. [P]
- [ ] Create `packages/auth-client` wrapping `react-oidc-context`. [P]

## Group 2: HR Application
- [ ] Create `apps/hr` using Vite + React. [P]
- [ ] Implement `EmployeeTable` component with `showSalary` prop. [P]
- [ ] Connect `EmployeeTable` to `useAuth()` hook to derive permissions. [P]

## Group 3: Finance Application
- [ ] Create `apps/finance` using Vite + React. [P]
- [ ] Implement `BudgetChart` using Recharts. [P]
- [ ] Add `RequireRole` guard: `<RequireRole role="finance-read">`. [P]

## Group 4: Portal & Integration
- [ ] Build `apps/portal` Landing Page with links to apps. [P]
- [ ] Configure `nginx` or local dev proxy to serve apps on ports 4000, 4001, 4002. [P]

## Group 5: v1.4 - SSE Streaming Client (Section 6.1)
- [ ] **[v1.4] Create `src/services/ai-query.ts`** with streamAIQuery function. [P]
- [ ] **[v1.4] Use EventSource API** (NOT WebSockets) for SSE connection. [P]
- [ ] **[v1.4] Pass token via query parameter** (EventSource does NOT support custom headers). [P]
- [ ] **[v1.4] Create `AIQueryInput` component** with text input and submit button. [P]
- [ ] **[v1.4] Create `StreamingResponse` component** for real-time updates. [P]
- [ ] **[v1.4] Display "Thinking..." spinner** during query processing. [P]
- [ ] **[v1.4] Handle `onmessage` events** to update UI with chunks. [P]
- [ ] **[v1.4] Handle [DONE] message** to close EventSource connection. [P]
- [ ] **[v1.4] Handle `onerror` events** with retry logic. [P]
- [ ] **[v1.4] Test long-running queries** (30-60 seconds) without timeouts. [P]
- [ ] **[v1.4] Test connection close** on completion. [P]
- [ ] **[v1.4] Test error handling** for network failures. [P]

## Group 6: v1.4 - Approval Card Component (Section 5.6)
- [ ] **[v1.4] Create `src/components/ApprovalCard.tsx`** component. [P]
- [ ] **[v1.4] Implement yellow warning border** (border-yellow-500, bg-yellow-50). [P]
- [ ] **[v1.4] Add Approve/Reject buttons** with Tailwind styling. [P]
- [ ] **[v1.4] Detect `status: 'pending_confirmation'`** in AI responses. [P]
- [ ] **[v1.4] Render ApprovalCard** with confirmationId, message, confirmationData. [P]
- [ ] **[v1.4] Implement `handleApprove`** to POST /api/confirm/:id with { approved: true }. [P]
- [ ] **[v1.4] Implement `handleReject`** to POST /api/confirm/:id with { approved: false }. [P]
- [ ] **[v1.4] Show success toast**: "✅ Action completed successfully". [P]
- [ ] **[v1.4] Show cancellation toast**: "❌ Action cancelled". [P]
- [ ] **[v1.4] Show timeout error**: "⏱️ Confirmation expired". [P]
- [ ] **[v1.4] Test approval flow** with delete_employee write tool. [P]
- [ ] **[v1.4] Test rejection flow**. [P]
- [ ] **[v1.4] Test timeout handling** (wait 6 minutes after confirmation request). [P]

## Group 7: v1.4 - Truncation Warning Display (Section 5.3)
- [ ] **[v1.4] Parse AI response metadata** for truncation warnings. [P]
- [ ] **[v1.4] Extract warning message** from MCP tool responses. [P]
- [ ] **[v1.4] Create `TruncationWarning` component** with yellow alert style. [P]
- [ ] **[v1.4] Display warning message**: "⚠️ Showing X of Y+ records". [P]
- [ ] **[v1.4] Add suggestion**: "Please refine your query with filters". [P]
- [ ] **[v1.4] Test with query** returning 100+ employees (should show 50). [P]
- [ ] **[v1.4] Verify warning** is visible and actionable. [P]

## Status
**PLANNED 🔲**

## Architecture Version
**Updated for**: v1.4 (December 2024)

**v1.4 Tasks Added**:
- ✅ Group 5: SSE Streaming Client - 12 tasks (Section 6.1)
- ✅ Group 6: Approval Card Component - 13 tasks (Section 5.6)
- ✅ Group 7: Truncation Warning Display - 7 tasks (Section 5.3)
- **Total**: 53 tasks (was 21) - **+32 v1.4 tasks**

**Constitutional Compliance**:
- All v1.4 features comply with Article V (Client-Side Security)
- No authorization logic in frontend components
- EventSource and fetch use Bearer tokens from memory (Article V.2)
