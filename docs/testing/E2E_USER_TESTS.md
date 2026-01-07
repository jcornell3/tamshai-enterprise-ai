# E2E User Login Testing

This document describes the end-to-end testing approach for user login flows in Tamshai Enterprise AI, including handling TOTP (Time-based One-Time Password) authentication.

## Overview

The E2E login tests verify the complete SSO authentication flow:
1. User navigates to employee login page
2. Clicks "Sign in with SSO" button
3. Redirected to Keycloak for authentication
4. Enters username and password
5. Completes TOTP verification (if enabled)
6. Redirected back to the portal
7. Portal displays user information and available applications

## TOTP Handling Strategy

### The Challenge

Keycloak encrypts TOTP secrets before storing them in the database. The `secret_data` field in the `credential` table contains an encrypted value that cannot be used to generate valid TOTP codes. This means we cannot:
- Extract the TOTP secret from the database
- Generate valid TOTP codes programmatically without the original secret

### The Solution: Backup/Disable/Test/Restore

Instead of trying to use the TOTP secret, we temporarily disable TOTP for the test user:

1. **Backup**: Save the user's TOTP credential record (the entire row from the database)
2. **Disable**: Delete the credential and switch the realm to a browser flow without OTP requirement
3. **Restart**: Restart Keycloak to clear cached authentication flow configuration
4. **Test**: Run the E2E test (user logs in without TOTP prompt)
5. **Restore**: Insert the backed-up credential record back into the database
6. **Restart**: Restart Keycloak to restore OTP-required authentication

This approach preserves the user's authenticator app registration because the exact same credential record is restored.

## Keycloak Database Schema

### Relevant Tables

#### `user_entity`
| Column | Type | Description |
|--------|------|-------------|
| id | varchar(36) | User UUID |
| username | varchar(255) | Username |
| email | varchar(255) | Email address |
| realm_id | varchar(255) | Realm UUID |

#### `credential`
| Column | Type | Description |
|--------|------|-------------|
| id | varchar(36) | Credential UUID |
| salt | bytea | Salt (nullable) |
| type | varchar(255) | Credential type: `password`, `otp`, etc. |
| user_id | varchar(36) | Foreign key to user_entity |
| created_date | bigint | Creation timestamp (milliseconds) |
| user_label | varchar(255) | User-provided label for the credential |
| secret_data | text | JSON with encrypted secret: `{"value":"..."}` |
| credential_data | text | JSON with configuration |
| priority | integer | Priority for multiple credentials |

Example `credential_data` for TOTP:
```json
{
  "subType": "totp",
  "digits": 6,
  "counter": 0,
  "period": 30,
  "algorithm": "HmacSHA256"
}
```

#### `realm`
| Column | Type | Description |
|--------|------|-------------|
| id | varchar(36) | Realm UUID |
| name | varchar(255) | Realm name |
| browser_flow | varchar(36) | UUID of authentication flow for browser logins |

#### `authentication_flow`
| Column | Type | Description |
|--------|------|-------------|
| id | varchar(36) | Flow UUID |
| alias | varchar(255) | Flow name (e.g., `browser`, `browser-with-otp`) |
| realm_id | varchar(36) | Foreign key to realm |

#### `authentication_execution`
| Column | Type | Description |
|--------|------|-------------|
| id | varchar(36) | Execution UUID |
| authenticator | varchar(255) | Authenticator class (e.g., `auth-otp-form`) |
| requirement | integer | 0=REQUIRED, 1=CONDITIONAL, 2=ALTERNATIVE, 3=DISABLED |
| flow_id | varchar(36) | Foreign key to authentication_flow |
| priority | integer | Execution order |

### Authentication Flows

Tamshai uses two browser authentication flows:

1. **`browser`** (standard): Username/password only
2. **`browser-with-otp`**: Username/password + OTP (currently active)

To disable TOTP for testing, we switch the realm's `browser_flow` from `browser-with-otp` to `browser`.

### Important: Keycloak Caching

Keycloak caches authentication flow configurations. After changing the `browser_flow` in the database, you **must restart Keycloak** for the change to take effect.

## Test Scripts

### Main Test Script

Location: `scripts/test/e2e-login-with-totp-backup.sh`

```bash
# Dev environment
./scripts/test/e2e-login-with-totp-backup.sh dev eve.thompson

# Stage environment (requires SSH)
VPS_HOST=$VPS_HOST ./scripts/test/e2e-login-with-totp-backup.sh stage eve.thompson
```

### npm Scripts

Location: `tests/e2e/package.json`

```bash
# Run all login tests (dev)
npm run test:login:dev

# Run all login tests (stage)
npm run test:login:stage
```

## Database Queries

### Get User ID
```sql
SELECT id FROM user_entity
WHERE username = 'eve.thompson'
AND realm_id = (SELECT id FROM realm WHERE name = 'tamshai-corp');
```

### Check User's Credentials
```sql
SELECT id, type, user_label, secret_data
FROM credential
WHERE user_id = 'bb69be96-edee-4100-9ab5-2efb8e868a2c';
```

### Check Current Browser Flow
```sql
SELECT af.alias
FROM realm r
JOIN authentication_flow af ON r.browser_flow = af.id
WHERE r.name = 'tamshai-corp';
```

### Get Standard Browser Flow ID
```sql
SELECT id FROM authentication_flow
WHERE alias = 'browser'
AND realm_id = (SELECT id FROM realm WHERE name = 'tamshai-corp');
```

### Switch to Standard Browser Flow (Disable OTP)
```sql
UPDATE realm
SET browser_flow = (
  SELECT id FROM authentication_flow
  WHERE alias = 'browser'
  AND realm_id = (SELECT id FROM realm WHERE name = 'tamshai-corp')
)
WHERE name = 'tamshai-corp';
```

### Restore Browser-with-OTP Flow
```sql
UPDATE realm
SET browser_flow = (
  SELECT id FROM authentication_flow
  WHERE alias = 'browser-with-otp'
  AND realm_id = (SELECT id FROM realm WHERE name = 'tamshai-corp')
)
WHERE name = 'tamshai-corp';
```

## Test Users

### Dev Environment

| Username | Password | TOTP | Role |
|----------|----------|------|------|
| eve.thompson | password123 | Enabled | Executive |
| alice.chen | password123 | Optional | HR |
| bob.martinez | password123 | Optional | Finance |

### Stage Environment

Test users in stage should have TOTP enabled for security. The backup/restore script handles this automatically.

## Troubleshooting

### "One-time code" Prompt Still Appears After Disabling TOTP

**Cause**: Keycloak caches authentication flows.
**Solution**: Restart Keycloak after changing the browser flow:
```bash
docker restart tamshai-keycloak
```

### TOTP Codes Don't Match

**Cause**: The `secret_data` in the database is encrypted and cannot be used to generate codes.
**Solution**: Use the backup/restore approach instead of trying to generate codes.

### Test Fails Waiting for URL Pattern

**Cause**: After OAuth redirect, the URL may include query parameters or fragments.
**Solution**: Wait for portal content instead of strict URL matching:
```typescript
// Instead of:
await page.waitForURL(/\/app\//);

// Use:
await page.waitForLoadState('networkidle');
await expect(page.locator('h2:has-text("Available Applications")')).toBeVisible();
```

### SSH Connection Fails for Stage

**Cause**: SSH key not configured or wrong host.
**Solution**:
```bash
# Test SSH connection
ssh -o BatchMode=yes root@$VPS_HOST "echo ok"

# Set custom host if needed
VPS_HOST=your-vps-ip ./scripts/test/e2e-login-with-totp-backup.sh stage eve.thompson
```

## File Structure

```
tests/e2e/
├── specs/
│   └── login-journey.ui.spec.ts    # Playwright test specs
├── playwright.config.ts             # Playwright configuration
├── package.json                     # Dependencies and scripts
├── .gitignore                       # Ignore backup files
└── .totp-backups/                   # Temporary backup directory (gitignored)

scripts/test/
└── e2e-login-with-totp-backup.sh   # Main test runner with TOTP handling
```

## CI/CD Integration

For CI/CD pipelines, the test script can be integrated as follows:

```yaml
jobs:
  e2e-login:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Start services
        run: docker compose up -d

      - name: Wait for Keycloak
        run: |
          until curl -s http://localhost:8180/health/ready | grep -q UP; do
            sleep 5
          done

      - name: Run E2E login tests
        run: ./scripts/test/e2e-login-with-totp-backup.sh dev eve.thompson
```

## Security Considerations

1. **Backup files**: TOTP credential backups are stored temporarily and deleted after restore. The `.totp-backups/` directory is gitignored.

2. **GitHub Secrets backup**: The script optionally backs up credentials to GitHub Secrets. This is disabled by default and should only be used if the pipeline needs to resume after failure.

3. **Stage environment**: Requires SSH access. Ensure SSH keys are properly secured and rotated.

4. **Keycloak restarts**: The script restarts Keycloak twice (disable and restore). In production, coordinate with maintenance windows.

---

*Last Updated: January 4, 2026*
