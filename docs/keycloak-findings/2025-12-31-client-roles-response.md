Based on the diagnosis files you provided (`KEYCLOAK_CLIENT_ROLES_ISSUE.md` and `index.ts`), I have identified **two distinct critical issues** that are conspiring to fail your tests.

You are currently chasing a "Ghost" (the 401 error) while a real logic bug (the Role Extraction) is waiting behind it.

### Root Cause Analysis

#### 1\. The "False Flag" 401 Error

You suspected `resource_access: null` is causing the `401 Unauthorized`. **This is incorrect.**

* **Evidence:** Your `services/mcp-gateway/src/index.ts` uses `?.` optional chaining (`payload.realm_access?.roles`). Missing roles/claims do **not** throw an error during token validation; they simply result in a user with empty roles.
* **Real Cause:** The `401` is definitely occurring because `jwt.verify` is throwing an exception. This confirms the **Issuer Mismatch** (identified in the previous turn) is still present.
  * **Token Issuer:** `http://127.0.0.1:8180/...` (from your "Actual JWT" snippet)
  * **Gateway Expectation:** `http://localhost:8180/...` (Default in `index.ts`)
  * **Result:** `jwt.verify` fails → `catch` block → returns `401 Invalid or expired token`.

#### 2\. The Hidden Logic Bug (The "Roles" Issue)

Even if you fix the 401, your permissions will **still fail** because your Gateway code **completely ignores Client Roles**.

* **Your Terraform:** Creates **Client Roles** (Correct best practice).
* **Your Code (`index.ts` Line 223):**

TypeScript

*     `// ❌ Only checks Realm Roles  
    const realmRoles = payload.realm_access?.roles || []  
    `

  
* **Result:** Even if Keycloak sends the roles in `resource_access`, your code blindly ignores them, resulting in a user with no permissions.

---

### 🚀 The Fix Plan

You need to apply **both** fixes below to resolve the integration test failures.

#### Fix 1: Update Gateway to Support Client Roles

Modify `services/mcp-gateway/src/index.ts` to read roles from both `realm_access` (legacy/global) and `resource_access` (client-specific).

TypeScript
    
    `// In services/mcp-gateway/src/index.ts (~Line 223)  
      
    // REPLACE THIS:  
    // const realmRoles = payload.realm_access?.roles || [];  
      
    // WITH THIS:  
    const realmRoles = payload.realm_access?.roles || [];  
    const clientRoles = payload.resource_access?.[config.keycloak.clientId]?.roles || [];  
      
    // Merge and deduplicate  
    const allRoles = Array.from(new Set([...realmRoles, ...clientRoles]));  
      
    // Update resolution  
    resolve({  
    userId: payload.sub || '',  
    username: username,  
    email: payload.email || '',  
    roles: allRoles, // <--- Use the merged list  
    groups: groups,  
    });`

#### Fix 2: Force Issuer Match in CI (To fix the 401)

You must tell the Gateway to expect the `127.0.0.1` issuer that the test runner is generating.

**In `.github/workflows/ci.yml` (Integration Test Job):**

YAML
    
    `- name: Start MCP Gateway  
    run: npm start &  
    env:  
    PORT: 3100  
    # CRITICAL: Must match the URL used by the test runner (jest.setup.js)  
    KEYCLOAK_URL: http://127.0.0.1:8180  
    KEYCLOAK_REALM: tamshai-corp  
    KEYCLOAK_CLIENT_ID: mcp-gateway`

### Summary

1. **401 Error:** Caused by `KEYCLOAK_URL` mismatch in CI (`localhost` vs `127.0.0.1`).
2. **Missing Permissions:** Caused by `index.ts` failing to read `resource_access`.
3. **`resource_access: null`**: This might still be true in your debug output, but once you fix the code to _look_ for it, and ensure your Terraform maps the roles, it should work. _Note: You may also need to ensure the `roles` scope is requested in your tests if it isn't added by default._
