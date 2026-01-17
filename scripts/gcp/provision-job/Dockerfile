# =============================================================================
# User Provisioning Job for Cloud Run
# =============================================================================
# Loads HR sample data into Cloud SQL and syncs users to Keycloak.
# Runs as a Cloud Run Job with VPC connector for private IP access.
#
# Build:
#   docker build -t us-central1-docker.pkg.dev/gen-lang-client-0553641830/tamshai-prod/provision-job:latest .
#
# =============================================================================

FROM node:20-bookworm-slim

# Install dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    curl \
    ca-certificates \
    netcat-openbsd \
    bash \
    && rm -rf /var/lib/apt/lists/*

# Install Cloud SQL Proxy
RUN curl -fsSL -o /usr/local/bin/cloud-sql-proxy \
    https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.14.0/cloud-sql-proxy.linux.amd64 \
    && chmod +x /usr/local/bin/cloud-sql-proxy

# Create app directory
WORKDIR /app

# Copy mcp-hr service (for identity-sync)
COPY services/mcp-hr/package*.json ./services/mcp-hr/
RUN cd services/mcp-hr && npm ci --production=false --silent

COPY services/mcp-hr/ ./services/mcp-hr/

# Copy sample data
COPY sample-data/hr-data.sql ./sample-data/

# Copy provisioning script
COPY scripts/gcp/provision-job/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Set entrypoint
ENTRYPOINT ["/entrypoint.sh"]
