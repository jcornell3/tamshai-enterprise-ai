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

# Set project
gcloud config set project gen-lang-client-0553641830

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

| Variable | Default | Description |
|----------|---------|-------------|
| `GCP_PROJECT` | `gen-lang-client-0553641830` | GCP Project ID |
| `GCP_REGION` | `us-central1` | GCP Region |
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
cloud-sql-proxy gen-lang-client-0553641830:us-central1:tamshai-prod-postgres --port=5432

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

The user provisioning process uses **Cloud Build** to load HR sample data and sync users to Keycloak. Cloud Build runs within GCP's network and can connect to private IP Cloud SQL instances (GitHub Actions cannot).

### Why Cloud Build?

The production Cloud SQL instance (`tamshai-prod-postgres`) is configured with **private IP only** for security. GitHub Actions runs on the public internet and cannot connect to private IP instances. Cloud Build runs within GCP's VPC and has direct access.

### Files

| File | Purpose |
|------|---------|
| `scripts/gcp/cloudbuild-provision-users.yaml` | Cloud Build configuration |
| `scripts/gcp/provision-users.sh` | Helper script for easy invocation |

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
| `--force-password-reset` | `false` | Reset passwords for existing users |

### Usage

#### Via Helper Script (Recommended)

```bash
cd scripts/gcp

# Verify current state (safe, read-only)
./provision-users.sh verify-only

# Preview loading HR data (dry run)
./provision-users.sh load-hr-data --dry-run

# Actually load HR data
./provision-users.sh load-hr-data

# Preview syncing users (dry run)
./provision-users.sh sync-users --dry-run

# Actually sync users to Keycloak
./provision-users.sh sync-users

# Do everything (load data + sync + verify)
./provision-users.sh all

# Reset passwords for all synced users
./provision-users.sh sync-users --force-password-reset
```

#### Via gcloud CLI Directly

```bash
# From repo root
gcloud builds submit \
  --config=scripts/gcp/cloudbuild-provision-users.yaml \
  --substitutions=_ACTION=verify-only \
  .

# Full provisioning
gcloud builds submit \
  --config=scripts/gcp/cloudbuild-provision-users.yaml \
  --substitutions=_ACTION=all,_DRY_RUN=false \
  .

# With password reset
gcloud builds submit \
  --config=scripts/gcp/cloudbuild-provision-users.yaml \
  --substitutions=_ACTION=sync-users,_FORCE_PASSWORD_RESET=true \
  .
```

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
  --project=gen-lang-client-0553641830

# Create prod-user-password
echo -n "YOUR_USER_PASSWORD" | gcloud secrets create prod-user-password \
  --data-file=- \
  --project=gen-lang-client-0553641830
```

### Cloud Build Steps

1. **Show Config**: Display configuration and parameters
2. **Start Proxy**: Start Cloud SQL Proxy with private IP
3. **Verify State**: Check HR data in Cloud SQL, users in Keycloak
4. **Load HR Data** (conditional): Load `sample-data/hr-data.sql` to Cloud SQL
5. **Sync Users** (conditional): Run identity-sync to create Keycloak users
6. **Final Verify**: Compare before/after counts

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
2. **Cloud Build API** enabled:
   ```bash
   gcloud services enable cloudbuild.googleapis.com
   ```
3. **Cloud Build service account** needs Secret Manager access:
   ```bash
   PROJECT_NUMBER=$(gcloud projects describe gen-lang-client-0553641830 --format='value(projectNumber)')
   gcloud projects add-iam-policy-binding gen-lang-client-0553641830 \
     --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
     --role="roles/secretmanager.secretAccessor"
   ```

### Troubleshooting

**"Permission denied accessing secret"**
- Grant Secret Manager access to Cloud Build service account (see Prerequisites)

**"Could not connect to database"**
- Verify Cloud SQL instance exists and is running
- Check the instance name in the Cloud Build config

**"Could not get Keycloak admin token"**
- Verify `tamshai-prod-keycloak-admin-password` secret exists and is correct
- Check Keycloak is accessible at the configured URL

**"Identity sync failed - Redis not available"**
- The identity-sync script requires Redis for BullMQ
- This is a known limitation; may need to modify sync script to make Redis optional

**Users synced but can't login**
- Users may have TOTP enabled - check Keycloak user settings
- Verify `prod-user-password` is set correctly
- Check user is enabled in Keycloak

---

## See Also

- [GCP Production Phase 1 Plan](../../docs/plans/GCP_PROD_PHASE_1_COST_SENSITIVE.md)
- [Production Testing Methodology](../../docs/testing/PROD_TESTING_METHODOLOGY.md)
- [403 Remediation Plan](../../docs/troubleshooting/PROD_403_REMEDIATION_PLAN.md)
- [Identity Sync Operations](../../docs/operations/IDENTITY_SYNC.md)
