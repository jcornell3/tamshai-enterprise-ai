# Tamshai Corp MCP Journey Server
# Multi-stage build for minimal production image

# =============================================================================
# BUILD STAGE
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files (from repo root context)
COPY services/mcp-journey/package*.json ./

# Install dependencies
RUN npm ci

# Copy source code (from repo root context)
COPY services/mcp-journey/tsconfig.json ./
COPY services/mcp-journey/src ./src

# Build TypeScript
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# =============================================================================
# INDEXER STAGE - Builds the journey database
# =============================================================================
FROM node:20-alpine AS indexer

WORKDIR /indexer

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Create data directory
RUN mkdir -p /indexer/data

# Copy project documentation for indexing
# Note: These paths are relative to the Docker build context (services/mcp-journey)
# We use the build context from the repo root to access docs
COPY docs/ ./project-docs/docs/
COPY .specify/ ./project-docs/.specify/
COPY CLAUDE.md ./project-docs/CLAUDE.md
COPY README.md ./project-docs/README.md

# Set environment and run indexer
ENV DB_PATH=/indexer/data/journey.db
ENV PROJECT_ROOT=/indexer/project-docs

# Run the build-index script (without embeddings - no API key at build time)
RUN node dist/scripts/build-index.js || echo "Index build completed with warnings"

# =============================================================================
# PRODUCTION STAGE
# =============================================================================
FROM node:20-alpine AS production

# Security: Apply Alpine security patches
RUN apk update && apk upgrade --no-cache

# Security: Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy built files and production dependencies
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./

# Copy pre-built database from indexer stage
COPY --from=indexer --chown=nodejs:nodejs /indexer/data/journey.db /app/data/journey.db

# Create data directory if database copy failed
RUN mkdir -p /app/data && chown nodejs:nodejs /app/data

# Set environment
ENV NODE_ENV=production
ENV PORT=3105
ENV DB_PATH=/app/data/journey.db

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3105

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3105/health || exit 1

# Start server
CMD ["node", "dist/index.js"]
