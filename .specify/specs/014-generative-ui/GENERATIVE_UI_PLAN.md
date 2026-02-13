# Plan: Generative UI Implementation

**Goal**: Implement AI-driven UI components with voice support based on GENERATIVE_UI_SPEC.md

**Specification**: `.specify/specs/014-generative-ui/GENERATIVE_UI_SPEC.md`

**Methodology**: TDD (RED-GREEN-REFACTOR) with parallel agent execution

---

## TDD Execution Strategy

### Agent Roles

| Agent | Role | Responsibility |
|-------|------|----------------|
| **RED Agent** | Test Writer | Write failing tests that define expected behavior. Tests MUST fail initially. |
| **GREEN Agent** | Implementer | Write minimum code to make tests pass. No over-engineering. |
| **REFACTOR** | Main Agent | Review, refactor, and verify after GREEN completes. |

### Workflow Per Module

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   RED AGENT     │────▶│  GREEN AGENT    │────▶│    REFACTOR     │
│                 │     │                 │     │                 │
│ 1. Read spec    │     │ 1. Read tests   │     │ 1. Run all tests│
│ 2. Write tests  │     │ 2. Implement    │     │ 2. Review code  │
│ 3. Verify FAIL  │     │ 3. Verify PASS  │     │ 3. Clean up     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Parallel Execution Rules

1. **RED agents can run in parallel** for independent modules
2. **GREEN agents MUST wait** for corresponding RED agent to complete
3. **Multiple GREEN agents can run in parallel** once their RED phase is done
4. **REFACTOR happens sequentially** after each GREEN completes

---

## Phase Overview (TDD Structure)

| Phase | Module | RED Agent | GREEN Agent | Effort |
|-------|--------|-----------|-------------|--------|
| 1 | MCP UI Service Skeleton | 1.RED | 1.GREEN | 1 day |
| 2 | Directive Parser | 2.RED | 2.GREEN | 0.5 day |
| 3 | Component Registry | 3.RED | 3.GREEN | 1 day |
| 4 | MCP Client | 4.RED | 4.GREEN | 0.5 day |
| 5 | Display Endpoint | 5.RED | 5.GREEN | 1 day |
| 6 | React: ComponentRenderer | 6.RED | 6.GREEN | 0.5 day |
| 7 | React: OrgChartComponent | 7.RED | 7.GREEN | 1 day |
| 8 | React: ApprovalsQueue | 8.RED | 8.GREEN | 1 day |
| 9 | React: Other Components (5) | 9.RED | 9.GREEN | 2 days |
| 10 | Voice Hooks (Web) | 10.RED | 10.GREEN | 1 day |
| 11 | Flutter Components | 11.RED | 11.GREEN | 2 days |
| 12 | Integration Tests | 12.RED | 12.GREEN | 1 day |
| 13 | E2E Tests | 13.RED | 13.GREEN | 1 day |

**Total**: ~13 days with parallel execution

---

## Phase 1: MCP UI Service Skeleton

### 1.RED: Write Failing Tests

**Agent Assignment**: RED Agent (Test Writer)

**Files to Create**:
- `services/mcp-ui/src/__tests__/health.test.ts`
- `services/mcp-ui/src/__tests__/server.test.ts`

**Test Specifications**:

```typescript
// src/__tests__/health.test.ts
describe('Health Endpoint', () => {
  it('should return 200 with healthy status', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'healthy',
      service: 'mcp-ui',
      version: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it('should include ISO timestamp', async () => {
    const response = await request(app).get('/health');
    expect(new Date(response.body.timestamp).toISOString()).toBe(response.body.timestamp);
  });
});

// src/__tests__/server.test.ts
describe('Server Configuration', () => {
  it('should listen on configured PORT', () => {
    expect(process.env.PORT || '3108').toBe('3108');
  });

  it('should accept JSON requests', async () => {
    const response = await request(app)
      .post('/api/display')
      .send({ test: true })
      .set('Content-Type', 'application/json');
    // Should not return 415 Unsupported Media Type
    expect(response.status).not.toBe(415);
  });

  it('should handle graceful shutdown', async () => {
    // Test SIGTERM handler exists
    const listeners = process.listeners('SIGTERM');
    expect(listeners.length).toBeGreaterThan(0);
  });
});
```

**Verification**: `npm test` should show RED (failing) tests

---

### 1.GREEN: Implement to Pass Tests

**Agent Assignment**: GREEN Agent (Implementer)

**Files to Create**:
```
services/mcp-ui/
├── src/
│   ├── index.ts
│   ├── app.ts                 # Express app (testable)
│   ├── types/
│   │   ├── response.ts
│   │   └── component.ts
│   └── utils/
│       └── logger.ts
├── package.json
├── tsconfig.json
├── jest.config.js
└── Dockerfile
```

**Implementation Requirements**:
1. Create Express app in `app.ts` (exportable for testing)
2. Create server startup in `index.ts`
3. Implement `/health` endpoint matching test expectations
4. Add JSON body parsing middleware
5. Add SIGTERM graceful shutdown handler

**Verification**: `npm test` should show GREEN (passing) tests

---

## Phase 2: Directive Parser

### 2.RED: Write Failing Tests

**Agent Assignment**: RED Agent

**File**: `services/mcp-ui/src/parser/__tests__/directive-parser.test.ts`

```typescript
import { parseDirective, ParsedDirective } from '../directive-parser';

describe('DirectiveParser', () => {
  describe('Valid Directives', () => {
    it('parses hr:org_chart directive', () => {
      const result = parseDirective('display:hr:org_chart:userId=me,depth=1');
      expect(result).toEqual({
        domain: 'hr',
        component: 'org_chart',
        params: { userId: 'me', depth: '1' },
      });
    });

    it('parses sales:customer directive', () => {
      const result = parseDirective('display:sales:customer:customerId=abc123');
      expect(result).toEqual({
        domain: 'sales',
        component: 'customer',
        params: { customerId: 'abc123' },
      });
    });

    it('parses approvals:pending directive', () => {
      const result = parseDirective('display:approvals:pending:userId=me');
      expect(result).toEqual({
        domain: 'approvals',
        component: 'pending',
        params: { userId: 'me' },
      });
    });

    it('handles empty params', () => {
      const result = parseDirective('display:finance:summary:');
      expect(result).toEqual({
        domain: 'finance',
        component: 'summary',
        params: {},
      });
    });

    it('trims whitespace from params', () => {
      const result = parseDirective('display:hr:org_chart:userId = me , depth = 2');
      expect(result?.params).toEqual({ userId: 'me', depth: '2' });
    });
  });

  describe('Invalid Directives', () => {
    it('returns null for missing prefix', () => {
      expect(parseDirective('hr:org_chart:userId=me')).toBeNull();
    });

    it('returns null for malformed format', () => {
      expect(parseDirective('display:hr')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseDirective('')).toBeNull();
    });

    it('returns null for non-display prefix', () => {
      expect(parseDirective('render:hr:org_chart:userId=me')).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('handles params with special characters in values', () => {
      const result = parseDirective('display:sales:customer:email=test@example.com');
      expect(result?.params.email).toBe('test@example.com');
    });

    it('handles multiple equals signs in value', () => {
      const result = parseDirective('display:hr:search:query=name=John');
      expect(result?.params.query).toBe('name=John');
    });
  });
});
```

**Verification**: Tests should FAIL (module doesn't exist)

---

### 2.GREEN: Implement Parser

**Agent Assignment**: GREEN Agent

**File**: `services/mcp-ui/src/parser/directive-parser.ts`

```typescript
export interface ParsedDirective {
  domain: string;
  component: string;
  params: Record<string, string>;
}

export function parseDirective(directive: string): ParsedDirective | null {
  if (!directive) return null;

  const match = directive.match(/^display:(\w+):(\w+):(.*)$/);
  if (!match) return null;

  const [, domain, component, paramString] = match;
  const params = parseParams(paramString);

  return { domain, component, params };
}

function parseParams(paramString: string): Record<string, string> {
  const params: Record<string, string> = {};
  if (!paramString) return params;

  for (const pair of paramString.split(',')) {
    const eqIndex = pair.indexOf('=');
    if (eqIndex === -1) continue;

    const key = pair.slice(0, eqIndex).trim();
    const value = pair.slice(eqIndex + 1).trim();
    if (key) params[key] = value;
  }
  return params;
}
```

**Verification**: All parser tests should PASS

---

## Phase 3: Component Registry

### 3.RED: Write Failing Tests

**Agent Assignment**: RED Agent

**File**: `services/mcp-ui/src/registry/__tests__/component-registry.test.ts`

```typescript
import {
  componentRegistry,
  getComponentDefinition,
  listComponents,
  ComponentDefinition
} from '../component-registry';

describe('ComponentRegistry', () => {
  describe('Registry Contents', () => {
    it('contains hr:org_chart component', () => {
      const def = getComponentDefinition('hr', 'org_chart');
      expect(def).toBeDefined();
      expect(def?.type).toBe('OrgChartComponent');
    });

    it('contains sales:customer component', () => {
      const def = getComponentDefinition('sales', 'customer');
      expect(def).toBeDefined();
      expect(def?.type).toBe('CustomerDetailCard');
    });

    it('contains sales:leads component', () => {
      const def = getComponentDefinition('sales', 'leads');
      expect(def?.type).toBe('LeadsDataTable');
    });

    it('contains sales:forecast component', () => {
      const def = getComponentDefinition('sales', 'forecast');
      expect(def?.type).toBe('ForecastChart');
    });

    it('contains finance:budget component', () => {
      const def = getComponentDefinition('finance', 'budget');
      expect(def?.type).toBe('BudgetSummaryCard');
    });

    it('contains approvals:pending component', () => {
      const def = getComponentDefinition('approvals', 'pending');
      expect(def?.type).toBe('ApprovalsQueue');
    });

    it('contains finance:quarterly_report component', () => {
      const def = getComponentDefinition('finance', 'quarterly_report');
      expect(def?.type).toBe('QuarterlyReportDashboard');
    });

    it('has 7 registered components', () => {
      expect(listComponents().length).toBe(7);
    });
  });

  describe('Component Definition Structure', () => {
    it('each component has required fields', () => {
      for (const def of listComponents()) {
        expect(def.type).toBeDefined();
        expect(def.domain).toBeDefined();
        expect(def.component).toBeDefined();
        expect(def.mcpCalls).toBeInstanceOf(Array);
        expect(typeof def.transform).toBe('function');
        expect(typeof def.generateNarration).toBe('function');
      }
    });

    it('mcpCalls have server, tool, and paramMap', () => {
      const orgChart = getComponentDefinition('hr', 'org_chart');
      expect(orgChart?.mcpCalls[0]).toEqual({
        server: 'hr',
        tool: 'get_org_chart',
        paramMap: expect.any(Object),
      });
    });
  });

  describe('Transform Functions', () => {
    it('org_chart transform extracts expected props', () => {
      const def = getComponentDefinition('hr', 'org_chart');
      const mockData = {
        manager: { id: '1', name: 'Manager' },
        employee: { id: '2', name: 'Self' },
        peers: [],
        directReports: [{ id: '3', name: 'Report' }],
      };
      const props = def?.transform(mockData);
      expect(props).toEqual({
        manager: mockData.manager,
        self: mockData.employee,
        peers: [],
        directReports: mockData.directReports,
      });
    });
  });

  describe('Narration Generation', () => {
    it('org_chart generates narration mentioning manager', () => {
      const def = getComponentDefinition('hr', 'org_chart');
      const mockData = {
        manager: { name: 'Alice Chen' },
        directReports: [{ id: '1' }, { id: '2' }],
      };
      const narration = def?.generateNarration(mockData, {});
      expect(narration?.text).toContain('Alice Chen');
      expect(narration?.text).toContain('2');
    });

    it('approvals generates narration with counts', () => {
      const def = getComponentDefinition('approvals', 'pending');
      const mockData = {
        timeOffRequests: [{}, {}],
        expenseReports: [{}],
        budgetAmendments: [],
      };
      const narration = def?.generateNarration(mockData, {});
      expect(narration?.text).toContain('3'); // total count
    });
  });

  describe('Unknown Components', () => {
    it('returns undefined for unknown domain', () => {
      expect(getComponentDefinition('unknown', 'chart')).toBeUndefined();
    });

    it('returns undefined for unknown component', () => {
      expect(getComponentDefinition('hr', 'unknown')).toBeUndefined();
    });
  });
});
```

---

### 3.GREEN: Implement Component Registry

**Agent Assignment**: GREEN Agent

**File**: `services/mcp-ui/src/registry/component-registry.ts`

Implement all 7 component definitions with:
- MCP call configurations
- Transform functions
- Narration generators

---

## Phase 4: MCP Client

### 4.RED: Write Failing Tests

**File**: `services/mcp-ui/src/mcp/__tests__/mcp-client.test.ts`

```typescript
import { callMCPTool, MCPCall } from '../mcp-client';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('MCPClient', () => {
  const mockUserContext = {
    userId: 'user-123',
    roles: ['hr-read', 'finance-read'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('callMCPTool', () => {
    it('calls correct MCP endpoint', async () => {
      mockedAxios.get.mockResolvedValue({ data: { status: 'success', data: {} } });

      const call: MCPCall = {
        server: 'hr',
        tool: 'get_org_chart',
        paramMap: { userId: 'userId' },
      };

      await callMCPTool(call, { userId: 'me' }, mockUserContext);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/mcp/hr/get_org_chart'),
        expect.any(Object)
      );
    });

    it('maps directive params to tool params', async () => {
      mockedAxios.get.mockResolvedValue({ data: { status: 'success', data: {} } });

      const call: MCPCall = {
        server: 'hr',
        tool: 'get_org_chart',
        paramMap: { userId: 'userId', maxDepth: 'depth' },
      };

      await callMCPTool(call, { userId: 'me', depth: '2' }, mockUserContext);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: { userId: 'me', maxDepth: '2' },
        })
      );
    });

    it('includes user context in headers', async () => {
      mockedAxios.get.mockResolvedValue({ data: { status: 'success', data: {} } });

      const call: MCPCall = { server: 'hr', tool: 'list', paramMap: {} };
      await callMCPTool(call, {}, mockUserContext);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: {
            'X-User-ID': 'user-123',
            'X-User-Roles': 'hr-read,finance-read',
          },
        })
      );
    });

    it('returns response data on success', async () => {
      const mockResponse = { status: 'success', data: { employee: { name: 'Test' } } };
      mockedAxios.get.mockResolvedValue({ data: mockResponse });

      const call: MCPCall = { server: 'hr', tool: 'get', paramMap: {} };
      const result = await callMCPTool(call, {}, mockUserContext);

      expect(result).toEqual(mockResponse);
    });

    it('throws on network error', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network Error'));

      const call: MCPCall = { server: 'hr', tool: 'get', paramMap: {} };

      await expect(callMCPTool(call, {}, mockUserContext)).rejects.toThrow('Network Error');
    });
  });
});
```

---

### 4.GREEN: Implement MCP Client

**Agent Assignment**: GREEN Agent

**File**: `services/mcp-ui/src/mcp/mcp-client.ts`

---

## Phase 5: Display Endpoint

### 5.RED: Write Failing Tests

**File**: `services/mcp-ui/src/routes/__tests__/display.test.ts`

```typescript
import request from 'supertest';
import { app } from '../../app';

// Mock MCP client
jest.mock('../../mcp/mcp-client');

describe('POST /api/display', () => {
  const validRequest = {
    directive: 'display:hr:org_chart:userId=me,depth=1',
    userContext: { userId: 'user-123', roles: ['hr-read'] },
  };

  describe('Success Cases', () => {
    it('returns component for valid directive', async () => {
      const response = await request(app)
        .post('/api/display')
        .send(validRequest);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.component.type).toBe('OrgChartComponent');
    });

    it('includes narration in response', async () => {
      const response = await request(app)
        .post('/api/display')
        .send(validRequest);

      expect(response.body.narration).toBeDefined();
      expect(response.body.narration.text).toBeDefined();
    });

    it('includes metadata with timestamp', async () => {
      const response = await request(app)
        .post('/api/display')
        .send(validRequest);

      expect(response.body.metadata.dataFreshness).toBeDefined();
    });
  });

  describe('Error Cases', () => {
    it('returns 400 for invalid directive format', async () => {
      const response = await request(app)
        .post('/api/display')
        .send({ ...validRequest, directive: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('INVALID_DIRECTIVE');
      expect(response.body.suggestedAction).toBeDefined();
    });

    it('returns 404 for unknown component', async () => {
      const response = await request(app)
        .post('/api/display')
        .send({ ...validRequest, directive: 'display:unknown:thing:id=1' });

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('UNKNOWN_COMPONENT');
    });

    it('returns 400 for missing directive', async () => {
      const response = await request(app)
        .post('/api/display')
        .send({ userContext: validRequest.userContext });

      expect(response.status).toBe(400);
    });

    it('returns 400 for missing userContext', async () => {
      const response = await request(app)
        .post('/api/display')
        .send({ directive: validRequest.directive });

      expect(response.status).toBe(400);
    });
  });
});

describe('GET /api/display/components', () => {
  it('returns list of available components', async () => {
    const response = await request(app).get('/api/display/components');

    expect(response.status).toBe(200);
    expect(response.body.components).toBeInstanceOf(Array);
    expect(response.body.components.length).toBe(7);
  });

  it('each component has type and directive pattern', async () => {
    const response = await request(app).get('/api/display/components');

    for (const comp of response.body.components) {
      expect(comp.type).toBeDefined();
      expect(comp.directivePattern).toMatch(/^display:\w+:\w+:/);
    }
  });
});
```

---

### 5.GREEN: Implement Display Routes

**Agent Assignment**: GREEN Agent

**File**: `services/mcp-ui/src/routes/display.ts`

---

## Phase 6-9: React Components

### RED Agent Tasks (Can Run in Parallel)

| Task | Test File | Test Count |
|------|-----------|------------|
| 6.RED | `ComponentRenderer.test.tsx` | ~10 tests |
| 7.RED | `OrgChartComponent.test.tsx` | ~15 tests |
| 8.RED | `ApprovalsQueue.test.tsx` | ~20 tests |
| 9.RED | `CustomerDetailCard.test.tsx`, `LeadsDataTable.test.tsx`, `ForecastChart.test.tsx`, `BudgetSummaryCard.test.tsx`, `QuarterlyReportDashboard.test.tsx` | ~50 tests |

### GREEN Agent Tasks (After Corresponding RED)

| Task | Implementation File |
|------|---------------------|
| 6.GREEN | `ComponentRenderer.tsx` |
| 7.GREEN | `OrgChartComponent.tsx`, `EmployeeCard.tsx` |
| 8.GREEN | `ApprovalsQueue.tsx`, `ApprovalSection.tsx` |
| 9.GREEN | 5 remaining components |

---

## Phase 10: Voice Hooks

### 10.RED: Write Failing Tests

**Files**:
- `clients/web/packages/ui/src/hooks/__tests__/useVoiceInput.test.ts`
- `clients/web/packages/ui/src/hooks/__tests__/useVoiceOutput.test.ts`

```typescript
// useVoiceInput.test.ts
describe('useVoiceInput', () => {
  it('initializes with isListening false', () => {
    const { result } = renderHook(() => useVoiceInput());
    expect(result.current.isListening).toBe(false);
  });

  it('sets isListening true when startListening called', () => {
    const { result } = renderHook(() => useVoiceInput());
    act(() => result.current.startListening());
    expect(result.current.isListening).toBe(true);
  });

  it('sets error when speech recognition not supported', () => {
    // Mock window without webkitSpeechRecognition
    const { result } = renderHook(() => useVoiceInput());
    act(() => result.current.startListening());
    expect(result.current.error).toBe('Speech recognition not supported');
  });

  it('updates transcript on recognition result', () => {
    // Mock recognition with result event
  });

  it('sets isListening false on stopListening', () => {
    const { result } = renderHook(() => useVoiceInput());
    act(() => result.current.startListening());
    act(() => result.current.stopListening());
    expect(result.current.isListening).toBe(false);
  });
});

// useVoiceOutput.test.ts
describe('useVoiceOutput', () => {
  it('calls speechSynthesis.speak with utterance', () => {
    const mockSpeak = jest.fn();
    global.speechSynthesis = { speak: mockSpeak } as any;

    const { result } = renderHook(() => useVoiceOutput());
    act(() => result.current.speak('Hello world'));

    expect(mockSpeak).toHaveBeenCalled();
  });

  it('cancels speech on stop', () => {
    const mockCancel = jest.fn();
    global.speechSynthesis = { cancel: mockCancel } as any;

    const { result } = renderHook(() => useVoiceOutput());
    act(() => result.current.stop());

    expect(mockCancel).toHaveBeenCalled();
  });

  it('handles missing speechSynthesis gracefully', () => {
    delete (global as any).speechSynthesis;

    const { result } = renderHook(() => useVoiceOutput());
    expect(() => result.current.speak('test')).not.toThrow();
  });
});
```

---

## Phase 11: Flutter Components

### 11.RED: Write Failing Tests

**Files**:
- `test/features/generative/display_service_test.dart`
- `test/features/generative/component_renderer_test.dart`
- `test/features/generative/org_chart_component_test.dart`

```dart
// display_service_test.dart
void main() {
  group('DisplayService', () {
    late DisplayService service;
    late MockDio mockDio;

    setUp(() {
      mockDio = MockDio();
      service = DisplayService(dio: mockDio, logger: Logger());
    });

    test('fetchComponent returns ComponentResponse on success', () async {
      when(mockDio.post(any, data: anyNamed('data'))).thenAnswer(
        (_) async => Response(
          data: {
            'status': 'success',
            'component': {'type': 'OrgChartComponent', 'props': {}},
          },
          statusCode: 200,
          requestOptions: RequestOptions(path: ''),
        ),
      );

      final result = await service.fetchComponent(
        'display:hr:org_chart:userId=me',
        UserContext(userId: 'test', roles: ['hr-read']),
      );

      expect(result.type, equals('OrgChartComponent'));
    });

    test('fetchComponent throws DisplayException on error', () async {
      when(mockDio.post(any, data: anyNamed('data'))).thenAnswer(
        (_) async => Response(
          data: {'status': 'error', 'code': 'UNKNOWN_COMPONENT'},
          statusCode: 404,
          requestOptions: RequestOptions(path: ''),
        ),
      );

      expect(
        () => service.fetchComponent('display:unknown:thing:', UserContext(...)),
        throwsA(isA<DisplayException>()),
      );
    });
  });
}
```

---

## Phase 12-13: Integration & E2E Tests

### 12.RED: Integration Test Specifications

**File**: `services/mcp-ui/src/__tests__/integration/generative-ui.integration.test.ts`

Tests require running services - validates full flow from directive to component response.

### 13.RED: E2E Test Specifications

**File**: `tests/e2e/specs/generative-ui.spec.ts`

Tests browser-based flows including voice interaction simulation.

---

## Task Dependency Graph

```
Phase 1 (Skeleton)
    1.RED ──────────▶ 1.GREEN ──▶ Docker Setup
       │
       ▼
Phase 2-5 (Backend) - Can run in parallel after Phase 1
    2.RED ──▶ 2.GREEN (Parser)
    3.RED ──▶ 3.GREEN (Registry)    ──┐
    4.RED ──▶ 4.GREEN (MCP Client)  ──┼──▶ 5.RED ──▶ 5.GREEN (Display)
                                      │
Phase 6-10 (Frontend) - Can run after Phase 5
    6.RED ──▶ 6.GREEN (Renderer)
    7.RED ──▶ 7.GREEN (OrgChart)     } Can run in parallel
    8.RED ──▶ 8.GREEN (Approvals)    }
    9.RED ──▶ 9.GREEN (Others)       }
   10.RED ──▶ 10.GREEN (Voice)

Phase 11 (Flutter) - Can run parallel to Phase 6-10
   11.RED ──▶ 11.GREEN

Phase 12-13 (Testing) - After all implementation
   12.RED ──▶ 12.GREEN (Integration)
   13.RED ──▶ 13.GREEN (E2E)
```

---

## Agent Execution Commands

### Launch RED Agents (Parallel)

```bash
# Phase 1 RED
claude-agent --type=RED --module=mcp-ui-skeleton --output=services/mcp-ui/src/__tests__/

# After Phase 1 GREEN completes, launch Phases 2-4 RED in parallel:
claude-agent --type=RED --module=directive-parser &
claude-agent --type=RED --module=component-registry &
claude-agent --type=RED --module=mcp-client &
wait
```

### Launch GREEN Agents (After RED)

```bash
# GREEN agents wait for corresponding RED to complete
claude-agent --type=GREEN --module=directive-parser --tests=src/parser/__tests__/
claude-agent --type=GREEN --module=component-registry --tests=src/registry/__tests__/
```

---

## Verification Checkpoints

| Checkpoint | Command | Expected |
|------------|---------|----------|
| After 1.RED | `npm test` | All tests FAIL |
| After 1.GREEN | `npm test` | All tests PASS |
| After 5.GREEN | `curl :3108/health` | 200 OK |
| After 9.GREEN | `npm test --coverage` | >90% coverage |
| After 12.GREEN | `npm run test:integration` | All pass |
| After 13.GREEN | `npm run test:e2e` | All pass |

---

## Success Criteria

| Metric | Target | Verification |
|--------|--------|--------------|
| Unit test coverage | >90% | `npm run coverage` |
| All RED tests initially fail | 100% | Manual verification |
| All GREEN implementations pass | 100% | `npm test` |
| Integration tests pass | 100% | `npm run test:integration` |
| E2E tests pass | 100% | `npm run test:e2e` |
| Display directive parse time | <10ms | Performance test |
| Component render time | <2s | E2E timing |

---

*Created: February 7, 2026*
*Methodology: TDD with Parallel Agent Execution*
*Status: Ready for Implementation*
