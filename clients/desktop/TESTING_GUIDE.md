# Desktop Client Testing Guide

## Test Environment Status

### ✅ Backend Services (All Running)
- Keycloak: http://localhost:8180 (healthy)
- MCP Gateway: http://localhost:3100 (healthy)
- Redis: localhost:6380 (healthy)
- MCP HR: localhost:3101 (healthy)
- MCP Finance: localhost:3102 (healthy)
- MCP Sales: localhost:3103 (healthy)
- MCP Support: localhost:3104 (healthy)

### ✅ Desktop App Build
- TypeScript compilation: ✅ PASSED
- Production build: ✅ COMPLETE
- Mobile Keycloak client: ✅ CREATED

---

## Test Scenarios

### Test 1: OAuth Login Flow

#### Prerequisites
- Backend services running
- Keycloak mobile client created

#### Steps
1. Start desktop app:
   ```bash
   cd clients/desktop
   npm run dev
   ```

2. Click "Sign in with SSO" button
3. Browser should open with Keycloak login page at:
   ```
   http://localhost:8180/realms/tamshai-corp/protocol/openid-connect/auth?...
   ```

4. Login with test user:
   - Username: `alice.chen`
   - Password: `[REDACTED-DEV-PASSWORD]`
   - TOTP Secret: `[REDACTED-DEV-TOTP]`

5. Generate TOTP code:
   - Use Google Authenticator or https://totp.app/
   - Enter 6-digit code

6. Verify redirect to:
   ```
   tamshai-ai://oauth/callback?code=...
   ```

7. Desktop app should:
   - Capture OAuth callback
   - Exchange code for tokens
   - Store tokens in OS keychain
   - Display chat window with user info

#### Expected Results
- ✅ Browser opens automatically
- ✅ Keycloak login page loads
- ✅ After auth, deep link redirects to app
- ✅ Chat window shows:
  - Username: "alice.chen"
  - Access level: "Department Admin" or "Manager"
  - Empty chat ready for queries

#### Success Criteria
- No console errors
- Token stored securely (check with `window.electronAPI.getTokens()` in DevTools)
- User info displayed correctly

---

### Test 2: SSE Streaming with AI Queries

#### Prerequisites
- Logged in successfully (Test 1 passed)
- CLAUDE_API_KEY configured in MCP Gateway

#### Test Queries

**Query 1: Simple Data Retrieval**
```
List all employees in the Engineering department
```

**Expected Behavior**:
- ✅ Query submitted successfully
- ✅ Streaming starts immediately
- ✅ Text appears word-by-word (real-time)
- ✅ Markdown formatted (bullet lists, bold, etc.)
- ✅ `[DONE]` signal received
- ✅ Streaming indicator stops

**Query 2: Multi-Server Query**
```
Show me all high-priority open support tickets and related customer opportunities
```

**Expected Behavior**:
- ✅ Gateway calls MCP Support and MCP Sales
- ✅ Results aggregated and streamed
- ✅ No timeout during 30-60s AI reasoning

**Query 3: Complex Analysis**
```
Who are the top 3 sales performers this quarter and what are their team sizes?
```

**Expected Behavior**:
- ✅ Gateway calls MCP Sales and MCP HR
- ✅ AI performs analysis and calculations
- ✅ Formatted response with numbers/tables

#### Troubleshooting
If streaming fails:
1. Check MCP Gateway logs:
   ```bash
   docker compose logs mcp-gateway --tail=50
   ```

2. Verify CLAUDE_API_KEY:
   ```bash
   docker compose exec mcp-gateway printenv CLAUDE_API_KEY
   ```

3. Check browser DevTools Console for errors

---

### Test 3: Confirmation Flow (Human-in-the-Loop)

#### Test Case 3.1: Delete Employee Confirmation

**Query**:
```
Delete employee frank.davis
```

**Expected Flow**:
1. ✅ AI processes request
2. ✅ MCP HR server returns `pending_confirmation`
3. ✅ Approval card appears with:
   - Warning icon and yellow background
   - Employee details (name, email, department)
   - "Approve" and "Reject" buttons
   - "5-minute expiration" notice

4. ✅ Redis stores confirmation with TTL:
   ```bash
   docker compose exec redis redis-cli -n 0 KEYS "pending:*"
   ```

5. ✅ Click "Approve":
   - POST to `/api/confirm/:confirmationId` with `{approved: true}`
   - Success notification
   - Employee marked as TERMINATED
   - System message: "✅ Action completed successfully"

6. ✅ Verification:
   ```bash
   docker compose exec postgres psql -U tamshai -d tamshai_hr -c \
     "SELECT first_name, last_name, status FROM hr.employees WHERE email='frank.davis@tamshai-playground.local';"
   ```
   Should show: `status = TERMINATED`

#### Test Case 3.2: Rejection Flow

**Query**:
```
Delete employee nina.patel
```

**Expected Flow**:
1. ✅ Approval card appears
2. ✅ Click "Reject":
   - POST to `/api/confirm/:confirmationId` with `{approved: false}`
   - Cancellation notification
   - System message: "❌ Action cancelled"
   - Employee status unchanged

#### Test Case 3.3: Expiration Handling

**Query**:
```
Delete employee marcus.johnson
```

**Expected Flow**:
1. ✅ Approval card appears
2. ✅ Wait 6 minutes (TTL expires)
3. ✅ Auto-removal notification:
   - "Confirmation Expired"
   - "The action request has expired. Please retry."
4. ✅ Approval card disappears
5. ✅ Click Approve (if still visible):
   - 404 error: "Confirmation not found or expired"

#### Test Case 3.4: User Ownership Validation

**Setup**: Need two logged-in users

**Flow**:
1. User A (alice.chen) creates confirmation:
   ```
   Delete employee dan.williams
   ```
2. User B (bob.martinez) attempts to approve User A's confirmation
3. Expected: 403 Forbidden error
   - "This confirmation belongs to a different user"

---

### Test 4: Truncation Warnings

#### Test Case 4.1: Large Result Set

**Query**:
```
List all employees with their salaries sorted by department
```

**Expected Behavior** (if >50 records):
1. ✅ SSE stream includes pagination metadata:
   ```json
   {"type": "pagination", "hasMore": true, "hint": "..."}
   ```

2. ✅ Truncation warning component appears:
   - Yellow left border
   - Warning icon
   - Message: "⚠️ Results Truncated"
   - Stats: "Shown: 50 records" / "Total: 50+ records"
   - Suggestion: "Try narrowing your search..."

3. ✅ AI response mentions incomplete results

#### Test Case 4.2: Small Result Set

**Query**:
```
List employees in Legal department
```

**Expected Behavior** (if <50 records):
- ✅ No truncation warning appears
- ✅ All results displayed
- ✅ No "hasMore" in pagination metadata

#### Verification
Check Gateway logs for truncation detection:
```bash
docker compose logs mcp-gateway --tail=100 | grep truncated
```

---

### Test 5: Error Handling

#### Test Case 5.1: Network Error

**Steps**:
1. Submit query
2. Stop MCP Gateway mid-stream:
   ```bash
   docker compose stop mcp-gateway
   ```

**Expected**:
- ✅ Error message displayed:
  "Connection to AI service lost. Please check your network and try again."
- ✅ Streaming stops gracefully
- ✅ No app crash

#### Test Case 5.2: Invalid Token

**Steps**:
1. Manually expire token (wait 6 minutes)
2. Submit query

**Expected**:
- ✅ Auto-refresh triggered
- ✅ New token obtained
- ✅ Query succeeds
- OR
- ✅ Refresh fails → logout → back to login screen

#### Test Case 5.3: Invalid Query

**Query**:
```
Delete the entire database
```

**Expected**:
- ✅ AI rejects dangerous request
- ✅ Error message with explanation
- ✅ No actual database operation

---

## Automated Test Commands

### Backend Health Checks
```bash
# All services
docker compose ps

# MCP Gateway health
curl http://localhost:3100/health

# Keycloak health
curl http://localhost:8180/health/ready

# Redis ping
docker compose exec redis redis-cli ping
```

### Desktop App Commands
```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Build
npm run build

# Development mode (with DevTools)
npm run dev

# Production preview
npm run preview
```

### Database Verification
```bash
# Check deleted employees
docker compose exec postgres psql -U tamshai -d tamshai_hr -c \
  "SELECT first_name, last_name, status FROM hr.employees WHERE status='TERMINATED';"

# Check Redis confirmations
docker compose exec redis redis-cli -n 0 KEYS "pending:*"
docker compose exec redis redis-cli -n 0 TTL "pending:<confirmation-id>"
```

---

## Test Results Template

### Test Session: [Date]
**Tester**: [Name]
**Platform**: [Windows/Linux]
**Node Version**: [Version]
**Electron Version**: [Version]

| Test | Status | Notes |
|------|--------|-------|
| OAuth Login | ⏳ | |
| SSE Streaming | ⏳ | |
| Simple Query | ⏳ | |
| Multi-Server Query | ⏳ | |
| Confirmation - Approve | ⏳ | |
| Confirmation - Reject | ⏳ | |
| Confirmation - Expiry | ⏳ | |
| Truncation Warning | ⏳ | |
| Error Handling | ⏳ | |
| Token Refresh | ⏳ | |

**Issues Found**:
1. [Issue description]
2. [Issue description]

**Performance**:
- App startup time: [X seconds]
- Average query response time: [X seconds]
- Memory usage: [X MB]

---

## Known Limitations

1. **Deep Linking on Linux**: May require manual `.desktop` file creation
2. **WSL2 Network**: Cannot test deep linking from WSL2 (use native Linux or Windows)
3. **TOTP Requirement**: All test users require TOTP (use secret: `[REDACTED-DEV-TOTP]`)
4. **Token Expiry**: Access tokens expire after 5 minutes (refresh tokens after 30 minutes)

---

## Quick Reference: Test Users

| Username | Password | Roles | Access Level |
|----------|----------|-------|--------------|
| alice.chen | [REDACTED-DEV-PASSWORD] | hr-read, hr-write, manager | Department Admin |
| bob.martinez | [REDACTED-DEV-PASSWORD] | finance-read, finance-write | Department Admin |
| carol.johnson | [REDACTED-DEV-PASSWORD] | sales-read, sales-write | Department Admin |
| dan.williams | [REDACTED-DEV-PASSWORD] | support-read, support-write | Department Admin |
| eve.thompson | [REDACTED-DEV-PASSWORD] | executive | Executive |
| nina.patel | [REDACTED-DEV-PASSWORD] | manager | Manager |
| marcus.johnson | [REDACTED-DEV-PASSWORD] | user | User |
| frank.davis | [REDACTED-DEV-PASSWORD] | intern | User |

**TOTP Secret for all users**: `[REDACTED-DEV-TOTP]`

---

## Reporting Issues

**Template**:
```
**Test**: [Test name]
**Platform**: [OS + version]
**Steps to Reproduce**:
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Expected**: [What should happen]
**Actual**: [What actually happened]

**Logs**:
[Paste relevant logs from DevTools console or Docker logs]

**Screenshots**: [If applicable]
```

---

**Test Status**: ✅ Environment Ready
**Next Step**: Run `npm run dev` and begin Test 1 (OAuth Login)
