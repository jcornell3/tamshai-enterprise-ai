# Tamshai Enterprise AI - Terraform Infrastructure

## Deployment Architecture Overview

Tamshai uses **different deployment strategies** for each environment:

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT ENVIRONMENTS                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Development (Local)                                            │
│  ├─ Platform: Docker Compose on localhost                       │
│  ├─ Location: infrastructure/docker/                            │
│  ├─ Configuration: .env file                                    │
│  ├─ Cost: Free (local resources)                                │
│  └─ Use: Development, testing, CI/CD                            │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Staging (VPS)                                                  │
│  ├─ Platform: DigitalOcean/Hetzner VPS                          │
│  ├─ Location: infrastructure/terraform/vps/                     │
│  ├─ Configuration: terraform.tfvars                             │
│  ├─ Cost: ~$40-60/month (single VPS)                            │
│  └─ Use: Pre-production testing, demos, UAT                     │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Production (GCP)                                               │
│  ├─ Platform: Google Cloud Platform                             │
│  ├─ Location: infrastructure/terraform/ (this directory)        │
│  ├─ Configuration: environments/production.tfvars               │
│  ├─ Cost: ~$150-200/month (scalable infrastructure)            │
│  └─ Use: Production workloads, customers                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## This Directory: GCP Production Infrastructure

**This Terraform configuration (`infrastructure/terraform/`) is for GCP production deployment only.**

### Architecture

The GCP infrastructure is modularized into focused, reusable components:

```
infrastructure/terraform/
├── main.tf                      # Root orchestration (GCP production)
├── variables.tf                 # Global variables
├── outputs.tf                   # Aggregated outputs
├── environments/
│   └── production.tfvars        # GCP production configuration
└── modules/                     # Reusable GCP modules
    ├── networking/              # VPC, subnets, NAT, firewall
    ├── security/                # IAM, Secret Manager, passwords
    ├── database/                # Cloud SQL PostgreSQL
    ├── storage/                 # Cloud Storage buckets
    └── compute/                 # GCE instances
```

### GCP Resources Created

- **Networking**: VPC, subnet, Cloud NAT, firewall rules
- **Security**: Service accounts, Secret Manager secrets, IAM bindings
- **Database**: Cloud SQL PostgreSQL (HA, automated backups)
- **Storage**: Cloud Storage buckets (versioned, lifecycle policies)
- **Compute**: GCE instances for Keycloak and MCP Gateway

### Cost Estimate

**Production (GCP)**: ~$150-200/month
- Cloud SQL (db-custom-2-7680): ~$80/month
- Compute Engine (2x e2-standard): ~$50/month
- Cloud Storage (with versioning): ~$10/month
- Networking (Cloud NAT, egress): ~$15/month
- Secret Manager: ~$1/month

### Usage

```bash
# 1. Initialize Terraform
cd infrastructure/terraform
terraform init

# 2. Select production workspace
terraform workspace select tamshai-production

# 3. Plan deployment
terraform plan -var-file=environments/production.tfvars

# 4. Apply infrastructure
terraform apply -var-file=environments/production.tfvars

# 5. Upload Anthropic API key (manual step)
echo "sk-ant-api03-PROD-KEY" | gcloud secrets versions add \
  tamshai-production-anthropic-api-key --data-file=-
```

### Documentation

- **[TERRAFORM_MODULES.md](./TERRAFORM_MODULES.md)** - Comprehensive module documentation
  - Module architecture and dependencies
  - Detailed descriptions of each module
  - Usage examples and testing guidelines
  - Troubleshooting and best practices

---

## Staging Deployment: VPS

**For staging environment, use the VPS configuration in `infrastructure/terraform/vps/`**

### VPS Architecture

Staging runs on a **single VPS** with all services containerized:

```
infrastructure/terraform/vps/
├── main.tf                      # VPS provisioning
├── cloud-init.yaml              # Automated setup script
├── terraform.tfvars.example     # Configuration template
└── scripts/
    └── deploy.sh                # Remote deployment script
```

### VPS Features

- **Supported Providers**: DigitalOcean, Hetzner Cloud
- **All-in-one**: Single VPS runs all services via Docker Compose
- **Automated Setup**: Cloud-init handles installation and deployment
- **Let's Encrypt**: Automatic SSL certificate provisioning
- **Cost-Effective**: ~$40-60/month for staging environment

### VPS Usage

```bash
# 1. Configure VPS deployment
cd infrastructure/terraform/vps
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values

# 2. Deploy VPS
terraform init
terraform plan
terraform apply

# 3. Deploy updates remotely
./scripts/deploy.sh                # Pull latest code and restart
./scripts/deploy.sh --build        # Rebuild containers
```

### Documentation

See **[infrastructure/terraform/vps/README.md](./vps/README.md)** for detailed VPS setup instructions.

---

## Development Environment: Docker Compose

**For local development, use Docker Compose in `infrastructure/docker/`**

### Development Setup

```bash
# Quick start
./scripts/setup-dev.sh

# Manual setup
cd infrastructure/docker
cp .env.example .env
# Edit .env with your values
docker compose up -d
```

### Development Features

- **Localhost Only**: All services on 127.0.0.1
- **No External Dependencies**: Self-contained environment
- **Fast Iteration**: Hot reload, instant feedback
- **Sample Data**: Pre-loaded test data

### Documentation

See **[CLAUDE.md](../../CLAUDE.md)** Section: "Development Environment" for full setup guide.

---

## Environment Comparison

| Feature | Development | Staging (VPS) | Production (GCP) |
|---------|-------------|---------------|------------------|
| **Platform** | Docker Compose | Single VPS | GCP Multi-service |
| **Location** | Localhost | DigitalOcean/Hetzner | Google Cloud |
| **Terraform** | No | Yes (vps/) | Yes (root) |
| **Cost** | Free | ~$40-60/month | ~$150-200/month |
| **SSL** | No | Let's Encrypt | Cloud Load Balancer |
| **HA** | No | No | Yes (Cloud SQL) |
| **Backups** | Manual | Optional | Automated |
| **Scalability** | N/A | Vertical only | Horizontal + Vertical |
| **Use Case** | Dev/Testing | UAT/Demos | Production |

---

## Which Configuration Should I Use?

### Use `infrastructure/terraform/` (this directory) if:
- ✅ Deploying to **production**
- ✅ Need GCP-specific resources (Cloud SQL, Secret Manager, GCE)
- ✅ Require high availability and automated backups
- ✅ Budget supports ~$150-200/month
- ✅ Need horizontal scalability

### Use `infrastructure/terraform/vps/` if:
- ✅ Deploying to **staging**
- ✅ Need a cost-effective pre-production environment
- ✅ Want automated VPS provisioning
- ✅ Budget is ~$40-60/month
- ✅ Testing full deployment workflow

### Use `infrastructure/docker/` if:
- ✅ Local **development**
- ✅ Testing code changes
- ✅ Running CI/CD pipelines
- ✅ Learning the system architecture
- ✅ Cost needs to be zero

---

## Migration Path

When promoting code from development → staging → production:

### Development → Staging
```bash
# 1. Test locally
cd infrastructure/docker
docker compose up -d
# Run tests, verify functionality

# 2. Deploy to VPS staging
cd ../terraform/vps
terraform apply
./scripts/deploy.sh --build
```

### Staging → Production
```bash
# 1. Verify staging
# Test all functionality on VPS

# 2. Deploy to GCP production
cd ../terraform
terraform workspace select tamshai-production
terraform plan -var-file=environments/production.tfvars
terraform apply -var-file=environments/production.tfvars
```

---

## Common Questions

### Q: Why not use GCP for staging?
**A:** Cost optimization. A single VPS ($40-60/month) provides adequate staging resources. GCP staging would cost ~$100-150/month with minimal benefit over VPS.

### Q: Can I use these modules for staging?
**A:** No. These modules are GCP-specific and designed for production scale. VPS staging uses a different, simpler architecture in `infrastructure/terraform/vps/`.

### Q: What if I want to test GCP features before production?
**A:** Use a separate GCP project with the dev environment configuration (when created), or manually create a test GCP environment. Do not use production Terraform for testing.

### Q: Can I run production on a VPS like staging?
**A:** Not recommended. VPS lacks high availability, automated backups, and horizontal scalability needed for production. Use GCP for production workloads.

---

## Next Steps

- **For GCP production deployment**: Read [TERRAFORM_MODULES.md](./TERRAFORM_MODULES.md)
- **For VPS staging deployment**: See [vps/README.md](./vps/README.md)
- **For local development**: See [CLAUDE.md](../../CLAUDE.md)

---

*Last Updated: December 29, 2025*
*Architecture Version: 1.4*
*Document Version: 1.0*
