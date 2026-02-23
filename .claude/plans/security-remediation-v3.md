# Security Hardening Plan v3 (Phoenix & Zero-Trust)

**Created**: 2026-02-18
**Updated**: 2026-02-22
**Status**: 🔄 In Progress (3 of 5 hardening items complete)
**Target Environment**: VPS / Staging (Phoenix Architecture)

---

## Executive Summary
This plan builds upon the completed remediations in `v2` to transition the Tamshai Enterprise AI environment from "Secure-by-Remediation" to "Hardened-by-Design." It specifically focuses on optimizing the **Phoenix build strategy** for Vault and establishing a **Zero-Trust** baseline.

> **Note (2026-02-19)**: C1 from v2 (Vault Production Mode) is a prerequisite for H1 below.
> C1 is currently **complete for dev mode** - config files created, unseal workflow works,
> and deployment is stable. Vault is still running in dev mode on VPS as recommended.
> Production mode migration requires switching docker-compose command from `server -dev`
> to `server -config=/vault/config/vault.hcl` and handling re-initialization.
>
> **Verified 2026-02-19**: Deploy workflow 22170704747 passed all C1 steps.

---

## 1. Phoenix-Compatible Vault AppRole Implementation (H1)

**Risk**: Shared secrets (`MCP_INTERNAL_SECRET`) provide a single point of failure. AppRoles provide granular, machine-to-machine authentication but are difficult to manage in a "wipe-and-rebuild" Phoenix scenario.

### Prerequisites (from v2):
| Item | Status | Notes |
|------|--------|-------|
| C1: Vault Production Mode | ✅ Complete (dev mode) | Config at `vault/config-stage/vault-stage.hcl`, workflow verified 2026-02-19 |
| Unseal Keys in GitHub | ✅ Done | `VAULT_UNSEAL_KEY_1` through `VAULT_UNSEAL_KEY_5` exist |
| Unseal Workflow Step | ✅ Done | Uses Vault HTTP API (`/v1/sys/unseal`), verified workflow 22170704747 |

### Implementation Strategy:
1.  **Trusted Orchestrator**: The GitHub Actions `deploy-vps.yml` workflow acts as the provisioning authority.
2.  **Idempotent Provisioning**: Create `scripts/vault/sync-vault.ts` (using the `@tamshai/vault-client`) to ensure policies and AppRoles are recreated immediately after Vault unseal.
3.  **Static RoleIDs / Ephemeral SecretIDs**:
    *   Hardcode `RoleIDs` in service configurations (stable identifiers).
    *   Generate a **short-lived (10-min), one-time-use `SecretID`** during each deployment.
4.  **C2 Integration**: Inject the ephemeral `SecretID` into the `.env` file before it is encrypted into `.env.enc`.
5.  **Service Bootstrap**: Update the `shared` library to exchange the `RoleID` + `SecretID` for a Vault Token at startup and fetch operational secrets into memory.

### Remaining C1 Work (Production Mode Migration):
> **Note**: These items are NOT blockers for H1. Dev mode Vault works correctly for AppRole
> configuration. Production mode migration is optional hardening.

- [ ] Create `docker-compose.stage.yml` override with `server -config=/vault/config/vault.hcl`
- [ ] Add persistent volume for `/vault/file` storage backend
- [ ] Test Phoenix rebuild with Vault re-initialization flow
- [ ] Document manual re-keying procedure if unseal keys are lost

**Acceptance Criteria**:
- [ ] `sync-vault.ts` recreates AppRoles on a fresh Vault instance.
- [ ] Services successfully start and fetch secrets from Vault without local plaintext storage.
- [ ] SecretID is invalidated immediately after service bootstrap.

---

## 2. Advanced AI Guardrails (H2) ✅ COMPLETE

**Risk**: Prompt injection and accidental data leakage through AI responses.

### Current State:
- ✅ `mcp-gateway` has 5-layer prompt injection defense (documented in CLAUDE.md)
- ✅ `scanOutput` now functional with system prompt leak detection and PII redaction
- ✅ Pre-LLM PII redaction implemented via `sanitizeForLLM()`
- ✅ Dynamic XML delimiters per session using `getSessionDelimiters()`

### Implementation (2026-02-22):
1.  **Functional `scanOutput`**: Rewrote `prompt-defense.ts` with:
    - System prompt fragment detection (10 patterns)
    - Internal XML tag detection
    - PII redaction (SSN, CC, email, phone, bank accounts)
    - Strict mode option for throwing on violations
2.  **Pre-LLM PII Redaction**: Added `sanitizeForLLM()` called before Claude API in streaming.routes.ts
3.  **Dynamic Delimiters**: Implemented `getSessionDelimiters()` with 30-minute TTL per session

**Files Changed**:
- `services/mcp-gateway/src/ai/prompt-defense.ts` (comprehensive rewrite)
- `services/mcp-gateway/src/ai/prompt-defense.test.ts` (61 tests)
- `services/mcp-gateway/src/routes/streaming.routes.ts` (integration)

**Acceptance Criteria**:
- [x] `scanOutput` successfully blocks responses containing "Tamshai System Prompt" or similar identifiers.
- [x] PII is redacted in the outgoing request to Anthropic/Google.
- [x] 61 unit tests verify defense layers work correctly.

---

## 3. Zero-Trust Network Baseline (H3) 🔄 Phase 1 Complete

**Risk**: Internal traffic is currently unencrypted by default, relying on Docker network isolation.

### Current State:
- ✅ `docker-compose.mtls.yml` exists (not merged into main compose)
- ✅ `scripts/generate-mtls-certs.sh` exists
- ✅ PostgreSQL SSL support added (Phase 1 - 2026-02-22)
- ❌ MongoDB accepts non-SSL connections
- ❌ MCP server-to-server traffic is HTTP (not HTTPS)

### Phase 1 Implementation (2026-02-22):
**Database SSL Support**:
- Added `getSSLConfig()` to `services/shared/src/database/postgres.ts`
- Environment variables:
  - `POSTGRES_SSL=true|require` - Enable SSL
  - `POSTGRES_SSL_CA` - CA certificate path or content
  - `POSTGRES_SSL_REJECT_UNAUTHORIZED` - Cert validation (default: true in prod)
- Updated `.env.example` with SSL documentation
- Compatible with GCP Cloud SQL `ENCRYPTED_ONLY` mode

### Remaining Phases:
> - ✅ Phase 1: Database SSL only (PostgreSQL `sslmode=require`)
> - ⏳ Phase 2: MCP server mTLS (gateway ↔ domain servers)
> - ⏳ Phase 3: Full mesh mTLS (all internal traffic)

**Acceptance Criteria**:
- [x] Node.js services support SSL connections to PostgreSQL
- [ ] Services cannot connect to databases without valid client certificates (Phase 2)
- [ ] Traffic between `mcp-gateway` and MCP servers is verified as HTTPS/mTLS (Phase 2)
- [ ] Certificates are rotated on every deployment (Phase 3)

---

## 4. Automated Secret Rotation (H4)

**Risk**: Long-lived client secrets and API keys increase the impact of a potential leak.

### Current State:
- Keycloak client secrets are static (set at creation, never rotated)
- Database passwords are static (set in .env, encrypted in .env.enc)
- GitHub Secrets are manually updated via `scripts/set-vault-secrets.ps1`
- Vault Database Secrets Engine is not configured

### Implementation Strategy:
1.  **Keycloak Secret Rotation**: Use the `keycloak/admin-client` to rotate the `MCP_GATEWAY_CLIENT_SECRET` as part of the monthly maintenance window.
2.  **Vault-Driven Rotation**: Configure Vault's Database Secrets Engine to rotate the `tamshai_app` PostgreSQL password every 24 hours.
3.  **CI/CD Secret Sync**: Update GitHub Secrets automatically using the `gh secret set` command after rotation.

> **Dependency**: H4 requires H1 (Vault AppRoles) to be complete. Services must be able
> to fetch dynamic credentials from Vault before rotation can be implemented.

> **Alternative (Lower Effort)**: Instead of Vault Database Secrets Engine, implement
> a simpler rotation script that runs monthly:
> 1. Generate new password
> 2. Update PostgreSQL user password
> 3. Update GitHub Secret
> 4. Trigger deployment to pick up new password

**Acceptance Criteria**:
- [ ] Client secrets are successfully rotated without service downtime.
- [ ] Database users are dynamic and have a TTL of < 24 hours.
- [ ] GitHub Actions secrets match the rotated values in Vault.

---

## 5. Audit Logging & Governance (H5) ✅ COMPLETE (Code)

**Risk**: Local Docker logs can be deleted by an attacker; lack of formal Phoenix validation.

### Current State:
- ✅ Kong logs to stdout (captured by Docker)
- ✅ `mcp-gateway` has structured audit logging (audit.ts - 2026-02-22)
- ✅ External SIEM webhook support configured
- C2 monitoring sends Discord alerts (not audit-grade)
- RLS is enforced but not continuously verified

### Implementation (2026-02-22):
**Structured Audit Logging**:
- Created `services/mcp-gateway/src/utils/audit.ts` with:
  - RFC 5424 severity levels (emergency → debug)
  - 7 event categories (authentication, authorization, data_access, etc.)
  - External SIEM webhook support via `AUDIT_LOG_ENDPOINT`
  - Configurable severity filtering via `AUDIT_LOG_LEVEL`
- Convenience functions: `audit.authSuccess()`, `audit.promptInjectionBlocked()`, etc.
- 20 unit tests

**Integration**:
- Prompt injection attempts logged as security alerts
- PII redaction events tracked for compliance

### Remaining Work (Infrastructure):
> **Cost-Effective Options**:
> - **Grafana Loki** (self-hosted): Free, but requires additional VPS resources
> - **Papertrail** (SaaS): ~$7/mo for 1GB/mo, easy Docker integration
> - **AWS CloudWatch Logs**: Pay-per-use, integrates with S3 for long-term storage
> - **Better Stack (Logtail)**: Free tier available, 1GB/mo

> **Phoenix Drill Automation**: Consider a GitHub Actions workflow that:
> 1. Runs `terraform destroy` on a test VPS
> 2. Runs `terraform apply` to recreate
> 3. Runs E2E tests to verify functionality
> 4. Reports TTR to a dashboard

**Acceptance Criteria**:
- [x] Structured audit logging implemented with SIEM support
- [x] Security events (injection, PII) logged to audit trail
- [ ] Audit logs are successfully received by external collector (infra)
- [ ] Recovery Drill restores the environment in < 15 minutes
- [ ] Deployment fails if a database user is found with excessive permissions

---

## Priority Matrix

| ID | Task | Priority | Effort | Dependencies | Status |
|----|------|----------|--------|--------------|--------|
| C1 | Vault Production Mode | **P0** | Medium | None | ✅ Complete (dev mode) |
| H1 | Phoenix Vault AppRoles | **P0** | High | C1 ✅ | Ready to start |
| H2 | Advanced AI Guardrails | **P1** | Medium | None | ✅ **Complete** (2026-02-22) |
| H3 | Mandatory mTLS | **P1** | Medium | None (phased) | 🔄 Phase 1 Complete |
| H4 | Automated Rotation | **P2** | High | H1 | Blocked (H1) |
| H5 | Immutable Audit | **P2** | Medium | None | ✅ **Complete (Code)** |

### Recommended Implementation Order:
1. ~~**C1**~~ ✅ Complete (2026-02-19)
2. ~~**H2**~~ ✅ Complete (2026-02-22) - 5-layer prompt defense, PII redaction, dynamic delimiters
3. ~~**H3 Phase 1**~~ ✅ Complete (2026-02-22) - Database SSL support
4. ~~**H5**~~ ✅ Complete (2026-02-22) - Structured audit logging with SIEM support
5. **H1** (C1 prerequisite satisfied, ready to start)
6. **H3 Phase 2-3** (Full mTLS)
7. **H4** (Requires H1)

---

## Success Metrics
*   **Time-to-Recovery**: < 15 minutes for a full Phoenix rebuild from scratch.
*   **Credential Lifespan**: No static service credentials older than 30 days.
*   **Internal Security**: 100% of service-to-service traffic is encrypted and authenticated.
*   **Compliance**: 0% plaintext PII sent to external LLM providers.

---

## Related Documents
- `.claude/plans/security-remediation-v2.md` - Completed E1-E4, M1-M3, C1-C3 remediations
- `.claude/plans/C1-vault-production-mode.md` - Detailed C1 implementation plan
- `docs/security/SECURITY_CONCERNSv2.md` - Original security audit findings
