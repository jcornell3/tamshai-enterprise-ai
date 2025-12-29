# **Tamshai Enterprise AI \- Gemini Code Guide**

## **Project Overview**

Project: Tamshai Corp Enterprise AI Access System  
Version: 1.4 (December 2025\)  
Type: Microservices Architecture with AI Orchestration  
Primary Language: TypeScript/Node.js  
Status: Specification Complete \- Implementation Ready

### **Purpose**

Enterprise-grade AI access system enabling secure Claude AI integration with role-based data access. Employees can use AI assistants while ensuring data access respects existing security boundaries through defense-in-depth architecture.

## **Quick Reference**

### **Workflow Requirements**

**IMPORTANT: Always push code after making changes.**

After completing any code modification, always commit and push to the repository:

git add \<modified-files\>  
git commit \-m "feat/fix/refactor: description of changes"  
git push

This ensures the user can immediately pull and test the changes on their local machine.

### **Essential Commands**

\# Full environment setup  
./scripts/setup-dev.sh

\# Start all services  
cd infrastructure/docker  
docker compose up \-d

\# Stop all services  
docker compose down

\# View service logs  
docker compose logs \-f mcp-gateway  
docker compose logs \-f keycloak

\# Check service health  
docker compose ps  
curl http://localhost:3100/health        \# MCP Gateway  
curl http://localhost:8100/api/health    \# Kong Gateway

### **MCP Gateway Development**

cd services/mcp-gateway

\# Install dependencies  
npm install

\# Development mode (with hot reload)  
npm run dev

\# Build for production  
npm run build

\# Run tests  
npm test

### **MCP Service Templates**

When creating a new MCP service (e.g., services/mcp-sales), use the existing structure:

* src/index.ts: Main entry point and SSE transport setup  
* src/tools/: Individual tool implementations  
* src/database/: Database connection logic  
* Dockerfile: Multi-stage build configuration

## **Architecture Context**

### **Core Components**

1. **Identity Provider**: Keycloak (OIDC/OAuth2) handling authentication and role management.  
2. **API Gateway**: Kong Gateway enforcing JWT validation and rate limiting.  
3. **MCP Gateway**: Central orchestration layer handling prompt defense, PII scrubbing, and tool routing.  
4. **MCP Services**: Domain-specific services (HR, Finance, Sales) exposing tools via SSE.  
5. **Data Layer**: PostgreSQL (with RLS), MongoDB, Redis (caching/revocation).

### **Security Boundaries**

* **Zero Trust**: All service-to-service communication requires mTLS.  
* **Token Propagation**: User JWT is passed through all layers to enforce RLS at the database level.  
* **Fail Secure**: Systems default to deny access. Redis failure triggers a lockdown.

## **Specification-Driven Development (SDD)**

This project strictly follows SDD. Do not write code without a corresponding specification.

### **Workflow**

1. **Specify**: Create specs/XXX-feature-name/spec.md.  
2. **Plan**: Generate specs/XXX-feature-name/plan.md.  
3. **Tasks**: Create specs/XXX-feature-name/tasks.md.  
4. **Implement**: Write code based on tasks.

### **Templates**

Templates are located in .github/templates/:

* spec.md: Feature specification template.  
* plan.md: Technical implementation plan template.  
* tasks.md: Task breakdown template.

## **Repository Structure**

### **Key Directories**

| Path | Purpose |
| :---- | :---- |
| services/ | Node.js microservices (MCP Gateway, Domain Services) |
| infrastructure/ | Docker Compose, Terraform, Kong Config |
| clients/ | Unified React Native Client (Windows, macOS, Mobile) |
| specs/ | SDD Specifications and Plans |
| docs/ | Architecture and Development Documentation |
| keycloak/ | Realm export and theme configuration |
| scripts/ | Automation and setup scripts |

### **Important Files**

| File | Purpose |
| :---- | :---- |
| services/mcp-gateway/src/index.ts | Gateway entry point |
| services/mcp-gateway/src/security/prompt-defense.ts | Prompt injection logic |
| docs/architecture/constitution.md | Core architectural rules |
| tests/integration/rbac.test.ts | Access control tests |

## **Additional Resources**

### **Documentation**

* [Architecture Overview](https://www.google.com/search?q=docs/architecture/overview.md)  
* [Security Model](https://www.google.com/search?q=docs/architecture/security-model.md)  
* [Port Allocation](https://www.google.com/search?q=docs/development/PORT_ALLOCATION.md)  
* [Lessons Learned](https://www.google.com/search?q=docs/development/lessons-learned.md)

### **External Links**

* [Google Gemini API Docs](https://ai.google.dev/gemini-api/docs)  
* [Model Context Protocol](https://modelcontextprotocol.io/)l  
* [Keycloak Documentation](https://www.keycloak.org/documentation)