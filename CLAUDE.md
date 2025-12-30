# Tamshai Enterprise AI - Claude Code Guide

## Project Overview

**Project**: Tamshai Corp Enterprise AI Access System  
**Version**: 1.4 (December 2025)  
**Type**: Microservices Architecture with AI Orchestration  
**Primary Language**: TypeScript/Node.js  
**Status**: Specification Complete - Implementation Ready

### Purpose

Enterprise-grade AI access system enabling secure Claude AI integration with role-based data access. Employees can use AI assistants while ensuring data access respects existing security boundaries through defense-in-depth architecture.

---

## Quick Reference

### Workflow Requirements

**IMPORTANT: Always push code after making changes.**

After completing any code modification, always commit and push to the repository: 
    
    `git add <modified-files>  
    git commit -m "feat/fix/refactor: description of changes"  
    git push  
    `

This ensures the user can immediately pull and test the changes on their local machine.

### Essential Commands 
    
    `# Full environment setup  
    ./scripts/setup-dev.sh  
      
    # Start all services  
    cd infrastructure/docker  
    docker compose up -d  
      
    # Stop all services  
    docker compose down  
      
    # View service logs  
    docker compose logs -f mcp-gateway  
    docker compose logs -f keycloak  
      
    # Check service health  
    docker compose ps  
    curl http://localhost:3100/health        # MCP Gateway  
    curl http://localhost:8100/api/health    # Kong Gateway  
    `

### MCP Gateway Development 
    
    `cd services/mcp-gateway  
      
    # Install dependencies  
    npm install  
      
    # Development mode (watch)  
    npm run dev  
      
    # Build TypeScript  
    npm run build  
      
    # Start production build  
    npm start  
      
    # Type checking only  
    npm run typecheck  
      
    # Linting  
    npm run lint  
      
    # Unit tests  
    npm test  
      
    # Integration tests (requires running services)  
    npm run test:integration  
    `

### Flutter Unified Client Development 
    
    `cd clients/unified_flutter  
      
    # Get dependencies  
    flutter pub get  
      
    # Generate Freezed/JSON serialization code  
    flutter pub run build_runner build --delete-conflicting-outputs  
      
    # Run on Windows (debug)  
    flutter run -d windows  
      
    # Build Windows release  
    flutter build windows --release  
      
    # Run analyzer  
    flutter analyze  
      
    # Run tests  
    flutter test  
    `

**Key Flutter Files**:

* `lib/core/auth/` - OAuth service, secure storage, auth state
* `lib/core/api/` - Dio HTTP client with auth interceptor
* `lib/features/chat/` - Chat UI, SSE streaming, message handling
* `lib/features/home/` - Home screen, user profile display

**OAuth Flow (Desktop)**:

1. App starts HTTP server on `127.0.0.1:0` (random port)
2. Opens browser to Keycloak with PKCE code challenge
3. User authenticates in browser
4. Keycloak redirects to `http://127.0.0.1:{port}/callback`
5. App exchanges auth code for tokens
6. Tokens stored in `flutter_secure_storage`

---

## 🆕 Architecture v1.4 Changes (December 2025)

### What's New in v1.4

Architecture v1.4 introduces four critical enhancements that improve AI reliability, user safety, and constitutional compliance:

#### 1\. SSE Transport Protocol (Section 6.1)

**Problem**: HTTP requests timeout during Claude's 30-60 second multi-step reasoning.  
**Solution**: Server-Sent Events (SSE) streaming using EventSource API. 
    
    `// Gateway: SSE endpoint  
    app.post('/api/query', async (req, res) => {  
    res.setHeader('Content-Type', 'text/event-stream');  
    res.setHeader('Cache-Control', 'no-cache');  
    res.setHeader('Connection', 'keep-alive');  
      
    const stream = await anthropic.messages.stream({  
    model: 'claude-sonnet-4-20250514',  
    max_tokens: 4096,  
    messages: [{ role: 'user', content: safeQuery }]  
    });  
      
    for await (const chunk of stream) {  
    res.write(\`data: ${JSON.stringify(chunk)}\n\n\`);  
    }  
    res.write('data: [DONE]\n\n');  
    });  
      
    // Client: EventSource consumption  
    const eventSource = new EventSource('/api/query');  
    eventSource.onmessage = (event) => {  
    if (event.data === '[DONE]') {  
    eventSource.close();  
    return;  
    }  
    const chunk = JSON.parse(event.data);  
    appendToMessageStream(chunk);  
    };  
    `

#### 2\. Truncation Warnings (Section 5.3)

**Problem**: Users unaware when AI responses are based on incomplete data (Article III.2: 50-record limit).  
**Solution**: MCP servers detect truncation and inject AI-visible warnings. 
    
    `// MCP Server: LIMIT+1 pattern  
    async function listEmployees(limit = 50): Promise<MCPToolResponse> {  
    const result = await db.query(  
    'SELECT * FROM hr.employees LIMIT $1',  
    [limit + 1]  // Query 1 extra to detect truncation  
    );  
      
    const truncated = result.rows.length > limit;  
      
    return {  
    status: 'success',  
    data: result.rows.slice(0, limit),  
    metadata: {  
    truncated,  
    totalCount: truncated ? \`${limit}+\` : result.rows.length.toString(),  
    warning: truncated  
    ? \`TRUNCATION WARNING: Only ${limit} of ${limit}+ records returned. AI must inform user that results are incomplete.\`  
    : null  
    }  
    };  
    }  
    `

#### 3\. LLM-Friendly Error Schemas (Section 7.4)

**Problem**: Raw exceptions don't help Claude self-correct (violates Article II.3).  
**Solution**: Discriminated union responses with `suggestedAction` fields. 
    
    `// MCP Tool Response Type  
    type MCPToolResponse =  
    | { status: 'success', data: any, metadata?: { truncated?: boolean } }  
    | { status: 'error', code: string, message: string, suggestedAction: string }  
    | { status: 'pending_confirmation', confirmationId: string, message: string };  
      
    // Example: Error with suggested action  
    async function getEmployee(employeeId: string): Promise<MCPToolResponse> {  
    const result = await db.query(  
    'SELECT * FROM hr.employees WHERE employee_id = $1',  
    [employeeId]  
    );  
      
    if (result.rows.length === 0) {  
    return {  
    status: 'error',  
    code: 'EMPLOYEE_NOT_FOUND',  
    message: \`Employee with ID ${employeeId} not found.\`,  
    suggestedAction: 'Use list_employees tool to find valid employee IDs, or verify the ID format is correct (UUID expected).'  
    };  
    }  
      
    return { status: 'success', data: result.rows[0] };  
    }  
    `

#### 4\. Human-in-the-Loop Confirmations (Section 5.6)

**Problem**: Accidental destructive operations (delete, update) without user approval.  
**Solution**: Write tools return `pending_confirmation`, user approves via UI. 
    
    `// MCP Server: Write tool  
    async function deleteEmployee(employeeId: string): Promise<MCPToolResponse> {  
    const confirmationId = crypto.randomUUID();  
      
    await redis.setex(  
    \`pending:${confirmationId}\`,  
    300,  // 5-minute TTL  
    JSON.stringify({  
    action: 'delete_employee',  
    employeeId,  
    userId: userContext.userId  
    })  
    );  
      
    return {  
    status: 'pending_confirmation',  
    confirmationId,  
    message: \`⚠️ Delete employee ${employee.name} (${employee.email})?\n\nThis action will permanently delete the employee record and cannot be undone.\`,  
    confirmationData: { employeeId, employeeName: employee.name }  
    };  
    }  
      
    // Gateway: Confirmation endpoint  
    app.post('/api/confirm/:confirmationId', async (req, res) => {  
    const { approved } = req.body;  
    const pendingAction = await redis.get(\`pending:${req.params.confirmationId}\`);  
      
    if (!pendingAction) {  
    return res.status(404).json({ error: 'Confirmation expired or not found' });  
    }  
      
    if (approved) {  
    const result = await executePendingAction(JSON.parse(pendingAction));  
    await redis.del(\`pending:${req.params.confirmationId}\`);  
    return res.json({ status: 'success', result });  
    } else {  
    await redis.del(\`pending:${req.params.confirmationId}\`);  
    return res.json({ status: 'cancelled' });  
    }  
    });  
    `

### Constitutional Compliance

**v1.4 fulfills constitutional requirements without amendments:**

* **Article II.3**: ✅ LLM-friendly error schemas with `suggestedAction` (Section 7.4)
* **Article III.2**: ✅ Truncation warnings enforce 50-record limit (Section 5.3)
* **Article V**: ✅ No client-side authorization changes (all security remains server-side)

### Implementation Status

All specifications have been updated for v1.4:

* ✅ **Spec 003 (MCP Gateway)**: +15 v1.4 tasks (SSE, truncation injection, confirmation endpoint)
* ✅ **Spec 004 (MCP Suite)**: +98 v1.4 tasks (error schemas, truncation, 8 write tools)
* ✅ **Spec 005 (Web Apps)**: +32 v1.4 tasks (EventSource client, Approval Card)
* ⚠️ **Spec 006 (Desktop)**: DEPRECATED - Superseded by Spec 009
* ⚠️ **Spec 008 (Unified Client)**: DEPRECATED - React Native stability issues
* ✅ **Spec 009 (Flutter Unified)**: COMPLETE - Windows desktop client with OAuth, SSE, v1.4 features

**Note**: Specs 006 and 008 were deprecated due to Electron single-instance lock issues and React Native Windows instability. See ADR-004/005 in `.specify/ARCHITECTURE_SPECS.md`.

**Total**: +185 v1.4 tasks across original specifications.

See [.specify/V1.4\_UPDATE\_STATUS.md](.specify/V1.4_UPDATE_STATUS.md) for detailed status.

---

## Architecture Patterns

### 1\. Microservices Architecture

**Pattern**: API Gateway + Service Mesh  
**Implementation**: Kong Gateway � MCP Gateway � Domain MCP Servers 
    
    `  
       Clients    (Desktop/Mobile Apps)  
    ,  
     HTTPS + JWT  
    �  
      
      Kong Gateway    (API Gateway - Port 8100)  
      - Rate Limiting  
      - CORS           
      - Auth Check     
    ,  
     HTTP + JWT  
    �  
      
       MCP Gateway       (AI Orchestration - Port 3100)  
       - Role Routing     
       - Prompt Defense   
       - Claude API       
    ,  
     Token Propagation  
    4,,  
    �           �          �          �  
         
     MCP HR   MCP Fin   MCP Sales MCP Support  
    :3101    :3102     :3103      :3104        
    , , , ,  
                                       
    �          �           �            �  
      
              Data Layer                          
      PostgreSQL  MongoDB  ES  MinIO  Redis  
      
    `

### 2\. Authentication Pattern: Token Propagation

**Pattern**: SSO with JWT Token Propagation  
**Flow**: OIDC PKCE � JWT Issuance � Token Validation � Role Extraction 
    
    `// Example: JWT validation in MCP Gateway  
    // services/mcp-gateway/src/index.ts:80-120  
      
    async function validateToken(authHeader: string) {  
    const token = authHeader.replace('Bearer ', '');  
      
    // 1. Verify signature with Keycloak JWKS  
    const decoded = await jwt.verify(token, getKey);  
      
    // 2. Check revocation in Redis  
    const isRevoked = await redis.get(\`revoked:${decoded.jti}\`);  
    if (isRevoked) throw new Error('Token revoked');  
      
    // 3. Extract roles from JWT  
    const roles = decoded.resource_access?.['mcp-gateway']?.roles || [];  
      
    return { userId: decoded.sub, roles, username: decoded.preferred_username };  
    }  
    `

**Token Lifecycle**:

* Access Token: 5 minutes (short-lived for security)
* Refresh Token: 30 minutes
* Revocation: Redis cache with token JTI

### 3\. Authorization Pattern: Hierarchical RBAC

**Pattern**: Role-Based Access Control with Inheritance  
**Implementation**: Keycloak Composite Roles 
    
    `Role Hierarchy:  
    executive (composite role)  
     hr-read � hr-write  
     finance-read � finance-write  
     sales-read � sales-write  
     support-read � support-write  
      
    Access Levels:  
    Self < Manager < Department < Executive  
    `

**Role-to-MCP Routing**: 
    
    `// services/mcp-gateway/src/index.ts:200-250  
      
    const ROLE_TO_MCP: Record<string, string[]> = {  
    'hr-read': ['mcp-hr'],  
    'hr-write': ['mcp-hr'],  
    'finance-read': ['mcp-finance'],  
    'finance-write': ['mcp-finance'],  
    'sales-read': ['mcp-sales'],  
    'sales-write': ['mcp-sales'],  
    'support-read': ['mcp-support'],  
    'support-write': ['mcp-support'],  
    'executive': ['mcp-hr', 'mcp-finance', 'mcp-sales', 'mcp-support']  
    };  
      
    function getAccessibleMcpServers(roles: string[]): string[] {  
    const mcpServers = new Set<string>();  
    roles.forEach(role => {  
    const servers = ROLE_TO_MCP[role] || [];  
    servers.forEach(server => mcpServers.add(server));  
    });  
    return Array.from(mcpServers);  
    }  
    `

### 4\. Security Pattern: Defense-in-Depth (6 Layers)

**Pattern**: Multiple security layers with fail-secure defaults

**Layer 1: Authentication (Keycloak)**

* OIDC with PKCE flow
* TOTP MFA for all users
* WebAuthn for production admins
* 5-minute JWT access tokens

**Layer 2: API Gateway (Kong)** 
    
    `# infrastructure/docker/kong/kong.yml:30-60  
      
    plugins:  
    - name: rate-limiting  
    config:  
    minute: 60  
    hour: 500  
    - name: jwt  
    config:  
    key_claim_name: kid  
    - name: request-size-limiting  
    config:  
    allowed_payload_size: 10  
    - name: cors  
    `

**Layer 3: MCP Gateway** 
    
    `// services/mcp-gateway/src/security/prompt-defense.ts  
      
    // 5-Layer Prompt Injection Defense:  
    // 1. Input validation (length, characters)  
    // 2. Keyword blocking (system, ignore, etc.)  
    // 3. Embedding delimiters (XML tags)  
    // 4. Instruction reinforcement  
    // 5. Output validation  
    `

**Layer 4: MCP Servers**

* Tool allow-listing per role
* Application-level filtering
* User context propagation

**Layer 5: Data Layer**

* PostgreSQL Row Level Security (RLS)
* MongoDB query filters
* Field-level masking

**Layer 6: Network**

* mTLS for service-to-service (production)
* Network segmentation (172.30.0.0/16)
* Egress firewall rules

### 5\. Data Access Pattern: Context Propagation

**Pattern**: User context flows through all layers  
**Implementation**: JWT � MCP � Data Layer 
    
    `// Example: Context propagation to PostgreSQL RLS  
    // services/mcp-hr/src/database.ts (planned)  
      
    async function queryEmployees(userId: string, roles: string[]) {  
    // Set session variables for RLS  
    await db.query(\`  
    SET LOCAL app.current_user_id = $1;  
    SET LOCAL app.current_user_roles = $2;  
    \`, [userId, roles.join(',')]);  
      
    // Query automatically filtered by RLS policy  
    const result = await db.query(\`  
    SELECT * FROM hr.employees WHERE active = true  
    \`);  
      
    return result.rows;  
    }  
    `

**RLS Policy Example**: 
    
    `-- sample-data/hr-data.sql:580-591  
      
    CREATE POLICY employee_access_policy ON hr.employees  
    FOR SELECT  
    USING (  
    employee_id = current_setting('app.current_user_id')::uuid  -- Self  
    OR manager_id = current_setting('app.current_user_id')::uuid  -- Manager  
    OR current_setting('app.current_user_roles') LIKE '%hr-read%'  -- HR  
    OR current_setting('app.current_user_roles') LIKE '%executive%'  -- Executive  
    );  
    `

### 6\. AI Integration Pattern: Secure Claude API

**Pattern**: Prompt wrapping with role context  
**Implementation**: Anthropic SDK with defensive prompting 
    
    `// services/mcp-gateway/src/index.ts:300-400  
      
    async function queryClaudeWithMcp(userQuery: string, userContext: UserContext) {  
    // 1. Apply prompt injection defense  
    const safeQuery = promptDefense.sanitize(userQuery);  
      
    // 2. Build role-aware system prompt  
    const systemPrompt = \`You are an AI assistant for Tamshai Corp.  
    Current user: ${userContext.username}  
    Roles: ${userContext.roles.join(', ')}  
    Access level: ${getAccessLevel(userContext.roles)}  
      
    Rules:  
    - Only answer using data from authorized MCP servers  
    - Do not reveal information above user's access level  
    - Refuse requests for unauthorized data access  
    - Log all queries for audit purposes  
      
    Available data sources: ${userContext.mcpServers.join(', ')}\`;  
      
    // 3. Call Claude API with MCP context  
    const response = await anthropic.messages.create({  
    model: 'claude-sonnet-4-20250514',  
    max_tokens: 4096,  
    system: systemPrompt,  
    messages: [{  
    role: 'user',  
    content: safeQuery  
    }],  
    tools: buildMcpTools(userContext.mcpServers)  
    });  
      
    // 4. Audit log  
    logger.info('AI Query', {  
    requestId: userContext.requestId,  
    userId: userContext.userId,  
    query: safeQuery,  
    mcpServersUsed: response.tool_uses.map(t => t.server)  
    });  
      
    return response;  
    }  
    `

### 7\. Logging Pattern: Structured Audit Logging

**Pattern**: JSON structured logs with request correlation  
**Implementation**: Winston logger 
    
    `// services/mcp-gateway/src/index.ts:50-70  
      
    const logger = winston.createLogger({  
    level: 'info',  
    format: winston.format.combine(  
    winston.format.timestamp(),  
    winston.format.json()  
    ),  
    transports: [  
    new winston.transports.Console(),  
    new winston.transports.File({ filename: 'logs/mcp-gateway.log' })  
    ]  
    });  
      
    // Audit log entry structure  
    interface AuditLog {  
    timestamp: string;  
    requestId: string;  
    userId: string;  
    username: string;  
    roles: string[];  
    action: 'ai_query' | 'token_validation' | 'access_denied';  
    query?: string;  // PII scrubbed  
    mcpServers?: string[];  
    statusCode: number;  
    duration: number;  
    }  
    `

### 8\. Error Handling Pattern: Fail-Secure

**Pattern**: Default deny with error logging  
**Implementation**: Centralized error middleware 
    
    `// Example error handling  
    app.use((err: Error, req: Request, res: Response, next: NextFunction) => {  
    logger.error('Request failed', {  
    requestId: req.headers['x-request-id'],  
    error: err.message,  
    stack: err.stack,  
    path: req.path,  
    method: req.method  
    });  
      
    // Fail-secure: never reveal internal details  
    res.status(500).json({  
    error: 'Internal server error',  
    requestId: req.headers['x-request-id']  
    });  
    });  
    `

---

## Build & Test Commands

### Development Workflow

**1\. Initial Setup** 
    
    `# Clone and setup  
    git clone https://github.com/jcornell3/tamshai-enterprise-ai.git  
    cd tamshai-enterprise-ai  
    ./scripts/setup-dev.sh  
      
    # The setup script will:  
    # - Check prerequisites (Docker, Node.js 20+)  
    # - Create .env file from template  
    # - Install MCP Gateway dependencies  
    # - Build Docker images  
    # - Start all services  
    # - Display access URLs and credentials  
    `

**2\. MCP Gateway Development** 
    
    `cd services/mcp-gateway  
      
    # Install dependencies  
    npm install  
      
    # Development with hot reload  
    npm run dev  
    # Watches src/**/*.ts and restarts on changes  
    # Output: Server running on port 3100  
      
    # Build TypeScript to JavaScript  
    npm run build  
    # Output: Compiles to dist/ directory  
      
    # Type check without compiling  
    npm run typecheck  
    # Catches type errors without building  
      
    # Lint TypeScript code  
    npm run lint  
    # ESLint with TypeScript rules  
    `

**3\. Testing** 
    
    `cd services/mcp-gateway  
      
    # Unit tests  
    npm test  
    # Runs Jest tests in src/**/*.test.ts  
    # Mocks external dependencies  
      
    # Integration tests (requires services running)  
    docker compose up -d  # Start dependencies first  
    npm run test:integration  
    # Tests in tests/integration/rbac.test.ts  
    # Tests full authentication and authorization flow  
    # Uses real Keycloak and Redis instances  
      
    # Test with coverage  
    npm test -- --coverage  
    # Outputs coverage report  
      
    # Run specific test file  
    npm test -- rbac.test.ts  
      
    # Watch mode for TDD  
    npm test -- --watch  
    `

**4\. Docker Operations** 
    
    `cd infrastructure/docker  
      
    # Start all services  
    docker compose up -d  
      
    # Start specific service  
    docker compose up -d mcp-gateway  
      
    # Rebuild and start  
    docker compose up -d --build mcp-gateway  
      
    # View logs  
    docker compose logs -f mcp-gateway  
    docker compose logs -f keycloak  
    docker compose logs --tail=100 mcp-gateway  
      
    # Check service status  
    docker compose ps  
      
    # Stop all services  
    docker compose down  
      
    # Stop and remove volumes (clean slate)  
    docker compose down -v  
      
    # Execute command in container  
    docker compose exec mcp-gateway sh  
    docker compose exec postgres psql -U tamshai  
      
    # Scale services (future use)  
    docker compose up -d --scale mcp-hr=3  
    `

**5\. Database Operations** 
    
    `# Connect to PostgreSQL  
    docker compose exec postgres psql -U tamshai -d tamshai_hr  
      
    # Load sample data  
    docker compose exec postgres psql -U tamshai -d tamshai_hr -f /sample-data/hr-data.sql  
      
    # MongoDB shell  
    docker compose exec mongodb mongosh -u admin -p [REDACTED-DEV-PASSWORD]  
      
    # Load sales data  
    docker compose exec mongodb mongosh -u admin -p [REDACTED-DEV-PASSWORD] < sample-data/sales-data.js  
      
    # Redis CLI  
    docker compose exec redis redis-cli  
      
    # Check token revocation  
    docker compose exec redis redis-cli KEYS "revoked:*"  
    `

**6\. Health Checks** 
    
    `# MCP Gateway  
    curl http://localhost:3100/health  
    # Expected: {"status":"healthy","timestamp":"2024-11-30T..."}  
      
    # Kong Gateway  
    curl http://localhost:8100/api/health  
      
    # Keycloak  
    curl http://localhost:8180/health/ready  
      
    # PostgreSQL  
    docker compose exec postgres pg_isready -U tamshai  
      
    # Redis  
    docker compose exec redis redis-cli ping  
    # Expected: PONG  
    `

**7\. Clean and Reset** 
    
    `# Stop all services and remove data  
    cd infrastructure/docker  
    docker compose down -v  
      
    # Clean build artifacts  
    cd services/mcp-gateway  
    rm -rf dist/ node_modules/  
    npm install  
    npm run build  
      
    # Full reset  
    ./scripts/setup-dev.sh  # Re-run setup  
    `

### Testing Strategy

**Unit Tests** (`src/**/*.test.ts`)

* Mock external dependencies (Anthropic, Redis, MCP servers)
* Test business logic in isolation
* Fast execution (< 1 second)

**Integration Tests** (`tests/integration/rbac.test.ts`)

* Test full authentication flow
* Real Keycloak token issuance
* Real Redis token revocation
* Test role-based access control
* Validate data filtering

**Example Integration Test Flow**: 
    
    `// tests/integration/rbac.test.ts:50-100  
      
    describe('RBAC Integration Tests', () => {  
    test('HR Manager can access employee data', async () => {  
    // 1. Authenticate with Keycloak  
    const token = await getKeycloakToken('alice.chen', '[REDACTED-DEV-PASSWORD]');  
      
    // 2. Query MCP Gateway  
    const response = await axios.post('http://localhost:3100/api/query', {  
    query: 'List all employees in Engineering department'  
    }, {  
    headers: { Authorization: \`Bearer ${token}\` }  
    });  
      
    // 3. Verify response  
    expect(response.status).toBe(200);  
    expect(response.data.results.length).toBeGreaterThan(0);  
    expect(response.data.results[0]).toHaveProperty('employee_id');  
    });  
      
    test('Intern cannot access salary data', async () => {  
    const token = await getKeycloakToken('frank.davis', '[REDACTED-DEV-PASSWORD]');  
      
    const response = await axios.post('http://localhost:3100/api/query', {  
    query: 'What is the average salary?'  
    }, {  
    headers: { Authorization: \`Bearer ${token}\` }  
    });  
      
    // Should return 403 Forbidden or filtered data  
    expect(response.status).toBe(403);  
    });  
    });  
    `

### Testing Philosophy

We follow a **"Diff Coverage"** strategy to balance code quality with development velocity:

* **90% coverage required on all new code** (enforced by Codecov, BLOCKS PRs)
* **49.06% overall coverage** (gradually improving from 31.52%)
* **70% target for new services** (industry "Commendable" tier)

This approach prevents new technical debt while not blocking work on legacy code (index.ts with 1,532 uncovered lines).

**Rationale:**

1. **Prevents Regression**: All new code must be tested at 90%+
2. **Gradual Improvement**: Naturally increases overall coverage as old code is modified
3. **Developer-Friendly**: Doesn't block work on legacy code
4. **Realistic Target**: 90% allows for edge cases, not 100% perfectionism
5. **Industry Alignment**: Google/Microsoft use similar "diff coverage" strategies

See [.specify/specs/011-qa-testing/TEST\_COVERAGE\_STRATEGY.md](.specify/specs/011-qa-testing/TEST_COVERAGE_STRATEGY.md) for complete strategy.

### All Test Commands 
    
    `cd services/mcp-gateway  
      
    # Unit tests  
    npm test                          # Run all unit tests  
    npm test -- --coverage            # With coverage report  
    npm test -- --watch               # Watch mode for TDD  
    npm test -- rbac.test.ts          # Run specific test file  
      
    # Integration tests (requires services running)  
    npm run test:integration          # All integration tests  
    npm run test:rbac                 # RBAC integration tests only  
    npm run test:mcp                  # MCP tool tests  
    npm run test:sse                  # SSE streaming tests (120s timeout)  
    npm run test:query                # Query scenario tests  
      
    # Coverage  
    npm run coverage                  # Generate full coverage report  
    npm run type-coverage             # Check TypeScript type coverage (85% min)  
      
    # Linting  
    npm run lint                      # ESLint + TypeScript rules  
    npm run lint:fix                  # Auto-fix linting issues  
    `

### Security Testing

Multiple layers of security scanning ensure defense-in-depth:

**1\. CodeQL (SAST)** - Static Application Security Testing

* **Schedule**: Weekly (Sunday) + push to main + all PRs
* **Languages**: JavaScript/TypeScript
* **Queries**: security-extended (OWASP Top 10)
* **Results**: GitHub Security tab
* **Status**: BLOCKING ❌

**2\. npm audit** - Dependency Vulnerability Scanning 
    
    `cd services/mcp-gateway  
    npm audit --audit-level=high  
    `

* **Thresholds**: Critical/High = FAIL, Moderate/Low = WARN
* **Status**: BLOCKING ❌

**3\. Gitleaks** - Secret Detection 
    
    `# Pre-commit hook (automatic)  
    pre-commit run gitleaks --all-files  
      
    # Manual scan  
    docker run --rm -v "$(pwd):/path" ghcr.io/gitleaks/gitleaks:latest detect --source /path -c .gitleaks.toml  
    `

* **Custom Rules**: Anthropic API keys (`sk-ant-api\d{2}-...`), Keycloak secrets
* **Allowlist**: `.gitleaksignore` for test fixtures
* **Status**: BLOCKING ❌ (pre-commit + CI)

**4\. tfsec** - Terraform Infrastructure Security 
    
    `cd infrastructure/terraform  
    tfsec .  
    `

* **Checks**: GCP misconfigurations, network exposure, encryption, IAM
* **Status**: BLOCKING ❌

**5\. Trivy** - Container Vulnerability Scanning 
    
    `docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \  
    aquasec/trivy image mcp-gateway:latest  
    `

* **Severity**: CRITICAL, HIGH
* **Status**: INFORMATIONAL ℹ️ (doesn't block main)

See [.specify/specs/011-qa-testing/TESTING\_CI\_CD\_CONFIG.md](.specify/specs/011-qa-testing/TESTING_CI_CD_CONFIG.md) for complete CI/CD documentation.

### Type Coverage

**Target**: 85% type coverage (enforced on MCP Gateway) 
    
    `cd services/mcp-gateway  
      
    # Check type coverage  
    npm run type-coverage  
      
    # Detailed report  
    npx type-coverage --detail  
      
    # CI enforcement  
    npx type-coverage --at-least 85  
    `

**Why 85%?**

* TypeScript's value is in type safety
* 85% allows for `any` in edge cases (third-party libraries, dynamic data)
* Higher than typical projects (50-60%)
* Catches type errors before runtime

**Example Output**: 
    
    `85.23% type coverage  
    12,345 / 14,567 expressions  
    2,222 expressions with 'any' type  
    `

---

## Development Environment

### Prerequisites

* Docker Desktop 4.0+ with Docker Compose v2+
* Node.js 20+ and npm 10+
* GitHub CLI 2.40+ (for CI/CD debugging, PR management) - [cli.github.com](https://cli.github.com/)
* Terraform 1.5+ (for VPS deployment) - [terraform.io](https://developer.hashicorp.com/terraform/install)
* Vault CLI (for secrets management, optional) - [vaultproject.io](https://developer.hashicorp.com/vault/install)
* 8GB RAM minimum (16GB recommended)
* 20GB free disk space

### Port Allocation

**Avoid Conflicts**: This project uses `172.30.0.0/16` subnet to avoid conflicts with existing MCP dev environment at `172.28.0.0/16`.
Service
Port
Protocol
Purpose
Kong Gateway
8100
HTTP
API Gateway
Keycloak
8180
HTTP
Identity Provider
MCP Gateway
3100
HTTP
AI Orchestration
MCP HR
3101
HTTP
HR Data MCP
MCP Finance
3102
HTTP
Finance MCP
MCP Sales
3103
HTTP
Sales MCP
MCP Support
3104
HTTP
Support MCP
PostgreSQL
5433
TCP
Relational DB
MongoDB
27018
TCP
Document DB
Elasticsearch
9201
HTTP
Search Engine
MinIO API
9100
HTTP
Object Storage
MinIO Console
9102
HTTP
MinIO UI
Redis
6380
TCP
Token Cache

### Environment Variables

> **SECURITY WARNING - DEVELOPMENT ONLY**
> 
> The credentials shown below are **DEFAULT VALUES FOR LOCAL DEVELOPMENT ONLY**.  
> They are intentionally simple for developer convenience.
> 
> **FOR PRODUCTION:**
> 
> * Use GCP Secret Manager (see `infrastructure/terraform/main.tf`)
> * All secrets are auto-generated and fetched at runtime
> * Never commit real secrets to git
> * See `010-security-compliance/spec.md` for production guidance
> 

**File**: `infrastructure/docker/.env` (copy from `.env.example`) 
    
    `# ============================================================  
    # LOCAL DEVELOPMENT CREDENTIALS - DO NOT USE IN PRODUCTION  
    # ============================================================  
      
    # Keycloak Configuration  
    KEYCLOAK_ADMIN=admin  
    KEYCLOAK_ADMIN_PASSWORD=${KEYCLOAK_ADMIN_PASSWORD:-admin}  # Override via env  
    KEYCLOAK_DB_PASSWORD=${KEYCLOAK_DB_PASSWORD:-changeme}  
      
    # Database Credentials  
    POSTGRES_PASSWORD=${TAMSHAI_DB_PASSWORD:-changeme}  
    MONGODB_ROOT_PASSWORD=${MONGODB_PASSWORD:-changeme}  
    MONGODB_PASSWORD=${MONGODB_PASSWORD:-changeme}  
      
    # MCP Gateway  
    MCP_GATEWAY_PORT=3100  
    CLAUDE_API_KEY=  # REQUIRED: Get from https://console.anthropic.com/  
      
    # JWT Configuration  
    KEYCLOAK_ISSUER=http://keycloak:8080/realms/tamshai  
    JWKS_URI=http://keycloak:8080/realms/tamshai/protocol/openid-connect/certs  
      
    # Redis  
    REDIS_HOST=redis  
    REDIS_PORT=6379  
      
    # Network  
    SUBNET=172.30.0.0/16  
    `

**Critical Variables**:

* `CLAUDE_API_KEY`: **Required** - Get from Anthropic Console, never commit
* `KEYCLOAK_ADMIN_PASSWORD`: Set via environment variable, not in file
* `POSTGRES_PASSWORD`: Set via environment variable, not in file

### Test Users

> **SECURITY WARNING - DEVELOPMENT ONLY**
> 
> These test users exist ONLY in `keycloak/realm-export-dev.json` for local testing.  
> The shared password and TOTP secret are **INTENTIONALLY WEAK** for testing convenience.
> 
> **PRODUCTION USES:** `keycloak/realm-export.json` (no pre-configured users)
> 
> * Users created via Keycloak Admin API with strong, unique passwords
> * Individual TOTP secrets per user
> * Temporary password on first login
> 

**Development Credentials** (password: `[REDACTED-DEV-PASSWORD]`, TOTP: `[REDACTED-DEV-TOTP]`):
Username
Role
Position
Access
eve.thompson
executive
CEO
All departments (read)
alice.chen
hr-read, hr-write
VP of HR
All employees
bob.martinez
finance-read, finance-write
Finance Director
All finance data
carol.johnson
sales-read, sales-write
VP of Sales
All sales/CRM
dan.williams
support-read, support-write
Support Director
Tickets, KB
nina.patel
manager
Engineering Manager
Team only
marcus.johnson
user
Software Engineer
Self only
frank.davis
intern
IT Intern
Minimal access

**Login Flow (Development)**:

1. Navigate to Keycloak: [http://localhost:8180](http://localhost:8180)
2. Login with username/password
3. Configure TOTP with secret `[REDACTED-DEV-TOTP]` or scan QR code
4. Use generated TOTP code on subsequent logins

---

## Service Architecture

### MCP Gateway (services/mcp-gateway)

**Purpose**: AI orchestration and security enforcement

**Key Files**:

* `src/index.ts` (473 lines): Main application logic
* `src/security/prompt-defense.ts`: Prompt injection prevention
* `src/security/token-revocation.ts`: Redis-backed revocation
* `package.json`: Dependencies and scripts
* `Dockerfile`: Multi-stage production build

**Dependencies**:

* `@anthropic-ai/sdk`: Claude AI integration
* `@modelcontextprotocol/sdk`: MCP protocol implementation
* `express`: HTTP server framework
* `helmet`: Security headers
* `jsonwebtoken` + `jwks-rsa`: JWT validation
* `winston`: Structured logging

**Flow**:

1. Receive HTTP request with JWT bearer token
2. Validate token signature with Keycloak JWKS
3. Check token revocation in Redis
4. Extract roles from JWT claims
5. Determine accessible MCP servers
6. Apply prompt injection defense
7. Call Claude API with MCP tools
8. Aggregate and return response
9. Log to audit trail

### Kong Gateway (infrastructure/docker/kong)

**Purpose**: API Gateway and rate limiting

**Configuration**: `infrastructure/docker/kong/kong.yml`

**Features**:

* JWT validation
* Rate limiting (60/min, 500/hour)
* CORS enforcement
* Request size limiting (10MB)
* Security headers

**Routes**: 
    
    `services:  
    - name: mcp-gateway  
    url: http://mcp-gateway:3100  
    routes:  
    - name: mcp-api  
    paths:  
    - /api  
    methods:  
    - GET  
    - POST  
    `

### Keycloak (keycloak)

**Purpose**: Identity Provider (IdP) and SSO

**Realm Configuration**: `keycloak/realm-export.json`

**Features**:

* OIDC and SAML2 support
* Hierarchical role management
* TOTP and WebAuthn MFA
* User federation (LDAP/AD ready)
* Session management

**Realm**: `tamshai`  
**Client**: `mcp-gateway` (confidential)  
**Roles**: hr-read, hr-write, finance-read, finance-write, sales-read, sales-write, support-read, support-write, manager, executive

### Data Layer

**PostgreSQL** (port 5433)

* Databases: `keycloak`, `tamshai_hr`, `tamshai_finance`
* Row Level Security (RLS) enabled on employee tables
* Sample data: 20 employees across 4 departments

**MongoDB** (port 27018)

* Database: `tamshai_crm`
* Collections: `customers`, `opportunities`, `activities`
* Sample data: 15 customers, 12 opportunities

**Elasticsearch** (port 9201)

* Index: `support_tickets`, `knowledge_base`
* Full-text search for support data

**MinIO** (port 9100/9102)

* Buckets: `finance-docs`, `public-docs`
* S3-compatible object storage

**Redis** (port 6380)

* Token revocation cache
* Key pattern: `revoked:{jti}` with TTL

---

## Deployment

### Local Development (Current)

**Method**: Docker Compose  
**File**: `infrastructure/docker/docker-compose.yml`

**Startup**: 
    
    `cd infrastructure/docker  
    docker compose up -d  
    `

**Services**: 13 containers  
**Network**: `tamshai-network` (172.30.0.0/16)  
**Volumes**: Named volumes for data persistence

### Production (Planned)

**Platform**: Google Cloud Platform (GCP)  
**Orchestration**: Google Kubernetes Engine (GKE)  
**IaC**: Terraform

**Infrastructure**: `infrastructure/terraform/main.tf`

**Resources**:

* GKE Cluster (3 nodes, n1-standard-2)
* Cloud SQL PostgreSQL (db-f1-micro)
* Cloud Storage (finance-docs, public-docs)
* Cloud NAT + Load Balancer
* Secret Manager for credentials

**Cost Estimate**: $17-25/month (preemptible), $35-45/month (regular VMs)

**Deployment**: 
    
    `cd infrastructure/terraform  
      
    # Initialize Terraform  
    terraform init  
      
    # Plan deployment  
    terraform plan -var="project_id=tamshai-prod" -var="region=us-central1"  
      
    # Apply infrastructure  
    terraform apply -var="project_id=tamshai-prod" -var="region=us-central1"  
      
    # Deploy services to GKE  
    kubectl apply -f infrastructure/kubernetes/  
    `

---

## Security Considerations

### Secrets Management

**Development**:

* Environment variables in `.env` (not committed)
* Docker secrets for sensitive values
* Keycloak admin password rotation

**Production**:

* GCP Secret Manager
* Kubernetes secrets with encryption at rest
* Automated credential rotation
* HSM-backed key storage

### TLS/mTLS

**Development**: HTTP (localhost only)

**Production**:

* External TLS: Let's Encrypt certificates
* Internal mTLS: Istio service mesh
* Certificate rotation: cert-manager

### Monitoring & Alerting

**Planned**:

* Prometheus for metrics
* Grafana for dashboards
* Loki for log aggregation
* AlertManager for incidents

**Key Metrics**:

* Request rate and latency
* Error rate (4xx, 5xx)
* Token validation failures
* Prompt injection attempts
* MCP server health

### Compliance

**Standards**:

* SOC 2 Type II (planned)
* GDPR compliance (data masking, right to deletion)
* S-OX (financial data)

**Audit Requirements**:

* 90-day audit log retention (dev)
* 7-year retention (production)
* PII scrubbing in logs
* Tamper-proof log storage (WORM)

---

## Troubleshooting

### Common Issues

**1\. Port Conflicts** 
    
    `# Check if ports are in use  
    lsof -i :3100  
    lsof -i :8100  
    lsof -i :8180  
      
    # Change ports in .env if needed  
    MCP_GATEWAY_PORT=3200  
    KONG_PORT=8200  
    KEYCLOAK_PORT=8280  
    `

**2\. Docker Compose Fails** 
    
    `# Check Docker status  
    docker info  
      
    # Clean up old containers/networks  
    docker compose down -v  
    docker system prune -a  
      
    # Restart Docker Desktop  
    `

**3\. Keycloak Not Ready** 
    
    `# Check Keycloak logs  
    docker compose logs keycloak  
      
    # Wait for "Admin console listening on" message  
    # Can take 30-60 seconds on first start  
      
    # Check health endpoint  
    curl http://localhost:8180/health/ready  
    `

**4\. JWT Validation Fails** 
    
    `# Verify Keycloak JWKS is accessible from gateway  
    docker compose exec mcp-gateway curl http://keycloak:8080/realms/tamshai/protocol/openid-connect/certs  
      
    # Check network connectivity  
    docker compose exec mcp-gateway ping keycloak  
      
    # Verify token in jwt.io  
    # Copy token and decode at https://jwt.io  
    `

**5\. Claude API Errors** 
    
    `# Verify API key is set  
    docker compose exec mcp-gateway printenv CLAUDE_API_KEY  
      
    # Check API key format (should start with sk-ant-api03-)  
    # Test API key with curl:  
    curl https://api.anthropic.com/v1/messages \  
    -H "x-api-key: $CLAUDE_API_KEY" \  
    -H "anthropic-version: 2023-06-01" \  
    -H "content-type: application/json" \  
    -d '{"model":"claude-sonnet-4-20250514","max_tokens":100,"messages":[{"role":"user","content":"Hi"}]}'  
    `

**6\. Database Connection Issues** 
    
    `# Check PostgreSQL is running  
    docker compose ps postgres  
      
    # Test connection  
    docker compose exec postgres psql -U tamshai -d tamshai_hr -c "SELECT 1;"  
      
    # Check MongoDB  
    docker compose exec mongodb mongosh --eval "db.adminCommand('ping')"  
    `

**7\. TOTP MFA Issues** 
    
    `# Use the pre-configured TOTP secret for test users  
    TOTP_SECRET=[REDACTED-DEV-TOTP]  
      
    # Generate current code with:  
    # - Google Authenticator app  
    # - Authy app  
    # - Or online generator: https://totp.app/  
      
    # Bypass MFA in dev (not recommended):  
    # Edit keycloak/realm-export.json and disable requiredActions  
    `

### Debugging Tips

**Enable Verbose Logging**: 
    
    `// services/mcp-gateway/src/index.ts  
      
    const logger = winston.createLogger({  
    level: 'debug',  // Change from 'info' to 'debug'  
    // ...  
    });  
    `

**Inspect JWT Token**: 
    
    `# Get token from Keycloak  
    TOKEN=$(curl -X POST http://localhost:8180/realms/tamshai/protocol/openid-connect/token \  
    -d "client_id=mcp-gateway" \  
    -d "client_secret=[REDACTED-DEV-SECRET]" \  
    -d "username=alice.chen" \  
    -d "password=[REDACTED-DEV-PASSWORD]" \  
    -d "grant_type=password" \  
    -d "scope=openid" | jq -r '.access_token')  
      
    # Decode token  
    echo $TOKEN | cut -d. -f2 | base64 -d | jq .  
      
    # Expected claims:  
    # - sub: user ID  
    # - preferred_username: alice.chen  
    # - resource_access.mcp-gateway.roles: ["hr-read", "hr-write"]  
    `

**Monitor Redis**: 
    
    `# Watch token revocations  
    docker compose exec redis redis-cli MONITOR  
      
    # List revoked tokens  
    docker compose exec redis redis-cli KEYS "revoked:*"  
      
    # Check TTL on revocation  
    docker compose exec redis redis-cli TTL "revoked:{jti}"  
    `

**Network Debugging**: 
    
    `# Check DNS resolution between services  
    docker compose exec mcp-gateway nslookup keycloak  
    docker compose exec mcp-gateway nslookup postgres  
      
    # Check network connectivity  
    docker compose exec mcp-gateway nc -zv keycloak 8080  
    docker compose exec mcp-gateway nc -zv postgres 5432  
      
    # Inspect network  
    docker network inspect tamshai-network  
    `

---

## Development Phases & Roadmap

### Phase 1: Foundation (Completed )

* Docker Compose infrastructure
* Keycloak SSO setup
* Redis token cache
* PostgreSQL, MongoDB, Elasticsearch
* Sample data loaded

### Phase 2: Security Layer (In Progress =)

* JWT validation
* Token revocation
* Prompt injection defense
* RLS policies
* Audit logging

### Phase 3: MCP Core (Current =)

* MCP Gateway implementation
* Claude API integration
* Role-based routing
* Integration tests

### Phase 4: MCP Suite (Planned �)

* MCP HR server
* MCP Finance server
* MCP Sales server
* MCP Support server
* Tool implementations

### Phase 5: Sample Apps (Planned �)

* Web-based query interface
* Admin dashboard
* Audit log viewer

### Phase 6: AI Desktop (Complete ✅)

* Flutter/Dart unified client (Windows - Phase 1 complete)
* Desktop OAuth with PKCE (HTTP server callback)
* Secure token storage (flutter\_secure\_storage)
* SSE streaming with real-time AI responses
* v1.4 features: truncation warnings, HITL confirmations
* **Location**: `clients/unified_flutter/`
* **Spec**: `.specify/specs/009-flutter-unified/`

### Phase 7: Operations (Planned �)

* Monitoring dashboards
* Alerting rules
* Backup automation
* Disaster recovery

### Phase 8: Production (Planned �)

* GCP deployment
* GKE orchestration
* Production data migration
* Security hardening
* Performance tuning

### Phase 9: Documentation (Planned �)

* API documentation (OpenAPI)
* Runbooks
* User guides
* Admin guides

---

## Key Files Reference

### Configuration Files
File
Purpose
Lines
`services/mcp-gateway/package.json`
Dependencies and scripts
50
`infrastructure/docker/docker-compose.yml`
Service orchestration
332
`infrastructure/docker/.env.example`
Environment template
40
`infrastructure/docker/kong/kong.yml`
API gateway config
174
`keycloak/realm-export.json`
Identity provider config
850+
`infrastructure/terraform/main.tf`
GCP infrastructure
462

### Source Files
File
Purpose
Lines
`services/mcp-gateway/src/index.ts`
Main gateway logic
473
`services/mcp-gateway/src/security/prompt-defense.ts`
Prompt injection prevention
~200
`services/mcp-gateway/src/security/token-revocation.ts`
Token revocation
~100

### Test Files
File
Purpose
Lines
`tests/integration/rbac.test.ts`
Access control tests
327

### Documentation
File
Purpose
Lines
`docs/architecture/overview.md`
System architecture
656
`docs/architecture/security-model.md`
Security details
631
`docs/development/PORT_ALLOCATION.md`
Port mapping
194
`README.md`
Project overview
154

### Sample Data
File
Purpose
Lines
`sample-data/hr-data.sql`
Employee data
591
`sample-data/finance-data.sql`
Budget/financial data
252
`sample-data/sales-data.js`
CRM data
414

---

## Additional Resources

### Documentation

* [Architecture Overview](docs/architecture/overview.md)
* [Security Model](docs/architecture/security-model.md)
* [Port Allocation](docs/development/PORT_ALLOCATION.md)
* [Lessons Learned](docs/development/lessons-learned.md)

### External Links

* [Anthropic Claude API Docs](https://docs.anthropic.com/claude/reference/getting-started-with-the-api)
* [Model Context Protocol](https://modelcontextprotocol.io/)
* [Keycloak Documentation](https://www.keycloak.org/documentation)
* [Kong Gateway](https://docs.konghq.com/gateway/latest/)

### Support

* Project Sponsor: John Cornell
* Repository: [https://github.com/jcornell3/tamshai-enterprise-ai](https://github.com/jcornell3/tamshai-enterprise-ai)
* Issues: Use GitHub Issues for bug reports

---

_Last Updated: December 26, 2025_  
_Architecture Version: 1.4 (Flutter Desktop Complete)_  
_Document Version: 1.1_ 