#!/bin/bash
# Keycloak Startup Script
# Fetches secrets from Secret Manager and starts Keycloak container

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

# Pull and run Keycloak with secrets from environment
docker run -d \
  --name keycloak \
  --restart unless-stopped \
  -p 8080:8080 \
  -e KEYCLOAK_ADMIN=admin \
  -e KEYCLOAK_ADMIN_PASSWORD="$KEYCLOAK_ADMIN_PASSWORD" \
  -e KC_DB=postgres \
  -e KC_DB_URL="jdbc:postgresql://${postgres_private_ip}:5432/keycloak" \
  -e KC_DB_USERNAME=keycloak \
  -e KC_DB_PASSWORD="$KEYCLOAK_DB_PASSWORD" \
  -e KC_HOSTNAME_STRICT=false \
  -e KC_PROXY=edge \
  quay.io/keycloak/keycloak:24.0 start-dev

# Clear sensitive variables from shell
unset KEYCLOAK_ADMIN_PASSWORD KEYCLOAK_DB_PASSWORD

echo "Keycloak started successfully"
