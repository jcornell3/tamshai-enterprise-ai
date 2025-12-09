# Tasks: [Feature Name]

## Group 1: Database (PostgreSQL)
- [ ] Create migration file `XX_[feature]_schema.sql` adding required tables. [P]
- [ ] Add RLS policy: `CREATE POLICY ... ON ... USING (...)`. [P]

## Group 2: MCP-[Domain] Service
- [ ] Install required dependencies in `services/mcp-[domain]`.
- [ ] Implement `[Feature]Service` class handling business logic.
- [ ] Define MCP Tool `[tool_name]` with input/output schemas.

## Group 3: Gateway & Security
- [ ] Update `mcp-gateway` to route requests to new MCP server endpoint.
- [ ] Update `kong.yml` to allow traffic on new route (if needed).

## Group 4: Verification
- [ ] Write `tests/integration/[feature]_rbac.test.ts`.
- [ ] Test authorized access (expect success).
- [ ] Test unauthorized access (expect 403 or filtered data).
