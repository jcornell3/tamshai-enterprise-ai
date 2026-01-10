# Keycloak for Cloud Run with Cloud SQL Socket Factory
# Multi-stage build for PostgreSQL connectivity via Unix sockets

# =============================================================================
# Stage 1: Fetch the Cloud SQL JDBC Socket Factory and jq binary
# =============================================================================
FROM alpine:latest AS deps
RUN apk add --no-cache curl
WORKDIR /libs

# Download Cloud SQL Socket Factory (v1.27.1 - latest on Maven Central)
# https://github.com/GoogleCloudPlatform/cloud-sql-jdbc-socket-factory
# Need both postgres-socket-factory and jdbc-socket-factory-core
RUN curl -L -o postgres-socket-factory.jar \
    https://repo1.maven.org/maven2/com/google/cloud/sql/postgres-socket-factory/1.27.1/postgres-socket-factory-1.27.1.jar && \
    curl -L -o jdbc-socket-factory-core.jar \
    https://repo1.maven.org/maven2/com/google/cloud/sql/jdbc-socket-factory-core/1.27.1/jdbc-socket-factory-core-1.27.1.jar

# Download jq static binary for realm recreation script
RUN curl -L -o /usr/local/bin/jq https://github.com/jqlang/jq/releases/download/jq-1.7.1/jq-linux-amd64 && \
    chmod +x /usr/local/bin/jq

# Download static curl binary (no dependencies) for realm recreation script
RUN curl -L -o /usr/local/bin/curl https://github.com/moparisthebest/static-curl/releases/download/v8.6.0/curl-amd64 && \
    chmod +x /usr/local/bin/curl

# =============================================================================
# Stage 2: Build Optimized Keycloak with PostgreSQL Driver
# =============================================================================
FROM quay.io/keycloak/keycloak:26.0.7 AS builder

# Copy Cloud SQL Socket Factory JARs to providers directory
COPY --from=deps /libs/postgres-socket-factory.jar /opt/keycloak/providers/
COPY --from=deps /libs/jdbc-socket-factory-core.jar /opt/keycloak/providers/

# Copy realm export for import
COPY realm-export.json /opt/keycloak/data/import/realm-export.json

# Copy realm sync scripts for Cloud Run job execution (with execute permissions)
COPY --chmod=755 scripts/ /opt/keycloak/scripts/

# Set build-time configuration
ENV KC_DB=postgres
ENV KC_HEALTH_ENABLED=true
ENV KC_METRICS_ENABLED=true
ENV KC_HTTP_ENABLED=true
ENV KC_HTTP_RELATIVE_PATH=/auth

# Build optimized Keycloak (generates runtime optimizations and caches)
RUN /opt/keycloak/bin/kc.sh build --verbose

# =============================================================================
# Stage 3: Final Production Image (UBI-based)
# =============================================================================
FROM quay.io/keycloak/keycloak:26.0.7

# Copy optimized Keycloak from builder stage (build-time config already baked in)
COPY --from=builder /opt/keycloak/ /opt/keycloak/

# Copy static curl and jq binaries from deps stage for realm recreation script
# Script expects curl at /opt/keycloak/curl-static (see recreate-realm-prod.sh)
COPY --from=deps /usr/local/bin/curl /opt/keycloak/curl-static
COPY --from=deps /usr/local/bin/jq /usr/local/bin/jq

# Configure curl to use UBI's CA certificate bundle (static curl expects /etc/ssl/certs/ca-certificates.crt)
ENV CURL_CA_BUNDLE=/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem

# The realm recreation script needs curl and jq, both are now available as static binaries

# Start Keycloak in production mode with realm import
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
CMD ["start", "--optimized", "--import-realm"]
