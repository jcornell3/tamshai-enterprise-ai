# Keycloak Realm Configuration

This directory contains Keycloak realm configuration for Tamshai Enterprise AI.

## Files

| File | Purpose | Use Case |
|------|---------|----------|
| `realm-export.json` | Production template | Production deployment |
| `realm-export-dev.json` | Development config | Local development with test users |

## Development Setup

The `realm-export-dev.json` file contains:
- Pre-configured test users with password `[REDACTED-DEV-PASSWORD]`
- Shared TOTP secret for easy testing
- All roles and groups pre-assigned

**Test Users:**

| Username | Role | Password | TOTP Secret |
|----------|------|----------|-------------|
| eve.thompson | executive | [REDACTED-DEV-PASSWORD] | [REDACTED-DEV-TOTP] |
| alice.chen | hr-read, hr-write | [REDACTED-DEV-PASSWORD] | [REDACTED-DEV-TOTP] |
| bob.martinez | finance-read, finance-write | [REDACTED-DEV-PASSWORD] | [REDACTED-DEV-TOTP] |
| carol.johnson | sales-read, sales-write | [REDACTED-DEV-PASSWORD] | [REDACTED-DEV-TOTP] |
| dan.williams | support-read, support-write | [REDACTED-DEV-PASSWORD] | [REDACTED-DEV-TOTP] |
| nina.patel | manager | [REDACTED-DEV-PASSWORD] | [REDACTED-DEV-TOTP] |
| marcus.johnson | user | [REDACTED-DEV-PASSWORD] | [REDACTED-DEV-TOTP] |
| frank.davis | intern | [REDACTED-DEV-PASSWORD] | [REDACTED-DEV-TOTP] |

## Production Setup

The `realm-export.json` file is a template for production:
- No pre-configured users (create via Admin API/UI)
- Client secret placeholder (generate new secret in Keycloak)
- TOTP uses SHA-256 algorithm

### Production Deployment Steps

1. **Import the realm template:**
   ```bash
   # Via Keycloak Admin UI or CLI
   /opt/keycloak/bin/kc.sh import --file realm-export.json
   ```

2. **Generate new client secret:**
   - Go to Keycloak Admin Console
   - Navigate to Clients → mcp-gateway → Credentials
   - Click "Regenerate Secret"
   - Update your application configuration with the new secret

3. **Create users via Admin API:**
   ```bash
   # Example: Create user via REST API
   curl -X POST "https://keycloak.example.com/admin/realms/tamshai-corp/users" \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "username": "john.doe",
       "email": "john.doe@company.com",
       "enabled": true,
       "emailVerified": true,
       "requiredActions": ["UPDATE_PASSWORD", "CONFIGURE_TOTP"]
     }'
   ```

4. **Configure production URLs:**
   - Update `redirectUris` in clients for production domains
   - Update `webOrigins` for CORS

## Security Notes

- **Never commit** `realm-export-dev.json` passwords to production
- **Rotate** the `mcp-gateway` client secret regularly
- **Enforce** TOTP/WebAuthn for all production users
- **Use** unique TOTP secrets per user (not shared like dev)

## TOTP Configuration

| Setting | Development | Production |
|---------|-------------|------------|
| Algorithm | HmacSHA256 | HmacSHA256 |
| Digits | 6 | 6 |
| Period | 30 seconds | 30 seconds |
| Look-ahead | 1 | 1 |

## Switching Between Dev/Prod

Update `docker-compose.yml` to use the appropriate file:

```yaml
# Development
volumes:
  - ./realm-export-dev.json:/opt/keycloak/data/import/realm-export.json:ro

# Production
volumes:
  - ./realm-export.json:/opt/keycloak/data/import/realm-export.json:ro
```
