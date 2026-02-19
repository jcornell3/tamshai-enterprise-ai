# Tamshai Enterprise AI - Security Concerns v2

This document outlines the security concerns identified during a review of the Tamshai Enterprise AI project, with a specific focus on the vps/stage environment.

## Critical Vulnerabilities

### 1. Unencrypted Traffic Between Cloudflare and VPS

*   **Finding:** Traffic between Cloudflare and the VPS is unencrypted HTTP, making it vulnerable to man-in-the-middle attacks.
*   **File:** `infrastructure/docker/Caddyfile.stage`
*   **Details:** The `auto_https off` directive in the Caddyfile confirms that traffic from Cloudflare to the VPS is unencrypted.
*   **Recommendation:** Given the constraint of not paying for an SSL certificate, you can use Cloudflare's "Flexible" SSL/TLS mode. This will encrypt the traffic between the user and Cloudflare, but the traffic between Cloudflare and your server will remain unencrypted. While not as secure as "Full" or "Full (Strict)" mode, it is better than no encryption at all. Alternatively, you can use a free certificate from Let's Encrypt. Caddy has built-in support for Let's Encrypt and can automatically provision and renew certificates.

### 2. Insecure Vault Configuration

*   **Finding:** HashiCorp Vault is running in development mode, which is not secure for a staging environment.
*   **File:** `infrastructure/docker/docker-compose.yml`
*   **Details:** The `command: server -dev` line in the `docker-compose.yml` file confirms that Vault is running in development mode.
*   **Recommendation:** Vault should be run in server mode in the vps/stage environment. This will require you to initialize Vault and unseal it. The initial root token should be stored securely and used to configure Vault. The Vault data should be persisted to a volume to prevent data loss.

### 3. Plaintext Secrets

*   **Finding:** Multiple secrets, including database passwords and API keys, are stored in a plaintext `.env` file on the server.
*   **File:** `infrastructure/terraform/vps/cloud-init.yaml`
*   **Details:** The `cloud-init.yaml` file shows that secrets are decoded and written to a temporary `.env` file in plaintext.
*   **Recommendation:** Given the "phoenix mode" constraint, using Vault at startup is not feasible. A better approach would be to encrypt the secrets file at rest and decrypt it in memory during the startup process. The `cloud-init.yaml` script could be modified to:
    1.  Download the encrypted secrets file from a secure location (e.g., a private S3 bucket).
    2.  Use a decryption key (which could be passed in as a secure environment variable or retrieved from a different secure location) to decrypt the secrets file in memory.
    3.  Pass the decrypted secrets to the services as environment variables.
    4.  The decrypted secrets should never be written to disk.

### 4. Passwords stored in environment variables

*   **Finding:** Passwords for test and corporate users are stored in environment variables, which are then populated from a plaintext `.env` file on the server. This is a critical vulnerability.
*   **File:** `keycloak/scripts/lib/users.sh`, `infrastructure/terraform/vps/cloud-init.yaml`
*   **Details:** The `get_test_user_password` and `get_corporate_user_password` functions in `users.sh` retrieve passwords from environment variables. The `cloud-init.yaml` file shows that these environment variables are populated from a plaintext `.env` file.
*   **Recommendation:** The same recommendation as for the "Plaintext Secrets" finding applies here. The passwords should be stored in an encrypted file and decrypted in memory at startup.

## Other Findings

*   The API gateway (Kong) applies policies like rate-limiting but delegates authentication to the downstream `mcp-gateway` service.
*   The host firewall is well-configured to limit external access, but the internal Docker network is flat.
*   **Recommendation:** This is a reasonable architecture, but it means that the `mcp-gateway` is a critical part of the security model. It is important to ensure that the `mcp-gateway` is secure and that it correctly validates JWTs. The internal Docker network should also be segmented to reduce the attack surface.

## Keycloak Client Configuration Concerns

### 1. Overly permissive `webOrigins` for `mcp-gateway`

*   **Finding:** The `webOrigins` for the `mcp-gateway` is set to `"+"`, which allows any origin. This is a security risk and should be restricted to the domains that need to access it.
*   **File:** `keycloak/scripts/lib/clients.sh`
*   **Details:** In the `get_mcp_gateway_client_json` function, `webOrigins` is set to `["+"]`.
*   **Recommendation:** The `webOrigins` for the `mcp-gateway` client should be restricted to the domains of the applications that need to access it. This will help prevent CSRF attacks.

### 2. `mcp-hr-service` has excessive permissions

*   **Finding:** The `mcp-hr-service` has `fullScopeAllowed` set to `true`, and is granted `manage-users`, `view-users`, `query-users`, `view-realm`, and `manage-realm` roles. This is a very powerful service account and its permissions should be reviewed and reduced to the minimum required.
*   **File:** `keycloak/scripts/lib/clients.sh`
*   **Details:** The `_post_sync_hr_service` function assigns these roles to the `mcp-hr-service` service account.
*   **Recommendation:** The permissions of the `mcp-hr-service` service account should be reviewed and reduced to the minimum required for it to perform its function. The `fullScopeAllowed` setting should also be reviewed and potentially disabled.

## Keycloak Group and Role Concerns

### 1. Test user added to C-Suite group in production

*   **Finding:** The `test-user.journey` user is added to the `C-Suite` group in the production environment. This is a significant security risk, as it grants a test user the highest level of privileges in the production environment.
*   **File:** `keycloak/scripts/lib/groups.sh`
*   **Details:** The `assign_critical_prod_users` function adds `test-user.journey` to the `C-Suite` group.
*   **Recommendation:** The `test-user.journey` user should be removed from the `C-Suite` group in the production environment.


## Keycloak Authorization Services Concerns

### 1. Admin token acquired using password grant

*   **Finding:** The `sync_token_exchange_permissions` function acquires an admin token using the `password` grant type with the admin's username and password. This is a security risk, as the admin's credentials could be exposed.
*   **File:** `keycloak/scripts/lib/authz.sh`
*   **Details:** The script uses `curl` to make a request to the token endpoint with the admin's username and password.
*   **Recommendation:** The script should be modified to use a more secure method for acquiring the admin token, such as the client credentials grant with a confidential client.

### 2. Use of `curl` and `jq`

*   **Finding:** The script uses `curl` and `jq` to interact with the Keycloak API. This makes the script more complex and harder to maintain than if it used a dedicated library. It also introduces dependencies on these tools being available in the environment where the script is run.
*   **File:** `keycloak/scripts/lib/authz.sh`
*   **Details:** The script uses `curl` to make REST API calls and `jq` to parse the JSON responses.
*   **Recommendation:** The script should be refactored to use a dedicated library for interacting with the Keycloak API, such as the official Keycloak admin client.

## JWT Validation Concerns

### 1. `account` is a valid audience

*   **Finding:** The `jwt-validator` accepts `account` as a valid audience. The `account` client is a default client in Keycloak that is used for the user account management console. It is not clear why the `mcp-gateway` needs to accept tokens intended for the `account` client. This could be a security risk if it allows tokens that were not intended for the `mcp-gateway` to be used to access its resources.
*   **File:** `services/mcp-gateway/src/auth/jwt-validator.ts`
*   **Details:** The `validateToken` function includes `account` in the list of valid audiences.
*   **Recommendation:** The `account` audience should be removed from the list of valid audiences in the `jwt-validator`.

## Secret Management Lifecycle

The `scripts/secrets/read-github-secrets.sh` script is used to retrieve secrets from GitHub Secrets by triggering the `export-test-secrets.yml` workflow. This script is used to populate the environment variables that are used by the application and the Keycloak synchronization scripts.

The `infrastructure/terraform/vps/cloud-init.yaml` file shows that the secrets are decoded and written to a temporary `.env` file in plaintext on the vps/stage server. This `.env` file is then used to populate the environment variables for the Docker containers.

This is a critical vulnerability, as it exposes the secrets in plaintext on the server. Anyone with access to the server can read the secrets.

*   **Recommendation:** Given the "phoenix mode" constraint, using Vault at startup is not feasible. A better approach would be to encrypt the secrets file at rest and decrypt it in memory during the startup process. The `cloud-init.yaml` script could be modified to:
    1.  Download the encrypted secrets file from a secure location (e.g., a private S3 bucket).
    2.  Use a decryption key (which could be passed in as a secure environment variable or retrieved from a different secure location) to decrypt the secrets file in memory.
    3.  Pass the decrypted secrets to the services as environment variables.
    4.  The decrypted secrets should never be written to disk.
