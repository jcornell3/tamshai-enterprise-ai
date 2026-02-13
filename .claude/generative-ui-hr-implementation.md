# Generative UI Implementation - HR Org Chart

**Date**: 2026-02-10
**Status**: Phase C.1 - Directive Detection (HR Org Chart) - COMPLETE
**Branch**: main

## What Was Implemented

### 1. Directive Detection in HR AIQueryPage

**File**: `clients/web/apps/hr/src/pages/AIQueryPage.tsx`

**Changes**:
- Added `ComponentRenderer` import from `@tamshai/ui`
- Added state for `componentResponse` and `directiveError`
- Implemented `detectDirective()` function to scan SSE responses for `display:hr:<component>:...` patterns
- Implemented `fetchComponentResponse()` to call MCP UI Service `/api/display` endpoint
- Implemented `handleQueryComplete()` callback to process SSE responses and detect directives
- Added ComponentRenderer rendering when directive detected
- Added error handling UI for directive fetch failures

**Pattern**:

```typescript
// Detect directive in SSE response
const directive = detectDirective(response); // "display:hr:org_chart:userId=me"

// Call MCP UI Service
const componentData = await fetch('/api/mcp-ui/display', {
  method: 'POST',
  body: JSON.stringify({ directive }),
});

// Render ComponentRenderer
<ComponentRenderer
  component={componentData}
  onAction={handleComponentAction}
  voiceEnabled={false}
/>
```

### 2. Configuration Updates

**File**: `clients/web/packages/auth/src/config.ts`

**Changes**:
- Added `mcpUiUrl` to `apiConfig`
- Uses `VITE_MCP_UI_URL` environment variable

**File**: `clients/web/apps/hr/.env.example`

**Changes**:
- Added `VITE_MCP_UI_URL=http://localhost:3118` for dev environment
- Documented stage URL: `https://vps.tamshai.com/mcp-ui`

## How It Works

### Flow Diagram

```text
User Query: "Show me my org chart"
     │
     ▼
SSEQueryClient (SSE streaming)
     │
     ▼
Claude Response (contains directive)
     │
     ▼
handleQueryComplete() callback
     │
     ▼
detectDirective() → "display:hr:org_chart:userId=me"
     │
     ▼
fetchComponentResponse() → POST /api/mcp-ui/display
     │
     ▼
MCP UI Service (port 3118)
     │
     ▼
ComponentResponse { type: "OrgChartComponent", props: {...} }
     │
     ▼
ComponentRenderer → renders OrgChartComponent
```

### Directive Format

```text
display:<domain>:<component>:<params>

Examples:
- display:hr:org_chart:userId=me,depth=1
- display:hr:approvals:userId=me
- display:finance:budget:department=engineering
```

### MCP UI Service

**URL**: <http://localhost:3118> (dev)
**Endpoint**: POST /api/display
**Body**: `{ "directive": "display:hr:org_chart:userId=me" }`
**Response**: `ComponentResponse` object

## Test Expectations

From `tests/e2e/specs/generative-ui.ui.spec.ts`:

**Test 1**: OrgChartComponent renders on "Show me my org chart" query
- Expects: `[data-testid="component-renderer"][data-component-type="OrgChartComponent"]`
- Expects: `[data-testid="org-chart-self-row"]` (self employee row)

**Test 2**: ApprovalsQueue renders on "Show pending approvals" query
- Expects: `[data-testid="approvals-queue"]` or empty state

**Test 3**: Invalid directive displays error message
- Expects: No component rendered for invalid queries

## What's NOW Implemented

### 1. Claude Prompt Engineering (Phase C.5) ✅ COMPLETE

**File**: `services/mcp-gateway/src/ai/claude-client.ts`

Added comprehensive display directive instructions to the system prompt:
- Instructs Claude when to emit directives vs text responses
- Lists all 7 available display directives with usage examples
- Includes trigger phrases ("show", "display", "org chart", etc.)
- Provides concrete examples of user queries → directives

**System Prompt Addition** (lines 108-125):

```typescript
DISPLAY DIRECTIVES (Generative UI):
When the user asks to VIEW or SHOW data that can be visualized as a rich interactive component, emit a display directive instead of text.

Available display directives:
- display:hr:org_chart:userId=me,depth=1 - "org chart", "team structure", "direct reports"
- display:hr:approvals:userId=me - "pending approvals", "things to approve"
- display:sales:customer:customerId={id} - specific customer details
- display:sales:leads:status=NEW,limit=10 - "leads", "pipeline"
- display:sales:forecast:period={period} - "forecast", "quota"
- display:finance:budget:department={dept},year={year} - "budget", "spending"
- display:finance:quarterly_report:quarter={Q},year={YYYY} - "quarterly financials"

Examples:
User: "Show me my org chart" → Emit: display:hr:org_chart:userId=me,depth=1
User: "What approvals do I have?" → Emit: display:hr:approvals:userId=me
```

**Testing**: Ready for manual testing - query "Show me my org chart" should now emit directive

## What's NOW Implemented (Phase C.4) ✅ COMPLETE

### 3. Nginx Proxying for MCP UI Service

**Files**: All web app nginx.conf files (HR, Finance, Sales, Support, Payroll, Tax, Portal)

Added `/api/mcp-ui/` location block to proxy MCP UI Service requests in stage/prod environments:

**Configuration**:

```nginx
# Proxy MCP UI Service requests (Generative UI Components)
# Must be BEFORE /api/ to take precedence
location /api/mcp-ui/ {
    proxy_pass http://mcp-ui:3118/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Pass through Authorization header for JWT validation
    proxy_set_header Authorization $http_authorization;
    proxy_pass_header Authorization;

    # Disable buffering for streaming responses
    proxy_buffering off;
    proxy_cache off;

    # Timeouts for component rendering
    proxy_read_timeout 30s;
    proxy_connect_timeout 10s;
    proxy_send_timeout 30s;
}
```

**Why This Matters**:
- Dev environment: Uses `VITE_MCP_UI_URL=http://localhost:3118` (direct port access)
- Stage/Prod: Uses `/api/mcp-ui/` (reverse proxied through Nginx)
- Ensures consistent MCP UI Service access across all environments

**Apps Updated**:
1. clients/web/apps/hr/nginx.conf
2. clients/web/apps/finance/nginx.conf
3. clients/web/apps/sales/nginx.conf
4. clients/web/apps/support/nginx.conf
5. clients/web/apps/payroll/nginx.conf
6. clients/web/apps/tax/nginx.conf
7. clients/web/apps/portal/nginx.conf

**Commit**: 814836b9

## What's NOW Implemented (Phase C.3) ✅ COMPLETE

### 2. Voice Integration - Input & Output

**File**: `clients/web/apps/hr/src/pages/AIQueryPage.tsx`

Implemented complete voice I/O integration:

**Voice Input (Speech-to-Text)**:
- Microphone button next to query input
- Uses `useVoiceInput` hook from `@tamshai/ui`
- Web Speech API (SpeechRecognition)
- Listening indicator with pulsing red dot
- Auto-fills query input with recognized speech
- Error handling for unsupported browsers

**Voice Output (Text-to-Speech)**:
- Toggle switch in page header
- Uses `useVoiceOutput` hook from `@tamshai/ui`
- Web Speech API (speechSynthesis)
- Automatically speaks component narration when enabled
- Speaking indicator (animated speaker icon)
- Stop speech when toggle disabled

**UI Components**:

```typescript
// Microphone button (data-testid="voice-input")
<button onClick={isListening ? stopListening : startListening}>
  <MicrophoneIcon className={isListening ? 'animate-pulse' : ''} />
</button>

// Voice output toggle (data-testid="voice-toggle")
<button onClick={() => setVoiceEnabled(!voiceEnabled)}>
  <ToggleSwitch enabled={voiceEnabled} />
</button>

// Listening indicator (data-testid="listening-indicator")
{isListening && <div>Listening... Speak your query</div>}
```

**ComponentRenderer Integration**:
- Passes `voiceEnabled` prop to ComponentRenderer
- ComponentRenderer automatically speaks narration when voiceEnabled=true
- Narration text comes from MCP UI Service component response

**Testing**:

```typescript
// E2E test expectations (generative-ui.ui.spec.ts)
- Microphone button visible: [data-testid="voice-input"]
- Voice toggle visible: [data-testid="voice-toggle"]
- Listening indicator appears when recording: [data-testid="listening-indicator"]
- Speech recognition API check: 'SpeechRecognition' in window
- Speech synthesis API check: 'speechSynthesis' in window
```

## Phase C.5 Status ✅ COMPLETE

All 6 apps now have generative UI and voice integration (Architecture v1.5).

### ✅ Completed Apps

**HR** (Commit: 07de6d16):
- Directive detection: `display:hr:org_chart:userId=me`, `display:hr:approvals:userId=me`
- Voice input/output integration
- ComponentRenderer with voiceEnabled prop
- VITE_MCP_UI_URL configuration
- SSEQueryClient integration

**Sales** (Commit: cc2340c8):
- Directive detection: `display:sales:customer:customerId={id}`, `display:sales:leads:status=NEW`
- Voice input/output integration
- ComponentRenderer with voiceEnabled prop
- VITE_MCP_UI_URL configuration
- SSEQueryClient integration

**Support** (Commit: cc2340c8):
- Directive detection: `display:support:tickets:status=open,priority=high`
- Voice input/output integration
- ComponentRenderer with voiceEnabled prop
- VITE_MCP_UI_URL configuration
- SSEQueryClient integration

**Finance** (Commit: eed467df):
- Directive detection: `display:finance:budget:department={dept}`, `display:finance:quarterly_report:quarter={Q}`
- Voice input/output integration
- ComponentRenderer with voiceEnabled prop
- VITE_MCP_UI_URL configuration
- Custom EventSource integration with content tracking via currentMessageContentRef
- Preserved existing features: message history, markdown rendering, confirmation handling

**Payroll** (Commit: 6f7bc858):
- Directive detection: `display:payroll:pay_stub:employeeId=me`, `display:payroll:pay_runs:period=current`
- Voice input/output integration
- ComponentRenderer with voiceEnabled prop
- VITE_MCP_UI_URL configuration
- ReadableStream integration with directive detection on stream completion
- Created .env.example file

**Tax** (Commit: 6f7bc858):
- Directive detection: `display:tax:quarterly_estimate:quarter=Q1`, `display:tax:filings:year=2025`
- Voice input/output integration
- ComponentRenderer with voiceEnabled prop
- VITE_MCP_UI_URL configuration
- ReadableStream integration with directive detection on stream completion
- Created .env.example file

## Streaming Integration Patterns

Phase C.5 successfully adapted the generative UI pattern to three different streaming architectures:

### Pattern 1: SSEQueryClient (HR, Sales, Support)

**Implementation**: Simple callback integration

```typescript
const handleQueryComplete = useCallback(async (response: string) => {
  const directive = detectDirective(response);
  if (directive) {
    await fetchComponentResponse(directive);
  }
}, []);

<SSEQueryClient onQueryComplete={handleQueryComplete} />
```

### Pattern 2: EventSource (Finance)

**Implementation**: Track content in ref during streaming, detect on '[DONE]'

```typescript
const currentMessageContentRef = useRef<string>('');

eventSource.onmessage = (event) => {
  const chunk = JSON.parse(event.data);
  if (chunk.type === 'text' && chunk.text) {
    currentMessageContentRef.current += chunk.text;
    // Update message display
  }

  if (event.data === '[DONE]') {
    const completeMessage = currentMessageContentRef.current;
    const directive = detectDirective(completeMessage);
    if (directive) {
      await fetchComponentResponse(directive);
    }
    currentMessageContentRef.current = '';
  }
};
```

### Pattern 3: ReadableStream (Payroll, Tax)

**Implementation**: Track content during reader loop, detect after completion

```typescript
const currentMessageContentRef = useRef<string>('');

while (reader) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  // Process SSE lines
  if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
    currentMessageContentRef.current += parsed.delta.text;
    // Update message display
  }
}

// After stream completes
const completeMessage = currentMessageContentRef.current;
const directive = detectDirective(completeMessage);
if (directive) {
  await fetchComponentResponse(directive);
}
currentMessageContentRef.current = '';
```

**Key Insight**: All three patterns use `currentMessageContentRef` to accumulate the complete message content, then detect directives only when the stream is fully complete. This ensures the directive regex has the complete message to scan.

## Testing Checklist

### Manual Testing

1. **Start services**:

   ```bash
   cd infrastructure/terraform/dev
   terraform apply -var-file=dev.tfvars
   ```

2. **Set environment variable** (create `.env.local` from `.env.example`):

   ```bash
   cd clients/web/apps/hr
   cp .env.example .env.local
   # Verify VITE_MCP_UI_URL=http://localhost:3118
   ```

3. **Start HR app**:

   ```bash
   npm run dev
   ```

4. **Test query**:
   - Navigate to HR → AI Query
   - Submit: "Show me my org chart"
   - Expected: Text response (no directive yet - Claude not prompted)
   - After prompt engineering: ComponentRenderer with OrgChartComponent

### E2E Testing

```bash
cd tests/e2e

# Load credentials
eval $(../../scripts/secrets/read-github-secrets.sh --e2e --env)
export DEV_USER_PASSWORD=$(grep '^DEV_USER_PASSWORD=' ../../infrastructure/docker/.env | cut -d= -f2)

# Run generative UI tests
npx playwright test specs/generative-ui.ui.spec.ts --reporter=list
```

**Expected**: Tests will skip or fallback until Claude prompt engineering is complete.

## Dependencies

### Runtime Dependencies

- MCP UI Service (port 3118) - ✅ Running
- MCP Gateway (port 3100) - ✅ Running
- ComponentRenderer (@tamshai/ui) - ✅ Built
- OrgChartComponent (@tamshai/ui) - ✅ Built

### Configuration Dependencies

- VITE_MCP_UI_URL environment variable - ✅ Documented in .env.example
- User needs to create `.env.local` from `.env.example` - ⏸️ User action required

## Next Steps

### Priority 1: Claude Prompt Engineering

Without this, Claude won't emit directives and the feature won't work.

**File to modify**: `services/mcp-gateway/src/index.ts` (system prompt)

### Priority 2: Test with Mock Directive

Before implementing prompt engineering, test with a hardcoded directive:

```typescript
// Temporary test code in AIQueryPage
const handleQueryComplete = useCallback(async (response: string) => {
  // TEMP: Force directive for testing
  const testDirective = "display:hr:org_chart:userId=me";
  await fetchComponentResponse(testDirective);
}, []);
```

This validates:
1. MCP UI Service is accessible
2. ComponentRenderer works
3. OrgChartComponent renders

### Priority 3: Nginx Proxying (for stage/prod)

Dev works with direct port access, but stage/prod need proxying.

### Priority 4: Voice Integration

Add microphone button and voice I/O wiring.

### Priority 5: Replicate to Other Apps

Copy this pattern to Finance, Sales, Support, Payroll, Tax AIQueryPages.

## Files Modified

1. `clients/web/apps/hr/src/pages/AIQueryPage.tsx` - Directive detection and ComponentRenderer
2. `clients/web/packages/auth/src/config.ts` - Added mcpUiUrl to apiConfig
3. `clients/web/apps/hr/.env.example` - Added VITE_MCP_UI_URL

## Git Status

```bash
git status
# Modified:
#   clients/web/apps/hr/.env.example
#   clients/web/apps/hr/src/pages/AIQueryPage.tsx
#   clients/web/packages/auth/src/config.ts
```

## Commit Message Template

```text
feat(generative-ui): implement directive detection for HR org chart

Phase C.1 - Directive Detection and ComponentRenderer Integration

Changes:
- Add directive detection in HR AIQueryPage
- Scan SSE responses for display:hr:* patterns
- Call MCP UI Service /api/display endpoint
- Render ComponentRenderer when directive found
- Add VITE_MCP_UI_URL configuration
- Update .env.example with MCP UI Service URL

Implementation Details:
- detectDirective() regex: /display:hr:(\w+):([^\s]*)/
- fetchComponentResponse() calls POST /api/mcp-ui/display
- handleQueryComplete() callback processes SSE completion
- ComponentRenderer with voiceEnabled=false (voice not wired yet)

Testing:
- Manual testing pending prompt engineering
- E2E tests will skip until Claude emits directives

Next Steps:
- Phase C.5: Claude prompt engineering to emit directives
- Phase C.3: Voice toggle integration
- Phase C.4: Nginx proxying for stage/prod

Related:
- Tests: tests/e2e/specs/generative-ui.ui.spec.ts
- Docs: .claude/generative-ui-hr-implementation.md
```

---

**Last Updated**: 2026-02-10
**Implemented By**: Claude-Dev
