# User Management Guide - Tamshai Enterprise AI

## Existing Test Users

All test users have the same credentials for development purposes:

| Username | Password | TOTP Secret | Roles | Access |
|----------|----------|-------------|-------|--------|
| eve.thompson | [REDACTED-DEV-PASSWORD] | [REDACTED-DEV-TOTP] | executive | All apps (CEO) |
| alice.chen | [REDACTED-DEV-PASSWORD] | [REDACTED-DEV-TOTP] | hr-read, hr-write | HR app |
| bob.martinez | [REDACTED-DEV-PASSWORD] | [REDACTED-DEV-TOTP] | finance-read, finance-write | Finance app |
| carol.johnson | [REDACTED-DEV-PASSWORD] | [REDACTED-DEV-TOTP] | sales-read, sales-write | Sales app |
| dan.williams | [REDACTED-DEV-PASSWORD] | [REDACTED-DEV-TOTP] | support-read, support-write | Support app |
| nina.patel | [REDACTED-DEV-PASSWORD] | [REDACTED-DEV-TOTP] | manager | Team-level access |
| marcus.johnson | [REDACTED-DEV-PASSWORD] | [REDACTED-DEV-TOTP] | user | Self-service only |
| frank.davis | [REDACTED-DEV-PASSWORD] | [REDACTED-DEV-TOTP] | intern | Minimal access |

---

## Login Process

### 1. Navigate to Application

- Portal: http://localhost:4000
- HR App: http://localhost:4001
- Finance App: http://localhost:4002

### 2. Click "Sign In"

Redirects to Keycloak: http://localhost:8180

### 3. Enter Credentials

- **Username**: (e.g., `eve.thompson`)
- **Password**: `[REDACTED-DEV-PASSWORD]`

### 4. Enter TOTP Code

**Option A: Use Pre-configured Secret**

If using the default TOTP secret `[REDACTED-DEV-TOTP]`:

1. Open Google Authenticator or Authy
2. Add new account
3. Choose "Enter a setup key"
4. Account name: `Tamshai - eve.thompson` (or your username)
5. Key: `[REDACTED-DEV-TOTP]`
6. Enter the 6-digit code shown

**Option B: Scan QR Code**

On first login, Keycloak shows a QR code. Scan it with your authenticator app.

---

## Creating New Users

### Quick Method (Script)

Use the provided script:

```bash
/tmp/create-keycloak-user.sh <username> <email> <firstName> <lastName> <role>
```

**Example**:
```bash
/tmp/create-keycloak-user.sh john.doe john.doe@tamshai.com John Doe hr-read
```

**Available Roles**:
- `executive` - All access (CEO, CTO, etc.)
- `hr-read` - View HR data
- `hr-write` - Modify HR data (includes hr-read)
- `finance-read` - View finance data
- `finance-write` - Modify finance data (includes finance-read)
- `sales-read` - View sales/CRM data
- `sales-write` - Modify sales/CRM data (includes sales-read)
- `support-read` - View support tickets
- `support-write` - Modify support tickets (includes support-read)
- `manager` - Team-level access
- `user` - Self-service only
- `intern` - Minimal access

### Manual Method (Keycloak Admin Console)

#### Step 1: Access Keycloak Admin Console

1. Navigate to: http://localhost:8180/admin
2. Login with admin credentials:
   - Username: `admin`
   - Password: `admin`

#### Step 2: Select Realm

1. Click dropdown in top-left (shows "master")
2. Select `tamshai-corp`

#### Step 3: Create User

1. Click "Users" in left menu
2. Click "Add user" button
3. Fill in form:
   - **Username**: (required, e.g., `jane.smith`)
   - **Email**: (e.g., `jane.smith@tamshai.com`)
   - **First Name**: Jane
   - **Last Name**: Smith
   - **Email Verified**: ON (toggle to yes)
   - **Enabled**: ON (toggle to yes)
4. Click "Create"

#### Step 4: Set Password

1. Click "Credentials" tab
2. Click "Set password"
3. Enter password (e.g., `[REDACTED-DEV-PASSWORD]`)
4. Set "Temporary" to OFF
5. Click "Save"

#### Step 5: Configure TOTP (MFA)

**Option A: Require on First Login**
1. Click "Details" tab
2. In "Required actions" dropdown, select "Configure OTP"
3. Click "Add"
4. User will configure TOTP on first login

**Option B: Configure Now**
1. User must log in and configure TOTP themselves
2. Keycloak shows QR code to scan

#### Step 6: Assign Roles

1. Click "Role Mappings" tab
2. In "Realm roles" section:
3. From "Available roles" list, select desired role(s)
4. Click "Add selected"

**Example**: Select `hr-read` for an HR viewer

---

## Role-Based Access Control (RBAC)

### Role Hierarchy

```
executive (composite)
  ├─ hr-read ──> hr-write
  ├─ finance-read ──> finance-write
  ├─ sales-read ──> sales-write
  └─ support-read ──> support-write

manager
  └─ Team-level access (own team only)

user
  └─ Self-service (own data only)
```

### Permission Matrix

| Role | HR App | Finance App | Sales App | Support App | Data Scope |
|------|--------|-------------|-----------|-------------|------------|
| executive | ✅ Read | ✅ Read | ✅ Read | ✅ Read | All data |
| hr-write | ✅ Read/Write | ❌ | ❌ | ❌ | All employees |
| hr-read | ✅ Read | ❌ | ❌ | ❌ | All employees |
| finance-write | ❌ | ✅ Read/Write | ❌ | ❌ | All finance data |
| finance-read | ❌ | ✅ Read | ❌ | ❌ | All finance data |
| sales-write | ❌ | ❌ | ✅ Read/Write | ❌ | All CRM data |
| sales-read | ❌ | ❌ | ✅ Read | ❌ | All CRM data |
| support-write | ❌ | ❌ | ❌ | ✅ Read/Write | All tickets |
| support-read | ❌ | ❌ | ❌ | ✅ Read | All tickets |
| manager | Partial | Partial | Partial | Partial | Team only |
| user | Self | Self | Self | Self | Own data only |

---

## Managing Users (Admin Tasks)

### List All Users

```bash
cd /home/jcornell/tamshai-enterprise-ai/infrastructure/docker
docker compose exec keycloak /opt/keycloak/bin/kcadm.sh get users -r tamshai-corp --fields username,email,enabled
```

### Find User by Username

```bash
docker compose exec keycloak /opt/keycloak/bin/kcadm.sh get users -r tamshai-corp -q username=alice.chen
```

### Get User's Roles

```bash
# First get user ID
USER_ID=$(docker compose exec keycloak /opt/keycloak/bin/kcadm.sh get users -r tamshai-corp -q username=alice.chen | grep '"id"' | cut -d'"' -f4 | head -1)

# Then get roles
docker compose exec keycloak /opt/keycloak/bin/kcadm.sh get users/$USER_ID/role-mappings/realm -r tamshai-corp
```

### Disable User

```bash
USER_ID=<user-id>
docker compose exec keycloak /opt/keycloak/bin/kcadm.sh update users/$USER_ID -r tamshai-corp -s enabled=false
```

### Reset User Password

```bash
docker compose exec keycloak /opt/keycloak/bin/kcadm.sh set-password -r tamshai-corp \
  --username alice.chen \
  --new-password new[REDACTED-DEV-PASSWORD]
```

### Remove TOTP for User

```bash
USER_ID=<user-id>
docker compose exec keycloak /opt/keycloak/bin/kcadm.sh update users/$USER_ID -r tamshai-corp \
  -s 'requiredActions=["CONFIGURE_TOTP"]'
```

This requires user to set up TOTP again on next login.

---

## Security Best Practices

### Password Policy

**Current Settings** (Development):
- Minimum length: 8 characters
- No complexity requirements
- Temporary passwords allowed

**Recommended for Production**:
1. Navigate to Keycloak Admin Console
2. Realm Settings → Authentication → Policies tab
3. Configure:
   - Minimum length: 12+
   - Require uppercase, lowercase, digits, special characters
   - Password history: 5 (prevent reuse)
   - Expire passwords: 90 days
   - Max login failures: 5

### MFA (Multi-Factor Authentication)

**Current**: TOTP (Time-based One-Time Password) required for all users

**Supported Methods**:
- TOTP (Google Authenticator, Authy)
- WebAuthn (YubiKey, Face ID, Touch ID) - for production

**To Enforce MFA**:
1. Realm Settings → Authentication → Required Actions
2. Ensure "Configure OTP" is enabled
3. In Flows → Browser, require OTP after password

### Session Management

**Current Settings**:
- Access Token: 5 minutes
- Refresh Token: 30 minutes
- SSO Session Idle: 30 minutes
- SSO Session Max: 10 hours

**Production Recommendations**:
- Access Token: 5 minutes (keep short)
- Refresh Token: 30 minutes
- SSO Session Idle: 15 minutes
- SSO Session Max: 8 hours
- Enable "Revoke Refresh Token" for sensitive applications

---

## Bulk User Operations

### Import Users from CSV

Create a script to bulk import:

```bash
#!/bin/bash
# bulk-import-users.sh

while IFS=, read -r username email firstname lastname role; do
    if [ "$username" != "username" ]; then  # Skip header
        /tmp/create-keycloak-user.sh "$username" "$email" "$firstname" "$lastname" "$role"
    fi
done < users.csv
```

**CSV Format**:
```csv
username,email,firstname,lastname,role
john.doe,john.doe@tamshai.com,John,Doe,hr-read
jane.smith,jane.smith@tamshai.com,Jane,Smith,finance-read
```

### Export Users

```bash
docker compose exec keycloak /opt/keycloak/bin/kcadm.sh get users -r tamshai-corp \
  --fields username,email,firstName,lastName,enabled > users-export.json
```

---

## Troubleshooting

### User Can't Login

**Check**:
1. User exists and is enabled
2. Password is correct
3. TOTP is configured correctly
4. Role is assigned
5. Client has required scopes (openid, profile, email)

**Commands**:
```bash
# Check if user exists
docker compose exec keycloak /opt/keycloak/bin/kcadm.sh get users -r tamshai-corp -q username=alice.chen

# Check if user is enabled
docker compose exec keycloak /opt/keycloak/bin/kcadm.sh get users -r tamshai-corp -q username=alice.chen | grep enabled

# Check user's roles
USER_ID=$(docker compose exec keycloak /opt/keycloak/bin/kcadm.sh get users -r tamshai-corp -q username=alice.chen | grep '"id"' | cut -d'"' -f4 | head -1)
docker compose exec keycloak /opt/keycloak/bin/kcadm.sh get users/$USER_ID/role-mappings/realm -r tamshai-corp
```

### TOTP Issues

**User lost TOTP device**:
```bash
# Reset TOTP for user
USER_ID=<user-id>
docker compose exec keycloak /opt/keycloak/bin/kcadm.sh update users/$USER_ID -r tamshai-corp \
  -s 'requiredActions=["CONFIGURE_TOTP"]'
```

User will set up new TOTP on next login.

### User Has Wrong Roles

**Remove role**:
```bash
docker compose exec keycloak /opt/keycloak/bin/kcadm.sh remove-roles -r tamshai-corp \
  --uid $USER_ID \
  --rolename hr-read
```

**Add role**:
```bash
docker compose exec keycloak /opt/keycloak/bin/kcadm.sh add-roles -r tamshai-corp \
  --uid $USER_ID \
  --rolename finance-read
```

---

## Integration with HR System (Future)

For production deployment, consider:

1. **LDAP/Active Directory Integration**
   - Sync users from corporate directory
   - Keycloak → User Federation → Add LDAP provider

2. **SCIM Provisioning**
   - Automatic user creation from HR system
   - OAuth 2.0 based user provisioning

3. **SAML/OIDC Federation**
   - SSO with existing corporate identity provider
   - Azure AD, Okta, Google Workspace integration

---

## Quick Reference

### Create User (One Command)

```bash
/tmp/create-keycloak-user.sh john.doe john.doe@tamshai.com John Doe hr-read
```

### Login Test User

- URL: http://localhost:4000
- Username: `eve.thompson`
- Password: `[REDACTED-DEV-PASSWORD]`
- TOTP Secret: `[REDACTED-DEV-TOTP]`

### Available Test Users

Use any of these for testing:
- `eve.thompson` - Executive (all access)
- `alice.chen` - HR Manager
- `bob.martinez` - Finance Director
- `carol.johnson` - Sales VP

All have password `[REDACTED-DEV-PASSWORD]` and TOTP secret `[REDACTED-DEV-TOTP]`.

---

**Last Updated**: December 11, 2025
**Keycloak Version**: 24.0
**Realm**: tamshai-corp
