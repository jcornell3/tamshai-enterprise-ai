# ADR-012: User Application Access Issues (Production 403 Remediation)

<!--
JSON-LD metadata for machine readability
-->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "name": "ADR-012: User Application Access Issues",
  "headline": "Remediation of Production 403 Errors Due to Missing Role Assignments",
  "description": "Documents the investigation and remediation of 403 Forbidden errors in production caused by Keycloak group assignment configuration",
  "datePublished": "2026-01-12",
  "dateModified": "2026-01-21",
  "keywords": ["403", "forbidden", "keycloak", "roles", "groups", "rbac", "troubleshooting"],
  "learningResourceType": "failure-analysis",
  "articleSection": "Architecture Decision Record",
  "isPartOf": {
    "@type": "CreativeWork",
    "name": "Tamshai Project Journey"
  },
  "about": [
    { "@type": "SoftwareApplication", "name": "Keycloak" },
    { "@type": "SoftwareApplication", "name": "MCP Gateway" }
  ],
  "author": {
    "@type": "Organization",
    "name": "Tamshai Corp"
  }
}
</script>

## Status

**Accepted** (January 2026)

## Context

In January 2026, production users (e.g., eve.thompson with `executive` role) received 403 Forbidden errors when accessing MCP Gateway API endpoints. The same users worked correctly in dev and stage environments.

**Symptoms**:
- User authenticates successfully via Keycloak
- Portal loads correctly
- API calls to `/api/mcp/*` return 403 Forbidden
- JWT token has empty `realm_access.roles` array

## Decision

Document the root cause and establish the production user provisioning policy that prevents automated group assignment.

### Root Cause

The `sync-realm.sh` script **intentionally skips** user-to-group assignment in production:

```bash
# keycloak/scripts/sync-realm.sh lines 609-612
if [ "$ENV" = "prod" ]; then
    log_info "Skipping user group assignment in production"
    return 0
fi
```

### Why This Design Exists

Production has stricter security requirements:

| Environment | User Provisioning | Group Assignment | Rationale |
|-------------|-------------------|------------------|-----------|
| **Dev** | Automated (identity-sync) | Automated (sync-realm.sh) | Fast iteration |
| **Stage** | Automated (identity-sync) | Automated (sync-realm.sh) | Production-like testing |
| **Prod** | Manual / Controlled | **Manual Only** | Security compliance |

**Security Rationale**:
- Production users shouldn't be auto-assigned roles
- Privilege escalation requires explicit approval
- Audit trail for role assignments
- Prevents accidental over-provisioning

### Role Inheritance Flow

```
User ──belongs to──► Group ──has──► Realm Roles ──included in──► JWT

Example:
eve.thompson → C-Suite → executive role → realm_access.roles: ["executive"]

Problem in Prod:
eve.thompson → (no group) → (no roles) → realm_access.roles: []
```

### JWT Token Comparison

**Working (Dev/Stage)**:
```json
{
  "realm_access": {
    "roles": ["executive", "manager", "default-roles-tamshai-corp"]
  }
}
```

**Broken (Prod)**:
```json
{
  "realm_access": {
    "roles": ["default-roles-tamshai-corp"]
  }
}
```

## Remediation Options

### Option A: Manual Keycloak Admin (Recommended)

**Steps**:
1. Access Keycloak Admin Console
2. Navigate: Users → Search user → Groups tab
3. Click "Join Group" → Select appropriate group
4. User must logout and login to get new token

**Pros**: Maintains security model, creates audit trail
**Cons**: Manual effort for each user

### Option B: Enable Automated Assignment in Prod

**NOT RECOMMENDED** because:
- Violates security model
- No approval workflow
- Risk of privilege escalation

### Option C: Provision via API with Approval

**Future Enhancement**:
- Admin requests group assignment via API
- Approval workflow (manager sign-off)
- Automated execution after approval
- Full audit trail

## Consequences

### Positive

- **Security Maintained**: Production requires explicit role assignment
- **Audit Trail**: Manual assignments are logged in Keycloak
- **Intentional Design**: This is not a bug, it's a security feature
- **Clear Documentation**: CLAUDE.md documents this policy

### Negative

- **Manual Overhead**: Each production user needs manual setup
- **Confusing Initially**: Works in dev/stage, fails in prod
- **No Self-Service**: Users can't request their own roles

### Prevention Checklist

When deploying new users to production:

1. ✅ User created via identity-sync or manual
2. ✅ User can authenticate (username + TOTP)
3. ⚠️ **Must manually assign group in Keycloak Admin**
4. ✅ User logout/login to refresh token
5. ✅ Verify roles in JWT (decode at jwt.io)
6. ✅ Test API access

## Investigation Timeline

```
Jan 12, 2026
├── 09:00 - eve.thompson reports 403 errors
├── 09:15 - Confirmed: auth works, API fails
├── 09:30 - JWT decoded: empty roles array
├── 10:00 - Compared dev vs prod tokens
├── 10:30 - Found sync-realm.sh skip logic
├── 11:00 - Root cause confirmed
├── 11:30 - Manual remediation applied
└── 12:00 - User access restored
```

## References

- `docs/troubleshooting/PROD_403_REMEDIATION_PLAN.md` - Full remediation plan
- `docs/security/IAM_SECURITY_REMEDIATION_PLAN.md` - Security remediation
- `SECURITY_INCIDENT_2026-01-09.md` - Related incident documentation
- `keycloak/scripts/sync-realm.sh` - Script with skip logic
- `CLAUDE.md` - Documents production user provisioning policy

## Related Decisions

- ADR-009: Keycloak 23 Configuration Challenges (group/role patterns)
- ADR-010: Test User TOTP Strategy (test-user.journey is exception)

---

*This ADR is part of the Tamshai Project Journey - when "working in dev but not prod" is actually correct behavior.*
