# Storage Module
# Manages Cloud Storage buckets

# Logs bucket for access logging
#checkov:skip=CKV_GCP_62:Logs bucket does not log itself (recursive logging not recommended)
#checkov:skip=CKV_GCP_78:Versioning not needed for logs bucket (lifecycle rule deletes after 90 days)
resource "google_storage_bucket" "logs" {
  name     = "tamshai-${var.environment}-logs-${var.project_id}${var.name_suffix}"
  location = var.region
  project  = var.project_id

  uniform_bucket_level_access = true
  force_destroy               = true

  public_access_prevention = "enforced" # Security: Prevent public access (CKV_GCP_114)

  lifecycle_rule {
    condition {
      age = 90 # Retain logs for 90 days
    }
    action {
      type = "Delete"
    }
  }

  labels = {
    environment = var.environment
    purpose     = "access-logs"
  }
}

resource "google_storage_bucket" "finance_docs" {
  name     = "tamshai-${var.environment}-finance-docs-${var.project_id}${var.name_suffix}"
  location = var.region
  project  = var.project_id

  uniform_bucket_level_access = true
  force_destroy               = var.force_destroy

  public_access_prevention = "enforced" # Security: Prevent public access (CKV_GCP_114)

  versioning {
    enabled = var.enable_versioning
  }

  logging {
    log_bucket        = google_storage_bucket.logs.name
    log_object_prefix = "finance-docs/"
  }

  lifecycle_rule {
    condition {
      age = var.lifecycle_age_days
    }
    action {
      type = "Delete"
    }
  }

  # Uses Google-managed encryption by default (no encryption block needed)

  labels = {
    environment = var.environment
    purpose     = "finance-documents"
  }
}

resource "google_storage_bucket" "public_docs" {
  name     = "tamshai-${var.environment}-public-docs-${var.project_id}${var.name_suffix}"
  location = var.region
  project  = var.project_id

  uniform_bucket_level_access = true
  force_destroy               = var.force_destroy

  public_access_prevention = "enforced" # Security: Prevent public access (CKV_GCP_114)

  versioning {
    enabled = true # Security: Enable versioning for data protection (CKV_GCP_78)
  }

  logging {
    log_bucket        = google_storage_bucket.logs.name
    log_object_prefix = "public-docs/"
  }

  labels = {
    environment = var.environment
    purpose     = "public-documents"
  }
}

# =============================================================================
# STATIC WEBSITE BUCKET (Phase 1)
# =============================================================================

# Static website bucket for prod.tamshai.com
# Note: Bucket name must match domain for CNAME hosting to work
#checkov:skip=CKV_GCP_114:Static website bucket requires public access for hosting. Public access is intentional.
resource "google_storage_bucket" "static_website" {
  count = var.enable_static_website ? 1 : 0

  name     = var.static_website_domain   # e.g., "prod.tamshai.com"
  location = var.static_website_location # Default: "US" (multi-regional for DR resilience)
  project  = var.project_id

  uniform_bucket_level_access = true
  force_destroy               = var.force_destroy

  website {
    main_page_suffix = "index.html"
    # SPA routing: serve index.html for all routes so React Router can handle them
    # This enables client-side routing for paths like /app/callback, /app/downloads, etc.
    not_found_page = "index.html"
  }

  # Allow public read access for website content
  # Note: This is intentional for static website hosting
  public_access_prevention = "inherited"

  versioning {
    enabled = true # Enable versioning for rollback capability
  }

  # Phoenix rebuild fix (Issue #2): Delete noncurrent versions to enable force_destroy
  # force_destroy=true only deletes current objects, not noncurrent versions
  # Without this rule, bucket deletion fails with "bucket is not empty"
  lifecycle_rule {
    condition {
      days_since_noncurrent_time = 1
      with_state                 = "ANY"
    }
    action {
      type = "Delete"
    }
  }

  logging {
    log_bucket        = google_storage_bucket.logs.name
    log_object_prefix = "static-website/"
  }

  cors {
    origin          = ["https://${var.static_website_domain}"]
    method          = ["GET", "HEAD"]
    response_header = ["*"]
    max_age_seconds = 3600
  }

  labels = {
    environment = var.environment
    purpose     = "static-website"
  }

  # Ignore location changes - the bucket may already exist in a different region
  # This allows terraform to manage the bucket without forcing recreation
  lifecycle {
    ignore_changes = [location]
  }
}

# Make website bucket publicly readable
#checkov:skip=CKV_GCP_28:Static website bucket must be publicly readable for GCS website hosting. Access is read-only.
resource "google_storage_bucket_iam_member" "static_website_public" {
  count = var.enable_static_website ? 1 : 0

  bucket = google_storage_bucket.static_website[0].name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

# Grant CI/CD service account write access to website bucket
resource "google_storage_bucket_iam_member" "static_website_cicd" {
  count = var.enable_static_website && var.enable_cicd_iam_bindings ? 1 : 0

  bucket = google_storage_bucket.static_website[0].name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${var.cicd_service_account_email}"
}

# Grant CI/CD service account bucket-level read access (required for gcloud storage rsync)
# storage.objectAdmin provides object operations but NOT storage.buckets.get
# legacyBucketReader provides storage.buckets.get which rsync needs to read bucket metadata
resource "google_storage_bucket_iam_member" "static_website_cicd_bucket_reader" {
  count = var.enable_static_website && var.enable_cicd_iam_bindings ? 1 : 0

  bucket = google_storage_bucket.static_website[0].name
  role   = "roles/storage.legacyBucketReader"
  member = "serviceAccount:${var.cicd_service_account_email}"
}

# =============================================================================
# MULTI-REGIONAL BACKUP BUCKET (Regional Evacuation Support)
# =============================================================================
# This bucket stores Cloud SQL exports and other critical data backups.
# Located in multi-regional "US" so it survives any single regional outage.
# Used by evacuate-region.sh to restore data in the recovery region.

resource "google_storage_bucket" "backups" {
  count = var.enable_backup_bucket ? 1 : 0

  name     = "tamshai-${var.environment}-backups-${var.project_id}"
  location = "US" # Multi-regional for disaster recovery
  project  = var.project_id

  uniform_bucket_level_access = true
  force_destroy               = false # Never auto-delete backup bucket

  public_access_prevention = "enforced" # Security: Prevent public access

  versioning {
    enabled = true # Keep multiple versions of backups
  }

  logging {
    log_bucket        = google_storage_bucket.logs.name
    log_object_prefix = "backups/"
  }

  # Lifecycle rules for backup retention
  lifecycle_rule {
    condition {
      age = var.backup_retention_days
    }
    action {
      type = "Delete"
    }
  }

  # Keep noncurrent versions for 30 days (rollback capability)
  lifecycle_rule {
    condition {
      days_since_noncurrent_time = 30
      with_state                 = "ANY"
    }
    action {
      type = "Delete"
    }
  }

  labels = {
    environment = var.environment
    purpose     = "disaster-recovery-backups"
  }
}

# Grant CI/CD service account write access to backup bucket (for automated backups)
resource "google_storage_bucket_iam_member" "backups_cicd_writer" {
  count = var.enable_backup_bucket && var.enable_cicd_iam_bindings ? 1 : 0

  bucket = google_storage_bucket.backups[0].name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${var.cicd_service_account_email}"
}

# Grant Cloud SQL service agent access (for native Cloud SQL export to GCS)
# Cloud SQL exports require the SQL service agent to write to the bucket
#
# Issue #102: The Cloud SQL service agent doesn't exist until the first Cloud SQL
# instance is created. Use enable_cloudsql_backup_iam=false for fresh deployments
# where Cloud SQL hasn't been created yet.
resource "google_storage_bucket_iam_member" "backups_cloudsql_writer" {
  count = var.enable_backup_bucket && var.enable_cloudsql_backup_iam ? 1 : 0

  bucket = google_storage_bucket.backups[0].name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-cloud-sql.iam.gserviceaccount.com"
}

# Data source to get project number for Cloud SQL service agent
data "google_project" "current" {
  project_id = var.project_id
}
