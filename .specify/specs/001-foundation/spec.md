# Specification: Foundation Infrastructure

## 1. Business Intent
**User Story:** As a platform administrator, I need a robust, containerized environment with centralized identity management so that I can securely deploy and manage future AI applications.

**Business Value:** Establishes the core security perimeter and identity source of truth (Keycloak) required for all subsequent features.

## 2. Access Control & Security (Crucial)
* **Required Role(s):** Platform Administrator
* **Data Classification:** Internal / System Configuration
* **PII Risks:** No - Infrastructure only
* **RLS Impact:** None - This phase establishes the foundation for RLS in subsequent phases

## 3. MCP Tool Definition
No MCP tools are exposed in this phase. This is pure infrastructure setup.

## 4. User Interaction Scenarios
* **Setup Scenario:** Administrator runs `./scripts/setup-dev.sh` -> All services start -> Keycloak accessible at localhost:8180 -> Test users can log in with TOTP.
* **Health Check:** Administrator runs health checks -> All services respond healthy -> Docker network isolated -> Redis cache operational.
* **Authentication Test:** Test user (alice.chen) logs in -> Keycloak authenticates -> JWT issued with roles -> Token can be validated.

## 5. Success Criteria
- [x] `docker-compose up` starts all infrastructure services without error
- [x] Keycloak is accessible at `localhost:8180`
- [x] Test users (Alice, Bob, Eve, Carol, Dan, Nina, Marcus, Frank) can log in
- [x] Redis is available for token revocation
- [x] PostgreSQL databases initialized (keycloak, tamshai_hr, tamshai_finance)
- [x] MongoDB initialized with tamshai_crm database
- [x] Elasticsearch initialized with support indices
- [x] MinIO initialized with finance-docs and public-docs buckets
- [x] Kong Gateway accessible at `localhost:8100`
- [x] Docker network `tamshai-network` (172.30.0.0/16) isolated and operational

## 6. Scope
* **Docker Compose:** Base configuration for Keycloak, Postgres, Redis, Kong, MongoDB, Elasticsearch, MinIO
* **Identity:** Realm import with predefined Roles (`hr-read`, `hr-write`, `finance-read`, `finance-write`, `sales-read`, `sales-write`, `support-read`, `support-write`, `manager`, `executive`) and test users
* **Databases:** Initialization of PostgreSQL schemas for Keycloak and future microservices
* **Network:** Subnet allocation (172.30.0.0/16) to avoid conflicts with existing MCP dev environment (172.28.0.0/16)

## 7. Technical Details
* **Port Allocation:** Custom ports to avoid conflicts (8180 for Keycloak, 5433 for Postgres, 27018 for MongoDB, etc.)
* **Environment Variables:** Stored in `.env` file (not committed to git)
* **Sample Data:** Test users with predefined roles and TOTP configuration
* **Authentication Flow:** OIDC with PKCE, TOTP MFA enforcement

## Status
**COMPLETED ✓** - This phase has been successfully implemented.
