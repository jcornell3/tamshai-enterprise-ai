# Security Model

## Document Information
- **Version**: 1.0
- **Classification**: Internal
- **Organization**: Tamshai Corp

---

## 1. Security Overview

This document details the security architecture for the Tamshai Corp Enterprise AI Access System. The system is designed with a "security-first" approach, ensuring that AI assistants operate within the same security boundaries as traditional enterprise applications.

### 1.1 Security Objectives

1. **Confidentiality**: AI can only access data the authenticated user is authorized to see
2. **Integrity**: AI responses are based only on authorized, unmodified data
3. **Availability**: Security controls do not unreasonably impede legitimate use
4. **Accountability**: All AI data access is logged and attributable to specific users
5. **Non-repudiation**: Users cannot deny AI queries made with their credentials

---

## 2. Identity and Access Management

### 2.1 Authentication Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    Authentication Flow                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│   ┌─────────┐          ┌───────────┐          ┌──────────┐       │
│   │  User   │          │ Keycloak  │          │   MFA    │       │
│   │ Device  │          │   IdP     │          │  Device  │       │
│   └────┬────┘          └─────┬─────┘          └────┬─────┘       │
│        │                     │                     │              │
│        │  1. Auth Request    │                     │              │
│        │────────────────────>│                     │              │
│        │                     │                     │              │
│        │  2. Login Page      │                     │              │
│        │<────────────────────│                     │              │
│        │                     │                     │              │
│        │  3. Credentials     │                     │              │
│        │────────────────────>│                     │              │
│        │                     │                     │              │
│        │                     │  4. MFA Challenge   │              │
│        │<────────────────────│                     │              │
│        │                     │                     │              │
│        │                     │  5. TOTP Code       │              │
│        │                     │<────────────────────│              │
│        │                     │                     │              │
│        │  6. Verify MFA      │                     │              │
│        │────────────────────>│                     │              │
│        │                     │                     │              │
│        │  7. Tokens (JWT)    │                     │              │
│        │<────────────────────│                     │              │
│        │                     │                     │              │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 Token Architecture

#### Access Token (JWT)
```json
{
  "header": {
    "alg": "RS256",
    "typ": "JWT",
    "kid": "keycloak-signing-key-id"
  },
  "payload": {
    "exp": 1699003600,
    "iat": 1699003300,
    "jti": "unique-token-id",
    "iss": "https://auth.tamshai-playground.local/realms/tamshai-corp",
    "aud": ["ai-desktop", "mcp-gateway"],
    "sub": "user-uuid-12345",
    "typ": "Bearer",
    "azp": "ai-desktop",
    "session_state": "session-uuid",
    "acr": "1",
    "realm_access": {
      "roles": ["hr-read", "hr-write"]
    },
    "scope": "openid profile email",
    "email_verified": true,
    "preferred_username": "alice.chen",
    "given_name": "Alice",
    "family_name": "Chen",
    "email": "alice@tamshai-playground.local"
  },
  "signature": "..."
}
```

#### Token Lifetimes
| Token Type | Lifetime | Rationale |
|------------|----------|-----------|
| Access Token | 5 minutes | Minimize window of token theft exploitation |
| Refresh Token | 30 minutes | Balance security with user experience |
| Refresh Token (idle) | 15 minutes | Auto-logout for abandoned sessions |

#### Token Revocation Strategy (v1.5)

Token revocation is handled via a **cached approach** rather than synchronous Redis lookups:

**Architecture**:
1. When a token is revoked, it is written to Redis with key `revoked:{jti}` and TTL matching token expiry
2. The MCP Gateway maintains an **in-memory cache** (`Set<JTI>`) of revoked tokens
3. Background task syncs from Redis every 2 seconds (configurable)
4. Token validation checks the local cache (O(1)) instead of Redis

**Trade-offs**:
| Aspect | Benefit | Cost |
|--------|---------|------|
| Latency | Removes 5-15ms Redis RTT per request | N/A |
| Availability | Redis failure doesn't block auth | Stale cache used during outage |
| Revocation Delay | N/A | Up to 2-second window for revoked tokens |

**Fail-Open Behavior**: When Redis is unavailable, the system uses the last known cache state and logs a warning. This is acceptable because:
- Access tokens have short 5-minute lifetimes
- The 2-second sync interval means cache is usually fresh
- Explicit revocation is rare (logout, security incident)

**Configuration**:
```bash
TOKEN_REVOCATION_SYNC_MS=2000      # Cache sync interval (default: 2 seconds)
TOKEN_REVOCATION_FAIL_OPEN=true   # Use stale cache on Redis failure
```

**See Also**: Architecture Overview Section 9.1 for implementation details.

### 2.3 Multi-Factor Authentication

**Supported Methods**:
1. **TOTP** (Time-based One-Time Password)
   - Apps: Google Authenticator, Authy, Microsoft Authenticator
   - 6-digit codes, 30-second rotation
   
2. **WebAuthn** (Hardware Keys)
   - YubiKey, platform authenticators
   - Phishing-resistant

**MFA Policy**:
- Required for all users
- Enrolled during first login
- Recovery codes generated at enrollment

---

## 3. Authorization Model

### 3.1 Role-Based Access Control (RBAC)

```
┌─────────────────────────────────────────────────────────────────┐
│                    RBAC Hierarchy                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│                      ┌────────────────┐                          │
│                      │   executive    │ (composite)              │
│                      └───────┬────────┘                          │
│                              │                                   │
│           ┌──────────────────┼──────────────────┐                │
│           │                  │                  │                │
│           ▼                  ▼                  ▼                │
│   ┌───────────────┐ ┌───────────────┐ ┌───────────────┐          │
│   │   hr-read     │ │ finance-read  │ │  sales-read   │ ...      │
│   └───────┬───────┘ └───────┬───────┘ └───────┬───────┘          │
│           │                 │                 │                  │
│           ▼                 ▼                 ▼                  │
│   ┌───────────────┐ ┌───────────────┐ ┌───────────────┐          │
│   │   hr-write    │ │finance-write  │ │ sales-write   │          │
│   └───────────────┘ └───────────────┘ └───────────────┘          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Role Definitions

| Role | Description | Permissions |
|------|-------------|-------------|
| `hr-read` | View HR data | Employee names, departments, org chart |
| `hr-write` | Manage HR data | + Salaries, performance data |
| `finance-read` | View financial data | Budget summaries, public reports |
| `finance-write` | Manage financial data | + Detailed financials, invoices |
| `sales-read` | View CRM data | Company names, deal pipeline |
| `sales-write` | Manage CRM data | + Contact details, deal values |
| `support-read` | View support data | Tickets (masked PII), KB articles |
| `support-write` | Manage support data | + Full ticket details |
| `executive` | Executive access | All *-read roles (composite) |

### 3.3 Group to Role Mapping

```yaml
groups:
  HR-Department:
    roles: [hr-read, hr-write]
    description: "Human Resources team members"
    
  Finance-Team:
    roles: [finance-read, finance-write]
    description: "Finance department staff"
    
  Sales-Team:
    roles: [sales-read]
    description: "Sales representatives (limited CRM access)"
    
  Sales-Managers:
    roles: [sales-read, sales-write]
    description: "Sales management (full CRM access)"
    
  Support-Team:
    roles: [support-read]
    description: "Customer support agents"
    
  C-Suite:
    roles: [executive]
    description: "Executive leadership"
```

---

## 4. Data Protection

### 4.1 Data Classification

| Classification | Examples | AI Access Rules |
|---------------|----------|-----------------|
| **Public** | Company policies, KB articles | Any authenticated user |
| **Internal** | Org charts, department budgets | Role-based access |
| **Confidential** | Salaries, customer contacts | Write-role holders only |
| **Restricted** | Executive compensation, M&A | Not accessible via AI |

### 4.2 Data Masking

For sensitive fields accessible to read-only roles:

```javascript
// Original customer record
{
  "company": "Acme Corp",
  "contact": {
    "name": "John Smith",
    "email": "john@acme.com",
    "phone": "+1-555-123-4567"
  }
}

// Masked for sales-read role
{
  "company": "Acme Corp",
  "contact": {
    "name": "J*** S****",
    "email": "j***@acme.com",
    "phone": "+1-555-***-****"
  }
}
```

### 4.3 Query Filtering

The MCP Gateway applies filters before data reaches the AI:

```typescript
interface QueryFilter {
  // Remove restricted fields before sending to AI
  filterFields(data: any, userRoles: string[]): any;

  // Limit result set size
  limitResults(data: any[], maxResults: number): any[];

  // Mask PII based on role
  maskPII(data: any, userRoles: string[]): any;
}
```

### 4.4 Row-Level Security (RLS)

PostgreSQL Row-Level Security provides an additional defense layer at the database level, ensuring data isolation even if application-level controls are bypassed.

#### 4.4.1 Database User Separation

| User | Purpose | BYPASSRLS | Usage |
|------|---------|-----------|-------|
| `tamshai` | Admin/Migrations | Yes | Schema changes, data loading |
| `tamshai_app` | Application | No | All MCP server connections |

**Critical**: MCP servers connect as `tamshai_app` which is subject to RLS policies.

#### 4.4.2 Session Variables

RLS policies use session variables set by MCP servers on each connection:

```sql
-- Set by MCP server before executing queries
SET app.current_user_id = 'user-uuid-12345';
SET app.current_user_email = 'alice.chen@tamshai.com';
SET app.current_user_roles = '["hr-read", "hr-write"]';
SET app.current_user_department = 'HR';
```

#### 4.4.3 RLS Policy Types

**Public Read Policies** (reference data):
```sql
-- Anyone can read reference tables
CREATE POLICY "departments_public_read" ON hr.departments
  FOR SELECT USING (true);

CREATE POLICY "grade_levels_public_read" ON hr.grade_levels
  FOR SELECT USING (true);

CREATE POLICY "fiscal_years_public_read" ON finance.fiscal_years
  FOR SELECT USING (true);
```

**Role-Based Read Policies** (sensitive data):
```sql
-- Users can only see employees they are authorized to access
CREATE POLICY "employees_role_read" ON hr.employees
  FOR SELECT USING (
    -- User can always see themselves
    employee_id::text = current_setting('app.current_user_id', true)
    OR
    -- Users with hr-read can see all
    current_setting('app.current_user_roles', true)::jsonb ? 'hr-read'
    OR
    -- Managers can see their direct reports
    manager_id::text = current_setting('app.current_user_id', true)
  );
```

**Write Policies** (destructive operations):
```sql
-- Only HR staff can modify employee records
CREATE POLICY "employees_hr_write" ON hr.employees
  FOR ALL USING (
    current_setting('app.current_user_roles', true)::jsonb ? 'hr-write'
  );

-- Employees can update their own non-sensitive fields
CREATE POLICY "employees_self_update" ON hr.employees
  FOR UPDATE USING (
    employee_id::text = current_setting('app.current_user_id', true)
  )
  WITH CHECK (
    -- Cannot change their own salary, department, or manager
    employee_id::text = current_setting('app.current_user_id', true)
  );
```

#### 4.4.4 Testing RLS Policies

Integration tests verify RLS enforcement using separate database clients:

```typescript
// Test setup: Create RLS-enforced client
const userClient = createUserClient({
  userId: 'alice-uuid',
  email: 'alice@tamshai.com',
  roles: ['hr-read'],
  department: 'HR'
});

// Test: User cannot see salary without hr-write
const result = await userClient.query(
  'SELECT salary FROM hr.employees WHERE employee_id = $1',
  [otherEmployeeId]
);
expect(result.rows).toHaveLength(0);  // RLS blocks access
```

---

## 5. Network Security

### 5.1 Network Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Internet                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                     ┌───────▼───────┐
                     │   Cloud LB    │
                     │  (TLS 1.3)    │
                     └───────┬───────┘
                             │
            ┌────────────────┴────────────────┐
            │                                 │
    ┌───────▼───────┐               ┌────────▼────────┐
    │   Keycloak    │               │      Kong       │
    │   (DMZ)       │               │    (DMZ)        │
    └───────┬───────┘               └────────┬────────┘
            │                                │
            │         ┌──────────────────────┘
            │         │
    ┌───────▼─────────▼───────┐
    │    Internal Network      │
    │  ┌───────────────────┐  │
    │  │   MCP Gateway     │  │
    │  └─────────┬─────────┘  │
    │            │            │
    │  ┌─────────▼─────────┐  │
    │  │    MCP Servers    │  │
    │  └─────────┬─────────┘  │
    │            │            │
    │  ┌─────────▼─────────┐  │
    │  │    Databases      │  │
    │  └───────────────────┘  │
    └─────────────────────────┘
```

### 5.2 TLS Configuration

**Minimum Requirements**:
- TLS 1.3 (TLS 1.2 acceptable for legacy clients)
- Strong cipher suites only
- HSTS enabled with long max-age
- Certificate pinning in mobile apps

**Cipher Suites (Priority Order)**:
```
TLS_AES_256_GCM_SHA384
TLS_CHACHA20_POLY1305_SHA256
TLS_AES_128_GCM_SHA256
```

### 5.3 Firewall Rules

| Source | Destination | Port | Protocol | Allow |
|--------|-------------|------|----------|-------|
| Internet | Load Balancer | 443 | HTTPS | ✓ |
| Load Balancer | Keycloak | 8080 | HTTP | ✓ |
| Load Balancer | Kong | 8000 | HTTP | ✓ |
| Kong | MCP Gateway | 3000 | HTTP | ✓ |
| MCP Gateway | MCP Servers | 3001-3004 | HTTP | ✓ |
| MCP Servers | Databases | Various | TCP | ✓ |
| * | * | * | * | ✗ |

---

## 6. Secure Token Storage

### 6.1 Desktop (Electron)

Using Electron's `safeStorage` API which leverages OS-level encryption:

```typescript
import { safeStorage } from 'electron';

class TokenStore {
  private readonly TOKEN_KEY = 'tamshai_tokens';
  
  async storeTokens(tokens: Tokens): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure storage not available');
    }
    const encrypted = safeStorage.encryptString(JSON.stringify(tokens));
    await keytar.setPassword('tamshai-ai', 'tokens', encrypted.toString('base64'));
  }
  
  async getTokens(): Promise<Tokens | null> {
    const encrypted = await keytar.getPassword('tamshai-ai', 'tokens');
    if (!encrypted) return null;
    const decrypted = safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
    return JSON.parse(decrypted);
  }
  
  async clearTokens(): Promise<void> {
    await keytar.deletePassword('tamshai-ai', 'tokens');
  }
}
```

### 6.2 Android

Using EncryptedSharedPreferences with Android Keystore:

```kotlin
class SecureTokenStore(context: Context) {
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()
    
    private val sharedPreferences = EncryptedSharedPreferences.create(
        context,
        "tamshai_secure_prefs",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )
    
    fun storeTokens(tokens: Tokens) {
        sharedPreferences.edit()
            .putString("access_token", tokens.accessToken)
            .putString("refresh_token", tokens.refreshToken)
            .apply()
    }
    
    fun getTokens(): Tokens? {
        val access = sharedPreferences.getString("access_token", null)
        val refresh = sharedPreferences.getString("refresh_token", null)
        return if (access != null && refresh != null) {
            Tokens(access, refresh)
        } else null
    }
}
```

### 6.3 iOS

Using Keychain Services:

```swift
class SecureTokenStore {
    private let service = "com.tamshai.ai"
    
    func storeTokens(_ tokens: Tokens) throws {
        let data = try JSONEncoder().encode(tokens)
        
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: "tokens",
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        
        SecItemDelete(query as CFDictionary) // Remove existing
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw TokenStoreError.saveFailed
        }
    }
    
    func getTokens() throws -> Tokens? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: "tokens",
            kSecReturnData as String: true
        ]
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        
        guard status == errSecSuccess, let data = result as? Data else {
            return nil
        }
        
        return try JSONDecoder().decode(Tokens.self, from: data)
    }
}
```

---

## 7. Audit and Compliance

### 7.1 Audit Log Schema

```json
{
  "timestamp": "2025-11-29T10:30:00.000Z",
  "event_id": "evt_abc123",
  "event_type": "AI_QUERY",
  "severity": "INFO",
  
  "user": {
    "id": "user-uuid-12345",
    "username": "alice.chen",
    "email": "alice@tamshai-playground.local",
    "roles": ["hr-read", "hr-write"],
    "groups": ["/HR-Department"]
  },
  
  "session": {
    "id": "session-uuid",
    "client_id": "ai-desktop",
    "ip_address": "192.168.1.100",
    "user_agent": "TamshaiAI/1.0 (Windows)"
  },
  
  "request": {
    "query": "Show me employee headcount by department",
    "mcp_servers_targeted": ["mcp-hr"],
    "mcp_servers_allowed": ["mcp-hr"],
    "mcp_servers_denied": []
  },
  
  "response": {
    "success": true,
    "records_returned": 5,
    "fields_returned": ["department", "count"],
    "masked_fields": [],
    "denied_fields": ["salary"]
  },
  
  "performance": {
    "total_ms": 1250,
    "auth_ms": 50,
    "mcp_ms": 800,
    "claude_ms": 400
  }
}
```

### 7.2 Security Events

| Event Type | Severity | Description | Alert |
|------------|----------|-------------|-------|
| AUTH_SUCCESS | INFO | Successful login | No |
| AUTH_FAILURE | WARNING | Failed login attempt | After 3 failures |
| MFA_FAILURE | WARNING | Failed MFA attempt | After 2 failures |
| ACCESS_DENIED | WARNING | Attempted unauthorized access | Yes |
| TOKEN_REFRESH | INFO | Token refreshed | No |
| TOKEN_REVOKED | INFO | Token explicitly revoked | No |
| SUSPICIOUS_QUERY | WARNING | AI query attempting data exfiltration | Yes |
| RATE_LIMIT_HIT | WARNING | User exceeded rate limit | After 5 hits |

### 7.3 Retention Policy

| Log Type | Retention | Storage |
|----------|-----------|---------|
| Authentication events | 2 years | Cloud Logging |
| AI query logs | 1 year | BigQuery |
| Access denied events | 2 years | Cloud Logging |
| Performance metrics | 90 days | Cloud Monitoring |

---

## 8. Incident Response

### 8.1 Security Incident Classification

| Level | Description | Response Time | Example |
|-------|-------------|---------------|---------|
| P1 - Critical | Active data breach | 15 minutes | Token database compromised |
| P2 - High | Potential breach | 1 hour | Suspicious query patterns |
| P3 - Medium | Security anomaly | 4 hours | Multiple auth failures |
| P4 - Low | Minor security event | 24 hours | Single access denied |

### 8.2 Response Procedures

**Token Compromise**:
1. Revoke all tokens for affected user
2. Force password reset
3. Re-enroll MFA
4. Audit recent activity
5. Notify user

**Suspected Data Exfiltration**:
1. Disable user account
2. Preserve audit logs
3. Analyze query patterns
4. Assess data exposure
5. Notify security team
6. Follow breach notification procedures if applicable

---

## 9. Security Testing

### 9.1 Automated Tests

```typescript
describe('Security Controls', () => {
  describe('Authentication', () => {
    test('rejects expired tokens', async () => {
      const expiredToken = createToken({ exp: Date.now() / 1000 - 3600 });
      const response = await api.query(expiredToken, 'test query');
      expect(response.status).toBe(401);
    });
    
    test('rejects tampered tokens', async () => {
      const validToken = await getValidToken();
      const tamperedToken = validToken.slice(0, -5) + 'XXXXX';
      const response = await api.query(tamperedToken, 'test query');
      expect(response.status).toBe(401);
    });
    
    test('rejects tokens with wrong audience', async () => {
      const wrongAudToken = createToken({ aud: 'wrong-client' });
      const response = await api.query(wrongAudToken, 'test query');
      expect(response.status).toBe(401);
    });
  });
  
  describe('Authorization', () => {
    test('HR user cannot access finance data', async () => {
      const hrToken = await loginAs('alice.chen');
      const response = await queryMCP(hrToken, 'mcp-finance', 'get budget');
      expect(response.status).toBe(403);
    });
    
    test('executive can access all read data', async () => {
      const execToken = await loginAs('eve.thompson');
      const hrResponse = await queryMCP(execToken, 'mcp-hr', 'employee count');
      const finResponse = await queryMCP(execToken, 'mcp-finance', 'budget summary');
      expect(hrResponse.status).toBe(200);
      expect(finResponse.status).toBe(200);
    });
  });
});
```

### 9.2 Penetration Testing Scope

**In Scope**:
- Authentication bypass attempts
- Token manipulation
- Role escalation
- MCP access control bypass
- Data leakage via AI responses
- Rate limiting bypass

**Out of Scope**:
- Physical security
- Social engineering
- Denial of service
- Third-party services (Claude API)

---

## 10. Compliance Mapping

| Requirement | Control | Status |
|-------------|---------|--------|
| SOC 2 - Access Control | RBAC + MFA | ✓ |
| SOC 2 - Encryption | TLS 1.3 + Encrypted storage | ✓ |
| SOC 2 - Logging | Comprehensive audit logs | ✓ |
| GDPR - Data Access | Role-based filtering | ✓ |
| GDPR - Right to Access | Audit log export | ✓ |
| GDPR - Data Minimization | Query filtering | ✓ |

---

## Appendix: Security Checklist

### Pre-Deployment
- [ ] All secrets in secret manager (not in code)
- [ ] TLS certificates installed and valid
- [ ] MFA enforced for all users
- [ ] Rate limiting configured
- [ ] Audit logging enabled
- [ ] Security tests passing

### Post-Deployment
- [ ] Penetration test completed
- [ ] Security monitoring alerts configured
- [ ] Incident response procedures documented
- [ ] User security awareness training completed
- [ ] Backup and recovery tested
