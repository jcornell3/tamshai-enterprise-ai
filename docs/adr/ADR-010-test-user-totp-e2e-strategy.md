# ADR-010: Test User TOTP Strategy for E2E OAuth Testing

<!--
JSON-LD metadata for machine readability
-->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "name": "ADR-010: Test User TOTP Strategy",
  "headline": "Strategy for E2E Testing with TOTP in OAuth Environments",
  "description": "Documents the decision to use a single test-user.journey account with managed TOTP secrets for E2E testing across all environments",
  "datePublished": "2026-01-10",
  "dateModified": "2026-01-21",
  "keywords": ["totp", "e2e-testing", "oauth", "keycloak", "mfa", "test-automation"],
  "learningResourceType": "process-decision",
  "articleSection": "Architecture Decision Record",
  "isPartOf": {
    "@type": "CreativeWork",
    "name": "Tamshai Project Journey"
  },
  "about": [
    { "@type": "SoftwareApplication", "name": "Keycloak" },
    { "@type": "SoftwareApplication", "name": "Playwright" }
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

The Tamshai Enterprise AI system requires TOTP (Time-based One-Time Password) for all user authentication. This creates a challenge for E2E testing:

1. **TOTP Codes Change**: Codes expire every 30 seconds
2. **Secrets Must Match**: Test code needs same secret as Keycloak
3. **Multiple Environments**: Dev, Stage, and Prod all require TOTP
4. **Security**: TOTP secrets shouldn't be in source code

**Question**: How do we automate E2E login testing in an OAuth + TOTP environment?

## Decision

Create a dedicated **test-user.journey** service account with managed TOTP secrets stored in GitHub Secrets.

### Account Design

| Field | Value |
|-------|-------|
| Username | `test-user.journey` |
| Email | `test-user@tamshai.local` |
| Department | `Testing` |
| Title | `Journey Test Account` |
| Roles | Minimal (no data access) |

### TOTP Secret Management

**Critical Discovery**: Keycloak stores TOTP secrets in **raw format**, not BASE32.

```
┌─────────────────────────────────────────────────────────────────┐
│                    TOTP Secret Flow                              │
│                                                                  │
│   Raw Secret              BASE32 Encoded                        │
│   "TamshaiTestKey123"  →  "KRUGKIDROVUWG2ZAMJZG633ON2..."       │
│         │                         │                              │
│         ▼                         ▼                              │
│   Keycloak secretData       oathtool / E2E tests                │
│   (realm-export.json)       (TOTP code generation)              │
└─────────────────────────────────────────────────────────────────┘
```

### GitHub Secrets Configuration

| Secret | Format | Purpose |
|--------|--------|---------|
| `TEST_USER_PASSWORD` | Plain text | Login password |
| `TEST_USER_TOTP_SECRET_RAW` | Raw | Injected into realm-export.json |
| `TEST_USER_TOTP_SECRET` | BASE32 | Used by E2E tests with oathtool |

### E2E Test Implementation

```typescript
// tests/e2e/specs/login-journey.ui.spec.ts
import { execSync } from 'child_process';

async function generateTOTP(): Promise<string> {
  const secret = process.env.TEST_USER_TOTP_SECRET;
  // Use oathtool for reliable TOTP generation
  const code = execSync(`oathtool --totp --base32 "${secret}"`)
    .toString()
    .trim();
  return code;
}

test('complete login journey with TOTP', async ({ page }) => {
  await page.goto('/employee-login.html');
  await page.click('text=Sign in with SSO');

  // Keycloak login
  await page.fill('#username', 'test-user.journey');
  await page.fill('#password', process.env.TEST_USER_PASSWORD);
  await page.click('#kc-login');

  // TOTP step
  const totpCode = await generateTOTP();
  await page.fill('#otp', totpCode);
  await page.click('#kc-login');

  // Verify successful login
  await expect(page).toHaveURL(/\/app/);
});
```

## Alternatives Considered

### Disable TOTP for Test User

**Rejected because**:
- Doesn't test real authentication flow
- Production requires TOTP, tests should match
- Security compliance requires MFA testing

### Use Multiple Test Users

**Rejected because**:
- More secrets to manage
- More Keycloak configuration
- Single account sufficient for journey testing
- Different roles tested via API, not E2E

### Hardcode TOTP Secret in Code

**Rejected because**:
- Security risk if repo is public
- Secrets should never be in source
- GitHub Secrets provides secure storage

### Mock TOTP in Tests

**Rejected because**:
- Doesn't validate real TOTP flow
- Could miss Keycloak configuration issues
- E2E should test real authentication

## Consequences

### Positive

- **Real Authentication**: Tests actual OAuth + TOTP flow
- **Consistent Credentials**: Same account works in all environments
- **Secure Storage**: Secrets in GitHub Secrets, not code
- **Reliable TOTP**: oathtool provides accurate code generation
- **CI/CD Compatible**: GitHub Actions can access secrets

### Negative

- **Secret Synchronization**: Must keep Keycloak and GitHub in sync
- **30-Second Window**: Tests must complete TOTP step quickly
- **Single Account**: Can't test concurrent user scenarios
- **Secret Rotation**: Changing TOTP requires coordinated update

### TOTP Timing Considerations

```
TOTP Window:
├─────────────────────────────────────┤
│           30 seconds                │
├─────────────────────────────────────┤
        ↑
    Code generated here must be
    submitted within window

Best Practice:
- Generate TOTP immediately before entering
- Don't store generated codes
- If test fails, regenerate fresh code
```

## Implementation Checklist

1. ✅ Create test-user.journey in realm-export.json
2. ✅ Configure TOTP credential with raw secret
3. ✅ Add secrets to GitHub Secrets
4. ✅ Install oathtool in CI environment
5. ✅ Write E2E tests using secret from environment
6. ✅ Document secret rotation procedure

## References

- `docs/testing/TEST_USER_JOURNEY.md` - Full test user documentation
- `docs/testing/TOTP_SETUP_FIX_PLAN.md` - TOTP configuration fix plan
- `docs/testing/TOTP_FIX_STATUS.md` - Fix implementation status
- `tests/e2e/specs/login-journey.ui.spec.ts` - E2E test implementation

## Related Decisions

- ADR-009: Keycloak 23 Configuration Challenges (TOTP format discovery)
- ADR-002: Phoenix Rebuild Evolution (E2E tests validate rebuilds)

---

*This ADR is part of the Tamshai Project Journey - solving the "how do you test MFA?" problem.*
