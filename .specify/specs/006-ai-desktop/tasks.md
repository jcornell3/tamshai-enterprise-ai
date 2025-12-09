# Tasks: AI Desktop Client

## Group 1: Electron Core
- [ ] Setup Electron + Vite boilerplate in `clients/desktop`. [P]
- [ ] Implement `main.ts` with secure window creation. [P]
- [ ] Implement `preload.ts` to expose protected APIs. [P]
- [ ] Disable Node Integration in Renderer. [P]
- [ ] Enable Context Isolation. [P]
- [ ] Define CSP (Content Security Policy). [P]

## Group 2: Authentication
- [ ] Configure custom protocol `tamshai-ai://` in `package.json`. [P]
- [ ] Implement `AuthService` in Main process using `openid-client` (Node.js). [P]
- [ ] Implement `safeStorage` logic for Refresh Tokens. [P]
- [ ] Implement deep link handler for OIDC callback. [P]
- [ ] Test token encryption/decryption with Electron `safeStorage`. [P]

## Group 3: Chat UI (v1.3)
- [ ] Create `ChatWindow` component. [P]
- [ ] Implement `MessageBubble` with Markdown support. [P]
- [ ] Add code block syntax highlighting. [P]
- [ ] Implement chat input area. [P]

## Group 4: v1.4 - SSE Streaming Client (Section 6.1)
- [ ] **[v1.4] Create `src/renderer/services/ai-stream.ts`** with streamAIQuery function. [P]
- [ ] **[v1.4] Use EventSource API** (NOT fetch or WebSockets). [P]
- [ ] **[v1.4] Set Authorization header** with Bearer token. [P]
- [ ] **[v1.4] Create streaming message component** with real-time updates. [P]
- [ ] **[v1.4] Display "Thinking..." spinner** during query processing. [P]
- [ ] **[v1.4] Handle `onmessage` events** to append chunks to UI. [P]
- [ ] **[v1.4] Handle [DONE] message** to close EventSource connection. [P]
- [ ] **[v1.4] Handle `onerror` events** with retry logic and error notifications. [P]
- [ ] **[v1.4] Test long-running queries** (30-60 seconds) without timeouts. [P]
- [ ] **[v1.4] Test connection close** on completion. [P]
- [ ] **[v1.4] Test error handling** for network failures. [P]
- [ ] **[v1.4] Test reconnection logic**. [P]

## Group 5: v1.4 - Approval Card Component (Section 5.6)
- [ ] **[v1.4] Create `src/renderer/components/ApprovalCard.tsx`** component. [P]
- [ ] **[v1.4] Implement yellow warning border** (border-yellow-500, bg-yellow-50). [P]
- [ ] **[v1.4] Add Approve/Reject buttons** with Tailwind styling. [P]
- [ ] **[v1.4] Display confirmation details** (employee info, action description). [P]
- [ ] **[v1.4] Detect `status: 'pending_confirmation'`** in AI responses. [P]
- [ ] **[v1.4] Render ApprovalCard** with confirmationId, message, confirmationData. [P]
- [ ] **[v1.4] Implement `handleApprove`** to POST /api/confirm/:id with { approved: true }. [P]
- [ ] **[v1.4] Implement `handleReject`** to POST /api/confirm/:id with { approved: false }. [P]
- [ ] **[v1.4] Create `src/renderer/store/confirmations.ts`** with Zustand. [P]
- [ ] **[v1.4] Track pending confirmations** with timestamps. [P]
- [ ] **[v1.4] Implement expiry detection** (5-minute TTL). [P]
- [ ] **[v1.4] Clean up expired confirmations** from store. [P]
- [ ] **[v1.4] Show Electron notification** "Action completed successfully" (success). [P]
- [ ] **[v1.4] Show Electron notification** "Action cancelled" (rejection). [P]
- [ ] **[v1.4] Show Electron notification** "Confirmation expired" (timeout). [P]
- [ ] **[v1.4] Test approval flow** with delete_employee write tool. [P]
- [ ] **[v1.4] Test rejection flow**. [P]
- [ ] **[v1.4] Test timeout handling** (wait 6 minutes after confirmation request). [P]
- [ ] **[v1.4] Test multiple pending confirmations**. [P]

## Group 6: v1.4 - Truncation Warning Display (Section 5.3)
- [ ] **[v1.4] Parse AI response metadata** for truncation warnings. [P]
- [ ] **[v1.4] Extract warning message** from MCP tool responses. [P]
- [ ] **[v1.4] Create `TruncationWarning.tsx` component** with yellow alert border. [P]
- [ ] **[v1.4] Display warning message** clearly in chat. [P]
- [ ] **[v1.4] Add query refinement suggestion**. [P]
- [ ] **[v1.4] Render TruncationWarning** above message content when metadata.truncated = true. [P]
- [ ] **[v1.4] Test with query** returning 100+ employees (should show 50 with warning). [P]
- [ ] **[v1.4] Verify warning** is visible and understandable. [P]
- [ ] **[v1.4] Test query refinement workflow**. [P]

## Group 7: Platform Packaging
- [ ] Configure Electron Builder for macOS, Windows, Linux. [P]
- [ ] Set up code signing (macOS: Developer ID, Windows: Authenticode). [P]
- [ ] Implement `electron-updater` for automatic updates. [P]
- [ ] Configure update server or GitHub Releases. [P]
- [ ] Generate installers (.dmg, .exe, .AppImage). [P]
- [ ] Test installation on all platforms. [P]

## Status
**PLANNED 🔲**

## Architecture Version
**Updated for**: v1.4 (December 2024)

**v1.4 Tasks Added**:
- ✅ Group 4: SSE Streaming Client - 12 tasks (Section 6.1)
- ✅ Group 5: Approval Card Component - 19 tasks (Section 5.6)
- ✅ Group 6: Truncation Warning Display - 9 tasks (Section 5.3)
- **Total**: 67 tasks (was 27) - **+40 v1.4 tasks**

**Platform-Specific Notes**:
- Electron `safeStorage` API used for token encryption (vs. web memory storage)
- EventSource runs in Chromium-based renderer process
- Electron notifications for user feedback
- Zustand store for confirmation tracking (in-memory only)

**Constitutional Compliance**:
- All v1.4 features comply with Article V (Client-Side Security)
- No authorization logic in renderer or main process
- Confirmation IDs stored in memory only (Zustand state, not localStorage)
