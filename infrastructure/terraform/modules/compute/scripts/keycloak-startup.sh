#!/bin/bash
# Keycloak Startup Script
# Fetches secrets from Secret Manager and starts Keycloak container
# Uses --import-realm for consistent realm setup across all environments

set -e

# Install dependencies
apt-get update
apt-get install -y docker.io jq
systemctl enable docker
systemctl start docker

# Fetch secrets from Secret Manager at runtime
# This requires the service account to have secretAccessor role
KEYCLOAK_ADMIN_PASSWORD=$(gcloud secrets versions access latest \
  --secret="tamshai-${environment}-keycloak-admin-password" \
  --project="${project_id}")

KEYCLOAK_DB_PASSWORD=$(gcloud secrets versions access latest \
  --secret="tamshai-${environment}-keycloak-db-password" \
  --project="${project_id}")

# Determine which realm export to use based on environment
# Production uses realm-export.json (no test users)
# Staging uses realm-export-dev.json (includes test users)
if [ "${environment}" = "prod" ]; then
  REALM_FILE="realm-export.json"
else
  REALM_FILE="realm-export-dev.json"
fi

# Download realm export from the repository
# The file should be available at /opt/tamshai/keycloak/
REALM_PATH="/opt/tamshai/keycloak/$REALM_FILE"

if [ ! -f "$REALM_PATH" ]; then
  echo "ERROR: Realm export file not found at $REALM_PATH"
  echo "Ensure the repository is cloned to /opt/tamshai"
  exit 1
fi

# Pull and run Keycloak with secrets from environment
# Use --import-realm to load realm configuration on startup
docker run -d \
  --name keycloak \
  --restart unless-stopped \
  -p 8080:8080 \
  -v "$REALM_PATH:/opt/keycloak/data/import/realm-export.json:ro" \
  -e KEYCLOAK_ADMIN=admin \
  -e KEYCLOAK_ADMIN_PASSWORD="$KEYCLOAK_ADMIN_PASSWORD" \
  -e KC_DB=postgres \
  -e KC_DB_URL="jdbc:postgresql://${postgres_private_ip}:5432/keycloak" \
  -e KC_DB_USERNAME=keycloak \
  -e KC_DB_PASSWORD="$KEYCLOAK_DB_PASSWORD" \
  -e KC_HOSTNAME_STRICT=false \
  -e KC_PROXY=edge \
  quay.io/keycloak/keycloak:24.0 start --import-realm

# Clear sensitive variables from shell
unset KEYCLOAK_ADMIN_PASSWORD KEYCLOAK_DB_PASSWORD

echo "Keycloak started successfully with realm from $REALM_FILE"
