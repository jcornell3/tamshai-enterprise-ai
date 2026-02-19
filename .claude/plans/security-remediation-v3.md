# Security Hardening Plan v3 (Phoenix & Zero-Trust)

**Created**: 2026-02-18
**Updated**: 2026-02-19
**Status**: 🔄 In Progress (Post-Remediation Hardening)
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

## 2. Advanced AI Guardrails (H2)

**Risk**: Prompt injection and accidental data leakage through AI responses.

### Current State:
- `mcp-gateway` has 5-layer prompt injection defense (documented in CLAUDE.md)
- `scanOutput` exists but is a placeholder (returns input unchanged)
- No PII redaction currently implemented
- Static XML delimiters (`<user_query>`, `<system_context>`)

### Implementation Strategy:
1.  **Functional `scanOutput`**: Replace the `mcp-gateway` placeholder with a regex-based scanner that detects system prompt fragments and internal XML tags (`<user_query>`).
2.  **Pre-LLM PII Redaction**: Integrate `pii-scrubber` into the `ai-query` route to redact sensitive data *before* it leaves the Tamshai network for external LLM providers.
3.  **Dynamic Delimiters**: Implement a utility to generate randomized XML delimiters for each session, preventing attackers from "guessing" the tag structure to escape the query context.

> **Implementation Note**: Consider using Claude's built-in content filtering capabilities
> in conjunction with custom scanning. The Anthropic API supports `metadata` fields that
> could be used to tag requests for audit purposes.

**Acceptance Criteria**:
- [ ] `scanOutput` successfully blocks responses containing "Tamshai System Prompt" or similar identifiers.
- [ ] PII is redacted in the outgoing request to Anthropic/Google.
- [ ] Integration tests verify that randomized tags do not break legitimate tool use.

---

## 3. Zero-Trust Network Baseline (H3)

**Risk**: Internal traffic is currently unencrypted by default, relying on Docker network isolation.

### Current State:
- ✅ `docker-compose.mtls.yml` exists (not merged into main compose)
- ✅ `scripts/generate-mtls-certs.sh` exists
- ❌ PostgreSQL accepts non-SSL connections (`sslmode=prefer` default)
- ❌ MongoDB accepts non-SSL connections
- ❌ MCP server-to-server traffic is HTTP (not HTTPS)

### Implementation Strategy:
1.  **Mandatory mTLS**: Merge `docker-compose.mtls.yml` into the primary `docker-compose.yml` for the `backend-network` and `data-network`.
2.  **Certificate Lifecycle**: Integrate certificate generation into the `deploy.sh` script (using the `generate-mtls-certs.sh` utility) so that certificates are refreshed during every Phoenix rebuild.
3.  **Enforce Database SSL**: Configure PostgreSQL and MongoDB to **reject** non-SSL connections from internal services.

> **Complexity Warning**: mTLS adds significant operational overhead. Consider phasing:
> - Phase 1: Database SSL only (PostgreSQL `sslmode=require`)
> - Phase 2: MCP server mTLS (gateway ↔ domain servers)
> - Phase 3: Full mesh mTLS (all internal traffic)

**Acceptance Criteria**:
- [ ] Services cannot connect to databases without valid client certificates.
- [ ] Traffic between `mcp-gateway` and MCP servers is verified as HTTPS/mTLS.
- [ ] Certificates are rotated on every deployment.

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

## 5. Audit Logging & Governance (H5)

**Risk**: Local Docker logs can be deleted by an attacker; lack of formal Phoenix validation.

### Current State:
- Kong logs to stdout (captured by Docker)
- `mcp-gateway` uses Winston logger (stdout + optional file)
- No external log aggregation configured
- C2 monitoring sends Discord alerts (not audit-grade)
- RLS is enforced but not continuously verified

### Implementation Strategy:
1.  **Immutable Audit Offloading**: Configure Kong and `mcp-gateway` to stream audit logs to an external HTTPS endpoint with object-lock capabilities (e.g., AWS S3 with Object Lock or a dedicated SIEM).
2.  **Phoenix Recovery Drills**: Document and automate a "Phoenix Drill" that destroys the VPS and measures the Time-to-Recovery (TTR) for a fully hardened state.
3.  **RLS Continuous Audit**: Add a step to the `verify-stage-deployment.ps1` script to check that the `tamshai_app` user lacks the `BYPASSRLS` permission.

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
- [ ] Audit logs are successfully received by the external collector.
- [ ] Recovery Drill restores the environment in < 15 minutes.
- [ ] Deployment fails if a database user is found with excessive permissions.

---

## Priority Matrix

| ID | Task | Priority | Effort | Dependencies | Status |
|----|------|----------|--------|--------------|--------|
| C1 | Vault Production Mode | **P0** | Medium | None | ✅ Complete (dev mode) |
| H1 | Phoenix Vault AppRoles | **P0** | High | C1 ✅ | Ready to start |
| H2 | Advanced AI Guardrails | **P1** | Medium | None | Not started |
| H3 | Mandatory mTLS | **P1** | Medium | None (phased) | Not started |
| H4 | Automated Rotation | **P2** | High | H1 | Blocked (H1) |
| H5 | Immutable Audit | **P2** | Medium | None | Not started |

### Recommended Implementation Order:
1. ~~**C1**~~ ✅ Complete (2026-02-19)
2. **H1** (C1 prerequisite satisfied, ready to start)
3. **H2** (Can be done in parallel with H1)
4. **H3 Phase 1** (Database SSL only)
5. **H5** (Can be done anytime)
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
