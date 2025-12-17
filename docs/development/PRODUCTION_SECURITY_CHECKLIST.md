# Production Security Checklist

This document tracks security and infrastructure improvements identified by qlty CLI analysis that should be addressed before production deployment.

## Status Legend
- [ ] Not started
- [x] Completed
- [-] Not applicable / Deferred

---

## Priority 2 - Production Deployment

These items are acceptable in development but should be addressed for production.

### GCP Terraform Configuration (`infrastructure/terraform/main.tf`)

#### Database Security

| Item | Trivy ID | Current State | Required Action |
|------|----------|---------------|-----------------|
| [ ] Enable TLS for Cloud SQL | AVD-GCP-0015 | TLS not required | Add `require_ssl = true` to database flags |
| [ ] Disable public IP for database | AVD-GCP-0017 | Public IP enabled | Use private networking with VPC peering |
| [ ] Enable database backups | AVD-GCP-0024 | Backups disabled | Enable `backup_configuration` block |
| [ ] Enable database logging | AVD-GCP-0014/0016/0020/0022/0025 | Logging minimal | Enable connection, disconnection, lock wait, checkpoint, and temp file logging |

**Implementation:**
```hcl
resource "google_sql_database_instance" "main" {
  settings {
    ip_configuration {
      ipv4_enabled    = false  # Disable public IP
      private_network = google_compute_network.vpc.id
      require_ssl     = true   # Require TLS
    }

    backup_configuration {
      enabled    = true
      start_time = "03:00"  # 3 AM UTC
      location   = "us"
      point_in_time_recovery_enabled = true
    }

    database_flags {
      name  = "log_connections"
      value = "on"
    }
    database_flags {
      name  = "log_disconnections"
      value = "on"
    }
    database_flags {
      name  = "log_lock_waits"
      value = "on"
    }
    database_flags {
      name  = "log_checkpoints"
      value = "on"
    }
    database_flags {
      name  = "log_temp_files"
      value = "0"  # Log all temp files
    }
  }
}
```

#### Compute Instance Security

| Item | Trivy ID | Current State | Required Action |
|------|----------|---------------|-----------------|
| [ ] Create dedicated service account | AVD-GCP-0044 | Uses default SA | Create `google_service_account` with minimal permissions |
| [ ] Disable public IPs on instances | AVD-GCP-0031 | Public IP enabled | Use NAT gateway for outbound, load balancer for inbound |
| [ ] Enable shielded VM features | AVD-GCP-0041/0045/0067 | Disabled | Enable vTPM, integrity monitoring, secure boot |
| [ ] Block project-level SSH keys | AVD-GCP-0030 | Allowed | Set `block-project-ssh-keys = true` |

**Implementation:**
```hcl
resource "google_service_account" "tamshai_app" {
  account_id   = "tamshai-app"
  display_name = "Tamshai Application Service Account"
}

resource "google_compute_instance" "app" {
  # ...existing config...

  service_account {
    email  = google_service_account.tamshai_app.email
    scopes = ["cloud-platform"]  # Use IAM for fine-grained control
  }

  network_interface {
    network    = google_compute_network.vpc.id
    subnetwork = google_compute_subnetwork.private.id
    # No access_config block = no public IP
  }

  shielded_instance_config {
    enable_vtpm                 = true
    enable_integrity_monitoring = true
    enable_secure_boot          = true
  }

  metadata = {
    block-project-ssh-keys = true
  }
}
```

#### Network Security

| Item | Trivy ID | Current State | Required Action |
|------|----------|---------------|-----------------|
| [ ] Restrict admin access IPs | S6321 | Open to 0.0.0.0/0 | Whitelist specific admin IPs |

**Implementation:**
```hcl
resource "google_compute_firewall" "ssh" {
  name    = "allow-ssh-admin"
  network = google_compute_network.vpc.id

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  # Replace with your admin IP ranges
  source_ranges = [
    "203.0.113.0/24",  # Office IP range
    "198.51.100.50/32" # VPN exit IP
  ]
}
```

#### Storage Security (Optional)

| Item | Trivy ID | Current State | Required Action |
|------|----------|---------------|-----------------|
| [-] Customer-managed encryption keys | AVD-GCP-0066/0033 | Google-managed | Optional: Use Cloud KMS for CMEK |

**Note:** Google-managed encryption is sufficient for most use cases. CMEK adds complexity and is only required for specific compliance requirements.

---

## Code Quality (Lower Priority)

### Cognitive Complexity

| File | Function | Complexity | Threshold | Action |
|------|----------|------------|-----------|--------|
| [ ] `clients/unified/src/services/api.ts:27` | `fetchWithAuth` | 31 | 15 | Consider refactoring into smaller functions |
| [ ] `services/mcp-gateway/src/index.ts:782` | (query handler) | 21 | 15 | Consider extracting validation logic |

**Note:** These are code quality suggestions, not security issues. Address when convenient.

---

## Completed Items (Priority 1)

### Docker Security
- [x] Add non-root USER to web app Dockerfiles (portal, hr, finance, sales, support)
  - Changed from `nginx:alpine` to `nginxinc/nginx-unprivileged:alpine`
  - Containers now run as `nginx` user on port 8080

### TypeScript Code Quality
- [x] Remove unused imports (`DEFAULT_CONFIG`, `Tokens`, `User`, `PendingConfirmation`)
- [x] Fix `react-hooks/exhaustive-deps` warning in `App.tsx`
- [x] Prefix unused `get` parameter with underscore in `chatStore.ts`

---

## Verification

After implementing changes, re-run qlty to verify:

```bash
qlty check --all
```

Or for specific files:

```bash
qlty check infrastructure/terraform/main.tf
```

---

*Last Updated: December 2024*
*Based on qlty CLI v0.595.0 analysis*
