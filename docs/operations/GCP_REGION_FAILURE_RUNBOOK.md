# GCP Regional Failure Runbook

**Last Updated**: January 26, 2026
**Version**: 1.3.0
**Owner**: Platform Team

## Overview

This runbook provides instructions for handling a complete GCP regional outage. When the primary region (us-central1) is unavailable, use the **Regional Evacuation** procedure to deploy a recovery stack in an alternate region.

**Primary Method**: Use `evacuate-region.sh` - all manual procedures are automated.

### When to Use Regional Evacuation

| Scenario | Use This Runbook? | Alternative |
|----------|-------------------|-------------|
| us-central1 is DOWN | **YES** | N/A - Phoenix won't work |
| us-central1 is SLOW | No | Wait for GCP to resolve |
| Terraform state corrupted | No | Use Phoenix Rebuild |
| Security incident | No | Use Phoenix Rebuild |
| Infrastructure changes | No | Use Phoenix Rebuild |

### Decision Tree

```
Is us-central1 available?
  │
  ├── YES → Can you run `gcloud run services list --region=us-central1`?
  │         ├── YES → Use PHOENIX_RUNBOOK.md
  │         └── NO (timeout) → Use THIS RUNBOOK
  │
  └── NO (GCP Status shows outage) → Use THIS RUNBOOK
```

### Key Insight

> "In a disaster recovery (DR) scenario, do not waste time trying to make `terraform destroy` work against a dead region. It is an exercise in futility."

The Regional Evacuation uses an **"Amnesia" approach**: create a fresh Terraform state in the new region, completely ignoring the unreachable primary region.

### Estimated Duration: 35-55 minutes

| Phase | Duration | Description |
|-------|----------|-------------|
| Pre-flight | 1-2 min | Validate tools, auth, region availability |
| Terraform | 10-15 min | Create infrastructure in new region |
| SSL Certificate | 10-15 min | Wait for **all** domain mapping SSL certs (auth, app, api) |
| Deploy | 3-5 min | Deploy containers, configure services |
| User Provisioning | 5-10 min | Sync passwords, provision users, reset passwords |
| Sample Data | 3-5 min | Load Finance, Sales, Support data |
| DNS | 2-5 min | Update DNS to point to new region |
| Verify | 2-3 min | Run health checks and E2E tests |

> **Note**: SSL certificate provisioning applies to **all three domains** (`auth-dr`, `app-dr`, `api-dr`). Without verifying all domains, E2E tests fail with HTTP 525 (SSL handshake failed). The script now automatically verifies SSL for all domain mappings before proceeding.

---

## Pre-requisites

### Required Tools

- [ ] `gcloud` CLI authenticated
- [ ] `gh` CLI authenticated
- [ ] `terraform` >= 1.5
- [ ] `curl`, `jq`
- [ ] Access to Cloudflare (for DNS updates)

### Required Access

- [ ] GCP Project Owner or Editor role
- [ ] GitHub repository admin access
- [ ] Cloudflare DNS access (or CF_API_TOKEN secret)

### Required Secrets

**GitHub Secrets** (already configured):
- `GCP_SA_KEY_PROD`, `GCP_PROJECT_ID`
- `CF_API_TOKEN`, `CF_ZONE_ID` (for automated DNS)
- `CLAUDE_API_KEY_PROD`
- `MONGODB_ATLAS_URI`
- `PROD_USER_PASSWORD` (corporate user password — synced to GCP Secret Manager during evacuation)

### Pre-Configured DR Infrastructure

The following should be set up BEFORE any incident:
- [x] DR CNAME records in Cloudflare (pointing to `ghs.googlehosted.com`)
- [x] `auth-dr.tamshai.com` domain verified in Google Search Console
- [x] `app-dr.tamshai.com` and `api-dr.tamshai.com` domain verified in Google Search Console
- [x] Keycloak realm includes DR redirect URIs
- [x] Multi-regional backup bucket exists
- [x] `PROD_USER_PASSWORD` set in GitHub Secrets

---

## Regional Evacuation Procedure

### Step 1: Confirm Regional Outage

```bash
# Check GCP Status Dashboard
open https://status.cloud.google.com/

# Verify us-central1 is unreachable (will timeout)
timeout 30 gcloud run services list --region=us-central1

# If timeout occurs, proceed with evacuation
```

**Decision Checkpoint**:
- [ ] GCP Status Dashboard shows us-central1 "Investigating" or "Service Disruption"
- [ ] `gcloud` commands to us-central1 timeout or fail
- [ ] Estimated outage duration is > 30 minutes

### Step 2: Execute Regional Evacuation

```bash
# Default: Oregon (us-west1) - recommended
./scripts/gcp/evacuate-region.sh

# Or specify region explicitly
./scripts/gcp/evacuate-region.sh us-west1 us-west1-b recovery-$(date +%Y%m%d)

# Alternative regions (same pricing tier)
./scripts/gcp/evacuate-region.sh us-east1 us-east1-b recovery-$(date +%Y%m%d)  # S. Carolina
./scripts/gcp/evacuate-region.sh us-east5 us-east5-b recovery-$(date +%Y%m%d)  # Ohio
```

**Options**:
```bash
./scripts/gcp/evacuate-region.sh --help     # Show usage
./scripts/gcp/evacuate-region.sh --yes      # Skip confirmation prompts (for automated/CI runs)
```

> **Tip**: Use `--yes` flag for automated runs or CI/CD pipelines to skip interactive confirmations.
> The `--yes` flag applies to both the evacuation confirmation AND the pre-cleanup phase (Phase 0.5).
> All cleanup operations run automatically without additional prompts.

**Environment Variables** (optional overrides):
```bash
# Override target region/zone
GCP_DR_REGION=us-east1 ./scripts/gcp/evacuate-region.sh --yes

# Override fallback zones for capacity issues (Issue #102)
GCP_DR_FALLBACK_ZONES="us-west1-a us-west1-c" ./scripts/gcp/evacuate-region.sh --yes
```

### Step 3: Monitor Progress

The script executes 8 phases:

| Phase | What It Does | Duration |
|-------|--------------|----------|
| 0 | Pre-flight checks (includes zone capacity validation) | ~1 min |
| 0.5 | Pre-cleanup (removes leftover resources from failed attempts) | ~2-5 min |
| 1 | Confirm evacuation | ~30 sec |
| 2 | Initialize Terraform + staged deploy + SSL verification (all domains) | ~15-25 min |
| 3 | Regenerate service account key | ~1 min |
| 4 | Trigger GitHub Actions deployment | ~5 min |
| 5 | Configure users: TOTP, sync passwords, provision users (force reset), load sample data | ~10 min |
| 6 | Verify deployment (health checks, E2E tests) | ~3 min |
| 7 | DNS configuration guidance | ~1 min |

**Zone Capacity Check (Phase 0)**: The script automatically checks if the requested machine types (e.g., `e2-micro`) are available in the target zone. If capacity is unavailable, it tries fallback zones configured in `dr.tfvars` or environment variables.

### Step 4: Update DNS

After evacuation completes, update DNS to point to recovery services:

**Automated (if CF_API_TOKEN available)**:
The script attempts automatic Cloudflare DNS updates. Check the output for success/failure.

**Manual DNS Updates (Cloudflare)**:

| Record | Current (Dead) | Update To | Type |
|--------|----------------|-----------|------|
| `api.tamshai.com` | `mcp-gateway-xxx-uc.a.run.app` | New URL from script output | CNAME |
| `auth-dr.tamshai.com` | `ghs.googlehosted.com` | Leave as-is (domain mapping) | CNAME |
| `app.tamshai.com` | Dead URL | New web-portal URL | CNAME |

**Important**: `auth.tamshai.com` CANNOT be remapped during outage (domain mapping is region-bound). Use `auth-dr.tamshai.com` instead.

### Step 5: Verify Recovery Stack

```bash
# Get new service URLs
cd infrastructure/terraform/gcp
terraform output

# Verify Keycloak (use DR domain)
curl -sf https://auth-dr.tamshai.com/auth/health/ready && echo "OK"

# Verify MCP Gateway
MCP_URL=$(terraform output -raw mcp_gateway_url)
curl -sf "${MCP_URL}/health" && echo "OK"

# Run E2E tests against recovery stack
cd tests/e2e
KEYCLOAK_URL=https://auth-dr.tamshai.com/auth npm run test:login:prod
```

**Final Checkpoints**:
- [ ] All Cloud Run services show "Ready" in new region
- [ ] Keycloak accessible at `https://auth-dr.tamshai.com`
- [ ] App portal accessible at `https://app-dr.tamshai.com` (no HTTP 525)
- [ ] API accessible at `https://api-dr.tamshai.com` (no HTTP 525)
- [ ] MCP Gateway health check passes
- [ ] E2E login test passes
- [ ] Corporate user (e.g., eve.thompson) can log in with PROD_USER_PASSWORD
- [ ] Sample data loaded (Finance invoices, Sales customers, Support tickets)
- [ ] Users can access the application

---

## Failback Procedure

After the primary region recovers, migrate traffic back and clean up the recovery stack.

### Step 1: Verify Primary Region Recovery

```bash
# Check GCP Status Dashboard
open https://status.cloud.google.com/

# Verify us-central1 is accessible
gcloud run services list --region=us-central1

# Verify primary services are healthy
curl -sf https://auth.tamshai.com/auth/health/ready && echo "Primary Keycloak OK"
curl -sf https://api.tamshai.com/health && echo "Primary MCP Gateway OK"
```

**Decision Checkpoint**:
- [ ] GCP Status Dashboard shows us-central1 "Available"
- [ ] Primary services respond to health checks
- [ ] Primary database is accessible
- [ ] E2E tests pass against primary stack

### Step 2: Migrate Traffic to Primary

Update DNS to point back to primary services:

| Record | Current (Recovery) | Revert To |
|--------|-------------------|-----------|
| `api.tamshai.com` | Recovery URL | `mcp-gateway-xxx-uc.a.run.app` |
| `app.tamshai.com` | Recovery URL | Primary web-portal URL |

Wait for DNS propagation (typically < 5 minutes with Cloudflare).

### Step 3: Verify Traffic on Primary

```bash
# Monitor error rates for 15-30 minutes
# Check that requests are going to primary, not recovery

# Verify with trace
curl -v https://api.tamshai.com/health 2>&1 | grep "Connected to"
```

### Step 4: Destroy Recovery Stack

```bash
# List available recovery stacks
./scripts/gcp/cleanup-recovery.sh --list

# Preview what will be destroyed
./scripts/gcp/cleanup-recovery.sh recovery-20260122 --dry-run

# Destroy the recovery stack
./scripts/gcp/cleanup-recovery.sh recovery-20260122
```

**Options**:
```bash
./scripts/gcp/cleanup-recovery.sh <ENV_ID> --force      # Skip confirmations
./scripts/gcp/cleanup-recovery.sh <ENV_ID> --keep-dns   # Don't show DNS guidance
```

### Step 5: Clean Up DR CNAMEs

After cleanup, you have two options for DR CNAMEs:

**Option 1: Delete DR DNS records** (recommended if not planning immediate re-evacuation)
- Delete `auth-dr.tamshai.com`
- Delete `api-dr.tamshai.com`
- Delete `app-dr.tamshai.com`

**Option 2: Leave as-is** (records will fail gracefully until next evacuation)

> **Important**: Production uses direct Cloud Run URLs (e.g., `mcp-gateway-fn44nd7wba-uc.a.run.app`),
> NOT `ghs.googlehosted.com`. The DR domains should follow the same pattern during evacuation.

---

## Troubleshooting

### Terraform init fails with "bucket not found"

The state bucket `tamshai-terraform-state-prod` must exist and be accessible.

```bash
# Verify bucket exists
gsutil ls gs://tamshai-terraform-state-prod/

# If not, create it (multi-regional for DR resilience)
gsutil mb -l US gs://tamshai-terraform-state-prod/
```

### Terraform apply fails with "quota exceeded"

New regions may have different quota limits.

```bash
# Check quotas
gcloud compute regions describe us-west1 --format="yaml(quotas)"

# Request quota increase if needed
open https://console.cloud.google.com/iam-admin/quotas
```

### Domain mapping fails with "domain not verified"

The `-dr` domain must be verified in Google Search Console before evacuation.

```bash
# Check domain verification status
gcloud domains list-user-verified

# Add domain for verification
open https://search.google.com/search-console
```

**Prevention**: Pre-verify `auth-dr.tamshai.com` during non-emergency setup.

### Cloud Run service fails to start

Check service logs for errors:

```bash
gcloud run services logs read mcp-gateway --region=us-west1 --limit=50
```

Common issues:
- **Secret not found**: Secrets are regional; may need to copy to new region
- **Image not found**: Artifact Registry is regional; images may not exist in new region

### Zone capacity unavailable (e2-micro not available)

**Error**: `The zone 'projects/.../zones/us-west1-b' does not have enough resources available`

**Cause**: GCP zones can have transient capacity issues for specific machine types, especially during regional outages when traffic shifts.

**Automatic Handling**: The evacuation script (Phase 0) automatically checks zone capacity and switches to fallback zones if configured.

**Manual Override**:
```bash
# Check which zones have capacity
for zone in us-west1-a us-west1-b us-west1-c; do
    gcloud compute machine-types describe e2-micro --zone=$zone 2>/dev/null && echo "$zone: OK" || echo "$zone: UNAVAILABLE"
done

# Use a different zone
GCP_DR_ZONE=us-west1-a ./scripts/gcp/evacuate-region.sh --yes

# Or set fallback zones
GCP_DR_FALLBACK_ZONES="us-west1-a us-west1-c" ./scripts/gcp/evacuate-region.sh --yes
```

**Prevention**: Configure `fallback_zones` in `dr.tfvars`:
```hcl
fallback_zones = ["us-west1-a", "us-west1-c"]
```

### Keycloak can't reach database

Cloud SQL private IP is regional. Recovery stack gets a new IP.

```bash
# Get new Cloud SQL IP
gcloud sql instances describe tamshai-prod-postgres-recovery-xxx --format="value(ipAddresses[0].ipAddress)"

# Verify Keycloak environment variables
gcloud run services describe keycloak --region=us-west1 --format="yaml(spec.template.spec.containers[0].env)"
```

### GitHub Actions deployment fails

The service account key may be region-specific.

```bash
# Regenerate and update GitHub secret
PROJECT_ID=$(gcloud config get-value project)
gcloud iam service-accounts keys create /tmp/key.json \
    --iam-account=tamshai-prod-cicd@${PROJECT_ID}.iam.gserviceaccount.com
gh secret set GCP_SA_KEY_PROD < /tmp/key.json
rm /tmp/key.json
```

### cleanup-recovery.sh can't find state

Ensure you're using the correct ENV_ID:

```bash
# List all recovery stacks
./scripts/gcp/cleanup-recovery.sh --list

# Check state bucket directly
gcloud storage ls gs://tamshai-terraform-state-prod/gcp/recovery/
```

### Corporate users can't log in after evacuation

**Error**: Users like eve.thompson get "Invalid credentials" in Keycloak.

**Cause**: One of three issues from the Phoenix rebuild:
1. `PROD_USER_PASSWORD` not synced from GitHub Secrets to GCP Secret Manager (Terraform creates random password)
2. Identity sync ran without `force_password_reset=true` (users get Keycloak-generated passwords)
3. Stale `keycloak_user_id` in PostgreSQL prevented user creation (sync reported 0 pending users)

**Solution**: The evacuation script now handles all three automatically:
- `sync_prod_user_password()` syncs the known password to GCP Secret Manager
- `trigger_identity_sync()` passes `force_password_reset=true`
- `entrypoint.sh` clears stale `keycloak_user_id` values before sync

**Manual Fix** (if automation fails):
```bash
# 1. Set the password in GCP Secret Manager
echo -n "YourKnownPassword" | gcloud secrets versions add prod-user-password --data-file=-

# 2. Trigger provisioning with force password reset
gh workflow run provision-prod-users.yml -f action=all -f force_password_reset=true -f dry_run=false
```

### Sample data missing after evacuation

**Error**: Finance invoices, Sales customers, or Support tickets are empty.

**Cause**: Sample data loading was not included in the original evacuation script.

**Solution**: The script now automatically triggers `provision-prod-data.yml` in Phase 5 Step 5.

**Manual Fix**:
```bash
# Load all sample data
gh workflow run provision-prod-data.yml -f data_set=all -f dry_run=false

# Or load specific data sets
gh workflow run provision-prod-data.yml -f data_set=finance -f dry_run=false
gh workflow run provision-prod-data.yml -f data_set=sales -f dry_run=false
gh workflow run provision-prod-data.yml -f data_set=support -f dry_run=false
```

### HTTP 525 errors on app-dr or api-dr domains

**Error**: Cloudflare returns "SSL handshake failed" (HTTP 525) for `app-dr.tamshai.com` or `api-dr.tamshai.com`.

**Cause**: SSL certificates for domain mappings take 10-15 minutes to provision. The original script only waited for the auth domain certificate.

**Solution**: The script now verifies SSL certificates for **all three domains** (auth, app, api) using `wait_for_all_domain_ssl()` from `lib/domain-mapping.sh`.

**Manual Check**:
```bash
# Check each domain
curl -sf https://auth-dr.tamshai.com/ -o /dev/null && echo "auth OK" || echo "auth FAIL"
curl -sf https://app-dr.tamshai.com/ -o /dev/null && echo "app OK" || echo "app FAIL"
curl -sf https://api-dr.tamshai.com/ -o /dev/null && echo "api OK" || echo "api FAIL"

# If still failing, check domain mapping status
gcloud beta run domain-mappings list --region=us-west1
```

### mcp-gateway fails startup probe during terraform apply

**Cause**: SSL certificate for `auth-dr.tamshai.com` domain mapping takes 10-15+ minutes to provision. mcp-gateway tries to fetch JWKS from Keycloak but fails because SSL isn't ready yet.

**Solution**: Wait for SSL certificate to be provisioned, then update the service to trigger a new revision:

```bash
# Check if SSL is ready (should return JSON, not SSL error)
curl -sf https://auth-dr.tamshai.com/auth/realms/tamshai-corp/.well-known/openid-configuration

# Once SSL is ready, trigger new mcp-gateway revision
gcloud run services update mcp-gateway --region=us-west1 \
    --update-env-vars="RESTART_TRIGGER=$(date +%s)"
```

**Note**: This is expected behavior. The evacuation script will show a terraform error, but you can continue after SSL is ready.

### Cloud SQL service agent IAM binding fails

**Error**: `Service account service-{number}@gcp-sa-cloud-sql.iam.gserviceaccount.com does not exist`

**Cause**: The Cloud SQL service agent is created asynchronously and may not exist in the expected format immediately.

**Impact**: Non-critical for DR. This only affects Cloud SQL backup exports to GCS, which are not essential during an evacuation.

**Workaround**: Ignore this error during evacuation. The backup IAM binding can be fixed later if needed.

### Cleanup fails with "Producer services still using this connection"

**Cause**: After deleting Cloud SQL, GCP's service networking connection may still have a stale reference.

**Solution**: Remove the stale resources from terraform state and continue:

```bash
cd infrastructure/terraform/gcp
terraform state rm 'module.database.google_service_networking_connection.private_vpc_connection'
terraform state rm 'module.database.google_compute_global_address.private_ip_range'

# Then re-run cleanup
./scripts/gcp/cleanup-recovery.sh <ENV_ID> --force
```

### VPC deletion fails with "already being used by address"

**Cause**: The private IP range wasn't deleted when removed from terraform state.

**Solution**: Delete the address manually, then continue cleanup:

```bash
gcloud compute addresses delete tamshai-prod-private-ip-<ENV_ID> \
    --global --project=<PROJECT_ID> --quiet

# Then re-run cleanup
./scripts/gcp/cleanup-recovery.sh <ENV_ID> --force
```

---

## Post-Evacuation Checklist

### Immediately After Evacuation
- [ ] All services healthy in recovery region
- [ ] SSL certificates working for all DR domains (auth-dr, app-dr, api-dr)
- [ ] test-user.journey can log in (via auth-dr.tamshai.com)
- [ ] Corporate user (eve.thompson) can log in with PROD_USER_PASSWORD
- [ ] Sample data loaded (Finance invoices, Sales customers, Support tickets)
- [ ] Critical business functions operational
- [ ] Monitoring/alerting configured for new region
- [ ] Stakeholders notified of regional failover

### Within 24 Hours
- [ ] Review logs for any errors
- [ ] Verify data consistency (if restored from backup)
- [ ] Document timeline and decisions
- [ ] Plan failback when primary recovers

### After Failback
- [ ] Verify primary stack is healthy
- [ ] Destroy recovery stack (avoid ongoing costs)
- [ ] Reset DR CNAMEs to placeholders
- [ ] Conduct post-incident review
- [ ] Update runbook with lessons learned

---

## Script Reference

### evacuate-region.sh

Creates a recovery stack in a new region.

```bash
./scripts/gcp/evacuate-region.sh [REGION] [ZONE] [ENV_ID]

# Examples
./scripts/gcp/evacuate-region.sh                                    # Oregon, auto ID
./scripts/gcp/evacuate-region.sh us-west1 us-west1-b recovery-01    # Explicit
./scripts/gcp/evacuate-region.sh us-east1 us-east1-b                # S. Carolina
```

**Environment Variables**:
- `GCP_PROJECT` or `GCP_PROJECT_ID`: GCP project (auto-detected if not set)
- `GCP_DR_REGION`: Override target region (default: from dr.tfvars or us-west1)
- `GCP_DR_ZONE`: Override target zone (default: from dr.tfvars or REGION-b)
- `GCP_DR_FALLBACK_ZONES`: Space-separated fallback zones for capacity issues
- `PROD_USER_PASSWORD`: Corporate user password (synced to GCP Secret Manager during Phase 5)
- `APP_DR_DOMAIN`: Override app domain (default: from dr.tfvars or app-dr.tamshai.com)
- `API_DR_DOMAIN`: Override API domain (default: from dr.tfvars or api-dr.tamshai.com)

**Flags**:
- `--yes`, `-y`: Skip interactive confirmations (recommended for automation)
- `--help`, `-h`: Show usage information

### cleanup-recovery.sh

Destroys a recovery stack after failback.

```bash
./scripts/gcp/cleanup-recovery.sh <ENV_ID> [OPTIONS]

# Options
--list          List all recovery stacks
--dry-run       Preview destruction
--force         Skip confirmations
--keep-dns      Don't show DNS reversion guidance

# Examples
./scripts/gcp/cleanup-recovery.sh --list
./scripts/gcp/cleanup-recovery.sh recovery-20260122 --dry-run
./scripts/gcp/cleanup-recovery.sh recovery-20260122
```

---

## Priority Regions

When choosing an evacuation region, consider:

| Priority | Region | Zone | Rationale |
|----------|--------|------|-----------|
| 1 | **us-west1** | us-west1-b | Same cost, no hurricane risk, closest to CA team |
| 2 | us-east1 | us-east1-b | Same cost, but hurricane zone (June-Nov) |
| 3 | us-east5 | us-east5-b | Same cost, newer region |

**Why us-west1 (Oregon) is recommended**:
- Same pricing tier as us-central1 (free tier eligible)
- No shared weather/disaster patterns with Iowa
- Lowest latency for California-based team
- No hurricane exposure (unlike us-east1)

---

## Related Documentation

- [Phoenix Runbook](./PHOENIX_RUNBOOK.md) - For rebuilds when region IS available
- [GCP Region Failure Scenario Plan](../plans/GCP-REGION-FAILURE-SCENARIO.md) - Detailed design
- [E2E User Tests](../testing/E2E_USER_TESTS.md) - E2E test procedures
- [Test User Journey](../testing/TEST_USER_JOURNEY.md) - Test user credentials

---

## Appendix A: Manual Procedures (Fallback)

> **Note**: These procedures are automated by `evacuate-region.sh`. Use only if automation fails.

### Manual Terraform Evacuation

```bash
cd infrastructure/terraform/gcp

# 1. Initialize with fresh state in new region
terraform init -reconfigure \
    -backend-config="bucket=tamshai-terraform-state-prod" \
    -backend-config="prefix=gcp/recovery/$(date +%Y%m%d)"

# 2. Apply infrastructure
terraform apply \
    -var="region=us-west1" \
    -var="zone=us-west1-b" \
    -var="env_id=recovery-$(date +%Y%m%d)" \
    -var="recovery_mode=true" \
    -var="source_backup_bucket=tamshai-backups-us"

# 3. Get new service URLs
terraform output
```

### Manual DNS Update (Cloudflare API)

```bash
# Set credentials
export CF_API_TOKEN="your-token"
export CF_ZONE_ID="your-zone-id"

# Update api.tamshai.com
curl -X PATCH "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records/RECORD_ID" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"content":"new-mcp-gateway-url.a.run.app"}'
```

### Manual Cleanup

```bash
cd infrastructure/terraform/gcp

# 1. Initialize with recovery state
terraform init -reconfigure \
    -backend-config="bucket=tamshai-terraform-state-prod" \
    -backend-config="prefix=gcp/recovery/recovery-20260122"

# 2. Destroy
terraform destroy \
    -var="region=us-west1" \
    -var="zone=us-west1-b" \
    -var="env_id=recovery-20260122" \
    -var="phoenix_mode=true" \
    -var="mongodb_atlas_uri=placeholder" \
    -var="claude_api_key=placeholder"

# 3. Clean up state
gsutil -m rm -r gs://tamshai-terraform-state-prod/gcp/recovery/recovery-20260122/
```

---

## Appendix B: Tabletop Exercise Script

Conduct quarterly to maintain readiness.

**Duration**: 30-45 minutes
**Participants**: On-call engineer, platform team lead

### Scenario Script

1. "It's 2 AM. PagerDuty alerts: all production services unreachable."
2. "You check GCP Status Dashboard - us-central1 shows 'Investigating'"
3. "You run `terraform plan` against us-central1 - it hangs for 2 minutes"
4. **Decision Point**: Do you wait for GCP, or evacuate?
5. "GCP Status updates to 'Service Disruption - Estimated 4 hours'"
6. **Action**: Walk through evacuation script usage
7. "Recovery stack is up. What DNS changes are needed?"
8. "Users report login issues. How do you debug?"
9. "Primary region recovers. How do you fail back?"
10. "How do you clean up the recovery stack?"

### Discussion Points

- Where is the evacuation script located?
- What's the recommended recovery region and why?
- How do you know DNS has propagated?
- What if the recovery stack also fails?
- How do you communicate to users during outage?

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.3.0 | Jan 26, 2026 | Tamshai-Dev | Phoenix rebuild lessons: multi-domain SSL verification, PROD_USER_PASSWORD sync, force password reset, sample data loading, shared library functions (Issue #102) |
| 1.2.0 | Jan 23, 2026 | Tamshai-Dev | Added zone capacity pre-check, fallback zones (GCP_DR_FALLBACK_ZONES), multi-zone cleanup support (Issue #102) |
| 1.1.0 | Jan 23, 2026 | Tamshai-Dev | Added troubleshooting for SSL delay, Cloud SQL IAM, cleanup issues from evacuation test 13 |
| 1.0.0 | Jan 22, 2026 | Tamshai-Dev | Initial version with evacuation and failback procedures |
