# Specification Alignment Plan

**Created**: December 26, 2025
**Purpose**: Document misalignments between specifications and implementation, with remediation plan

---

## Executive Summary

A comprehensive review of specifications (001-007) against the actual codebase reveals **significant misalignments**. Most notably:

1. **Spec 003 (MCP Gateway)** and **Spec 004 (MCP Suite)** are marked as "IN PROGRESS" or "PLANNED" but are actually **v1.4 COMPLETE**
2. **Spec 006 (Electron Desktop)** and **Spec 007 (Mobile)** describe React Native approaches but Flutter is the actual implementation (Spec 009)
3. **Spec 005 (Web Apps)** is marked "PLANNED" but Portal and HR apps are implemented
4. Success criteria checkboxes across multiple specs are outdated

---

## Detailed Misalignment Analysis

### Spec 001: Foundation Infrastructure

| Aspect | Spec Says | Reality | Status |
|--------|-----------|---------|--------|
| Status | COMPLETED | All 18 services deployed via Docker Compose | ✅ ALIGNED |
| Services | 13 services | 18 services (added web apps) | Minor Update |
| Success Criteria | All checked | All complete | ✅ ALIGNED |

**Action Required**: Minor - Update service count from 13 to 18

---

### Spec 002: Security Layer (mTLS & RLS)

| Aspect | Spec Says | Reality | Status |
|--------|-----------|---------|--------|
| Status | IN PROGRESS (6/9 pending) | Partially complete | Needs Update |
| PostgreSQL RLS | Pending | HR schema has full RLS with 7 policies | ❌ MISALIGNED |
| Finance RLS | Pending | NO RLS policies defined | Gap Confirmed |
| mTLS | Pending | Not implemented (dev uses HTTP) | Correct |
| Session Variables | Documented | `set_user_context()` function exists in HR | ❌ MISALIGNED |

**Findings from sample-data/hr-data.sql**:
- RLS enabled on `hr.employees` and `hr.performance_reviews`
- 4 access policies: self, hr-staff, executive, manager-hierarchy
- `is_manager_of()` function with SECURITY DEFINER (fixes recursion bug)
- `access_audit_log` table for audit logging

**Findings from sample-data/finance-data.sql**:
- Schema created (`finance.*`) - CORRECT
- NO RLS policies - GAP
- No audit logging table - GAP

**Action Required**:
1. Update success criteria - mark RLS patterns as complete for HR
2. Document Finance RLS as a known gap requiring implementation
3. Clarify mTLS is production-only (dev uses HTTP intentionally)
4. Add note about RLS recursion workaround

---

### Spec 003: MCP Core Gateway

| Aspect | Spec Says | Reality | Status |
|--------|-----------|---------|--------|
| Status | CURRENT (5/12 pending) | v1.4 COMPLETE | ❌ MAJOR MISALIGNED |
| Line Count | 473 lines | 1,170 lines | Outdated |
| JWT Validation | Checked | Complete with JWKS | ✅ |
| Token Revocation | Unchecked | Implemented in Redis | ❌ Should be checked |
| Role Extraction | Unchecked | Implemented | ❌ Should be checked |
| SSE Streaming | Unchecked | Full implementation (GET + POST) | ❌ Should be checked |
| Truncation Warnings | Unchecked | Injected via metadata | ❌ Should be checked |
| HITL Confirmations | Unchecked | `/api/confirm/:id` endpoint | ❌ Should be checked |
| Audit Logging | Unchecked | Implemented with PII scrubbing | ❌ Should be checked |

**Implementation Details (from services/mcp-gateway/src/index.ts)**:
- Full JWT validation with Keycloak JWKS (lines 159-231)
- Token revocation via Redis
- Role-based MCP server routing
- SSE streaming on GET/POST `/api/query` (lines 605-779)
- Confirmation endpoint `/api/confirm/:confirmationId` (lines 787-887)
- MCP tool proxy endpoints (lines 890-1157)
- CORS, rate limiting, security headers

**Action Required**:
1. Change status to **COMPLETE**
2. Update line count to 1,170
3. Check ALL success criteria (10/12 are implemented)
4. Only unchecked items should be:
   - Integration tests verify RBAC routing (tests exist but may need verification)
   - Performance SLA measurement (not formally measured)

---

### Spec 004: MCP Domain Services

| Aspect | Spec Says | Reality | Status |
|--------|-----------|---------|--------|
| Status | PLANNED (6/14 pending) | v1.4 COMPLETE | ❌ CRITICAL MISALIGNED |
| MCP HR | Planned | COMPLETE - 3 tools | ❌ |
| MCP Finance | Planned | COMPLETE - 6 tools | ❌ |
| MCP Sales | Planned | COMPLETE - 3 tools | ❌ |
| MCP Support | Planned | COMPLETE - 3 tools | ❌ |
| Total Tools | 12 listed | 15 implemented | More than spec |

**Actual Implementation**:

| Service | Port | Tools Implemented | v1.4 Features |
|---------|------|-------------------|---------------|
| mcp-hr | 3101 | get_employee, list_employees, delete_employee | Truncation, Errors, Confirmations |
| mcp-finance | 3102 | get_budget, list_budgets, list_invoices, get_expense_report, delete_invoice, approve_budget | Truncation, Errors, Confirmations |
| mcp-sales | 3103 | list_opportunities, get_customer, delete_opportunity | Truncation, Errors, Confirmations |
| mcp-support | 3104 | search_tickets, search_knowledge_base, close_ticket | Truncation, Errors, Confirmations |

**v1.4 Features Verified**:
- ✅ Discriminated union responses (`status: 'success' | 'error' | 'pending_confirmation'`)
- ✅ LLM-friendly errors with `suggestedAction`
- ✅ Truncation metadata (LIMIT+1 pattern, `hasMore`, `totalEstimate`)
- ✅ Write operations return `pending_confirmation`
- ✅ Redis storage for pending confirmations with 5-minute TTL

**Action Required**:
1. Change status to **COMPLETE**
2. Update tools list with actual implementations
3. Check all applicable success criteria
4. Note: `update_salary` and some other tools mentioned in spec are not implemented (could be future work or removed from scope)

---

### Spec 005: Sample Web Applications

| Aspect | Spec Says | Reality | Status |
|--------|-----------|---------|--------|
| Status | PLANNED (10/17 pending) | PARTIAL - 2/5 apps complete | ❌ MISALIGNED |
| Portal App | Planned | COMPLETE | ❌ |
| HR App | Planned | COMPLETE (305-line directory, 217-line AI query) | ❌ |
| Finance App | Planned | STUB (150 lines) | Correct |
| Sales App | Planned | STUB (343 lines) | Correct |
| Support App | Planned | STUB (379 lines) | Correct |
| Shared Auth Package | Not mentioned | @tamshai/auth COMPLETE | Missing from spec |
| Shared UI Package | Not mentioned | @tamshai/ui COMPLETE (SSEQueryClient, ApprovalCard) | Missing from spec |

**Implementation Details**:
- **Turbo Monorepo** structure with npm workspaces
- **React 18 + Vite 6.2 + TypeScript 5.3 + Tailwind CSS 3.4**
- Shared packages: `@tamshai/auth`, `@tamshai/ui`, `@tamshai/tailwind-config`

**Completed Features**:
- SSO via react-oidc-context
- Role-based navigation
- SSE streaming (SSEQueryClient component - 251 lines)
- Approval Card component (205 lines)
- Employee directory with conditional salary column
- AI Query page with real-time streaming

**Action Required**:
1. Change status to **IN PROGRESS**
2. Add shared packages section to spec
3. Update success criteria for Portal and HR (mark as complete)
4. Keep Finance/Sales/Support as pending (stubs only)

---

### Spec 006: AI Desktop Client (Electron/React Native)

| Aspect | Spec Says | Reality | Status |
|--------|-----------|---------|--------|
| Status | IN PROGRESS | DEPRECATED - Superseded by Flutter | ❌ OBSOLETE |
| Platform | React Native Windows | Flutter/Dart (Spec 009) | ❌ |
| Electron | Also mentioned | Exists but deprecated | ❌ |

**Reality**:
- `clients/desktop/` - Electron implementation exists (phases 3-6 complete)
- `clients/unified/` - React Native implementation exists (phases 3-5)
- **BOTH are superseded by `clients/unified_flutter/` (Spec 009)**

**Action Required**:
1. Mark as **DEPRECATED**
2. Add deprecation notice referencing Spec 009
3. Reference ADR-004 (Electron issues) and ADR-005 (RN to Flutter pivot)

---

### Spec 007: Mobile AI Assistant

| Aspect | Spec Says | Reality | Status |
|--------|-----------|---------|--------|
| Status | PLANNED | SUPERSEDED | ❌ OBSOLETE |
| Platform | React Native iOS/Android | Flutter unified (Spec 009) | ❌ |
| Host Discovery | Detailed scripts | May still be relevant | Partial |

**Reality**:
- Spec 007 describes React Native mobile with host discovery scripts
- Flutter (Spec 009) is the actual implementation path
- Some concepts (host discovery, firewall scripts) may still be relevant for mobile testing

**Action Required**:
1. Mark as **SUPERSEDED by Spec 009**
2. Move relevant mobile concepts (host discovery, firewall) to Spec 009 if needed
3. Keep for historical reference

---

## Integration Test Coverage

**Location**: `tests/integration/`

| Test File | Lines | Coverage |
|-----------|-------|----------|
| rbac.test.ts | 346 | Authentication, RBAC, role access |
| query-scenarios.test.ts | 745 | Natural language queries, team queries, budgets |
| sse-streaming.test.ts | 449 | SSE protocol, streaming, timeouts |
| mcp-tools.test.ts | 925 | All MCP tools, confirmations, errors |
| **Total** | **2,465** | Comprehensive integration coverage |

**Note**: Unit tests are NOT implemented for MCP services (gap in test coverage)

---

## Remediation Plan

### Phase 1: Critical Updates (Immediate)

| Spec | Action | Priority |
|------|--------|----------|
| 003 | Mark COMPLETE, update success criteria | P0 |
| 004 | Mark COMPLETE, document tools | P0 |
| 006 | Mark DEPRECATED, reference Spec 009 | P0 |
| 007 | Mark SUPERSEDED, reference Spec 009 | P0 |

### Phase 2: Important Updates (This Week)

| Spec | Action | Priority |
|------|--------|----------|
| 002 | Update RLS status (HR done, Finance gap) | P1 |
| 005 | Update to IN PROGRESS, document packages | P1 |
| 001 | Update service count (13 → 18) | P2 |

### Phase 3: Documentation (Ongoing)

| Item | Action | Priority |
|------|--------|----------|
| CLAUDE.md | Already updated (done earlier) | Complete |
| ARCHITECTURE_SPECS.md | Already updated with ADR-005 | Complete |
| Spec 009 | Already created (Flutter) | Complete |

---

## Summary of Changes Required

| Spec | Current Status | New Status | Key Changes |
|------|----------------|------------|-------------|
| 001 | COMPLETE | COMPLETE | Update service count |
| 002 | IN PROGRESS | IN PROGRESS | Update RLS status, document gaps |
| 003 | CURRENT | **COMPLETE** | Check all criteria, update lines |
| 004 | PLANNED | **COMPLETE** | Document 15 tools, check criteria |
| 005 | PLANNED | **IN PROGRESS** | Document packages, partial completion |
| 006 | IN PROGRESS | **DEPRECATED** | Reference Spec 009 |
| 007 | PLANNED | **SUPERSEDED** | Reference Spec 009 |

---

## Appendix: File Locations

### Specifications
- `.specify/specs/001-foundation/spec.md`
- `.specify/specs/002-security/spec.md`
- `.specify/specs/003-mcp-core/spec.md`
- `.specify/specs/004-mcp-suite/spec.md`
- `.specify/specs/005-sample-apps/spec.md`
- `.specify/specs/006-ai-desktop/spec.md`
- `.specify/specs/007-mobile/spec.md`
- `.specify/specs/009-flutter-unified/spec.md` (current implementation)

### Implementations
- `services/mcp-gateway/` (1,170 lines)
- `services/mcp-hr/` (v1.4 complete)
- `services/mcp-finance/` (v1.4 complete)
- `services/mcp-sales/` (v1.4 complete)
- `services/mcp-support/` (v1.4 complete)
- `clients/web/` (Turbo monorepo, 5 apps)
- `clients/unified_flutter/` (Flutter - Phase 1 complete)

### Sample Data
- `sample-data/hr-data.sql` (RLS implemented)
- `sample-data/finance-data.sql` (RLS missing - gap)
- `sample-data/sales-data.js` (MongoDB)

### Tests
- `tests/integration/rbac.test.ts`
- `tests/integration/query-scenarios.test.ts`
- `tests/integration/sse-streaming.test.ts`
- `tests/integration/mcp-tools.test.ts`
