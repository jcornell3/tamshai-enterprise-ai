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

The `Provision Production Users` GitHub workflow automates loading HR sample data and syncing users to Keycloak.

### Workflow Location

`.github/workflows/provision-prod-users.yml`

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
| `dry_run` | `true` | Preview only, no changes made |
| `force_password_reset` | `false` | Reset passwords for existing users |

### Usage

#### Via GitHub UI

1. Go to **Actions** > **Provision Production Users**
2. Click **Run workflow**
3. Select action: `verify-only`, `load-hr-data`, `sync-users`, or `all`
4. Set `dry_run` to `false` to make actual changes
5. Click **Run workflow**
6. Monitor progress in workflow logs

#### Via GitHub CLI

```bash
# Verify current state (safe, read-only)
gh workflow run provision-prod-users.yml -f action=verify-only

# Preview loading HR data (dry run)
gh workflow run provision-prod-users.yml -f action=load-hr-data -f dry_run=true

# Actually load HR data
gh workflow run provision-prod-users.yml -f action=load-hr-data -f dry_run=false

# Preview syncing users (dry run)
gh workflow run provision-prod-users.yml -f action=sync-users -f dry_run=true

# Actually sync users to Keycloak
gh workflow run provision-prod-users.yml -f action=sync-users -f dry_run=false

# Do everything (load data + sync + verify)
gh workflow run provision-prod-users.yml -f action=all -f dry_run=false

# Reset passwords for all synced users
gh workflow run provision-prod-users.yml -f action=sync-users -f dry_run=false -f force_password_reset=true
```

### Required Secrets

The workflow requires these secrets in GCP Secret Manager:

| Secret Name | Description |
|-------------|-------------|
| `tamshai-prod-db-password` | PostgreSQL password for Cloud SQL |
| `tamshai-prod-keycloak-admin-password` | Keycloak admin password (for verification) |

And these GitHub secrets:

| Secret Name | Description |
|-------------|-------------|
| `GCP_SA_KEY_PROD` | GCP service account JSON key |
| `PROD_USER_PASSWORD` | Password to set for synced users |
| `MCP_HR_SERVICE_CLIENT_SECRET` | Keycloak client secret for identity-sync |

### Workflow Jobs

1. **Pre-flight Checks**: Validate inputs, display configuration
2. **Verify Current State**: Check HR data in Cloud SQL, users in Keycloak
3. **Load HR Data** (optional): Load `sample-data/hr-data.sql` to Cloud SQL
4. **Sync Users** (optional): Run identity-sync to create Keycloak users
5. **Final Verification**: Compare before/after counts, test login

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

JOB RESULTS:
  Load HR Data:      success
  Sync Users:        success
==============================================
```

### Troubleshooting

**"mcp-hr-service-client-secret not available"**
- Create the secret in GCP Secret Manager with the Keycloak client secret
- The client must exist in Keycloak with service account enabled

**"Could not get Keycloak admin token"**
- Verify `keycloak-admin-password` secret exists and is correct
- Check Keycloak is accessible at the configured URL

**Users synced but can't login**
- Users may have TOTP enabled - check Keycloak user settings
- Verify `PROD_USER_PASSWORD` is set correctly
- Check user is enabled in Keycloak

---

## See Also

- [GCP Production Phase 1 Plan](../../docs/plans/GCP_PROD_PHASE_1_COST_SENSITIVE.md)
- [Production Testing Methodology](../../docs/testing/PROD_TESTING_METHODOLOGY.md)
- [403 Remediation Plan](../../docs/troubleshooting/PROD_403_REMEDIATION_PLAN.md)
- [Identity Sync Operations](../../docs/operations/IDENTITY_SYNC.md)
