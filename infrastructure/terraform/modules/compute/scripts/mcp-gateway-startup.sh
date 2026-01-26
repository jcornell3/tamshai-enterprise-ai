#!/bin/bash
# MCP Gateway Startup Script
# Fetches secrets from Secret Manager and starts MCP Gateway container
# Issue #27: Also runs Redis for Cloud Run services to connect to

set -e

# Install dependencies
apt-get update
apt-get install -y docker.io jq
systemctl enable docker
systemctl start docker

# Issue #27: Start Redis for Cloud Run mcp-gateway to connect to
# This provides token revocation cache for the Cloud Run services
docker run -d \
  --name redis \
  --restart unless-stopped \
  -p 6379:6379 \
  redis:7-alpine redis-server --appendonly yes

echo "Redis started on port 6379"

# Fetch secrets from Secret Manager at runtime
ANTHROPIC_API_KEY=$(gcloud secrets versions access latest \
  --secret="tamshai-${environment}-claude-api-key" \
  --project="${project_id}" 2>/dev/null || echo "")

MCP_GATEWAY_CLIENT_SECRET=$(gcloud secrets versions access latest \
  --secret="tamshai-${environment}-mcp-gateway-client-secret" \
  --project="${project_id}")

JWT_SECRET=$(gcloud secrets versions access latest \
  --secret="tamshai-${environment}-jwt-secret" \
  --project="${project_id}")

# Check if Anthropic API key is set
if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "WARNING: Anthropic API key not set. Add it with:"
  echo "gcloud secrets versions add tamshai-${environment}-claude-api-key --data-file=-"
fi

# Create environment file for MCP Gateway (in memory tmpfs)
mkdir -p /run/secrets
chmod 700 /run/secrets
cat > /run/secrets/mcp-gateway.env <<ENVEOF
ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY
MCP_GATEWAY_CLIENT_SECRET=$MCP_GATEWAY_CLIENT_SECRET
JWT_SECRET=$JWT_SECRET
KEYCLOAK_URL=http://${keycloak_private_ip}:8080
KEYCLOAK_REALM=tamshai-corp
KEYCLOAK_CLIENT_ID=mcp-gateway
REDIS_HOST=localhost
NODE_ENV=production
ENVEOF
chmod 600 /run/secrets/mcp-gateway.env

# Clear sensitive variables from shell
unset ANTHROPIC_API_KEY MCP_GATEWAY_CLIENT_SECRET JWT_SECRET

# Pull and run MCP Gateway
# TODO: Replace with actual container image
docker run -d \
  --name mcp-gateway \
  --restart unless-stopped \
  -p 3100:3100 \
  --env-file /run/secrets/mcp-gateway.env \
  node:20-slim sleep infinity  # Placeholder - replace with actual image

echo "MCP Gateway started successfully"
