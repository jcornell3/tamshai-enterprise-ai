# Security Hardening Plan v3 (Phoenix & Zero-Trust)

**Created**: 2026-02-18
**Status**: 🔄 In Progress (Post-Remediation Hardening)
**Target Environment**: VPS / Staging (Phoenix Architecture)

---

## Executive Summary
This plan builds upon the completed remediations in `v2` to transition the Tamshai Enterprise AI environment from "Secure-by-Remediation" to "Hardened-by-Design." It specifically focuses on optimizing the **Phoenix build strategy** for Vault and establishing a **Zero-Trust** baseline.

---

## 1. Phoenix-Compatible Vault AppRole Implementation (H1)

**Risk**: Shared secrets (`MCP_INTERNAL_SECRET`) provide a single point of failure. AppRoles provide granular, machine-to-machine authentication but are difficult to manage in a "wipe-and-rebuild" Phoenix scenario.

### Implementation Strategy:
1.  **Trusted Orchestrator**: The GitHub Actions `deploy-vps.yml` workflow acts as the provisioning authority.
2.  **Idempotent Provisioning**: Create `scripts/vault/sync-vault.ts` (using the `@tamshai/vault-client`) to ensure policies and AppRoles are recreated immediately after Vault unseal.
3.  **Static RoleIDs / Ephemeral SecretIDs**:
    *   Hardcode `RoleIDs` in service configurations (stable identifiers).
    *   Generate a **short-lived (10-min), one-time-use `SecretID`** during each deployment.
4.  **C2 Integration**: Inject the ephemeral `SecretID` into the `.env` file before it is encrypted into `.env.enc`.
5.  **Service Bootstrap**: Update the `shared` library to exchange the `RoleID` + `SecretID` for a Vault Token at startup and fetch operational secrets into memory.

**Acceptance Criteria**:
- [ ] `sync-vault.ts` recreates AppRoles on a fresh Vault instance.
- [ ] Services successfully start and fetch secrets from Vault without local plaintext storage.
- [ ] SecretID is invalidated immediately after service bootstrap.

---

## 2. Advanced AI Guardrails (H2)

**Risk**: Prompt injection and accidental data leakage through AI responses.

### Implementation Strategy:
1.  **Functional `scanOutput`**: Replace the `mcp-gateway` placeholder with a regex-based scanner that detects system prompt fragments and internal XML tags (`<user_query>`).
2.  **Pre-LLM PII Redaction**: Integrate `pii-scrubber` into the `ai-query` route to redact sensitive data *before* it leaves the Tamshai network for external LLM providers.
3.  **Dynamic Delimiters**: Implement a utility to generate randomized XML delimiters for each session, preventing attackers from "guessing" the tag structure to escape the query context.

**Acceptance Criteria**:
- [ ] `scanOutput` successfully blocks responses containing "Tamshai System Prompt" or similar identifiers.
- [ ] PII is redacted in the outgoing request to Anthropic/Google.
- [ ] Integration tests verify that randomized tags do not break legitimate tool use.

---

## 3. Zero-Trust Network Baseline (H3)

**Risk**: Internal traffic is currently unencrypted by default, relying on Docker network isolation.

### Implementation Strategy:
1.  **Mandatory mTLS**: Merge `docker-compose.mtls.yml` into the primary `docker-compose.yml` for the `backend-network` and `data-network`.
2.  **Certificate Lifecycle**: Integrate certificate generation into the `deploy.sh` script (using the `generate-mtls-certs.sh` utility) so that certificates are refreshed during every Phoenix rebuild.
3.  **Enforce Database SSL**: Configure PostgreSQL and MongoDB to **reject** non-SSL connections from internal services.

**Acceptance Criteria**:
- [ ] Services cannot connect to databases without valid client certificates.
- [ ] Traffic between `mcp-gateway` and MCP servers is verified as HTTPS/mTLS.
- [ ] Certificates are rotated on every deployment.

---

## 4. Automated Secret Rotation (H4)

**Risk**: Long-lived client secrets and API keys increase the impact of a potential leak.

### Implementation Strategy:
1.  **Keycloak Secret Rotation**: Use the `keycloak/admin-client` to rotate the `MCP_GATEWAY_CLIENT_SECRET` as part of the monthly maintenance window.
2.  **Vault-Driven Rotation**: Configure Vault's Database Secrets Engine to rotate the `tamshai_app` PostgreSQL password every 24 hours.
3.  **CI/CD Secret Sync**: Update GitHub Secrets automatically using the `gh secret set` command after rotation.

**Acceptance Criteria**:
- [ ] Client secrets are successfully rotated without service downtime.
- [ ] Database users are dynamic and have a TTL of < 24 hours.
- [ ] GitHub Actions secrets match the rotated values in Vault.

---

## 5. Audit Logging & Governance (H5)

**Risk**: Local Docker logs can be deleted by an attacker; lack of formal Phoenix validation.

### Implementation Strategy:
1.  **Immutable Audit Offloading**: Configure Kong and `mcp-gateway` to stream audit logs to an external HTTPS endpoint with object-lock capabilities (e.g., AWS S3 with Object Lock or a dedicated SIEM).
2.  **Phoenix Recovery Drills**: Document and automate a "Phoenix Drill" that destroys the VPS and measures the Time-to-Recovery (TTR) for a fully hardened state.
3.  **RLS Continuous Audit**: Add a step to the `verify-stage-deployment.ps1` script to check that the `tamshai_app` user lacks the `BYPASSRLS` permission.

**Acceptance Criteria**:
- [ ] Audit logs are successfully received by the external collector.
- [ ] Recovery Drill restores the environment in < 15 minutes.
- [ ] Deployment fails if a database user is found with excessive permissions.

---

## Priority Matrix

| ID | Task | Priority | Effort | Goal |
|----|------|----------|--------|------|
| H1 | Phoenix Vault AppRoles | **P0** | High | Eliminate "Secret Zero" risk |
| H2 | Advanced AI Guardrails | **P1** | Medium | Prevent AI data leakage |
| H3 | Mandatory mTLS | **P1** | Medium | Establish internal Zero-Trust |
| H4 | Automated Rotation | **P2** | High | Minimize credential lifespan |
| H5 | Immutable Audit | **P2** | Medium | Ensure non-repudiation |

---

## Success Metrics
*   **Time-to-Recovery**: < 15 minutes for a full Phoenix rebuild from scratch.
*   **Credential Lifespan**: No static service credentials older than 30 days.
*   **Internal Security**: 100% of service-to-service traffic is encrypted and authenticated.
*   **Compliance**: 0% plaintext PII sent to external LLM providers.
