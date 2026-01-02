# Implementation Plan: Foundation Infrastructure

## Phase 1: Docker Compose Architecture
* [x] **Docker Network Setup:**
    * Create isolated Docker network `tamshai-network` with subnet 172.30.0.0/16
    * Configure DNS resolution between services
    * Set up network policies for service isolation
* [x] **Port Allocation Strategy:**
    * Document all service ports to avoid conflicts with existing MCP environment
    * Create PORT_ALLOCATION.md documentation
* [x] **Environment Configuration:**
    * Create `.env.example` template with all required variables
    * Document secrets management strategy
    * Set up `.gitignore` to prevent credential leakage

## Phase 2: Identity & Authentication (Keycloak)
* [x] **Keycloak Container:**
    * Deploy Keycloak 23.0 with PostgreSQL backend
    * Configure custom port (8180) to avoid conflicts
    * Set up health check endpoints
    * Use Docker `--import-realm` flag for atomic realm setup (ADR-006)
* [x] **Realm Configuration:**
    * Create `tamshai` realm with OIDC support
    * Configure realm settings (token lifetimes, MFA requirements)
    * Export realm configuration to `keycloak/realm-export.json` (prod) and `realm-export-dev.json` (dev/stage)
* [x] **Role Hierarchy:**
    * Define atomic roles (hr-read, hr-write, finance-read, finance-write, etc.)
    * Create composite roles (executive role combining all department roles)
    * Document role inheritance model
* [x] **Test Users:**
    * Create 8 test users representing different roles:
      - eve.thompson (executive)
      - alice.chen (hr-read, hr-write)
      - bob.martinez (finance-read, finance-write)
      - carol.johnson (sales-read, sales-write)
      - dan.williams (support-read, support-write)
      - nina.patel (manager)
      - marcus.johnson (user)
      - frank.davis (intern)
    * Configure TOTP MFA with shared secret for testing
* [x] **Client Configuration:**
    * Create `mcp-gateway` confidential client
    * Enable PKCE flow
    * Configure valid redirect URIs

## Phase 3: Data Layer
* [x] **PostgreSQL:**
    * Deploy PostgreSQL 15 on port 5433
    * Create databases: `keycloak`, `tamshai_hr`, `tamshai_finance`
    * Initialize schemas for each database
    * Configure connection pooling
* [x] **MongoDB:**
    * Deploy MongoDB 7.0 on port 27018
    * Create database: `tamshai_sales`
    * Configure authentication
    * Set up collections for sales data
* [x] **Elasticsearch:**
    * Deploy Elasticsearch 8.11 on port 9201
    * Create indices: `support_tickets`, `knowledge_base`
    * Configure analyzers for full-text search
* [x] **MinIO:**
    * Deploy MinIO on ports 9100 (API) and 9102 (Console)
    * Create buckets: `finance-docs`, `public-docs`
    * Configure access policies
* [x] **Redis:**
    * Deploy Redis 7.2 on port 6380
    * Configure for token revocation cache
    * Set up persistence (AOF + RDB)

## Phase 4: API Gateway (Kong)
* [x] **Kong Deployment:**
    * Deploy Kong Gateway 3.5 on port 8100
    * Configure Kong declarative configuration mode
    * Set up PostgreSQL backend for Kong
* [x] **Gateway Configuration:**
    * Create `infrastructure/docker/kong/kong.yml` declarative config
    * Configure services and routes
    * Set up upstream connection to MCP Gateway
* [x] **Security Plugins:**
    * Enable JWT authentication plugin
    * Configure rate limiting (60/min, 500/hour)
    * Enable request-size-limiting (10MB)
    * Configure CORS plugin
    * Add security headers (helmet)

## Phase 5: Development Scripts & Terraform
* [x] **Terraform Dev Environment:**
    * Create `infrastructure/terraform/dev/` for local development deployment
    * Configure null_resource + local-exec for docker compose operations
    * Add hosts file validation (pre-flight check for tamshai.local)
    * Add Caddy health check integration
    * Generate `.env` from template with TF_VAR_* substitution
* [x] **Legacy Setup Script (Deprecated):**
    * Create `scripts/setup-dev.sh` for one-command environment setup (deprecated in favor of Terraform)
    * Add prerequisite checks (Docker, Node.js, disk space)
    * Implement service health checking
    * Display access URLs and credentials after setup
* [x] **Sample Data Loading:**
    * Create SQL scripts for HR data in `sample-data/hr-data.sql`
    * Create SQL scripts for Finance data in `sample-data/finance-data.sql`
    * Create MongoDB scripts for Sales data in `sample-data/sales-data.js`
    * Create Elasticsearch index mappings for Support data
    * Auto-load sample data during setup

## Phase 6: Documentation
* [x] **Architecture Documentation:**
    * Create `docs/architecture/overview.md` with system architecture
    * Document security model in `docs/architecture/security-model.md`
    * Create port allocation guide in `docs/development/PORT_ALLOCATION.md`
* [x] **Development Guide:**
    * Update CLAUDE.md with comprehensive development instructions
    * Document Docker commands for common operations
    * Create troubleshooting guide
* [x] **README:**
    * Create project README with quick start instructions
    * Add badges for project status
    * Link to detailed documentation

## Phase 7: VPS/Stage Deployment
* [x] **Hetzner Cloud Infrastructure:**
    * Deploy CPX31 (4 vCPU, 8GB RAM) in Hillsboro, Oregon
    * Configure Terraform in `infrastructure/terraform/vps/`
    * Set up Vault SSH authentication for secure access
* [x] **CI/CD Pipeline:**
    * Create `.github/workflows/deploy-vps.yml` for automated deployment
    * Configure Vault OIDC authentication for GitHub Actions
    * Implement health checks and deployment verification
* [x] **Keycloak Realm Unification (ADR-006):**
    * Remove Terraform keycloak provider from dev environment
    * Unified all environments on Docker `--import-realm` pattern
    * Fix GCP production Keycloak (was not configured)

## Verification Checklist
- [x] Does `docker-compose up -d` start all services successfully?
- [x] Can test users log in to Keycloak with TOTP?
- [x] Are all databases accessible and initialized?
- [x] Is Kong Gateway routing traffic correctly?
- [x] Are all ports properly allocated without conflicts?
- [x] Is the network isolated from other Docker environments?
- [x] Do health check endpoints return 200 OK?
- [x] Is sample data loaded correctly in all databases?
- [x] Does Terraform dev environment deploy successfully?
- [x] Does VPS staging receive automated deployments from GitHub Actions?
- [x] Is Keycloak realm imported via --import-realm across all environments?

## Status
**COMPLETED ✓** - All phases successfully implemented and verified.

### Deployment Status (January 2026)
| Environment | Status | Method |
|-------------|--------|--------|
| CI | ✅ Working | GitHub Actions + Docker Compose |
| Dev | ✅ Working | Terraform + Docker Compose |
| VPS/Stage | ✅ Working | Terraform + GitHub Actions (Vault SSH) |
| GCP/Prod | Ready | Terraform + GKE (not yet deployed) |
