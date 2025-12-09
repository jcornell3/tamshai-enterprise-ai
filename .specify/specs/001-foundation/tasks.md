# Tasks: Foundation Infrastructure

## Group 1: Docker Infrastructure
- [x] Create `infrastructure/docker/docker-compose.yml` with network configuration. [P]
- [x] Define Docker network `tamshai-network` with subnet 172.30.0.0/16. [P]
- [x] Create `.env.example` template with all required environment variables. [P]
- [x] Add `.env` to `.gitignore` to prevent credential leakage. [P]
- [x] Document port allocation strategy in `docs/development/PORT_ALLOCATION.md`. [P]

## Group 2: Identity Provider (Keycloak)
- [x] Add Keycloak service to docker-compose.yml (port 8180). [P]
- [x] Configure Keycloak with PostgreSQL backend database. [P]
- [x] Create `keycloak/realm-export.json` with tamshai realm configuration. [P]
- [x] Define roles: hr-read, hr-write, finance-read, finance-write, sales-read, sales-write, support-read, support-write, manager, executive. [P]
- [x] Create composite role `executive` combining all department roles. [P]
- [x] Create 8 test users with appropriate role assignments. [P]
- [x] Configure TOTP MFA with shared secret `JBSWY3DPEHPK3PXP` for testing. [P]
- [x] Create confidential client `mcp-gateway` with PKCE enabled. [P]

## Group 3: Databases
- [x] Add PostgreSQL service to docker-compose.yml (port 5433). [P]
- [x] Create initialization script for databases: keycloak, tamshai_hr, tamshai_finance. [P]
- [x] Add MongoDB service to docker-compose.yml (port 27018). [P]
- [x] Configure MongoDB authentication and create tamshai_crm database. [P]
- [x] Add Elasticsearch service to docker-compose.yml (port 9201). [P]
- [x] Create index mappings for support_tickets and knowledge_base. [P]
- [x] Add Redis service to docker-compose.yml (port 6380). [P]
- [x] Configure Redis persistence (AOF + RDB) for token revocation. [P]
- [x] Add MinIO service to docker-compose.yml (ports 9100, 9102). [P]
- [x] Create buckets: finance-docs, public-docs. [P]

## Group 4: API Gateway (Kong)
- [x] Add Kong Gateway service to docker-compose.yml (port 8100). [P]
- [x] Create Kong declarative configuration in `infrastructure/docker/kong/kong.yml`. [P]
- [x] Configure JWT authentication plugin. [P]
- [x] Configure rate limiting plugin (60/min, 500/hour). [P]
- [x] Configure request-size-limiting plugin (10MB max). [P]
- [x] Configure CORS plugin with appropriate origins. [P]
- [x] Add security headers configuration. [P]
- [x] Define service route to MCP Gateway (http://mcp-gateway:3100). [P]

## Group 5: Sample Data
- [x] Create `sample-data/hr-data.sql` with 20 employee records. [P]
- [x] Add RLS policy definitions to hr-data.sql (for future Phase 2). [P]
- [x] Create `sample-data/finance-data.sql` with budget and invoice data. [P]
- [x] Create `sample-data/sales-data.js` with 15 customers and 12 opportunities. [P]
- [x] Create sample support tickets and knowledge base articles for Elasticsearch. [P]

## Group 6: Development Scripts
- [x] Create `scripts/setup-dev.sh` for automated environment setup. [P]
- [x] Add prerequisite checks (Docker 4.0+, Node.js 20+, disk space). [P]
- [x] Implement service health checking in setup script. [P]
- [x] Add automatic sample data loading. [P]
- [x] Display access URLs and test credentials after successful setup. [P]

## Group 7: Documentation
- [x] Create `docs/architecture/overview.md` with system architecture diagrams. [P]
- [x] Create `docs/architecture/security-model.md` documenting defense-in-depth. [P]
- [x] Create `docs/development/PORT_ALLOCATION.md` with port mapping table. [P]
- [x] Update `CLAUDE.md` with comprehensive development guide. [P]
- [x] Create project `README.md` with quick start instructions. [P]
- [x] Document test user credentials and roles. [P]

## Group 8: Verification
- [x] Test `docker-compose up -d` starts all services. [P]
- [x] Verify Keycloak accessible at http://localhost:8180. [P]
- [x] Test user login with TOTP (alice.chen/password123). [P]
- [x] Verify JWT token issuance with correct role claims. [P]
- [x] Test PostgreSQL connectivity (psql -h localhost -p 5433 -U tamshai). [P]
- [x] Test MongoDB connectivity (mongosh localhost:27018). [P]
- [x] Test Redis connectivity (redis-cli -p 6380). [P]
- [x] Verify Kong Gateway health check (curl localhost:8100/api/health). [P]
- [x] Verify network isolation (docker network inspect tamshai-network). [P]

## Status
**COMPLETED ✓** - All tasks successfully completed and verified.
