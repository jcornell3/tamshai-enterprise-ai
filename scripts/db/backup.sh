#!/bin/bash
# =============================================================================
# Tamshai Database Backup Script
# =============================================================================
#
# Creates backups of PostgreSQL and MongoDB databases.
#
# Usage:
#   ./backup.sh [environment] [database]
#
# Environments:
#   dev    - Local Docker (default)
#   stage  - VPS staging server
#
# Databases:
#   all        - All databases (default)
#   postgres   - PostgreSQL only
#   mongodb    - MongoDB only
#
# Examples:
#   ./backup.sh dev              # Backup all databases in dev
#   ./backup.sh dev postgres     # Backup only PostgreSQL
#   ./backup.sh stage all        # Backup all on stage
#
# Backups are stored in:
#   - Dev: ./backups/dev/<timestamp>/
#   - Stage: /opt/tamshai/backups/<timestamp>/
#
# Environment Variables (for stage):
#   VPS_HOST     - VPS IP address or hostname (required for stage backups)
#   VPS_SSH_USER - SSH username (default: root)
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Load .env.local if it exists (for VPS_HOST and other local config)
if [ -f "$PROJECT_ROOT/.env.local" ]; then
    # shellcheck source=/dev/null
    source "$PROJECT_ROOT/.env.local"
fi

ENV="${1:-dev}"
DATABASE="${2:-all}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_header() { echo -e "\n${BLUE}=== $1 ===${NC}"; }

# Configure backup directory
if [ "$ENV" = "dev" ]; then
    BACKUP_DIR="$PROJECT_ROOT/backups/dev/$TIMESTAMP"
else
    BACKUP_DIR="/opt/tamshai/backups/$TIMESTAMP"
fi

backup_postgres_dev() {
    log_header "Backing up PostgreSQL (Dev)"

    local container="tamshai-postgres"
    local databases=("tamshai" "tamshai_hr" "tamshai_finance")

    mkdir -p "$BACKUP_DIR/postgres"

    for db in "${databases[@]}"; do
        log_info "Backing up database: $db"

        local backup_file="$BACKUP_DIR/postgres/${db}.sql"

        docker exec "$container" pg_dump \
            -U tamshai \
            -d "$db" \
            --no-owner \
            --no-privileges \
            > "$backup_file"

        # Compress backup
        gzip "$backup_file"

        local size=$(ls -lh "${backup_file}.gz" | awk '{print $5}')
        log_info "  Created: ${backup_file}.gz ($size)"
    done

    # Backup all roles and global objects
    log_info "Backing up roles and global objects..."
    docker exec "$container" pg_dumpall \
        -U tamshai \
        --globals-only \
        > "$BACKUP_DIR/postgres/globals.sql"

    gzip "$BACKUP_DIR/postgres/globals.sql"
}

backup_postgres_stage() {
    log_header "Backing up PostgreSQL (Stage)"

    local vps_host="${VPS_HOST:-}"
    if [ -z "$vps_host" ]; then
        log_error "VPS_HOST not set. Either:"
        log_info "  1. Create .env.local with VPS_HOST=<ip>"
        log_info "  2. Export VPS_HOST environment variable"
        log_info "  3. Get IP from: cd infrastructure/terraform/vps && terraform output vps_ip"
        exit 1
    fi
    local vps_user="${VPS_SSH_USER:-root}"

    ssh -o ConnectTimeout=30 "$vps_user@$vps_host" << BACKUP
set -e
cd /opt/tamshai

BACKUP_DIR="/opt/tamshai/backups/$TIMESTAMP"
mkdir -p "\$BACKUP_DIR/postgres"

# Load environment
export \$(cat .env | grep -v '^#' | xargs)

for db in tamshai tamshai_hr tamshai_finance; do
    echo "Backing up database: \$db"
    docker exec tamshai-postgres pg_dump \
        -U tamshai \
        -d "\$db" \
        --no-owner \
        --no-privileges \
        > "\$BACKUP_DIR/postgres/\${db}.sql"

    gzip "\$BACKUP_DIR/postgres/\${db}.sql"
done

# Global objects
docker exec tamshai-postgres pg_dumpall \
    -U tamshai \
    --globals-only \
    > "\$BACKUP_DIR/postgres/globals.sql"

gzip "\$BACKUP_DIR/postgres/globals.sql"

echo "PostgreSQL backup complete: \$BACKUP_DIR/postgres/"
ls -lh "\$BACKUP_DIR/postgres/"
BACKUP
}

backup_mongodb_dev() {
    log_header "Backing up MongoDB (Dev)"

    local container="tamshai-mongodb"

    mkdir -p "$BACKUP_DIR/mongodb"

    log_info "Running mongodump..."

    # Use mongodump to backup all databases
    docker exec "$container" mongodump \
        --archive \
        --gzip \
        > "$BACKUP_DIR/mongodb/mongodump.archive.gz"

    local size=$(ls -lh "$BACKUP_DIR/mongodb/mongodump.archive.gz" | awk '{print $5}')
    log_info "Created: $BACKUP_DIR/mongodb/mongodump.archive.gz ($size)"
}

backup_mongodb_stage() {
    log_header "Backing up MongoDB (Stage)"

    local vps_host="${VPS_HOST:-}"
    if [ -z "$vps_host" ]; then
        log_error "VPS_HOST not set. Either:"
        log_info "  1. Create .env.local with VPS_HOST=<ip>"
        log_info "  2. Export VPS_HOST environment variable"
        log_info "  3. Get IP from: cd infrastructure/terraform/vps && terraform output vps_ip"
        exit 1
    fi
    local vps_user="${VPS_SSH_USER:-root}"

    ssh -o ConnectTimeout=30 "$vps_user@$vps_host" << BACKUP
set -e
cd /opt/tamshai

BACKUP_DIR="/opt/tamshai/backups/$TIMESTAMP"
mkdir -p "\$BACKUP_DIR/mongodb"

echo "Running mongodump..."
docker exec tamshai-mongodb mongodump \
    --archive \
    --gzip \
    > "\$BACKUP_DIR/mongodb/mongodump.archive.gz"

echo "MongoDB backup complete: \$BACKUP_DIR/mongodb/"
ls -lh "\$BACKUP_DIR/mongodb/"
BACKUP
}

backup_redis_dev() {
    log_header "Backing up Redis (Dev)"

    local container="tamshai-redis"

    mkdir -p "$BACKUP_DIR/redis"

    log_info "Saving Redis RDB..."

    # Trigger a BGSAVE and copy the dump file
    docker exec "$container" redis-cli BGSAVE

    # Wait for save to complete
    sleep 2

    # Copy dump.rdb from container
    docker cp "$container:/data/dump.rdb" "$BACKUP_DIR/redis/dump.rdb" 2>/dev/null || {
        log_warn "Redis dump.rdb not found (may be empty database)"
        return 0
    }

    gzip "$BACKUP_DIR/redis/dump.rdb"
    log_info "Created: $BACKUP_DIR/redis/dump.rdb.gz"
}

backup_all() {
    log_header "Full Database Backup"
    log_info "Backup directory: $BACKUP_DIR"

    local failed=0

    if [ "$ENV" = "dev" ]; then
        mkdir -p "$BACKUP_DIR"
        backup_postgres_dev || ((failed++))
        backup_mongodb_dev || ((failed++))
        backup_redis_dev || ((failed++))
    else
        backup_postgres_stage || ((failed++))
        backup_mongodb_stage || ((failed++))
    fi

    return $failed
}

backup_postgres() {
    if [ "$ENV" = "dev" ]; then
        mkdir -p "$BACKUP_DIR"
        backup_postgres_dev
    else
        backup_postgres_stage
    fi
}

backup_mongodb() {
    if [ "$ENV" = "dev" ]; then
        mkdir -p "$BACKUP_DIR"
        backup_mongodb_dev
    else
        backup_mongodb_stage
    fi
}

show_help() {
    echo "Database Backup Script"
    echo ""
    echo "Usage: $0 [environment] [database]"
    echo ""
    echo "Environments:"
    echo "  dev    - Local Docker (default)"
    echo "  stage  - VPS staging server"
    echo ""
    echo "Databases:"
    echo "  all        - All databases (default)"
    echo "  postgres   - PostgreSQL only"
    echo "  mongodb    - MongoDB only"
    echo ""
    echo "Backup locations:"
    echo "  Dev:   ./backups/dev/<timestamp>/"
    echo "  Stage: /opt/tamshai/backups/<timestamp>/"
}

main() {
    echo "Tamshai Database Backup"
    echo "Environment: $ENV"
    echo "Database: $DATABASE"
    echo "Timestamp: $TIMESTAMP"
    echo ""

    case "$DATABASE" in
        all)
            backup_all
            ;;
        postgres|pg)
            backup_postgres
            ;;
        mongodb|mongo)
            backup_mongodb
            ;;
        help|--help|-h)
            show_help
            exit 0
            ;;
        *)
            log_error "Unknown database: $DATABASE"
            show_help
            exit 1
            ;;
    esac

    local exit_code=$?

    log_header "Backup Summary"
    if [ $exit_code -eq 0 ]; then
        log_info "Backup completed successfully"
        if [ "$ENV" = "dev" ]; then
            log_info "Location: $BACKUP_DIR"
            ls -la "$BACKUP_DIR" 2>/dev/null || true
        fi
    else
        log_error "Backup completed with errors"
    fi

    return $exit_code
}

main "$@"
