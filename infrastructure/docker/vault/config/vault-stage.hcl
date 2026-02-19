# =============================================================================
# Vault Production Configuration for Stage Environment
# =============================================================================
# This configuration runs Vault in server mode (not dev mode).
# Requires initialization and unsealing after container start.
#
# Key differences from dev mode:
# - Data persists in /vault/file (not in-memory)
# - Requires unseal keys after restart
# - No auto-generated root token
# =============================================================================

# File storage backend (simple, no external dependencies)
storage "file" {
  path = "/vault/file"
}

# Listener configuration
# TLS disabled because Caddy handles TLS termination
listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = "true"
}

# API address for client redirects
api_addr = "http://vault:8200"

# Cluster address (single node, but required)
cluster_addr = "http://vault:8201"

# Disable mlock (required for Docker without --privileged)
# In production with dedicated VMs, this should be enabled
disable_mlock = true

# Enable web UI
ui = true

# Telemetry for monitoring (optional)
telemetry {
  disable_hostname = true
}
