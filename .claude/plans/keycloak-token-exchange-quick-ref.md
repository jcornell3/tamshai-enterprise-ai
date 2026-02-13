# Keycloak Token Exchange - Quick Reference

**Status**: ✅ **RESOLVED** - Read-Modify-Write pattern successful
**Last Updated**: 2026-02-12 18:30 PST
**Full Details**: `keycloak-token-exchange-blocking-issue.md`

---

## 🎉 Resolution

**Solution**: Use Read-Modify-Write pattern via script:

```bash
cd keycloak/scripts
./configure-token-exchange.sh
```

**Result**: Token exchange now works! 9 of 16 tests passing.

**Root Cause**: Keycloak Authorization API requires full permission object, not partial updates.

---

## Quick Summary (Original Issue - RESOLVED)

**Problem**: Cannot bind client policy to impersonation permission via Keycloak Admin REST API. The `policies` field remains `null` after PUT requests.

**Impact**: Blocks integration test migration from ROPC to token exchange.

**Environment**: Keycloak 24.0.5, Docker, features enabled: `token-exchange`, `admin-fine-grained-authz`

---

## What's Working ✅

- Keycloak features enabled in Dockerfile
- Service account client created (`mcp-integration-runner`)
- Impersonation role granted to service account
- Users permissions enabled
- Client policy created
- Client credentials authentication works

---

## What's Broken ❌

**Failing API Call**:

```bash
curl -X PUT "http://localhost:8180/auth/admin/realms/tamshai-corp/clients/f0408dd8-81f9-4bc9-8207-fc1c782c0070/authz/resource-server/permission/scope/efd9e24d-0f0e-462b-8c91-1dcd16bde196" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "efd9e24d-0f0e-462b-8c91-1dcd16bde196",
    "name": "admin-impersonating.permission.users",
    "policies": ["cfdb972d-6ce9-4fdf-9216-a83d71707ec1"]
  }'
```

**Result**: HTTP 200, but subsequent GET shows `policies: null`

**Token Exchange Error**:

```json
{
  "error": "access_denied",
  "error_description": "Client not allowed to exchange"
}
```

**Keycloak Log**:

```
reason="subject not allowed to impersonate"
```

---

## Quick Fix (Recommended)

### Use Admin UI + Realm Export

1. **Access Admin Console**: <http://localhost:8180/auth/admin>
2. **Navigate**: Users → Permissions → impersonate link
3. **Create Policy**: Add `mcp-integration-runner` client to policy
4. **Bind Policy**: Add to impersonate permission
5. **Test**: Run token exchange test
6. **Export Realm**:

   ```bash
   docker compose exec keycloak /opt/keycloak/bin/kc.sh export \
     --dir /tmp/export \
     --realm tamshai-corp
   ```

7. **Update**: Copy export to `keycloak/realm-export-dev.json`
8. **Commit**: Changes now survive Phoenix rebuilds

**Time**: ~15 minutes

---

## Key UUIDs

| Resource | UUID |
|----------|------|
| mcp-integration-runner | `1d627f52-bb73-40fe-93f5-812b40cebdaf` |
| Service account user | `94a85f93-7969-4622-a87e-ca454cc56f92` |
| realm-management | `f0408dd8-81f9-4bc9-8207-fc1c782c0070` |
| impersonate permission | `efd9e24d-0f0e-462b-8c91-1dcd16bde196` |
| Client policy | `cfdb972d-6ce9-4fdf-9216-a83d71707ec1` |

---

## References

- [Keycloak Token Exchange](https://www.keycloak.org/securing-apps/token-exchange)
- [GitHub Issue #35902](https://github.com/keycloak/keycloak/issues/35902)
- [POC Example](https://github.com/masalinas/poc-keycloak-token-exchange)

---

## Test Command

```bash
# After fixing, test with:
cd tests/integration
npm test -- auth-token-exchange.test.ts

# Expected: 16 passing tests
```
