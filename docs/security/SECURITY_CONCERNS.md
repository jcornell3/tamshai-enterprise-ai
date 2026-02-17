# Security Concerns

This document summarizes the security concerns identified during the security analysis of the Tamshai Enterprise AI project.

**Last Updated:** 2026-02-17
**Author:** Gemini

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

### 1. Weak Default Credentials

**Concern:** The project uses weak default credentials for Keycloak, such as `admin` for the admin password and `test-client-secret` for the client secret. These credentials should be changed to strong, randomly generated values.

**Recommendation:** Update the Keycloak configuration to use strong, randomly generated credentials. These credentials should be stored in a secure location, such as a secret manager.

### 2. Storing Private Key in Terraform State and GitHub Secrets

**Concern:** The Terraform configuration generates an SSH private key for emergency access and stores it in multiple locations:
1.  **Terraform State:** The `tls_private_key` resource stores the private key in the Terraform state. This is a security risk, as anyone with access to the Terraform state can retrieve the private key.
2.  **Local File:** The `local_sensitive_file` resource saves the private key to a local file on the machine running Terraform. This is also a security risk, as the private key could be compromised if the machine is compromised.
3.  **GitHub Secret:** The `null_resource` named `update_github_ssh_secret` uses a `local-exec` provisioner to set a GitHub secret named `VPS_SSH_KEY` with the content of the private key. While storing secrets in GitHub is generally a good practice, the fact that the private key is also stored in two other less secure locations is a concern.

**Recommendation:** The private key should be generated and stored in a secure location, such as HashiCorp Vault. The public key can then be retrieved from Vault and used in the Terraform configuration. This would eliminate the need to store the private key in the Terraform state or in a local file. The `gh secret set` command could then retrieve the private key directly from Vault. This approach would provide a single, secure source of truth for the private key.

---

## Medium

### 1. Vulnerabilities in `mcp-gateway`

**Concern:** The `mcp-gateway` service has 9 moderate severity vulnerabilities related to the `ajv` package. These vulnerabilities are in development dependencies, but it's still good practice to fix them.

**Recommendation:** Run `npm audit fix --force` in the `services/mcp-gateway` directory to fix the vulnerabilities.

### 2. Weak OTP Algorithm

**Concern:** The Keycloak realm is configured to use `HmacSHA1` for the OTP algorithm. SHA1 is no longer considered a strong cryptographic hash function.

**Recommendation:** Update the Keycloak realm configuration to use `HmacSHA256` or `HmacSHA512` for the OTP algorithm. Both Google Authenticator and Microsoft Authenticator support these stronger algorithms. This change will increase the security of the OTP mechanism without affecting the user experience.

To maintain functionality in the E2E tests for `test-user.journey`, the following changes have been made:
- The `otpPolicyAlgorithm` in `keycloak/realm-export.json` has been updated to `HmacSHA256`.
- The `credentialData` for the `test-user.journey`'s OTP credential in `keycloak/realm-export.json` has been updated to use `HmacSHA256`.
- The `credentialData` in `infrastructure/terraform/vps/cloud-init.yaml` has been updated to use `HmacSHA256`.
- The `credentialData` in `tests/e2e/global-setup.ts` has been updated to use `HmacSHA256`.
- The `generateTotpCode` function in `tests/shared/auth/totp.ts` has been updated to use `HmacSHA256` with both `oathtool` and `otplib`.

### 3. Long Access Token Lifespan

**Concern:** The Keycloak realm is configured with an access token lifespan of `accessTokenLifespan: 1800` seconds (30 minutes). This is a bit long. Shorter-lived access tokens are generally more secure.

**Recommendation:** Reduce the `accessTokenLifespan` to a shorter duration, such as 5-15 minutes (300-900 seconds) in the `keycloak/realm-export.json` file.

### 4. Wildcard Redirect URIs

**Concern:** The following Keycloak clients have wildcard redirect URIs, which is generally not recommended as it can be exploited in some scenarios:
- `ai-mobile`: `ms-app://*`
- `hr-app`: `http://localhost:4001/*`, `https://www.tamshai.com/*`, `https://prod.tamshai.com/*`, `https://prod-dr.tamshai.com/*`
- `finance-app`: `http://localhost:4002/*`, `https://www.tamshai.com/*`, `https://prod.tamshai.com/*`, `https://prod-dr.tamshai.com/*`
- `sales-app`: `http://localhost:4003/*`, `https://www.tamshai.com/*`, `https://prod.tamshai.com/*`, `https://prod-dr.tamshai.com/*`
- `support-app`: `http://localhost:4004/*`, `https://www.tamshai.com/*`, `https://prod.tamshai.com/*`, `https://prod-dr.tamshai.com/*`
- `tamshai-website`: `http://localhost:8080/*`, `https://tamshai.local/*`, `https://www.tamshai.local/*`, `https://vps.tamshai.com/*`, `https://prod.tamshai.com/*`, `https://prod-dr.tamshai.com/*`, `https://tamshai.com/*`, `https://www.tamshai.com/*`
- `web-portal`: `http://localhost:4000/*`, `https://www.tamshai.local/app/*`, `https://www.tamshai.com/app/*`, `https://prod.tamshai.com/app/*`, `https://prod-dr.tamshai.com/app/*`, `https://app.tamshai.com/*`, `https://app-dr.tamshai.com/*`

**Recommendation:** Use specific redirect URIs instead of wildcards.

---

## Low

*(No low severity concerns identified during this analysis)*

---

## Resolved Concerns

### 1. ROPC Grant Type Still in Use

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

**Next Steps:**
- Run `./scripts/secrets/rotate-passwords.sh --env stage --all` to rotate stage passwords
- Run Phoenix rebuild (`terraform destroy && terraform apply`) to apply new passwords

**Reference:** `scripts/secrets/rotate-passwords.sh`, `.github/actions/setup-keycloak/action.yml`
