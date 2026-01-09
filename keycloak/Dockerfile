# Keycloak for Cloud Run
# Based on official Keycloak image with realm import configuration

FROM quay.io/keycloak/keycloak:26.0.7

# Copy realm export for import
COPY realm-export.json /opt/keycloak/data/import/realm-export.json

# Set production mode
ENV KC_HEALTH_ENABLED=true
ENV KC_METRICS_ENABLED=true
ENV KC_HTTP_ENABLED=true
ENV KC_HTTP_RELATIVE_PATH=/auth

# Build optimized Keycloak (database selected at runtime)
RUN /opt/keycloak/bin/kc.sh build

# Start Keycloak in production mode
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
CMD ["start", "--optimized", "--import-realm"]
