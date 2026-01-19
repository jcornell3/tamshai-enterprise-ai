# GCP Scripts

Scripts for managing Tamshai Enterprise AI on Google Cloud Platform.

## Prerequisites

- **gcloud CLI**: Authenticated with appropriate permissions
- **Cloud SQL Auth Proxy**: For PostgreSQL access (`cloud-sql-proxy`)
- **mongosh**: MongoDB Shell for Atlas access
- **psql**: PostgreSQL client

### Install Prerequisites

```bash
# macOS
brew install google-cloud-sdk postgresql mongosh

# Windows
winget install Google.CloudSDK
winget install PostgreSQL
winget install MongoDB.Shell

# Linux (Ubuntu/Debian)
sudo apt-get install -y google-cloud-sdk postgresql-client
# mongosh: https://www.mongodb.com/try/download/shell
```

### Authenticate

```bash
# Login to GCP
gcloud auth login

# Set project (use your actual project ID)
gcloud config set project ${GCP_PROJECT}

# For service account authentication
gcloud auth activate-service-account --key-file=path/to/key.json
```

## Scripts

### Infrastructure

| Script | Purpose |
|--------|---------|
| `gcp-infra-deploy.sh` | Deploy GCP infrastructure via Terraform |
| `gcp-infra-teardown.sh` | Tear down GCP infrastructure |
| `enable-apis.sh` | Enable required GCP APIs |

### Sample Data

| Script | Purpose |
|--------|---------|
| `load-sample-data.sh` | Load sample data into production databases |
| `remove-sample-data.sh` | Remove sample data from production databases |

## Sample Data Scripts

### Load Sample Data

Loads sample data from `sample-data/` into Cloud SQL and MongoDB Atlas.

```bash
# Load all sample data
./scripts/gcp/load-sample-data.sh

# Load specific service data
./scripts/gcp/load-sample-data.sh --service=hr
./scripts/gcp/load-sample-data.sh --service=finance
./scripts/gcp/load-sample-data.sh --service=sales

# Preview without making changes
./scripts/gcp/load-sample-data.sh --dry-run
```

**Data Sources:**
- HR: `sample-data/hr-data.sql` → Cloud SQL `tamshai_hr`
- Finance: `sample-data/finance-data.sql` → Cloud SQL `tamshai_finance`
- Sales: `sample-data/sales-data.js` → MongoDB Atlas `tamshai_sales`
- Support: `sample-data/support-data.js` → MongoDB Atlas `tamshai_support` (tickets)
- Knowledge Base: `sample-data/support-data.ndjson` → Elasticsearch (not deployed in Phase 1)

### Remove Sample Data

Removes sample data from production databases. **Destructive operation!**

```bash
# Remove all sample data (requires confirmation)
./scripts/gcp/remove-sample-data.sh

# Remove specific service data
./scripts/gcp/remove-sample-data.sh --service=sales

# Skip confirmation (use with caution)
./scripts/gcp/remove-sample-data.sh --force

# Preview without making changes
./scripts/gcp/remove-sample-data.sh --dry-run
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GCP_PROJECT` | Yes | GCP Project ID |
| `GCP_REGION` | Yes | GCP Region (e.g., from `${{ vars.GCP_REGION }}` in GitHub Actions) |
| `CLOUD_SQL_INSTANCE` | `tamshai-prod-postgres` | Cloud SQL instance name |
| `POSTGRES_USER` | `tamshai` | PostgreSQL username |
| `POSTGRES_PORT` | `5432` | Local port for Cloud SQL proxy |

## Secrets

The scripts retrieve credentials from GCP Secret Manager:

| Secret Name | Used For |
|-------------|----------|
| `tamshai-prod-db-password` | PostgreSQL password (HR, Finance) |
| `tamshai-prod-mongodb-uri` | MongoDB Atlas connection string (Sales, Support) |

## Troubleshooting

### Cloud SQL Auth Proxy Issues

```bash
# Check if proxy is running
pgrep -f cloud-sql-proxy

# Start manually
cloud-sql-proxy ${GCP_PROJECT}:${GCP_REGION}:tamshai-prod-postgres --port=5432

# Test connection
PGPASSWORD=$(gcloud secrets versions access latest --secret=tamshai-prod-db-password) \
  psql -h localhost -p 5432 -U tamshai -d tamshai_hr -c "SELECT 1;"
```

### MongoDB Atlas Connection Issues

```bash
# Test connection
MONGODB_URI=$(gcloud secrets versions access latest --secret=tamshai-prod-mongodb-uri)
mongosh "$MONGODB_URI" --eval "db.adminCommand('ping')"
```

### Permission Errors

Ensure your account has:
- `roles/secretmanager.secretAccessor` for Secret Manager
- `roles/cloudsql.client` for Cloud SQL
- `roles/run.admin` for Cloud Run (if restarting services)

## User Provisioning Workflow

The user provisioning process uses **Cloud Run Jobs** to load HR sample data and sync users to Keycloak. Cloud Run Jobs have VPC connector access and can connect to private IP Cloud SQL instances.

### Why Cloud Run Jobs?

The production Cloud SQL instance (`tamshai-prod-postgres`) is configured with **private IP only** for security:
- GitHub Actions runs on the public internet and cannot connect to private IP instances
- Cloud Build also runs on shared infrastructure outside the VPC (despite documentation)
- **Cloud Run Jobs** have native VPC connector support via `tamshai-prod-connector`

### Architecture

```
┌──────────────────┐      ┌─────────────────┐      ┌──────────────────┐
│ Cloud Run Job    │──────│ VPC Connector   │──────│ Private Cloud SQL│
│ provision-users  │      │ tamshai-prod-   │      │ 10.x.x.x:5432    │
│                  │      │ connector       │      │                  │
└──────────────────┘      └─────────────────┘      └──────────────────┘
         │
         │ Cloud SQL Proxy (localhost:5432)
         ▼
    ┌──────────────────┐
    │ entrypoint.sh    │
    │ - load HR data   │
    │ - identity-sync  │
    │   (--no-redis)   │
    └──────────────────┘
```

### Files

| File | Purpose |
|------|---------|
| `scripts/gcp/provision-job/Dockerfile` | Container image for provisioning |
| `scripts/gcp/provision-job/entrypoint.sh` | Entrypoint script with actions |
| `scripts/gcp/provision-job/cloudbuild.yaml` | Cloud Build config for building image |
| `scripts/gcp/provision-users-job.sh` | Helper script for building/running job |
| `infrastructure/terraform/modules/security/main.tf` | Terraform for Cloud Run Job |

### Actions

| Action | Description |
|--------|-------------|
| `verify-only` | Check current state without making changes (default) |
| `load-hr-data` | Load HR sample data to Cloud SQL |
| `sync-users` | Run identity-sync to create Keycloak users |
| `all` | Load data + sync users + verify |

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--dry-run` | `false` | Preview only, no changes made |
| `--force-password-reset` | `false` | Reset passwords, assign department roles, AND add to All-Employees group |

### The `--force-password-reset` Flag

This flag does more than just reset passwords. It:

1. **Resets passwords** for all active employees with Keycloak accounts
2. **Assigns department roles** based on the employee's HR department code
3. **Adds users to All-Employees group** for self-access via RLS policies

This is useful when:
- Users were synced before role assignment was working correctly
- Roles were accidentally removed or not assigned during initial sync
- Users are missing from the All-Employees group
- Password rotation is needed after a security incident
- You need to ensure all users have correct department-based roles and group membership

**Department to Role Mapping:**

| Department Code | Keycloak Realm Role |
|-----------------|---------------------|
| HR | hr-read |
| FIN | finance-read |
| SALES | sales-read |
| SUPPORT | support-read |
| ENG | engineering-read |
| IT | it-read |
| MKT | marketing-read |
| OPS | operations-read |
| LEGAL | legal-read |
| EXEC | executive (composite role) |

**Example:**
```bash
# Reset passwords and assign roles for all synced users
gcloud run jobs execute provision-users \
  --region=${GCP_REGION} \
  --project=${GCP_PROJECT} \
  --update-env-vars="ACTION=sync-users,FORCE_PASSWORD_RESET=true" \
  --wait
```

### The `--no-redis` Flag

The identity-sync script normally uses Redis (via BullMQ) for async cleanup job scheduling. However, Cloud Run Jobs don't have Redis available. The `--no-redis` flag provides a no-op queue implementation:

```typescript
// In sync-identities.ts
const noOpQueue: CleanupQueue = {
  add: async () => ({ id: 'no-op' }),
};
```

The entrypoint.sh automatically passes `--no-redis` to identity-sync. This is safe because:
- The sync operation doesn't queue any jobs
- Only `terminateEmployee()` uses the queue (72-hour delayed deletion)
- User provisioning only calls `syncAllEmployees()` and `forcePasswordReset()`

### Usage

#### Via Helper Script (Recommended)

```bash
cd scripts/gcp

# Build and push the container image
./provision-users-job.sh build

# Run the job (image must exist)
./provision-users-job.sh run verify-only

# Run with specific action
./provision-users-job.sh run load-hr
./provision-users-job.sh run sync-users

# Build + run in one command
./provision-users-job.sh all

# With options
./provision-users-job.sh run sync-users --force-password-reset
./provision-users-job.sh all --dry-run
```

#### Via gcloud CLI Directly

```bash
# Build the container image (from repo root)
gcloud builds submit \
  --config=scripts/gcp/provision-job/cloudbuild.yaml \
  --project=${GCP_PROJECT}

# Execute the Cloud Run Job
gcloud run jobs execute provision-users \
  --region=${GCP_REGION} \
  --project=${GCP_PROJECT} \
  --wait

# Execute with specific action (override env vars)
gcloud run jobs execute provision-users \
  --region=${GCP_REGION} \
  --project=${GCP_PROJECT} \
  --update-env-vars=ACTION=load-hr-data \
  --wait

# Execute all steps with force password reset
gcloud run jobs execute provision-users \
  --region=${GCP_REGION} \
  --project=${GCP_PROJECT} \
  --update-env-vars=ACTION=all,FORCE_PASSWORD_RESET=true \
  --wait
```

### Setting the Production User Password

The production user password can be configured depending on how you run provisioning:

**Option 1: Via GitHub Actions Workflow (Recommended)**

The `PROD_USER_PASSWORD` GitHub Secret is the **source of truth** for the `provision-prod-users.yml` workflow:

1. Set `PROD_USER_PASSWORD` in GitHub Secrets (one-time manual setup)
2. Trigger the `provision-prod-users.yml` workflow
3. The workflow passes the password to identity-sync
4. All corporate users are created with this password

```bash
# Set the GitHub Secret (one-time)
echo "YourSecurePassword123!" | gh secret set PROD_USER_PASSWORD

# Trigger the provisioning workflow
gh workflow run provision-prod-users.yml -f action=all
```

**Option 2: Via Cloud Run Job (Direct GCP)**

For running provisioning directly via Cloud Run Job (without GitHub Actions):

```bash
# Update password in GCP Secret Manager
echo -n 'YourNewPassword123!' | gcloud secrets versions add prod-user-password \
  --data-file=- --project=${GCP_PROJECT}

# Then run the provisioning job with force password reset
gcloud run jobs execute provision-users \
  --region=${GCP_REGION} \
  --project=${GCP_PROJECT} \
  --update-env-vars="ACTION=sync-users,FORCE_PASSWORD_RESET=true" \
  --wait
```

**Option 3: Via Terraform Variable**

For initial infrastructure setup, you can pass the password to Terraform:

```bash
export TF_VAR_prod_user_password="YourSecurePassword123!"
terraform apply
```

**Note:** The Terraform configuration uses `ignore_changes` on the secret data to prevent accidental overwrites of manually set passwords. For ongoing user provisioning, use Option 1 (GitHub Actions) or Option 2 (Cloud Run Job).

### Required Secrets

All secrets must be in GCP Secret Manager:

| Secret Name | Description |
|-------------|-------------|
| `tamshai-prod-db-password` | PostgreSQL password for Cloud SQL |
| `tamshai-prod-keycloak-admin-password` | Keycloak admin password (for verification) |
| `mcp-hr-service-client-secret` | Keycloak client secret for identity-sync |
| `prod-user-password` | Password to set for synced users |

#### Creating Missing Secrets

```bash
# Create mcp-hr-service-client-secret (get value from Keycloak Admin UI)
echo -n "YOUR_CLIENT_SECRET" | gcloud secrets create mcp-hr-service-client-secret \
  --data-file=- \
  --project=${GCP_PROJECT}

# Create prod-user-password
echo -n "YOUR_USER_PASSWORD" | gcloud secrets create prod-user-password \
  --data-file=- \
  --project=${GCP_PROJECT}
```

### Cloud Run Job Steps

The entrypoint.sh script runs these steps:

1. **Start Cloud SQL Proxy**: Connect to private IP Cloud SQL via VPC connector
2. **Verify State**: Check HR data in Cloud SQL, users in Keycloak
3. **Load HR Data** (if action includes): Load `sample-data/hr-data.sql` to Cloud SQL
4. **Sync Users** (if action includes): Run identity-sync with `--no-redis` flag
5. **Final Verify**: Compare before/after counts

### Example Output

```
==============================================
PROVISIONING SUMMARY
==============================================
Action:              all
Dry Run:             false

BEFORE:
  HR Employees:      0
  Keycloak Users:    1

AFTER:
  HR Employees:      50
  Synced to KC:      50
  Keycloak Users:    51
==============================================
```

### Prerequisites

1. **gcloud CLI** authenticated with appropriate permissions
2. **Terraform applied** - Cloud Run Job and IAM permissions are managed in Terraform:
   - `infrastructure/terraform/modules/security/main.tf` creates the Cloud Run Job
   - Grants `provision-job` service account access to required secrets
   - Grants Cloud SQL Client role for database connectivity
   - Configures VPC connector for private IP access

**Note:** All IAM and API configurations are in Terraform (Phoenix principle). Manual `gcloud` commands are only needed for initial bootstrap or troubleshooting.

### Phoenix Principle Compliance

All resources for user provisioning are managed in Terraform:

| Resource | Location | Purpose |
|----------|----------|---------|
| `google_cloud_run_v2_job.provision_users` | security/main.tf | Cloud Run Job definition |
| `google_service_account.provision_job` | security/main.tf | Service account with minimal permissions |
| `google_secret_manager_secret.mcp_hr_service_client_secret` | security/main.tf | Keycloak client secret |
| `google_secret_manager_secret.prod_user_password` | security/main.tf | User password for provisioning |
| IAM bindings | security/main.tf | Secret accessor, SQL client roles |
| VPC connector | networking/main.tf | Private IP connectivity |

The container image is built via Cloud Build (`scripts/gcp/provision-job/cloudbuild.yaml`) and stored in Artifact Registry.

### Troubleshooting

**"Permission denied accessing secret"**
- Verify Terraform has been applied (`terraform apply`)
- Check `infrastructure/terraform/modules/security/main.tf` for IAM bindings
- Wait a few minutes for IAM propagation after Terraform apply

**"Could not connect to database"**
- Verify Cloud SQL instance exists and is running
- Check VPC connector is configured: `gcloud compute networks vpc-access connectors list`
- Check Cloud SQL Proxy logs in job execution

**"Could not get Keycloak admin token"**
- Verify `tamshai-prod-keycloak-admin-password` secret exists and is correct
- Check Keycloak is accessible at the configured URL

**"Identity sync failed - Redis not available" (ECONNREFUSED 127.0.0.1:6379)**
- This is solved by the `--no-redis` flag in entrypoint.sh
- Verify the container image includes the updated sync-identities.ts
- Rebuild with `./provision-users-job.sh build` if needed

**Users synced but can't login**
- Users may have TOTP enabled - check Keycloak user settings
- Verify `prod-user-password` is set correctly
- Check user is enabled in Keycloak

**Job keeps failing after Terraform changes**
- Cloud Run Job may be using old revision
- Force update: `gcloud run jobs update provision-users --region=${GCP_REGION} --image=...`
- Or destroy and recreate the job via Terraform

**View job logs**
```bash
# Get recent executions
gcloud run jobs executions list --job=provision-users --region=${GCP_REGION} --limit=5

# View logs for specific execution
gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=provision-users" \
  --project=${GCP_PROJECT} --limit=100 --format="table(timestamp,textPayload)"
```

---

## Phoenix Rebuild Process

The **Phoenix Rebuild** is a complete environment teardown and rebuild from scratch. This process ensures all environments can be recreated from Terraform + GitHub Actions without manual intervention.

### Phoenix Rebuild Sequence

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       PHOENIX REBUILD SEQUENCE                          │
├─────────────────────────────────────────────────────────────────────────┤
│  1. terraform destroy + apply    │ Recreate GCP infrastructure          │
│  2. deploy-to-gcp.yml            │ Deploy all Cloud Run services        │
│  3. provision-prod-users.yml     │ Load HR data, sync users to Keycloak │
│  4. provision-prod-data.yml      │ Load Finance, Sales, Support data    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Step-by-Step Phoenix Rebuild

```bash
# 1. Destroy and recreate infrastructure
cd infrastructure/terraform/gcp
terraform destroy -auto-approve
terraform apply -auto-approve

# 2. Build and push Cloud Run Job image (required after entrypoint.sh changes)
gcloud builds submit \
  --config=scripts/gcp/provision-job/cloudbuild.yaml \
  --project=${GCP_PROJECT}

# 3. Deploy all services (triggers automatically on main, or manually)
gh workflow run deploy-to-gcp.yml -f service=all

# 4. Load HR data and sync users to Keycloak
gh workflow run provision-prod-users.yml -f action=all -f dry_run=false

# 5. Load Finance, Sales, Support sample data
gh workflow run provision-prod-data.yml -f data_set=all -f dry_run=false
```

### provision-prod-data.yml Workflow

This workflow loads Finance, Sales, and Support sample data into production databases.

**Workflow Location:** `.github/workflows/provision-prod-data.yml`

**Data Targets:**
| Data Set | Database | Target | Connection Method |
|----------|----------|--------|-------------------|
| Finance | Cloud SQL PostgreSQL | `tamshai_finance` | Cloud Run Job (VPC connector) |
| Sales | MongoDB Atlas | `tamshai_sales` | Direct (public Atlas) |
| Support | MongoDB Atlas | `tamshai_support` | Direct (public Atlas) |

**Note:** Cloud SQL has private IP only, so Finance data must be loaded via the Cloud Run Job which has VPC connector access. Sales and Support use MongoDB Atlas (public internet) so they can be loaded directly from GitHub Actions.

**Usage:**

```bash
# Load all sample data (Finance, Sales, Support)
gh workflow run provision-prod-data.yml -f data_set=all -f dry_run=false

# Load specific data set
gh workflow run provision-prod-data.yml -f data_set=finance -f dry_run=false
gh workflow run provision-prod-data.yml -f data_set=sales -f dry_run=false
gh workflow run provision-prod-data.yml -f data_set=support -f dry_run=false

# Dry run (preview without making changes)
gh workflow run provision-prod-data.yml -f data_set=all -f dry_run=true
```

**Workflow Inputs:**
| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `data_set` | choice | `all` | Which data to load: `all`, `finance`, `sales`, `support` |
| `dry_run` | boolean | `true` | Preview only, no changes made |

### Sample Data Files

| File | Database | Description |
|------|----------|-------------|
| `sample-data/hr-data.sql` | Cloud SQL `tamshai_hr` | Employee records (loaded by provision-prod-users.yml) |
| `sample-data/finance-data.sql` | Cloud SQL `tamshai_finance` | Invoices, expense reports, budgets |
| `sample-data/sales-data.js` | MongoDB Atlas `tamshai_sales` | Customers, opportunities, activities |
| `sample-data/support-data.js` | MongoDB Atlas `tamshai_support` | Tickets, KB articles |

### Post-Phoenix Verification

After Phoenix rebuild, verify all data is loaded:

```bash
# Check HR data (via Cloud SQL Proxy)
PGPASSWORD=$(gcloud secrets versions access latest --secret=tamshai-prod-db-password) \
  psql -h localhost -p 5432 -U tamshai -d tamshai_hr -c "SELECT COUNT(*) FROM hr.employees;"

# Check Finance data
PGPASSWORD=$(gcloud secrets versions access latest --secret=tamshai-prod-db-password) \
  psql -h localhost -p 5432 -U tamshai -d tamshai_finance -c "SELECT COUNT(*) FROM finance.invoices;"

# Check Sales data
MONGODB_URI=$(gcloud secrets versions access latest --secret=tamshai-prod-mongodb-uri)
mongosh "$MONGODB_URI" --eval "db.getSiblingDB('tamshai_sales').customers.countDocuments()"

# Check Support data
mongosh "$MONGODB_URI" --eval "db.getSiblingDB('tamshai_support').tickets.countDocuments()"
```

---

## See Also

- [GCP Production Phase 1 Plan](../../docs/plans/GCP_PROD_PHASE_1_COST_SENSITIVE.md)
- [Production Testing Methodology](../../docs/testing/PROD_TESTING_METHODOLOGY.md)
- [403 Remediation Plan](../../docs/troubleshooting/PROD_403_REMEDIATION_PLAN.md)
- [Identity Sync Operations](../../docs/operations/IDENTITY_SYNC.md)
