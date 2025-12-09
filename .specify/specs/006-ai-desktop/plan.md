# Implementation Plan: AI Desktop Client

## Phase 1: Electron Foundation
* [ ] **Scaffolding:**
    * Initialize `clients/desktop` with Electron Forge + Vite + TypeScript
* [ ] **Security Hardening:**
    * Disable Node Integration in Renderer
    * Enable Context Isolation
    * Define CSP (Content Security Policy)

## Phase 2: Authentication (Native)
* [ ] **Deep Linking:**
    * Register custom protocol `tamshai-ai://`
    * Handle OIDC callback via protocol handler
* [ ] **Secure Storage:**
    * Implement `TokenStore` using Electron `safeStorage` API
    * Encrypt Refresh Token at rest

## Phase 3: Chat Interface (v1.3)
* [ ] **UI Implementation:**
    * Build Chat Layout (Sidebar, Message List, Input Area)
    * Implement Markdown Renderer for AI responses
    * Add Code block highlighting (syntax highlighting)
* [ ] **Basic Query Handler:**
    * Implement query submission to MCP Gateway
    * Display responses with markdown formatting

## Phase 4: v1.4 - SSE Streaming Client (Section 6.1)
* [ ] **EventSource Integration:**
    * Create `src/renderer/services/ai-stream.ts` with streamAIQuery function
    * Use EventSource API (NOT fetch or WebSockets)
    * Set Authorization header with Bearer token
* [ ] **Streaming UI:**
    * Create streaming message component with real-time updates
    * Display "Thinking..." spinner during query processing
    * Show streaming chunks as they arrive
* [ ] **Event Handling:**
    * Handle `onmessage` events to append chunks to UI
    * Handle [DONE] message to close EventSource connection
    * Handle `onerror` events with retry logic and error notifications
* [ ] **Testing:**
    * Test long-running queries (30-60 seconds) without timeouts
    * Test connection close on completion
    * Test error handling for network failures
    * Test reconnection logic

## Phase 5: v1.4 - Approval Card Component (Section 5.6)
* [ ] **Component Implementation:**
    * Create `src/renderer/components/ApprovalCard.tsx`
    * Implement yellow warning border (Tailwind: border-yellow-500, bg-yellow-50)
    * Add Approve/Reject buttons with proper styling
    * Display confirmation details (employee info, action description)
* [ ] **Approval Flow:**
    * Detect `status: 'pending_confirmation'` in AI responses
    * Render ApprovalCard with confirmationId, message, confirmationData
    * Implement `handleApprove`: POST /api/confirm/:id with { approved: true }
    * Implement `handleReject`: POST /api/confirm/:id with { approved: false }
* [ ] **Confirmation Store (Zustand):**
    * Create `src/renderer/store/confirmations.ts`
    * Track pending confirmations with timestamps
    * Implement expiry detection (5-minute TTL)
    * Clean up expired confirmations
* [ ] **User Feedback:**
    * Show Electron notification: "Action completed successfully" (success)
    * Show notification: "Action cancelled" (rejection)
    * Show notification: "Confirmation expired. Please retry." (timeout)
* [ ] **Testing:**
    * Test approval flow with delete_employee write tool
    * Test rejection flow
    * Test timeout handling (wait 6 minutes after confirmation request)
    * Test multiple pending confirmations

## Phase 6: v1.4 - Truncation Warning Display (Section 5.3)
* [ ] **Warning Detection:**
    * Parse AI response metadata for truncation warnings
    * Extract warning message from MCP tool responses
* [ ] **UI Component:**
    * Create `src/renderer/components/TruncationWarning.tsx`
    * Implement yellow alert border (border-l-4 border-yellow-500)
    * Display warning message clearly
    * Add query refinement suggestion
* [ ] **Integration:**
    * Render TruncationWarning above message content when metadata.truncated = true
    * Ensure warning is visible and actionable
* [ ] **Testing:**
    * Test with query returning 100+ employees (should show 50 with warning)
    * Verify warning is visible and understandable
    * Test query refinement workflow

## Phase 7: Platform Packaging
* [ ] **Build Configuration:**
    * Configure Electron Builder for macOS, Windows, Linux
    * Set up code signing (macOS: Developer ID, Windows: Authenticode)
* [ ] **Auto-Update:**
    * Implement `electron-updater` for automatic updates
    * Configure update server or GitHub Releases
* [ ] **Distribution:**
    * Generate installers (.dmg, .exe, .AppImage)
    * Test installation on all platforms

## Verification Checklist
### v1.3 Criteria
- [ ] Does the app launch and prompt for login?
- [ ] Are tokens persisted encrypted on disk (safeStorage)?
- [ ] Does markdown rendering work (tables, code blocks, lists)?
- [ ] Does logout clear tokens from keychain?

### v1.4 Criteria
- [ ] **SSE Streaming:**
    - [ ] EventSource establishes connection to /api/query
    - [ ] UI updates in real-time during streaming
    - [ ] No timeout errors for 30-60 second queries
    - [ ] Connection closes on [DONE] message
    - [ ] Error handling works (network failures, reconnection)
- [ ] **Approval Card:**
    - [ ] pending_confirmation responses render as Approval Cards
    - [ ] Yellow warning styling is visible
    - [ ] Approve button executes write operation
    - [ ] Reject button cancels operation
    - [ ] Timeout (5 minutes) handled gracefully
    - [ ] Electron notifications work for all outcomes
- [ ] **Truncation Warnings:**
    - [ ] Warnings display clearly in chat
    - [ ] Users understand results are incomplete
    - [ ] Query refinement suggestions are helpful

## Status
**PLANNED 🔲**

## Architecture Version
**Updated for**: v1.4 (December 2024)

**v1.4 Phases Added**:
- ✅ Phase 4: EventSource SSE streaming implementation (Section 6.1)
- ✅ Phase 5: Approval Card component with confirmation store (Section 5.6)
- ✅ Phase 6: Truncation warning display (Section 5.3)

**Key Differences from Web Apps**:
- Uses Electron `safeStorage` for token encryption (vs. memory-only web storage)
- EventSource runs in Electron renderer process (Chromium-based)
- Electron notifications for user feedback (vs. toast notifications)
- Confirmation store uses Zustand with in-memory state (no localStorage)

**Constitutional Compliance**:
- All v1.4 features comply with Article V (Client-Side Security)
- No authorization logic in renderer or main process
- EventSource and fetch use Bearer tokens from `safeStorage` API
- Confirmation IDs stored in memory only (Zustand state)
