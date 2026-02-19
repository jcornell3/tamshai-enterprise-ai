# =============================================================================
# Tamshai Stage Monitor - Lightweight Health Checker
# =============================================================================
# Alpine-based container for monitoring remote stage environment.
# Checks health endpoints and alerts on failures.
# =============================================================================

FROM alpine:3.19

# Install dependencies
RUN apk add --no-cache \
    curl \
    jq \
    bash \
    ca-certificates \
    mailx \
    tzdata

# Set timezone
ENV TZ=UTC

# Create app directory
WORKDIR /app

# Copy monitoring scripts
COPY scripts/ /app/scripts/
RUN chmod +x /app/scripts/*.sh

# Create data directory for state persistence
RUN mkdir -p /data

# Health check for the monitor itself
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD [ -f /data/last_check.json ] && [ $(($(date +%s) - $(stat -c %Y /data/last_check.json))) -lt 300 ] || exit 1

# Run the monitor
CMD ["/app/scripts/monitor.sh"]
