# Keycloak for Cloud Run with Cloud SQL Socket Factory
# Multi-stage build for PostgreSQL connectivity via Unix sockets

# =============================================================================
# Stage 1: Fetch the Cloud SQL JDBC Socket Factory
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

# =============================================================================
# Stage 2: Build Optimized Keycloak with PostgreSQL Driver
# =============================================================================
FROM quay.io/keycloak/keycloak:26.0.7 AS builder

# Copy Cloud SQL Socket Factory JARs to providers directory
COPY --from=deps /libs/postgres-socket-factory.jar /opt/keycloak/providers/
COPY --from=deps /libs/jdbc-socket-factory-core.jar /opt/keycloak/providers/

# Copy realm export for import
COPY realm-export.json /opt/keycloak/data/import/realm-export.json

# Set build-time configuration (only DB type and health)
ENV KC_DB=postgres
ENV KC_HEALTH_ENABLED=true

# Build optimized Keycloak (generates runtime optimizations and caches)
RUN /opt/keycloak/bin/kc.sh build --verbose

# =============================================================================
# Stage 3: Final Production Image
# =============================================================================
FROM quay.io/keycloak/keycloak:26.0.7

# Copy optimized Keycloak from builder stage
COPY --from=builder /opt/keycloak/ /opt/keycloak/

# Set runtime configuration
ENV KC_METRICS_ENABLED=true
ENV KC_HTTP_ENABLED=true
ENV KC_HTTP_RELATIVE_PATH=/auth

# Start Keycloak in production mode with realm import
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
CMD ["start", "--optimized", "--import-realm"]
