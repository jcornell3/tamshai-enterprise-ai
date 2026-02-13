# Multi-Realm Keycloak Configuration

## 1. Overview

The Customer Support Portal uses a separate Keycloak realm (`tamshai-customers`) to maintain complete security isolation between employees and external customers.

## 2. Realm Comparison

| Aspect | tamshai (Internal) | tamshai-customers (External) |
|--------|-------------------|------------------------------|
| **Purpose** | Employee authentication | Customer authentication |
| **Users** | Tamshai Corp employees | External customer contacts |
| **Roles** | hr-read, finance-write, executive | lead-customer, basic-customer |
| **MFA** | Required (TOTP) | Optional (customer choice) |
| **Password Policy** | 12+ chars, complexity | 8+ chars, basic |
| **Session Timeout** | 30 min access, 8hr refresh | 4 hr access, 8hr refresh |
| **Self-Registration** | Disabled | Disabled (admin-only) |
| **Email Verification** | Not required (internal) | Required |

## 3. tamshai-customers Realm Configuration

### 3.1 Realm Settings

```json
{
  "realm": "tamshai-customers",
  "enabled": true,
  "displayName": "Tamshai Customer Support",
  "displayNameHtml": "<div class=\"kc-logo-text\"><span>Tamshai</span> Customer Portal</div>",
  "registrationAllowed": false,
  "registrationEmailAsUsername": true,
  "verifyEmail": true,
  "loginWithEmailAllowed": true,
  "duplicateEmailsAllowed": false,
  "resetPasswordAllowed": true,
  "rememberMe": true,
  "bruteForceProtected": true,
  "maxFailureWaitSeconds": 900,
  "maxDeltaTimeSeconds": 43200,
  "failureFactor": 5,
  "defaultSignatureAlgorithm": "RS256",
  "accessTokenLifespan": 14400,
  "accessTokenLifespanForImplicitFlow": 14400,
  "ssoSessionIdleTimeout": 28800,
  "ssoSessionMaxLifespan": 36000,
  "offlineSessionIdleTimeout": 2592000,
  "accessCodeLifespan": 60,
  "accessCodeLifespanUserAction": 300
}
```

### 3.2 Roles

```json
{
  "roles": {
    "realm": [
      {
        "name": "lead-customer",
        "description": "Lead Customer Contact - can view all org tickets and manage contacts",
        "composite": false
      },
      {
        "name": "basic-customer",
        "description": "Basic Customer - can only view/create own tickets",
        "composite": false
      }
    ]
  }
}
```

### 3.3 Client Configuration

```json
{
  "clients": [
    {
      "clientId": "customer-portal",
      "name": "Customer Support Portal",
      "description": "Customer-facing support portal web application",
      "enabled": true,
      "publicClient": true,
      "standardFlowEnabled": true,
      "implicitFlowEnabled": false,
      "directAccessGrantsEnabled": false,
      "serviceAccountsEnabled": false,
      "protocol": "openid-connect",
      "rootUrl": "${CUSTOMER_PORTAL_URL}",
      "baseUrl": "/",
      "redirectUris": [
        "http://localhost:4006/*",
        "https://customers.tamshai-playground.local/*"
      ],
      "webOrigins": [
        "http://localhost:4006",
        "https://customers.tamshai-playground.local"
      ],
      "attributes": {
        "pkce.code.challenge.method": "S256",
        "post.logout.redirect.uris": "http://localhost:4006/*##https://customers.tamshai-playground.local/*"
      },
      "defaultClientScopes": [
        "openid",
        "profile",
        "email",
        "organization"
      ],
      "optionalClientScopes": []
    }
  ]
}
```

### 3.4 Custom Scope: Organization

Include `organization_id` in JWT claims for RLS filtering.

```json
{
  "clientScopes": [
    {
      "name": "organization",
      "description": "Organization membership scope",
      "protocol": "openid-connect",
      "attributes": {
        "include.in.token.scope": "true",
        "display.on.consent.screen": "true"
      },
      "protocolMappers": [
        {
          "name": "organization_id",
          "protocol": "openid-connect",
          "protocolMapper": "oidc-usermodel-attribute-mapper",
          "consentRequired": false,
          "config": {
            "userinfo.token.claim": "true",
            "user.attribute": "organization_id",
            "id.token.claim": "true",
            "access.token.claim": "true",
            "claim.name": "organization_id",
            "jsonType.label": "String"
          }
        },
        {
          "name": "organization_name",
          "protocol": "openid-connect",
          "protocolMapper": "oidc-usermodel-attribute-mapper",
          "consentRequired": false,
          "config": {
            "userinfo.token.claim": "true",
            "user.attribute": "organization_name",
            "id.token.claim": "true",
            "access.token.claim": "true",
            "claim.name": "organization_name",
            "jsonType.label": "String"
          }
        }
      ]
    }
  ]
}
```

### 3.5 Audience Mapper for MCP Gateway

```json
{
  "protocolMappers": [
    {
      "name": "mcp-gateway-audience",
      "protocol": "openid-connect",
      "protocolMapper": "oidc-audience-mapper",
      "consentRequired": false,
      "config": {
        "included.client.audience": "mcp-gateway",
        "id.token.claim": "false",
        "access.token.claim": "true"
      }
    }
  ]
}
```

## 4. Password Policy

### 4.1 tamshai (Internal)

```json
{
  "passwordPolicy": "length(12) and digits(1) and upperCase(1) and lowerCase(1) and specialChars(1) and notUsername and passwordHistory(5)"
}
```

### 4.2 tamshai-customers (External)

```json
{
  "passwordPolicy": "length(8) and digits(1) and notUsername"
}
```

## 5. Sample Users

### 5.1 Acme Corporation (Enterprise Tier)

```json
{
  "users": [
    {
      "username": "jane.smith@acme.com",
      "email": "jane.smith@acme.com",
      "firstName": "Jane",
      "lastName": "Smith",
      "enabled": true,
      "emailVerified": true,
      "attributes": {
        "organization_id": ["org-acme-001"],
        "organization_name": ["Acme Corporation"]
      },
      "credentials": [
        {
          "type": "password",
          "value": "AcmeLead123!",
          "temporary": false
        }
      ],
      "realmRoles": ["lead-customer"]
    },
    {
      "username": "bob.developer@acme.com",
      "email": "bob.developer@acme.com",
      "firstName": "Bob",
      "lastName": "Developer",
      "enabled": true,
      "emailVerified": true,
      "attributes": {
        "organization_id": ["org-acme-001"],
        "organization_name": ["Acme Corporation"]
      },
      "credentials": [
        {
          "type": "password",
          "value": "AcmeDev123!",
          "temporary": false
        }
      ],
      "realmRoles": ["basic-customer"]
    }
  ]
}
```

### 5.2 Globex Industries (Professional Tier)

```json
{
  "users": [
    {
      "username": "mike.manager@globex.com",
      "email": "mike.manager@globex.com",
      "firstName": "Mike",
      "lastName": "Manager",
      "enabled": true,
      "emailVerified": true,
      "attributes": {
        "organization_id": ["org-globex-002"],
        "organization_name": ["Globex Industries"]
      },
      "realmRoles": ["lead-customer"]
    },
    {
      "username": "sara.support@globex.com",
      "email": "sara.support@globex.com",
      "firstName": "Sara",
      "lastName": "Support",
      "enabled": true,
      "emailVerified": true,
      "attributes": {
        "organization_id": ["org-globex-002"],
        "organization_name": ["Globex Industries"]
      },
      "realmRoles": ["basic-customer"]
    }
  ]
}
```

### 5.3 Initech Solutions (Basic Tier)

```json
{
  "users": [
    {
      "username": "peter.principal@initech.com",
      "email": "peter.principal@initech.com",
      "firstName": "Peter",
      "lastName": "Principal",
      "enabled": true,
      "emailVerified": true,
      "attributes": {
        "organization_id": ["org-initech-003"],
        "organization_name": ["Initech Solutions"]
      },
      "realmRoles": ["lead-customer"]
    },
    {
      "username": "tim.tech@initech.com",
      "email": "tim.tech@initech.com",
      "firstName": "Tim",
      "lastName": "Tech",
      "enabled": true,
      "emailVerified": true,
      "attributes": {
        "organization_id": ["org-initech-003"],
        "organization_name": ["Initech Solutions"]
      },
      "realmRoles": ["basic-customer"]
    }
  ]
}
```

## 6. JWT Token Claims

### 6.1 Internal Token (tamshai)

```json
{
  "exp": 1706900000,
  "iat": 1706896400,
  "iss": "http://keycloak:8080/realms/tamshai",
  "aud": ["mcp-gateway", "account"],
  "sub": "user-uuid-001",
  "preferred_username": "alice.chen",
  "realm_access": {
    "roles": ["hr-read", "hr-write", "employee"]
  },
  "resource_access": {
    "mcp-gateway": {
      "roles": ["mcp-gateway"]
    }
  }
}
```

### 6.2 Customer Token (tamshai-customers)

```json
{
  "exp": 1706910400,
  "iat": 1706896400,
  "iss": "http://keycloak:8080/realms/tamshai-customers",
  "aud": ["mcp-gateway", "customer-portal"],
  "sub": "customer-uuid-001",
  "preferred_username": "jane.smith@acme.com",
  "email": "jane.smith@acme.com",
  "organization_id": "org-acme-001",
  "organization_name": "Acme Corporation",
  "realm_access": {
    "roles": ["lead-customer"]
  }
}
```

## 7. Dual-Realm Token Validation

### 7.1 JWKS Endpoints

| Realm | JWKS URI |
|-------|----------|
| tamshai | `http://keycloak:8080/realms/tamshai/protocol/openid-connect/certs` |
| tamshai-customers | `http://keycloak:8080/realms/tamshai-customers/protocol/openid-connect/certs` |

### 7.2 Validation Flow

```typescript
interface DualRealmValidator {
  validateToken(token: string): Promise<ValidatedToken>;
}

interface ValidatedToken {
  realm: 'internal' | 'customer';
  userId: string;
  roles: string[];
  organizationId?: string;  // Only for customer tokens
  username: string;
}

// Implementation pseudocode
async function validateToken(token: string): Promise<ValidatedToken> {
  // 1. Try internal realm first
  try {
    const decoded = await verifyWithJWKS(token, INTERNAL_JWKS_URI);
    return {
      realm: 'internal',
      userId: decoded.sub,
      roles: decoded.realm_access?.roles || [],
      username: decoded.preferred_username
    };
  } catch (internalError) {
    // Not a valid internal token, try customer realm
  }

  // 2. Try customer realm
  try {
    const decoded = await verifyWithJWKS(token, CUSTOMER_JWKS_URI);
    return {
      realm: 'customer',
      userId: decoded.sub,
      roles: decoded.realm_access?.roles || [],
      organizationId: decoded.organization_id,
      username: decoded.preferred_username
    };
  } catch (customerError) {
    throw new Error('Invalid token: not valid for any realm');
  }
}
```

## 8. sync-realm.sh Extensions

```bash
#!/bin/bash

# Sync customer realm configuration

sync_customer_realm() {
    echo "Syncing tamshai-customers realm..."

    # Get admin token
    local admin_token=$(get_admin_token)

    # Create realm if not exists
    create_realm_if_not_exists "tamshai-customers" "$admin_token"

    # Create roles
    create_role "tamshai-customers" "lead-customer" "$admin_token"
    create_role "tamshai-customers" "basic-customer" "$admin_token"

    # Create client
    create_customer_portal_client "$admin_token"

    # Create organization scope
    create_organization_scope "$admin_token"

    # Provision sample users (dev only)
    if [[ "$ENVIRONMENT" == "dev" ]]; then
        provision_sample_customers "$admin_token"
    fi

    echo "Customer realm sync complete."
}

create_customer_portal_client() {
    local admin_token=$1
    local client_json='{
        "clientId": "customer-portal",
        "name": "Customer Support Portal",
        "enabled": true,
        "publicClient": true,
        "standardFlowEnabled": true,
        "redirectUris": ["http://localhost:4006/*", "https://customers.tamshai-playground.local/*"],
        "webOrigins": ["http://localhost:4006", "https://customers.tamshai-playground.local"],
        "attributes": {
            "pkce.code.challenge.method": "S256"
        },
        "defaultClientScopes": ["openid", "profile", "email", "organization"]
    }'

    create_or_update_client "tamshai-customers" "customer-portal" "$client_json" "$admin_token"
}
```

## 9. Theme Customization (Optional)

For customer-facing login, customize the Keycloak theme:

```
keycloak/themes/tamshai-customers/
├── login/
│   ├── theme.properties
│   ├── resources/
│   │   └── css/
│   │       └── login.css
│   └── messages/
│       └── messages_en.properties
```

### Login Page Customization

```css
/* login.css */
.kc-logo-text span {
    font-weight: bold;
    color: #1a56db;
}

#kc-header-wrapper {
    background: linear-gradient(135deg, #1a56db 0%, #3b82f6 100%);
}

.btn-primary {
    background-color: #1a56db;
    border-color: #1a56db;
}
```
