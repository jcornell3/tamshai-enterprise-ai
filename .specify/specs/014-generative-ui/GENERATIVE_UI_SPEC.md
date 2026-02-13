# Generative UI Specification

**Version**: 1.0
**Status**: Draft
**Created**: February 7, 2026
**Author**: Claude (with user direction)

---

## 1. Executive Summary

Enable the AI Agent to render rich, interactive UI components in response to natural language queries, with voice input/output support. The AI emits minimal display directives while a dedicated MCP UI Service handles data fetching, component selection, and rendering.

### Goals

1. **Token Efficiency**: AI emits ~10-20 token directives, not full data payloads
2. **Rich Visualization**: Display org charts, data tables, forecasts as interactive components
3. **Voice-First Option**: Support voice input and verbal AI responses
4. **Action Support**: Components include drill-down, approve/reject, and navigation actions
5. **Extensibility**: Design for future components and dynamic refresh

### Non-Goals (v1.0)

- Mobile client support (screen too small for complex visualizations)
- Real-time data updates (static snapshots only)
- Write forms (read-only display first)

---

## 2. Architecture Overview

### Option A: Minimal Directive Pattern

```
┌─────────────┐     Voice/Text      ┌─────────────┐
│   User      │ ─────────────────▶  │  AI Agent   │
│  (Web/      │                     │  (Claude)   │
│  Desktop)   │                     │             │
└─────────────┘                     └──────┬──────┘
      ▲                                    │
      │                          Display Directive
      │                          (~10-20 tokens)
      │                                    │
      │                                    ▼
      │                            ┌──────────────┐
      │      Rendered Component    │  MCP UI      │
      │◀───────────────────────────│  Service     │
      │      + Voice Response      │  (New)       │
      │                            └──────┬───────┘
      │                                   │
      │                          Fetch Data via
      │                          MCP Tools
      │                                   │
      │                                   ▼
      │                            ┌──────────────┐
      │                            │ MCP Servers  │
      │                            │ (HR, Finance,│
      │                            │  Sales, etc) │
      │                            └──────────────┘
```

### Request Flow

1. **User** speaks or types: "Show me my org chart"
2. **AI Agent** (cached system prompt) emits: `display:hr:org_chart:depth=1`
3. **MCP UI Service** receives directive:
   - Parses directive
   - Calls `GET /api/mcp/hr/get_org_chart?depth=1`
   - Selects `OrgChartComponent`
   - Returns component definition + data
4. **Client** renders interactive component
5. **AI Agent** (optionally) provides voice narration: "Here's your org chart. You report to Alice Chen and have 3 direct reports."

---

## 3. Priority Tools & Components (v1.0)

### 3.1 Tool-to-Component Mapping

| Priority | MCP Tool | Component | Domain |
|----------|----------|-----------|--------|
| 1 | `get_org_chart` | OrgChartComponent | HR |
| 2 | `get_customer` | CustomerDetailCard | Sales |
| 3 | `list_leads` | LeadsDataTable | Sales |
| 4 | `get_forecast` | ForecastChart | Sales |
| 5 | `get_budget` | BudgetSummaryCard | Finance |
| 6 | `list_pending_approvals` | ApprovalsQueue | Cross-Domain |
| 7 | `get_quarterly_report` | QuarterlyReportDashboard | Finance |

### 3.2 Component Specifications

#### OrgChartComponent

**Display Directive**: `display:hr:org_chart:userId={id},depth={1|2|3}`

**Data Source**: `GET /api/mcp/hr/get_org_chart`

**Layout**:
```
                    ┌─────────────────┐
                    │  Manager        │
                    │  Alice Chen     │
                    │  VP of HR       │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
        ┌─────┴─────┐  ┌─────┴─────┐  ┌─────┴─────┐
        │  Peer 1   │  │   YOU     │  │  Peer 2   │
        │  Bob Lee  │  │ Marcus J. │  │ Carol Wu  │
        └───────────┘  └─────┬─────┘  └───────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
        ┌─────┴─────┐  ┌─────┴─────┐  ┌─────┴─────┐
        │ Report 1  │  │ Report 2  │  │ Report 3  │
        │  Dan Kim  │  │  Eva Ruiz │  │ Frank Lee │
        └───────────┘  └───────────┘  └───────────┘
```

**Actions**:
- Click employee → Expand to show details (drill-down)
- Click employee → Navigate to Employee Directory page
- Hover → Show tooltip with title, department, email

**Voice Narration**: "You report to [manager name] who is the [title]. You have [n] peers and [m] direct reports."

---

#### CustomerDetailCard

**Display Directive**: `display:sales:customer:customerId={id}`

**Data Source**: `GET /api/mcp/sales/get_customer`

**Layout**:
```
┌────────────────────────────────────────────────────┐
│  🏢  Acme Corporation                    [Active]  │
├────────────────────────────────────────────────────┤
│                                                    │
│  Industry:        Technology                       │
│  Annual Revenue:  $5,200,000                       │
│  Employees:       150                              │
│  Website:         acme.com                         │
│                                                    │
│  ─────────────── Contacts ───────────────         │
│                                                    │
│  👤 John Smith (Primary)     john@acme.com        │
│     CEO                      (555) 123-4567       │
│                                                    │
│  👤 Jane Doe                 jane@acme.com        │
│     CTO                      (555) 234-5678       │
│                                                    │
│  ─────────────── Opportunities ──────────────     │
│                                                    │
│  • Enterprise License    $250,000   [Negotiation] │
│  • Support Package       $45,000    [Proposal]    │
│                                                    │
│  [View All Opportunities]  [Add Note]  [Edit]     │
└────────────────────────────────────────────────────┘
```

**Actions**:
- Click opportunity → Navigate to Opportunities page
- Click contact → Show contact detail modal
- Click "View All Opportunities" → Filter opportunities by customer

**Voice Narration**: "[Company name] is a [industry] company with [revenue] annual revenue. They have [n] active opportunities worth [total value]."

---

#### LeadsDataTable

**Display Directive**: `display:sales:leads:status={status},limit={n}`

**Data Source**: `GET /api/mcp/sales/list_leads`

**Layout**:
```
┌──────────────────────────────────────────────────────────────────┐
│  Leads                                        [+ New Lead]       │
├──────────────────────────────────────────────────────────────────┤
│  Status: [All ▼]  Source: [All ▼]  Score: [Min ▼]  🔍 Search    │
├────┬───────────────┬────────────┬───────┬─────────┬─────────────┤
│ □  │ Name          │ Company    │ Score │ Status  │ Source      │
├────┼───────────────┼────────────┼───────┼─────────┼─────────────┤
│ □  │ Sarah Connor  │ Cyberdyne  │  85   │ 🟢 NEW  │ Website     │
│ □  │ John Matrix   │ Val Verde  │  72   │ 🟡 QUAL │ Referral    │
│ □  │ Dutch Schae.. │ Guatemala  │  68   │ 🟡 QUAL │ Conference  │
│ □  │ Ellen Ripley  │ Weyland    │  91   │ 🔵 CONT │ Cold Call   │
├────┴───────────────┴────────────┴───────┴─────────┴─────────────┤
│  Showing 1-4 of 47 leads                    [< Prev] [Next >]   │
└──────────────────────────────────────────────────────────────────┘
```

**Actions**:
- Click row → Expand inline detail
- Click checkbox → Select for bulk action
- Click column header → Sort
- Pagination controls → Load more data
- Filter dropdowns → Re-fetch with filters

**Voice Narration**: "You have [n] leads. [m] are new this week with an average score of [avg]. Your highest priority lead is [name] from [company] with a score of [score]."

---

#### ForecastChart

**Display Directive**: `display:sales:forecast:period={Q1 2026}`

**Data Source**: `GET /api/mcp/sales/get_forecast`

**Layout**:
```
┌────────────────────────────────────────────────────────────────┐
│  Sales Forecast - Q1 2026                                      │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ████████████████████████░░░░░░  Quota: $500,000              │
│  ████████████████████████████░░  Commit: $425,000  (85%)      │
│  ████████████████████████████░░  Best Case: $520,000          │
│  ██████████████████░░░░░░░░░░░░  Closed: $312,000  (62%)      │
│                                                                │
│  ───────────────── By Rep ─────────────────                   │
│                                                                │
│  Alice Chen      $125,000 / $150,000  ████████████░░  83%     │
│  Bob Martinez    $98,000 / $125,000   ████████████░░░  78%    │
│  Carol Johnson   $89,000 / $100,000   █████████████░░  89%    │
│                                                                │
│  ───────────────── Pipeline ─────────────────                 │
│                                                                │
│  Qualification:  $45,000   (3 deals)                          │
│  Discovery:      $82,000   (5 deals)                          │
│  Proposal:       $156,000  (8 deals)                          │
│  Negotiation:    $230,000  (4 deals)                          │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Actions**:
- Click rep row → Filter pipeline by rep
- Click stage → Show deals in that stage
- Hover bar → Show detailed breakdown

**Voice Narration**: "Your team is at [percent]% of quota for [period], with [closed] closed and [commit] committed. You need [remaining] more to hit target."

---

#### BudgetSummaryCard

**Display Directive**: `display:finance:budget:department={dept},year={year}`

**Data Source**: `GET /api/mcp/finance/get_budget`

**Layout**:
```
┌────────────────────────────────────────────────────────────────┐
│  Engineering Budget - FY 2026                      [APPROVED]  │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Total Budget:     $2,500,000                                  │
│  Spent to Date:    $1,245,000  (49.8%)                        │
│  Remaining:        $1,255,000                                  │
│                                                                │
│  ████████████████████████░░░░░░░░░░░░░░░░░░░░  49.8%          │
│                                                                │
│  ─────────────── By Category ───────────────                  │
│                                                                │
│  Salaries         $850,000 / $1,500,000  ██████████░░░  56%   │
│  Equipment        $125,000 / $400,000    █████░░░░░░░░  31%   │
│  Software         $180,000 / $300,000    █████████░░░░  60%   │
│  Travel           $45,000 / $150,000     █████░░░░░░░░  30%   │
│  Training         $45,000 / $150,000     █████░░░░░░░░  30%   │
│                                                                │
│  ⚠️  Software category at 60% with 6 months remaining         │
│                                                                │
│  [View Transactions]  [Request Amendment]                      │
└────────────────────────────────────────────────────────────────┘
```

**Actions**:
- Click category → Drill down to transactions
- Click "View Transactions" → Navigate to transactions page
- Click "Request Amendment" → Open amendment form (future)

**Voice Narration**: "[Department] has spent [percent]% of their [year] budget. [warning if overspending]. Largest spend is [category] at [amount]."

---

#### ApprovalsQueue

**Display Directive**: `display:approvals:pending:userId={me}`

**Data Sources** (aggregated):
- `GET /api/mcp/hr/list_team_time_off_requests?status=pending`
- `GET /api/mcp/finance/list_expense_reports?status=SUBMITTED`
- `GET /api/mcp/finance/list_budgets?status=PENDING_APPROVAL`

**Layout**:
```
┌────────────────────────────────────────────────────────────────┐
│  Your Pending Approvals                              (5 items) │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ─────────────── Time Off (2) ───────────────                 │
│                                                                │
│  📅 Dan Kim - Vacation                                         │
│     Feb 15-19, 2026 (5 days)                                  │
│     "Family vacation to Hawaii"                               │
│     [Approve] [Reject]                                         │
│                                                                │
│  📅 Eva Ruiz - Sick Leave                                      │
│     Feb 10, 2026 (1 day)                                      │
│     "Doctor appointment"                                       │
│     [Approve] [Reject]                                         │
│                                                                │
│  ─────────────── Expense Reports (2) ───────────────          │
│                                                                │
│  💰 Marcus Johnson - Client Dinner                             │
│     $342.50 - Jan 28, 2026                                    │
│     3 items: Dinner, Uber, Parking                            │
│     [View Details] [Approve] [Reject]                          │
│                                                                │
│  💰 Frank Lee - Conference Travel                              │
│     $1,245.00 - Jan 15-18, 2026                               │
│     8 items: Flight, Hotel, Meals...                          │
│     [View Details] [Approve] [Reject]                          │
│                                                                │
│  ─────────────── Budget Amendments (1) ───────────────        │
│                                                                │
│  📊 Marketing - Q1 Increase Request                            │
│     +$50,000 for trade show booth                             │
│     Submitted by: Carol Johnson                               │
│     [View Budget] [Approve] [Reject]                           │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Actions**:
- Click [Approve] → Show ApprovalCard confirmation
- Click [Reject] → Show ConfirmDialog with reason input
- Click [View Details] → Expand inline or open modal
- Click item title → Navigate to source page

**Voice Narration**: "You have [n] pending approvals: [breakdown by type]. The oldest is from [name] submitted [days] ago."

**Empty State Voice**: "You don't have any outstanding approvals at this time."

---

#### QuarterlyReportDashboard

**Display Directive**: `display:finance:quarterly_report:quarter={Q4},year={2025}`

**Data Sources**:
- `GET /api/mcp/finance/get_arr`
- `GET /api/mcp/finance/get_arr_movement`
- `GET /api/mcp/finance/list_invoices` (aggregated)

**Layout**:
```
┌────────────────────────────────────────────────────────────────┐
│  Q4 2025 Financial Report                                      │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  Revenue     │  │  ARR         │  │  Net Income  │         │
│  │  $1.2M       │  │  $4.8M       │  │  $245K       │         │
│  │  ▲ 12% QoQ   │  │  ▲ 8% QoQ    │  │  ▲ 15% QoQ   │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│                                                                │
│  ─────────────── ARR Movement ───────────────                 │
│                                                                │
│  Starting ARR:     $4,450,000                                 │
│  + New:            +$320,000                                  │
│  + Expansion:      +$145,000                                  │
│  - Churn:          -$85,000                                   │
│  - Contraction:    -$30,000                                   │
│  ═══════════════════════════════                              │
│  Ending ARR:       $4,800,000                                 │
│                                                                │
│  ─────────────── Revenue by Segment ───────────────           │
│                                                                │
│  Enterprise:   $680,000  (57%)  ████████████████░░░           │
│  Mid-Market:   $380,000  (32%)  █████████░░░░░░░░░░           │
│  SMB:          $140,000  (11%)  ███░░░░░░░░░░░░░░░░           │
│                                                                │
│  [Download PDF]  [Compare to Q3]  [View Details]              │
└────────────────────────────────────────────────────────────────┘
```

**Actions**:
- Click segment → Drill down to customer list
- Click "Compare to Q3" → Side-by-side comparison
- Click "Download PDF" → Generate report

**Voice Narration**: "Q4 revenue was [amount], up [percent]% from last quarter. ARR grew to [arr] with [new] in new business and [churn] in churn."

---

## 4. Voice Integration

### 4.1 Voice Input (Speech-to-Text)

**Technology Options**:
| Option | Pros | Cons |
|--------|------|------|
| Web Speech API | Free, built-in, no API costs | Browser-dependent, limited accuracy |
| Whisper API (OpenAI) | High accuracy, multi-language | API cost, latency |
| Azure Speech | Enterprise-grade, real-time | API cost, complexity |
| Deepgram | Fast, accurate, streaming | API cost |

**Recommended**: Start with Web Speech API for v1.0, upgrade path to Whisper/Deepgram.

**UI Pattern**:
```
┌────────────────────────────────────────────────────────────┐
│                                                            │
│  ┌────────────────────────────────────────────────────┐   │
│  │  Show me my pending approvals                      │   │
│  │                                          🎤 [Send] │   │
│  └────────────────────────────────────────────────────┘   │
│                                                            │
│  🎤 Listening...  "Show me my pending..."                 │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

**Voice Commands**:
- "Show me [component]" → Display directive
- "What's my [metric]?" → Query + voice response
- "Approve [item]" → Action with confirmation
- "Tell me about [topic]" → Conversational response

### 4.2 Voice Output (Text-to-Speech)

**Technology Options**:
| Option | Pros | Cons |
|--------|------|------|
| Web Speech API | Free, built-in | Robotic voice, limited control |
| ElevenLabs | Natural voices, emotion | API cost, latency |
| Azure Neural TTS | Enterprise, SSML support | API cost |
| OpenAI TTS | High quality, simple API | API cost |

**Recommended**: Start with Web Speech API, upgrade to ElevenLabs for production.

**Voice Response Types**:

1. **Component Narration**: Summarizes displayed data
   ```
   Component: OrgChartComponent
   Narration: "You report to Alice Chen, VP of HR. You have 3 direct reports: Dan, Eva, and Frank."
   ```

2. **Empty State**: When no data matches
   ```
   Component: ApprovalsQueue (empty)
   Narration: "You don't have any outstanding approvals at this time."
   ```

3. **Contextual Assistance**: Helpful information
   ```
   Query: "I'm planning a business trip to Boston next week"
   Response: "Bring a warm coat - it will be around 20 degrees. Also, the Celtics have a playoff game that week, so hotels near TD Garden may be booked."
   ```

4. **Error/Warning**: When something needs attention
   ```
   Component: BudgetSummaryCard
   Narration: "Warning: Your software budget is at 60% with 6 months remaining. You may want to review upcoming renewals."
   ```

### 4.3 Voice Configuration

```typescript
interface VoiceConfig {
  // Input settings
  inputEnabled: boolean;
  inputLanguage: string;  // 'en-US', 'es-ES', etc.
  continuousListening: boolean;
  wakeWord?: string;  // "Hey Tamshai" (future)

  // Output settings
  outputEnabled: boolean;
  outputVoice: 'default' | 'natural';  // Web Speech vs ElevenLabs
  speakComponentNarration: boolean;
  speakEmptyStates: boolean;
  speakWarnings: boolean;

  // Preferences
  speed: number;  // 0.5 - 2.0
  volume: number; // 0.0 - 1.0
}
```

---

## 5. Display Directive Protocol

### 5.1 Directive Format

```
display:<domain>:<component>:<params>
```

**Examples**:
```
display:hr:org_chart:userId=me,depth=1
display:sales:customer:customerId=abc123
display:sales:leads:status=NEW,limit=10
display:sales:forecast:period=Q1 2026
display:finance:budget:department=Engineering,year=2026
display:approvals:pending:userId=me
display:finance:quarterly_report:quarter=Q4,year=2025
```

### 5.2 AI System Prompt Addition

```markdown
## Display Directives

When the user asks to view data that can be displayed as a rich component, emit a display directive instead of describing the data in text.

Available display directives:

| Directive | Use When |
|-----------|----------|
| `display:hr:org_chart:userId={id},depth={1\|2\|3}` | User asks about org chart, team structure, reports |
| `display:sales:customer:customerId={id}` | User asks about a specific customer/company |
| `display:sales:leads:status={status},limit={n}` | User asks about leads, pipeline, prospects |
| `display:sales:forecast:period={period}` | User asks about sales forecast, quota, targets |
| `display:finance:budget:department={dept},year={year}` | User asks about budget, spending |
| `display:approvals:pending:userId=me` | User asks about pending approvals, things to review |
| `display:finance:quarterly_report:quarter={Q},year={YYYY}` | User asks about quarterly financials, reports |

After emitting the directive, you may add a brief voice narration context. The narration will be generated from the actual data by the MCP UI Service.

Example:
User: "Show me my org chart"
You: display:hr:org_chart:userId=me,depth=1

User: "What approvals do I have?"
You: display:approvals:pending:userId=me

User: "How's our Q4 looking?"
You: display:finance:quarterly_report:quarter=Q4,year=2025
```

### 5.3 Contextual Responses (Non-Display)

For conversational queries that don't map to a component, the AI responds normally:

```
User: "I'm planning a business trip to Boston next week. Anything I should know?"

AI: [No display directive - conversational response]
"A few things to keep in mind for your Boston trip:

🌡️ Weather: It'll be around 20°F (-6°C) next week. Pack warm layers and a heavy coat.

🏀 Events: The Celtics have a playoff game on Thursday. Hotels near TD Garden will be pricey and traffic will be heavy.

✈️ Travel: If flying into Logan, the Blue Line to downtown is the fastest option during game days.

💼 Business: Do you want me to check your calendar for any conflicts or pull up the customer you're visiting?"
```

---

## 6. MCP UI Service Design

### 6.1 Service Overview

**Port**: 3108 (new service)
**Purpose**: Parse display directives, fetch data, return component definitions

### 6.2 API Endpoints

#### POST /api/display

Parse display directive and return component + data.

**Request**:
```json
{
  "directive": "display:hr:org_chart:userId=me,depth=1",
  "userContext": {
    "userId": "abc-123",
    "roles": ["hr-read", "manager"]
  }
}
```

**Response**:
```json
{
  "status": "success",
  "component": {
    "type": "OrgChartComponent",
    "props": {
      "manager": {
        "id": "mgr-1",
        "name": "Alice Chen",
        "title": "VP of HR",
        "email": "alice.chen@tamshai.com",
        "avatarUrl": "/avatars/alice.jpg"
      },
      "self": {
        "id": "abc-123",
        "name": "Marcus Johnson",
        "title": "Software Engineer",
        "email": "marcus.j@tamshai.com"
      },
      "peers": [...],
      "directReports": [...]
    },
    "actions": [
      { "type": "navigate", "target": "/hr/employees/:id" },
      { "type": "expand", "loadMore": "display:hr:employee:id={id}" }
    ]
  },
  "narration": {
    "text": "You report to Alice Chen, VP of HR. You have 3 direct reports.",
    "ssml": "<speak>You report to <emphasis>Alice Chen</emphasis>, VP of HR. You have 3 direct reports.</speak>"
  },
  "metadata": {
    "dataFreshness": "2026-02-07T10:30:00Z",
    "truncated": false
  }
}
```

#### GET /api/display/components

List available components for system prompt generation.

**Response**:
```json
{
  "components": [
    {
      "type": "OrgChartComponent",
      "directivePattern": "display:hr:org_chart:userId={id},depth={1|2|3}",
      "description": "Hierarchical org chart visualization",
      "triggers": ["org chart", "team structure", "who reports to", "direct reports"]
    },
    ...
  ]
}
```

### 6.3 Component Registry

```typescript
interface ComponentDefinition {
  type: string;
  directivePattern: RegExp;
  mcpCalls: MCPCall[];
  transform: (data: any) => ComponentProps;
  generateNarration: (data: any) => Narration;
  actions: ActionDefinition[];
}

const componentRegistry: Record<string, ComponentDefinition> = {
  'org_chart': {
    type: 'OrgChartComponent',
    directivePattern: /^display:hr:org_chart:(.+)$/,
    mcpCalls: [
      { server: 'hr', tool: 'get_org_chart', paramMap: { userId: 'userId', maxDepth: 'depth' } }
    ],
    transform: (data) => ({
      manager: data.manager,
      self: data.employee,
      peers: data.peers || [],
      directReports: data.directReports || []
    }),
    generateNarration: (data) => ({
      text: `You report to ${data.manager?.name || 'no one'}. You have ${data.directReports?.length || 0} direct reports.`,
    }),
    actions: [
      { type: 'navigate', pattern: '/hr/employees/{id}' },
      { type: 'drilldown', directive: 'display:hr:employee:id={id}' }
    ]
  },
  // ... more components
};
```

---

## 7. Client Implementation

### 7.0 Client Technology Stack

| Client | Technology | Voice API | Notes |
|--------|------------|-----------|-------|
| Web | React/TypeScript | Web Speech API | Primary development target |
| Desktop (Windows/Mac) | Flutter/Dart | Platform native | OAuth works reliably with Flutter |

**Why Flutter for Desktop?** Electron and React-based desktop approaches faced significant OAuth/OIDC integration challenges. Flutter's native platform channels provide reliable OAuth flows on Windows and macOS.

### 7.1 Web Component Library (React)

Located in `clients/web/packages/ui/src/components/generative/`:

```
generative/
├── OrgChartComponent.tsx
├── CustomerDetailCard.tsx
├── LeadsDataTable.tsx
├── ForecastChart.tsx
├── BudgetSummaryCard.tsx
├── ApprovalsQueue.tsx
├── QuarterlyReportDashboard.tsx
├── ComponentRenderer.tsx      # Dynamic renderer
├── VoiceInput.tsx             # Microphone button + speech-to-text
├── VoiceOutput.tsx            # Text-to-speech player
└── index.ts
```

### 7.2 ComponentRenderer

```tsx
interface ComponentRendererProps {
  component: ComponentResponse;
  onAction: (action: ActionEvent) => void;
  voiceEnabled: boolean;
}

function ComponentRenderer({ component, onAction, voiceEnabled }: ComponentRendererProps) {
  const { speak } = useVoiceOutput();

  useEffect(() => {
    if (voiceEnabled && component.narration) {
      speak(component.narration.text);
    }
  }, [component, voiceEnabled]);

  const Component = componentMap[component.type];
  if (!Component) {
    return <UnknownComponentFallback />;
  }

  return (
    <Component
      {...component.props}
      onAction={onAction}
    />
  );
}
```

### 7.3 Voice Hooks

```typescript
// useVoiceInput.ts
function useVoiceInput() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');

  const startListening = useCallback(() => {
    const recognition = new webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      setTranscript(event.results[0][0].transcript);
    };
    recognition.start();
    setIsListening(true);
  }, []);

  return { isListening, transcript, startListening, stopListening };
}

// useVoiceOutput.ts
function useVoiceOutput() {
  const speak = useCallback((text: string) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    speechSynthesis.speak(utterance);
  }, []);

  return { speak, stop: () => speechSynthesis.cancel() };
}
```

### 7.4 Flutter/Dart Desktop Implementation

Located in `clients/flutter/lib/components/generative/`:

```
generative/
├── org_chart_component.dart
├── customer_detail_card.dart
├── leads_data_table.dart
├── forecast_chart.dart
├── budget_summary_card.dart
├── approvals_queue.dart
├── quarterly_report_dashboard.dart
├── component_renderer.dart
├── voice_input.dart
└── voice_output.dart
```

**Voice Integration (Flutter)**:

```dart
// voice_service.dart
import 'package:speech_to_text/speech_to_text.dart';
import 'package:flutter_tts/flutter_tts.dart';

class VoiceService {
  final SpeechToText _speechToText = SpeechToText();
  final FlutterTts _flutterTts = FlutterTts();

  Future<void> initialize() async {
    await _speechToText.initialize();
    await _flutterTts.setLanguage('en-US');
    await _flutterTts.setSpeechRate(1.0);
  }

  Future<String> listen() async {
    String transcript = '';
    await _speechToText.listen(
      onResult: (result) => transcript = result.recognizedWords,
    );
    return transcript;
  }

  Future<void> speak(String text) async {
    await _flutterTts.speak(text);
  }

  Future<void> stop() async {
    await _flutterTts.stop();
  }
}
```

**Component Renderer (Flutter)**:

```dart
// component_renderer.dart
class ComponentRenderer extends StatelessWidget {
  final ComponentResponse component;
  final Function(ActionEvent) onAction;
  final bool voiceEnabled;
  final VoiceService voiceService;

  @override
  Widget build(BuildContext context) {
    if (voiceEnabled && component.narration != null) {
      voiceService.speak(component.narration!.text);
    }

    switch (component.type) {
      case 'OrgChartComponent':
        return OrgChartComponent(
          props: component.props,
          onAction: onAction,
        );
      case 'ApprovalsQueue':
        return ApprovalsQueue(
          props: component.props,
          onAction: onAction,
        );
      // ... other components
      default:
        return UnknownComponentFallback();
    }
  }
}
```

**Platform-Specific Voice APIs**:

| Platform | Speech-to-Text | Text-to-Speech |
|----------|----------------|----------------|
| Windows | `speech_to_text` plugin (uses Windows Speech API) | `flutter_tts` (uses SAPI) |
| macOS | `speech_to_text` plugin (uses Speech Framework) | `flutter_tts` (uses AVSpeechSynthesizer) |

---

## 8. Implementation Phases

### Phase 1: Foundation (Week 1-2)

- [ ] Create MCP UI Service skeleton (port 3108)
- [ ] Implement display directive parser
- [ ] Create ComponentRenderer in UI package
- [ ] Add voice input (Web Speech API)
- [ ] Add voice output (Web Speech API)

### Phase 2: Priority Components (Week 3-4)

- [ ] OrgChartComponent + MCP integration
- [ ] ApprovalsQueue (cross-domain aggregation)
- [ ] CustomerDetailCard
- [ ] LeadsDataTable with pagination

### Phase 3: Advanced Components (Week 5-6)

- [ ] ForecastChart with D3/Recharts
- [ ] BudgetSummaryCard
- [ ] QuarterlyReportDashboard

### Phase 4: Polish & Desktop (Week 7-8)

- [ ] Desktop (Flutter/Dart) voice integration
- [ ] Narration quality improvements
- [ ] Action handling refinements
- [ ] E2E testing

---

## 9. Future Extensibility

### 9.1 Dynamic Refresh (v2.0)

```typescript
interface ComponentResponse {
  // ... existing fields
  refresh?: {
    enabled: boolean;
    intervalMs: number;
    directive: string;  // Re-fetch directive
  };
}
```

### 9.2 Write Forms (v2.0)

```
display:hr:time_off_form:type=vacation
display:finance:expense_form:reportId=new
display:sales:lead_form:leadId=abc123
```

### 9.3 Mobile-Optimized Components (v3.0)

Simplified layouts for tablet/phone screens.

### 9.4 Wake Word Activation (v3.0)

"Hey Tamshai, show me my approvals"

---

## 10. Success Metrics

| Metric | Target |
|--------|--------|
| AI tokens per display directive | < 50 tokens |
| Time to first component render | < 2 seconds |
| Voice recognition accuracy | > 95% |
| User satisfaction (voice) | > 4.0/5.0 |
| Component coverage of common queries | > 80% |

---

## Appendix A: Component Props Interfaces

```typescript
interface OrgChartProps {
  manager?: Employee;
  self: Employee;
  peers: Employee[];
  directReports: Employee[];
  onEmployeeClick: (employee: Employee) => void;
}

interface CustomerDetailCardProps {
  customer: Customer;
  contacts: Contact[];
  opportunities: OpportunitySummary[];
  onOpportunityClick: (id: string) => void;
  onContactClick: (id: string) => void;
}

interface LeadsDataTableProps {
  leads: Lead[];
  pagination: PaginationState;
  filters: LeadFilters;
  onFilterChange: (filters: LeadFilters) => void;
  onPageChange: (cursor: string) => void;
  onRowClick: (lead: Lead) => void;
}

interface ForecastChartProps {
  period: string;
  quota: number;
  commit: number;
  bestCase: number;
  closed: number;
  byRep: RepForecast[];
  pipeline: PipelineStage[];
}

interface BudgetSummaryCardProps {
  department: string;
  year: number;
  totalBudget: number;
  spent: number;
  categories: BudgetCategory[];
  warnings: string[];
  onCategoryClick: (category: string) => void;
}

interface ApprovalsQueueProps {
  timeOffRequests: TimeOffRequest[];
  expenseReports: ExpenseReport[];
  budgetAmendments: BudgetAmendment[];
  onApprove: (type: string, id: string) => void;
  onReject: (type: string, id: string, reason?: string) => void;
  onViewDetails: (type: string, id: string) => void;
}

interface QuarterlyReportProps {
  quarter: string;
  year: number;
  revenue: number;
  arr: number;
  netIncome: number;
  arrMovement: ARRMovement;
  revenueBySegment: SegmentRevenue[];
  comparePeriod?: QuarterlyReportProps;
}
```

---

## Appendix B: Voice Narration Templates

```typescript
const narrationTemplates = {
  org_chart: {
    withManager: "You report to {managerName}, {managerTitle}. You have {reportCount} direct reports.",
    noManager: "You are at the top of this org chart with {reportCount} direct reports.",
    withPeers: "You have {peerCount} peers at your level.",
  },

  approvals: {
    hasItems: "You have {total} pending approvals: {breakdown}. The oldest is from {oldestName} submitted {daysAgo} days ago.",
    empty: "You don't have any outstanding approvals at this time.",
  },

  budget: {
    onTrack: "{department} has spent {percent}% of their {year} budget. You're on track for the year.",
    warning: "{department} has spent {percent}% of their {year} budget. Warning: {category} is at {categoryPercent}% with {monthsRemaining} months remaining.",
  },

  forecast: {
    onTrack: "Your team is at {percent}% of quota for {period}. You need {remaining} more to hit target.",
    aheadOfPlan: "Great news! Your team is at {percent}% of quota for {period}, ahead of schedule.",
    behindPlan: "Your team is at {percent}% of quota for {period}. You may need to accelerate {topDeals} to hit target.",
  },
};
```
