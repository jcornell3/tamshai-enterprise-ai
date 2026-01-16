# Tamshai Corp MCP Gateway
# Multi-stage build for minimal production image

# =============================================================================
# BUILD STAGE
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# =============================================================================
# PRODUCTION STAGE
# =============================================================================
FROM node:20-alpine AS production

# Security: Apply Alpine security patches (CVE-2026-22184 zlib, CVE-2025-60876 busybox)
RUN apk update && apk upgrade --no-cache

# Security: Update npm to fix CVE-2025-64756 (glob), CVE-2024-21538 (cross-spawn),
# CVE-2025-5889 (brace-expansion) in npm's bundled dependencies
RUN npm install -g npm@latest

# Security: Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy built files and production dependencies
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./

# Set environment
ENV NODE_ENV=production

# Switch to non-root user
USER nodejs

# Expose port (Cloud Run will set PORT env var dynamically)
EXPOSE 8080

# Health check (uses PORT env var via shell)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3100}/health || exit 1

# Start server
CMD ["node", "dist/index.js"]
