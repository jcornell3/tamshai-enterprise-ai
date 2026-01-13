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

## See Also

- [GCP Production Phase 1 Plan](../../docs/plans/GCP_PROD_PHASE_1_COST_SENSITIVE.md)
- [Production Testing Methodology](../../docs/testing/PROD_TESTING_METHODOLOGY.md)
- [403 Remediation Plan](../../docs/troubleshooting/PROD_403_REMEDIATION_PLAN.md)
