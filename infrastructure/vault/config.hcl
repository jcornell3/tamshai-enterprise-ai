# Tamshai Vault Production Configuration
# =======================================
#
# This configuration file is used for VPS/production deployments.
# For dev mode (auto-unsealed), see infrastructure/docker/vault/
#
# IMPORTANT: Production Vault requires manual initialization and unsealing.
# See docs/vault/PRODUCTION_SETUP.md for instructions.

# Storage backend - file-based for VPS (simple, no external dependencies)
storage "file" {
  path = "/vault/data"
}

# Listener configuration
listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = 1  # TLS handled by Caddy reverse proxy
}

# Disable memory lock warning
disable_mlock = true

# API address (internal)
api_addr = "http://127.0.0.1:8200"

# Cluster address (not used in single-node setup)
cluster_addr = "http://127.0.0.1:8201"

# UI enabled for administration
ui = true

# Logging
log_level = "info"

# Telemetry (optional - enable for monitoring)
# telemetry {
#   prometheus_retention_time = "30s"
#   disable_hostname = true
# }
