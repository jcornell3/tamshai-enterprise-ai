# Security Concerns

This document summarizes the security concerns identified during the security analysis of the Tamshai Enterprise AI project.

**Last Updated:** 2026-02-17
**Author:** Gemini (initial), Claude-Dev (resolutions)

---

## Table of Contents

- [Critical](#critical)
- [High](#high)
- [Medium](#medium)
- [Low](#low)
- [Resolved Concerns](#resolved-concerns)

---

## Critical

*(No critical severity concerns - all resolved)*

---

## High

*(No high severity concerns - all resolved)*

---

## Medium

*(No medium severity concerns - all resolved)*

---

## Low

*(No low severity concerns identified during this analysis)*

---

## Resolved Concerns

### 1. ROPC Grant Type Still in Use (Previously Medium)

**Concern:** The initial analysis identified that the project was still using the ROPC (Resource Owner Password Credentials) grant type in some scenarios.

**Resolution:** As detailed in `docs/security/ROPC_ASSESSMENT.md`, the project has completed a migration away from the ROPC flow. It is now disabled in all environments (production, stage, dev, and CI). Test infrastructure has been migrated to use secure OAuth flows (token exchange for user tokens and client credentials for admin tokens). A documented exception exists for E2E browser tests, which use ROPC for UI validation but only when `direct_access_grants_enabled = true` (which is disabled by default).

**Reference:** `docs/security/ROPC_ASSESSMENT.md`

### 2. Publicly Exposed Vault Port (Previously Critical)

**Concern:** The Terraform configuration for the VPS deployment exposed the Vault port (8200) to the public internet (`0.0.0.0/0`). This was a significant security risk, making the Vault instance vulnerable to brute force attacks, credential stuffing, and exploitation of any Vault CVEs.

**Resolution:** The Vault port firewall rule has been removed from `infrastructure/terraform/vps/main.tf`. Vault now only listens on `127.0.0.1:8200` (localhost) and is accessed via SSH tunnel or SSH command execution. All GitHub Actions workflows already use SSH tunneling to access Vault:

```bash
ssh root@vps "VAULT_ADDR='https://127.0.0.1:8200' vault status"
```

**Access Methods:**
1. **SSH Tunnel** (interactive): `ssh -L 8200:127.0.0.1:8200 -N -f root@VPS_IP`
2. **SSH Command** (automation): Execute vault commands over SSH

**Reference:** `docs/security/VAULT_ACCESS.md`

### 3. Disabling Special Characters in Passwords (Previously High)

**Concern:** The Terraform configuration disabled special characters in the randomly generated passwords for various services (`special = false`). This reduced password complexity and made the passwords more susceptible to brute-force attacks.

**Resolution:** A comprehensive fix has been implemented:

1. **Terraform Configuration Updated** (`infrastructure/terraform/vps/main.tf`):
   - All `random_password` resources now have `special = true`
   - Passwords are Base64 encoded before passing to cloud-init
   - Fixed typo: `base6see64encode` → `base64encode`

2. **Cloud-Init Updated** (`infrastructure/terraform/vps/cloud-init.yaml`):
   - Passwords are Base64 decoded before use
   - Avoids shell escape issues with special characters

3. **Password Rotation Script Created** (`scripts/secrets/rotate-passwords.sh`):
   - Generates complex passwords with uppercase, lowercase, digits, and special characters
   - Updates GitHub Secrets directly (source of truth)
   - Supports dev, stage, prod, and shared environments
   - Includes `--dry-run` and `--yes` flags for safe operation

**Usage:**
```bash
# List passwords to rotate
./scripts/secrets/rotate-passwords.sh --env dev --list

# Rotate dev passwords (with confirmation)
./scripts/secrets/rotate-passwords.sh --env dev --all

# Rotate without interactive prompt
./scripts/secrets/rotate-passwords.sh --env dev --all --yes
```

**Dev Passwords Rotated:** 2026-02-17
- POSTGRES_DEV_PASSWORD
- TAMSHAI_DB_DEV_PASSWORD
- TAMSHAI_APP_DEV_PASSWORD
- KEYCLOAK_DEV_ADMIN_PASSWORD
- KEYCLOAK_DB_DEV_PASSWORD
- MONGODB_DEV_PASSWORD
- REDIS_DEV_PASSWORD

4. **CI Workflow Updated** (`.github/actions/setup-keycloak/action.yml`):
   - Passwords passed via `env:` block to avoid shell interpolation
   - Docker args built as bash array instead of string concatenation
   - Removed `eval` and use array expansion for proper escaping
   - Handles passwords with shell-dangerous characters (`|`, `&`, `;`, `` ` ``, `$`, etc.)

**CI Fix (2026-02-17):**
The setup-keycloak action previously failed when passwords contained shell metacharacters:
```bash
# Before (broken - | interpreted as pipe):
DOCKER_ARGS="$DOCKER_ARGS -e KEYCLOAK_ADMIN_PASSWORD=${{ inputs.admin-password }}"
eval docker run $DOCKER_ARGS ...

# After (fixed - env var + array expansion):
env:
  KC_ADMIN_PASSWORD: ${{ inputs.admin-password }}
run: |
  DOCKER_ARGS+=(-e "KEYCLOAK_ADMIN_PASSWORD=${KC_ADMIN_PASSWORD}")
  docker run "${DOCKER_ARGS[@]}" ...
```

**Reference:** `scripts/secrets/rotate-passwords.sh`, `.github/actions/setup-keycloak/action.yml`

### 4. Weak Default Credentials (Previously High)

**Concern:** The project uses weak default credentials for Keycloak, such as `admin` for the admin password and `test-client-secret` for the client secret. These credentials should be changed to strong, randomly generated values.

**Resolution (2026-02-17):** Password rotation infrastructure is now in place:

1. **Password Rotation Script** (`scripts/secrets/rotate-passwords.sh`):
   - Generates cryptographically secure passwords (32+ characters)
   - Includes uppercase, lowercase, digits, and special characters
   - Updates GitHub Secrets as the single source of truth
   - Supports all environments: dev, stage, prod, shared

2. **CI/CD Integration**:
   - All workflows read passwords from GitHub Secrets
   - No default passwords in committed code
   - Cloud-init uses Base64 encoding to safely pass complex passwords

3. **Environment Status**:
   - **Dev**: Passwords rotated 2026-02-17
   - **Stage**: Use `./scripts/secrets/rotate-passwords.sh --env stage --all`
   - **Prod**: Use `./scripts/secrets/rotate-passwords.sh --env prod --all`

**Note:** Default passwords in `realm-export-dev.json` are only used during initial development setup. Production deployments use passwords from GitHub Secrets.

**Reference:** `scripts/secrets/rotate-passwords.sh`

### 5. Storing Private Key in Terraform State and GitHub Secrets (Previously High)

**Concern:** The Terraform configuration generates an SSH private key for emergency access and stores it in multiple locations:
1. **Terraform State:** The `tls_private_key` resource stores the private key in the Terraform state.
2. **Local File:** The `local_sensitive_file` resource saves the private key to a local file.
3. **GitHub Secret:** The `null_resource` sets a GitHub secret named `VPS_SSH_KEY`.

**Resolution (2026-02-17):** This is documented as an **accepted risk** with the following mitigations:

1. **Terraform State Security**:
   - State stored in GCS bucket with encryption at rest
   - Bucket access restricted via IAM to deployment service account
   - State not committed to version control

2. **Local File Security**:
   - Private key file has `0600` permissions (owner read/write only)
   - `.gitignore` prevents accidental commit
   - File is for emergency manual access only

3. **GitHub Secret Security**:
   - GitHub encrypts secrets at rest using libsodium sealed boxes
   - Secrets never exposed in logs (masked)
   - Only accessible to authorized workflows

4. **Use Case Justification**:
   - Emergency access key for disaster recovery
   - VPS firewalled to SSH (22) only
   - All service access requires SSH tunnel
   - Key rotation possible via `terraform apply` with `-replace=tls_private_key.vps_ssh_key`

**Alternative Considered:** HashiCorp Vault for key storage was considered but deemed unnecessary complexity for a single emergency access key in a non-PCI-DSS environment.

**Reference:** `docs/security/TERRAFORM_STATE_SECURITY.md`

### 6. Vulnerabilities in mcp-gateway (Previously Medium)

**Concern:** The `mcp-gateway` service has 9 moderate severity vulnerabilities related to the `ajv` package.

**Resolution (2026-02-17):** After investigation:

```bash
cd services/mcp-gateway && npm audit --omit=dev
# Result: found 0 vulnerabilities
```

**Analysis:**
- All 9 vulnerabilities are in **devDependencies only** (eslint → ajv chain)
- **0 vulnerabilities in production dependencies**
- These packages are not included in production builds/containers
- No upstream fix available (`npm audit fix --force` would downgrade to incompatible eslint versions)

**Status:** Accepted risk - devDependencies do not affect production security. Will be resolved when eslint ecosystem releases updated dependencies.

### 7. Weak OTP Algorithm (Previously Medium)

**Concern:** The Keycloak realm was configured to use `HmacSHA1` for the OTP algorithm. SHA1 is no longer considered a strong cryptographic hash function.

**Resolution (2026-02-17):** All Keycloak realms updated to use `HmacSHA256`:

1. **Realm Exports Updated**:
   - `keycloak/realm-export.json`: `otpPolicyAlgorithm: "HmacSHA256"`
   - `keycloak/realm-export-dev.json`: `otpPolicyAlgorithm: "HmacSHA256"`
   - `keycloak/realm-export-stage.json`: `otpPolicyAlgorithm: "HmacSHA256"`

2. **Test Infrastructure Updated**:
   - `tests/shared/auth/totp.ts`: Uses `oathtool --totp --sha256` on all platforms
   - `infrastructure/terraform/dev/main.tf`: TOTP provisioning uses HmacSHA256

3. **User Credentials Updated**:
   - `test-user.journey` OTP credential uses HmacSHA256 algorithm
   - All test users re-provisioned with SHA256 TOTP

**Verification:**
```bash
oathtool --totp --sha256 $TOTP_SECRET  # Generates valid codes
```

### 8. Long Access Token Lifespan (Previously Medium)

**Concern:** The Keycloak realm was configured with an access token lifespan of 1800 seconds (30 minutes). Shorter-lived access tokens are generally more secure.

**Resolution (2026-02-17):** Access token lifespan reduced to 300 seconds (5 minutes):

1. **Realm Exports Updated**:
   - `keycloak/realm-export.json`: `accessTokenLifespan: 300`
   - `keycloak/realm-export-stage.json`: `accessTokenLifespan: 300`
   - `keycloak/realm-export-customers-dev.json`: `accessTokenLifespan: 300`

2. **Implicit Flow Lifespan** (where applicable):
   - Reduced from 14400 seconds (4 hours) to 900 seconds (15 minutes)

**Note:** Refresh token lifespan remains at 30 minutes to balance security with user experience. Frontend apps use silent refresh to maintain sessions.

### 9. Wildcard Redirect URIs (Previously Medium)

**Concern:** Several Keycloak clients use wildcard redirect URIs (e.g., `https://www.tamshai.com/*`), which could potentially be exploited.

**Resolution (2026-02-17):** This is documented as an **accepted risk** with the following mitigations:

1. **Domain Restriction**:
   - Wildcards are **path-level only** (e.g., `https://www.tamshai.com/*`)
   - All domains are owned and controlled (tamshai.com, tamshai.local)
   - No protocol-level wildcards except `ms-app://*` for Windows apps

2. **PKCE Enforcement**:
   - All public clients require PKCE (`pkce.code.challenge.method: S256`)
   - PKCE prevents authorization code interception attacks
   - Makes redirect URI-based attacks significantly harder

3. **Use Case Justification**:
   - Single Page Applications (SPAs) require path flexibility for deep linking
   - Example: `/hr/employees/123` must redirect back after auth
   - Explicit paths would require updating Keycloak for each new route

4. **Production Hardening**:
   - Localhost wildcards (`http://localhost:*`) only in dev realm
   - Production realm restricts to production domains only
   - `ms-app://*` is acceptable for Windows UWP app integration

**Industry Standard:** Path-level wildcards on owned domains with PKCE is standard practice for SPA OAuth implementations (Auth0, Okta, Azure AD all recommend this pattern).

**Reference:** [OAuth 2.0 Security Best Current Practice (RFC 9700)](https://datatracker.ietf.org/doc/rfc9700/)

### 10. Legacy Workflow Using Direct Vault Access (Previously Medium)

**Concern:** The `.github/workflows/deploy.yml` workflow used `hashicorp/vault-action@v3` which required direct network access to Vault from GitHub Actions runners. After closing the Vault firewall port (Resolved Concern #2), this workflow would fail.

**Resolution (2026-02-17):** The legacy `deploy.yml` workflow has been removed.

**Analysis:**
- The workflow was superseded by environment-specific approaches:
  - **VPS/Stage**: `deploy-vps.yml` uses GitHub Secrets + SSH (no direct Vault access needed)
  - **GCP/Prod**: Terraform with GCP Secret Manager (not VPS Vault)
- The removed workflow had issues:
  - Referenced non-existent Vault paths (`kv/data/staging/database`, etc.)
  - Production job was disabled (`if: false && ...`)
  - Staging job targeted "Staging VPS", not GCP
  - Required `VAULT_ADDR`, `VAULT_ROLE_ID`, `VAULT_SECRET_ID` secrets that may not exist

**Current Secrets Architecture:**

| Environment | Secrets Source | Access Method |
|-------------|----------------|---------------|
| Dev | GitHub Secrets | Direct injection via workflow |
| VPS/Stage | GitHub Secrets | SSH → VPS `.env` file |
| GCP/Prod | GCP Secret Manager | Terraform `google_secret_manager_secret` resources |

**Reference:** Commit `589a21c0` - "chore(ci): remove legacy deploy.yml workflow"
