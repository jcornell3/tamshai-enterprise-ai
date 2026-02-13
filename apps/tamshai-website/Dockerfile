# Tamshai Corp Website
# Static site served via Nginx

FROM nginx:1.25-alpine

# Add labels for container metadata
LABEL org.opencontainers.image.title="Tamshai Website"
LABEL org.opencontainers.image.description="Tamshai Corp corporate website"
LABEL org.opencontainers.image.source="https://github.com/jcornell3/tamshai-enterprise-ai"

# Install wget for health checks (Alpine doesn't include it by default)
RUN apk add --no-cache wget

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy static website files
COPY src/ /usr/share/nginx/html/

# Set proper permissions and ownership for non-root user
RUN chmod -R 755 /usr/share/nginx/html && \
    chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

# Security: Run as non-root user
USER nginx

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

# Run nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
