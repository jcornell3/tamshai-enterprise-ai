# Specification: AI Desktop Client (React Native)

**Status**: DEPRECATED - Superseded by Spec 009 (Flutter Unified)
**Deprecated**: December 26, 2025
**Replaced By**: 009-flutter-unified

---

> **WARNING: This specification is DEPRECATED**
>
> React Native Windows demonstrated fundamental stability issues that blocked development:
> - Hermes engine crashes on TextInput (RN Windows 0.80)
> - NuGet/npm version mismatches (RN Windows 0.73)
> - std::mutex crash bug in VS 2022 17.10+
> - XAML initialization failures
>
> See **ADR-005** in `.specify/ARCHITECTURE_SPECS.md` for full rationale.
>
> **Current Implementation**: Spec 009 (Flutter Unified Client)
> - Location: `clients/unified_flutter/`
> - Specification: `.specify/specs/009-flutter-unified/`

---

**Original Updated**: December 2024
**Original Architecture**: React Native for Windows + macOS (replaces Electron)
**Original Location**: `clients/unified/`

---

## 1. Business Intent

**User Story:** As an employee, I want a dedicated desktop assistant that can answer questions about enterprise data, so that I don't have to switch between multiple dashboards.

**Business Value:** Provides a unified "Natural Language Interface" to the enterprise, increasing productivity.

---

## 2. Access Control & Security (Crucial)

* **Required Role(s):** Any authenticated user
* **Data Classification:** All classifications (queries routed through MCP Gateway)
* **PII Risks:** No - Desktop app is a client; PII handled by backend
* **RLS Impact:** Desktop app queries MCP Gateway, which enforces all security policies

---

## 3. Security Requirements

* **Authentication:** OIDC via Keycloak (PKCE) using OS-native secure browser
* **Storage:**
  - **Mobile (iOS/Android/macOS):** `react-native-keychain` (OS Keychain)
  - **Windows:** Windows Credential Manager (native module)
* **Transport:** All AI queries sent to **MCP Gateway** (`http://localhost:3100/api/query`), NOT directly to Claude
* **Browser Auth:**
  - **MUST USE** OS-native secure browser modal (NOT WebView)
  - Windows: System browser via `Linking.openURL()`
  - macOS: `ASWebAuthenticationSession` via `react-native-app-auth`
  - iOS: `SFSafariViewController` via `react-native-app-auth`
  - Android: Chrome Custom Tabs via `react-native-app-auth`

---

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
   - Custom SSE parser for Server-Sent Events from MCP Gateway
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

---

## 5. Technical Stack

* **Runtime:** React Native 0.80 (replaces Electron)
* **Desktop Windows:** `react-native-windows` (Microsoft maintained)
* **Desktop macOS:** `react-native-macos` (Microsoft maintained)
* **Language:** TypeScript 5.x (strict mode)
* **Auth:** `react-native-app-auth` (mobile/macOS), custom PKCE (Windows)
* **Token Storage:** `react-native-keychain` (mobile), Windows Credential Manager (Windows)
* **State:** Zustand
* **v1.4 Streaming:** Custom SSE parser with fetch API
* **UI Framework:** React Native Paper or NativeWind (TBD)

---

## 6. User Interaction Scenarios

### v1.3 Scenarios
* **Scenario A (Login):**
  1. User launches app → sees "Sign In with SSO" button
  2. User clicks button → OS-native browser modal pops up (loading Keycloak)
  3. User enters credentials + TOTP in secure modal
  4. Modal closes automatically → App receives token via protocol callback
  5. App transitions to Chat UI

* **Scenario B (Basic Query):** User types "Who is my manager?" → App sends to MCP Gateway with access token → App displays response with markdown formatting.

* **Scenario D (Logout):** User clicks "Logout" → App clears access token from memory → Deletes refresh token from secure storage → Returns to login screen.

### v1.4 Scenarios
* **Scenario E (SSE Streaming - Section 6.1):**
  - User asks: "Show me all employees in Engineering department"
  - App displays "Thinking..." spinner
  - SSE connection established to `/api/query`
  - Response streams in real-time over 30-60 seconds (no timeout)
  - Connection closes on [DONE] message
  - Full response rendered with markdown formatting

* **Scenario F (Truncation Warning - Section 5.3):**
  - User queries: "List all sales opportunities"
  - AI response includes: "Showing 50 of 100+ opportunities. Results are incomplete. Please refine your query with filters (e.g., stage, owner, date range)."
  - App displays warning with yellow alert banner
  - User can refine query based on suggestion

* **Scenario G (Write Operation Approval - Section 5.6):**
  - User requests: "Delete employee Marcus Johnson (ID: emp-456)"
  - Gateway returns `pending_confirmation` response
  - App renders Approval Card:
    ```
    ⚠ Confirm Action Required

    Delete employee Marcus Johnson (marcus.johnson@tamshai.com)?

    Department: Engineering
    Position: Software Engineer

    This action will permanently delete the employee record and cannot be undone.

    [Approve] [Reject]
    ```
  - User taps "Approve" → App sends `POST /api/confirm/:confirmationId` with `{ approved: true }`
  - Gateway executes deletion and returns success
  - App displays: "Employee Marcus Johnson deleted successfully"

  - **Alternative: User Rejects**
    - User taps "Reject" → App sends `{ approved: false }`
    - App displays: "Action cancelled"

  - **Alternative: Timeout Expires**
    - User waits > 5 minutes without tapping
    - App attempts to approve → Gateway returns 404 (confirmation expired)
    - App displays: "Confirmation expired. Please retry the operation."

---

## 7. Success Criteria

### v1.3 Criteria
- [x] App launches and shows "Sign In with SSO" button
- [ ] OIDC login opens OS-native browser (NOT WebView)
- [ ] Refresh token stored securely in OS keychain/Credential Manager
- [ ] Markdown rendering works (tables, code blocks, lists)
- [ ] Closing the app clears Access Token from memory
- [ ] Citations displayed for data sources
- [ ] "Thinking..." indicator shown during MCP tool execution

### v1.4 Criteria
- [ ] **[v1.4] SSE Streaming Works (Section 6.1):**
  - [x] API service implements SSE streaming
  - [ ] UI streams Claude response chunks in real-time
  - [ ] No timeout errors for 30-60 second queries
  - [ ] Connection closes gracefully on [DONE] message
  - [ ] Error handling for connection failures
- [ ] **[v1.4] Approval Card Component (Section 5.6):**
  - [ ] `pending_confirmation` responses render as Approval Cards
  - [ ] Yellow warning styling visible
  - [ ] Approve button sends POST /api/confirm/:id with { approved: true }
  - [ ] Reject button sends POST /api/confirm/:id with { approved: false }
  - [ ] Confirmation timeout (5 minutes) handled gracefully
  - [ ] Success/failure messages display clearly
- [ ] **[v1.4] Truncation Warnings Display (Section 5.3):**
  - [ ] AI-generated truncation warnings render with yellow alert banner
  - [ ] Users understand results are incomplete
  - [ ] UI encourages query refinement

---

## 8. v1.4 Technical Implementation

### 8.1. SSE Streaming (Section 6.1)

**Implementation Status:** COMPLETE in `src/services/api.ts`

```typescript
// src/services/api.ts - streamQuery function

export async function streamQuery(
  query: string,
  accessToken: string,
  onChunk: (chunk: SSEEvent) => void,
  onComplete: () => void,
  onError: (error: Error) => void
): Promise<void> {
  const response = await fetch(`${baseUrl}/api/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify({ query }),
  });

  // Custom SSE parser for text/event-stream
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value);
    // Parse SSE format: data: {...}\n\n
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') {
          onComplete();
          return;
        }
        onChunk(JSON.parse(data));
      }
    }
  }
}
```

### 8.2. Approval Card Component (Section 5.6)

**Implementation Status:** PENDING - UI component not built

```typescript
// src/components/ApprovalCard.tsx (React Native)

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
  const { confirmAction } = useChatStore();

  const handleApprove = () => confirmAction(confirmationId, true);
  const handleReject = () => confirmAction(confirmationId, false);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <WarningIcon />
        <Text style={styles.title}>Confirm Action Required</Text>
      </View>

      <Text style={styles.message}>{message}</Text>

      {confirmationData.employeeName && (
        <View style={styles.details}>
          <Text>Employee: {confirmationData.employeeName}</Text>
          <Text>Email: {confirmationData.employeeEmail}</Text>
          <Text>Department: {confirmationData.department}</Text>
        </View>
      )}

      <View style={styles.buttons}>
        <TouchableOpacity style={styles.approveButton} onPress={handleApprove}>
          <Text style={styles.buttonText}>Approve</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.rejectButton} onPress={handleReject}>
          <Text style={styles.buttonText}>Reject</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.expiry}>This confirmation will expire in 5 minutes</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderWidth: 2,
    borderColor: '#EAB308', // yellow-500
    backgroundColor: '#FEF9C3', // yellow-50
    padding: 16,
    borderRadius: 8,
    marginVertical: 8,
  },
  // ... more styles
});
```

### 8.3. Truncation Warning Banner (Section 5.3)

**Implementation Status:** PENDING - UI component not built

```typescript
// src/components/TruncationWarning.tsx (React Native)

export const TruncationWarning: React.FC<{ message: string }> = ({ message }) => {
  return (
    <View style={styles.container}>
      <WarningIcon color="#EAB308" />
      <View style={styles.content}>
        <Text style={styles.message}>{message}</Text>
        <Text style={styles.tip}>
          Tip: Refine your query with specific filters to get complete results.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderLeftWidth: 4,
    borderLeftColor: '#EAB308', // yellow-500
    backgroundColor: '#FEF9C3', // yellow-50
    padding: 12,
    marginVertical: 8,
  },
  // ... more styles
});
```

---

## 9. Constitution Compliance

* **Article V.1:** No authorization logic in client - roles are display-only
* **Article V.2:** Refresh tokens in OS-native secure storage (Keychain/Credential Manager)
* **Article V.3:** OIDC with PKCE via OS-native browser modal (NOT WebView, NOT embedded form)

---

## 10. Platform-Specific Notes

### Windows
- **Protocol Handler:** `com.tamshai.ai://` registered in Package.appxmanifest
- **Deep Link Handling:** `DeepLinkModule` C++ native module captures protocol activation
- **Known Issue:** `Linking.getInitialURL()` returns null (RN Windows bug #6996)
- **Workaround:** DeepLinkModule reads command line args in WinMain

### macOS (Planned)
- **Auth:** `react-native-app-auth` with ASWebAuthenticationSession
- **Storage:** macOS Keychain via `react-native-keychain`

### iOS/Android (Planned)
- **Auth:** `react-native-app-auth` with native browser
- **Storage:** iOS Keychain / Android Keystore via `react-native-keychain`

---

## Status
**DEPRECATED** - Superseded by Spec 009 (Flutter Unified Client)

See `.specify/specs/009-flutter-unified/` for the current implementation specification.

## Architecture Version
**Original**: v1.4 (December 2024)
**Deprecated**: December 26, 2025
**Replaced By**: Spec 009 (Flutter Unified)

**Key Changes from Electron Spec**:
- Runtime: Electron → React Native
- Token storage: `safeStorage` → `react-native-keychain` / Windows Credential Manager
- Protocol handling: Registry hacks → Native UWP activation
- SSE: EventSource API → Custom SSE parser (EventSource not available in RN)

**v1.4 Changes Applied**:
- Section 6.1: SSE streaming implemented in api.ts
- Section 5.6: Approval Card component specification (UI pending)
- Section 5.3: Truncation warning component specification (UI pending)
- User interaction scenarios updated with v1.4 flows
- Success criteria expanded with v1.4 requirements

**Constitutional Impact**:
- No changes to Article V (Client-Side Security) - remains fully compliant
- SSE and Approval Card follow Article V.1 (no client-side authorization)
- Confirmation storage in Zustand memory state only
- No constitutional amendments required
