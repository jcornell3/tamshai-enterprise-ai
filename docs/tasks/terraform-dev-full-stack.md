# Action Item: Expand Terraform Dev Scripts for Full Stack Deployment

**Created**: 2025-12-30
**Priority**: Medium
**Effort**: Medium (2-3 days)
**Assigned**: TBD
**Status**: Queued

---

## Objective

Expand Terraform development scripts to manage all services in the local Docker environment, achieving parity with the stage environment deployment.

## Current State

**Currently Managed by Terraform** (dev environment):
- Keycloak (realm, roles, users, client)
- PostgreSQL (implicit dependency)
- Redis (implicit dependency)

**Available in docker-compose.yml** (19 services total):
```
elasticsearch       # Search engine
keycloak           # ✅ Managed by Terraform
kong               # API Gateway
mcp-finance        # Finance MCP server
mcp-gateway        # ✅ Depends on Terraform-managed Keycloak
mcp-hr             # HR MCP server
mcp-sales          # Sales MCP server
mcp-support        # Support MCP server
minio              # Object storage
minio-init         # MinIO initialization
mongodb            # Document database
postgres           # ✅ Managed by Terraform (Keycloak DB)
redis              # ✅ Managed by Terraform (token cache)
tamshai-website    # Marketing website
web-finance        # Finance web app
web-hr             # HR web app
web-portal         # Main portal
web-sales          # Sales web app
web-support        # Support web app
```

**Gap**: 16 services available but not Terraform-managed in dev.

## Desired State

**Full Terraform Management for Dev**:
1. All infrastructure services (databases, caches, storage)
2. All MCP servers with configuration
3. All web applications with configuration
4. Sample data loading (HR, Finance, Sales, Support)
5. API Gateway (Kong) configuration
6. Service health checks and dependencies

**Benefits**:
- **Environment Parity**: Dev matches stage/prod deployment
- **Consistency**: Same IaC for all environments
- **Onboarding**: New developers run `terraform apply` for full stack
- **Testing**: Integration tests against complete environment
- **Documentation**: Self-documenting infrastructure

## Scope

### Phase 1: Database Infrastructure (High Priority)

**Postgres Databases**:
```hcl
resource "postgresql_database" "tamshai_hr" {
  name  = "tamshai_hr"
  owner = "tamshai"
}

resource "postgresql_database" "tamshai_finance" {
  name  = "tamshai_finance"
  owner = "tamshai"
}

resource "postgresql_database" "tamshai_sales" {
  name  = "tamshai_sales"
  owner = "tamshai"
}

resource "postgresql_database" "tamshai_support" {
  name  = "tamshai_support"
  owner = "tamshai"
}
```

**MongoDB Collections**:
```hcl
resource "mongodbatlas_database_user" "tamshai" {
  # User setup
}

# Or use mongodb provider for local dev
```

**MinIO Buckets**:
```hcl
resource "minio_s3_bucket" "finance_docs" {
  bucket = "finance-docs"
  acl    = "private"
}

resource "minio_s3_bucket" "public_docs" {
  bucket = "public-docs"
  acl    = "public-read"
}
```

### Phase 2: Sample Data Loading (Medium Priority)

**HR Sample Data**:
```hcl
resource "postgresql_table" "employees" {
  # Schema creation
}

resource "null_resource" "load_hr_data" {
  provisioner "local-exec" {
    command = "psql -U tamshai -d tamshai_hr -f ${path.module}/sample-data/hr-employees.sql"
  }
  depends_on = [postgresql_database.tamshai_hr]
}
```

**Finance Sample Data**: Invoices, transactions, budgets
**Sales Sample Data**: Customers, opportunities, deals
**Support Sample Data**: Tickets, knowledge base articles

### Phase 3: MCP Server Configuration (Medium Priority)

**MCP Server Environment Variables**:
```hcl
resource "docker_container" "mcp_hr" {
  name  = "mcp-hr"
  image = "tamshai/mcp-hr:latest"

  env = [
    "DB_HOST=${docker_container.postgres.name}",
    "DB_NAME=${postgresql_database.tamshai_hr.name}",
    "DB_USER=tamshai",
    "DB_PASSWORD=${var.db_password}",
    "KEYCLOAK_URL=${var.keycloak_url}",
    "KEYCLOAK_REALM=${keycloak_realm.tamshai_corp.realm}",
  ]

  depends_on = [
    postgresql_database.tamshai_hr,
    keycloak_realm.tamshai_corp
  ]
}
```

Repeat for mcp-finance, mcp-sales, mcp-support.

### Phase 4: Kong API Gateway Configuration (Low Priority)

**Kong Declarative Config**:
```hcl
resource "kong_service" "mcp_gateway" {
  name     = "mcp-gateway"
  protocol = "http"
  host     = "mcp-gateway"
  port     = 3100
}

resource "kong_route" "mcp_gateway" {
  service_id = kong_service.mcp_gateway.id
  paths      = ["/api"]
  strip_path = true
}

resource "kong_plugin" "rate_limiting" {
  service_id = kong_service.mcp_gateway.id
  name       = "rate-limiting"

  config = {
    minute = 100
    hour   = 1000
  }
}
```

### Phase 5: Web Applications (Low Priority)

Configure web-hr, web-finance, web-sales, web-support, web-portal with:
- Environment variables
- Backend API URLs
- OAuth client IDs
- Feature flags

## Implementation Plan

### Directory Structure

```
infrastructure/terraform/dev/
├── versions.tf              # Terraform and provider versions
├── provider.tf              # Multiple providers (postgres, minio, etc.)
├── variables.tf             # Input variables
├── main.tf                  # Main infrastructure
├── keycloak.tf             # Keycloak resources (import from keycloak/)
├── databases.tf            # PostgreSQL, MongoDB databases
├── storage.tf              # MinIO buckets
├── sample-data.tf          # Data loading resources
├── mcp-servers.tf          # MCP server configuration
├── kong.tf                 # API Gateway configuration
├── web-apps.tf             # Web application configuration
├── outputs.tf              # Outputs for integration
├── environments/
│   └── dev.tfvars          # Local development configuration
└── sample-data/
    ├── hr-employees.sql
    ├── finance-invoices.sql
    ├── sales-customers.sql
    └── support-tickets.sql
```

### Required Terraform Providers

```hcl
terraform {
  required_providers {
    keycloak = {
      source  = "mrparkers/keycloak"
      version = "~> 4.4.0"
    }
    postgresql = {
      source  = "cyrilgdn/postgresql"
      version = "~> 1.22.0"
    }
    mongodb = {
      source  = "mongodb/mongodbatlas"
      version = "~> 1.14.0"
    }
    minio = {
      source  = "aminueza/minio"
      version = "~> 2.0.0"
    }
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0.0"
    }
    kong = {
      source  = "kevholditch/kong"
      version = "~> 7.0.0"
    }
  }
}
```

### Testing Strategy

1. **Unit Tests**: Validate Terraform configurations
   ```bash
   terraform validate
   terraform fmt -check
   ```

2. **Integration Tests**:
   - Deploy full stack: `terraform apply -var-file=environments/dev.tfvars`
   - Run health checks on all services
   - Verify sample data loaded
   - Test MCP Gateway with all servers
   - Run integration test suite (74 tests)

3. **Cleanup Tests**:
   - `terraform destroy` removes all resources
   - Fresh `terraform apply` recreates everything

### Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Provider compatibility issues | High | Test each provider individually first |
| Sample data conflicts | Medium | Use upsert logic, idempotent SQL scripts |
| Docker networking complexity | Medium | Use docker-compose networks, document |
| State file size growth | Low | Use remote state, modularize |
| Increased apply time | Low | Parallel resource creation, optimize dependencies |

## Success Criteria

- [ ] All 19 docker-compose services managed by Terraform
- [ ] `terraform apply` deploys full development stack
- [ ] Sample data loaded in all databases
- [ ] MCP servers connect to Keycloak and databases
- [ ] Integration tests pass (74/74)
- [ ] `terraform destroy` cleans up all resources
- [ ] Documentation updated with new workflow
- [ ] New developer onboarding time < 30 minutes

## Estimated Timeline

- **Phase 1** (Database Infrastructure): 2 days
- **Phase 2** (Sample Data): 1 day
- **Phase 3** (MCP Servers): 1 day
- **Phase 4** (Kong Gateway): 1 day
- **Phase 5** (Web Apps): 1 day
- **Testing & Documentation**: 1 day

**Total**: 7 days (with buffer for debugging)

## Dependencies

- Keycloak Terraform (✅ Complete)
- Docker Compose environment (✅ Available)
- Sample data scripts (❌ Need to create)
- Provider documentation (✅ Available)

## References

- **Current Keycloak Terraform**: `infrastructure/terraform/keycloak/`
- **Docker Compose**: `infrastructure/docker/docker-compose.yml`
- **Stage Deployment**: `infrastructure/terraform/vps/` (for reference)
- **PostgreSQL Provider**: https://registry.terraform.io/providers/cyrilgdn/postgresql/latest/docs
- **MinIO Provider**: https://registry.terraform.io/providers/aminueza/minio/latest/docs
- **Docker Provider**: https://registry.terraform.io/providers/kreuzwerker/docker/latest/docs
- **Kong Provider**: https://registry.terraform.io/providers/kevholditch/kong/latest/docs

## Related Issues

- Keycloak HTTP 400 race conditions (✅ Resolved with Terraform)
- Integration test failures (5/74 passing, expected 74/74 after Keycloak fix)
- New developer onboarding complexity

## Notes

- **Prioritization**: Start with Phase 1 (databases) as it's required for MCP servers
- **Incremental Approach**: Can implement phase by phase, doesn't block current work
- **Reusability**: Dev Terraform can be adapted for stage/prod with different tfvars
- **Learning Curve**: Team gains Terraform expertise, improves infrastructure skills

---

**Status Updates**:
- 2025-12-30: Action item created, queued for future sprint
