# Tamshai Enterprise AI Constitution

## Article I: Security & Zero Trust Imperative

1. **Row Level Security (RLS) is Non-Negotiable:** No new data tables shall be created in PostgreSQL without accompanying RLS policies.
2. **Fail Secure:** All API endpoints and MCP Tools must default to `deny` access unless explicitly authorized by a specific role.
3. **PII Masking:** No data classified as PII (SSN, Salary, Contact Info) shall leave the MCP layer without passing through a masking function unless the user holds a specific `*-write` or `executive` role.
4. **No Secrets in Code:** All credentials must be loaded via environment variables; never hardcoded.

## Article II: The Model Context Protocol (MCP) Standard

1. **Tool Atomicity:** Every feature must be exposed as a discrete MCP Tool with a strict JSON Schema definition.
2. **Stateless Tools:** MCP Tools must be stateless. Context required for execution (like User ID or Roles) must be passed via the request headers or context object, not stored in global server state.
3. **Error Schemas:** Tools must not throw raw exceptions. They must return structured JSON error objects (e.g., `{ isError: true, message: "..." }`) that the LLM can interpret.

## Article III: Testing & Verification

1. **RBAC Verification:** No feature is complete without an integration test verifying that an unauthorized user receives an `ACCESS_DENIED` response.
2. **Context Limits:** All list-based queries must implement pagination or hard limits (max 50 records) to prevent context stuffing.

## Article IV: Infrastructure & Consistency

1. **Container Native:** All services must run within the existing Docker Compose / Kubernetes architecture.
2. **TypeScript Strictness:** All code must be written in TypeScript with `strict: true`. `any` types are forbidden.

## Article V: Client-Side Security

1. **No Logic in Client:** Frontend apps (Web/Mobile/Desktop) must never implement authorization logic (e.g., `if (isAdmin) showSalary()`). All data hiding must happen at the API/MCP layer. The client simply renders what it receives.
2. **Secure Token Storage:**
    - **Web:** HttpOnly Cookies (preferred) or memory-only storage for Access Tokens.
    - **Desktop (Electron):** System Keychain (via Electron `safeStorage` API).
    - **Mobile:** Secure Enclave / Keystore.
3. **OIDC Compliance:** All clients must use PKCE (Proof Key for Code Exchange) for authentication. Implicit flows are forbidden.

## Governance

This Constitution supersedes all other development practices. Any amendments require:
1. Documented architectural decision record (ADR)
2. Lead Architect approval
3. Migration plan for existing code

All pull requests must verify compliance with this Constitution. Complexity must be justified against these principles.

**Version**: 1.0.0 | **Ratified**: 2024-11-30 | **Last Amended**: 2024-12-08
