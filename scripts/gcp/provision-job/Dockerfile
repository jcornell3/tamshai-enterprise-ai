# =============================================================================
# User Provisioning Job for Cloud Run
# =============================================================================
# Loads HR sample data into Cloud SQL and syncs users to Keycloak.
# Runs as a Cloud Run Job with VPC connector for private IP access.
#
# Build:
#   docker build -t ${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT}/tamshai-prod/provision-job:latest .
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
    python3 \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Install Cloud SQL Proxy
RUN curl -fsSL -o /usr/local/bin/cloud-sql-proxy \
    https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.14.0/cloud-sql-proxy.linux.amd64 \
    && chmod +x /usr/local/bin/cloud-sql-proxy

# Create app directory
WORKDIR /app

# Copy mcp-hr service (for identity-sync)
COPY services/mcp-hr/package*.json ./services/mcp-hr/
RUN cd services/mcp-hr && npm ci --production=false --silent \
    && chmod +x node_modules/.bin/*

COPY services/mcp-hr/ ./services/mcp-hr/

# Copy sample data (all SQL files)
COPY sample-data/*.sql ./sample-data/

# Copy provisioning script
COPY scripts/gcp/provision-job/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Set entrypoint
ENTRYPOINT ["/entrypoint.sh"]
