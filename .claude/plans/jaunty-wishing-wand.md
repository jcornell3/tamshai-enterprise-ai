# Plan: Missing MCP Tools for ApprovalsQueue

**Status**: CLOSED
**Closed**: 2026-02-13

---

## MCP Tool Status

| Tool | Server | Status |
|------|--------|--------|
| `get_pending_time_off` | HR (3101) | COMPLETE |
| `get_pending_expenses` | Finance (3102) | COMPLETE (itemCount included) |
| `get_pending_budgets` | Finance (3102) | COMPLETE |
| `list_employees` | HR (3101) | COMPLETE (name resolution) |
| Component registry transform | MCP UI | COMPLETE |

## Approval Action Endpoints

| Endpoint | Status |
|----------|--------|
| `POST /api/mcp/hr/tools/approve_time_off_request` | COMPLETE |
| `POST /api/mcp/finance/tools/approve_expense_report` | COMPLETE |
| `POST /api/mcp/finance/tools/approve_budget` | COMPLETE (added 2026-02-13) |

## Completed Work (2026-02-13)

- [x] Added budget approval endpoint in `approval-actions.ts` following time-off/expense pattern
- [x] Updated CLAUDE.md: Removed stale "itemCount always 0" known limitation
- [x] Verified TypeScript compiles cleanly

## Known Limitation (Accepted)

- `budgetAmendments.currentBudget` always 0 - Tool returns new budget submissions (PENDING_APPROVAL), not amendments to existing budgets. This is a semantic design choice, not a bug.

**This plan is CLOSED.**
