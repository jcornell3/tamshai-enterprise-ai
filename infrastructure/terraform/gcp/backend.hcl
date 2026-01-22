# Default backend configuration for primary GCP deployment
# Use with: terraform init -backend-config=backend.hcl
#
# For regional evacuation, use partial config directly:
#   terraform init -reconfigure \
#     -backend-config="bucket=tamshai-terraform-state-prod" \
#     -backend-config="prefix=gcp/recovery/<ENV_ID>"

bucket = "tamshai-terraform-state-prod"
prefix = "gcp/phase1"
