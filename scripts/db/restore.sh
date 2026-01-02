#!/bin/bash
# =============================================================================
# Tamshai Database Restore Script
# =============================================================================
#
# Restores PostgreSQL and MongoDB databases from backups.
#
# Usage:
#   ./restore.sh [environment] [backup_path] [database]
#
# Environments:
#   dev    - Local Docker (default)
#   stage  - VPS staging server
#
# Arguments:
#   backup_path  - Path to backup directory (required)
#   database     - all, postgres, or mongodb (default: all)
#
# Examples:
#   ./restore.sh dev ./backups/dev/20250102_120000/
#   ./restore.sh dev ./backups/dev/20250102_120000/ postgres
#   ./restore.sh stage /opt/tamshai/backups/20250102_120000/
#
# WARNING: This script will DROP and recreate databases!
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

ENV="${1:-dev}"
BACKUP_PATH="${2:-}"
DATABASE="${3:-all}"

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

confirm_restore() {
    echo -e "${RED}WARNING: This will DROP and recreate databases!${NC}"
    echo ""
    echo "Environment: $ENV"
    echo "Backup path: $BACKUP_PATH"
    echo "Database: $DATABASE"
    echo ""
    read -p "Are you sure you want to continue? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        log_info "Restore cancelled"
        exit 0
    fi
}

restore_postgres_dev() {
    log_header "Restoring PostgreSQL (Dev)"

    local container="tamshai-postgres"
    local postgres_backup="$BACKUP_PATH/postgres"

    if [ ! -d "$postgres_backup" ]; then
        log_error "PostgreSQL backup not found: $postgres_backup"
        return 1
    fi

    # Restore globals first (roles, etc.)
    if [ -f "$postgres_backup/globals.sql.gz" ]; then
        log_info "Restoring global objects..."
        gunzip -c "$postgres_backup/globals.sql.gz" | \
            docker exec -i "$container" psql -U tamshai -d postgres || true
    fi

    # Restore each database
    local databases=("tamshai" "tamshai_hr" "tamshai_finance")

    for db in "${databases[@]}"; do
        local backup_file="$postgres_backup/${db}.sql.gz"

        if [ -f "$backup_file" ]; then
            log_info "Restoring database: $db"

            # Drop and recreate database
            docker exec "$container" psql -U tamshai -d postgres -c "DROP DATABASE IF EXISTS $db;" || true
            docker exec "$container" psql -U tamshai -d postgres -c "CREATE DATABASE $db OWNER tamshai;"

            # Restore data
            gunzip -c "$backup_file" | \
                docker exec -i "$container" psql -U tamshai -d "$db"

            log_info "  Restored: $db"
        else
            log_warn "Backup not found for database: $db"
        fi
    done
}

restore_postgres_stage() {
    log_header "Restoring PostgreSQL (Stage)"

    local vps_host="${VPS_HOST:-5.78.159.29}"
    local vps_user="${VPS_SSH_USER:-root}"

    ssh -o ConnectTimeout=30 "$vps_user@$vps_host" << RESTORE
set -e
cd /opt/tamshai

BACKUP_PATH="$BACKUP_PATH"
POSTGRES_BACKUP="\$BACKUP_PATH/postgres"

if [ ! -d "\$POSTGRES_BACKUP" ]; then
    echo "PostgreSQL backup not found: \$POSTGRES_BACKUP"
    exit 1
fi

# Restore globals
if [ -f "\$POSTGRES_BACKUP/globals.sql.gz" ]; then
    echo "Restoring global objects..."
    gunzip -c "\$POSTGRES_BACKUP/globals.sql.gz" | \
        docker exec -i tamshai-postgres psql -U tamshai -d postgres || true
fi

# Restore databases
for db in tamshai tamshai_hr tamshai_finance; do
    if [ -f "\$POSTGRES_BACKUP/\${db}.sql.gz" ]; then
        echo "Restoring database: \$db"

        docker exec tamshai-postgres psql -U tamshai -d postgres -c "DROP DATABASE IF EXISTS \$db;" || true
        docker exec tamshai-postgres psql -U tamshai -d postgres -c "CREATE DATABASE \$db OWNER tamshai;"

        gunzip -c "\$POSTGRES_BACKUP/\${db}.sql.gz" | \
            docker exec -i tamshai-postgres psql -U tamshai -d "\$db"

        echo "  Restored: \$db"
    else
        echo "Backup not found for: \$db"
    fi
done

echo "PostgreSQL restore complete"
RESTORE
}

restore_mongodb_dev() {
    log_header "Restoring MongoDB (Dev)"

    local container="tamshai-mongodb"
    local mongodb_backup="$BACKUP_PATH/mongodb"

    if [ ! -d "$mongodb_backup" ]; then
        log_error "MongoDB backup not found: $mongodb_backup"
        return 1
    fi

    local archive_file="$mongodb_backup/mongodump.archive.gz"

    if [ ! -f "$archive_file" ]; then
        log_error "MongoDB archive not found: $archive_file"
        return 1
    fi

    log_info "Restoring from archive..."

    # Use mongorestore with --drop to replace existing data
    cat "$archive_file" | docker exec -i "$container" mongorestore \
        --archive \
        --gzip \
        --drop

    log_info "MongoDB restore complete"
}

restore_mongodb_stage() {
    log_header "Restoring MongoDB (Stage)"

    local vps_host="${VPS_HOST:-5.78.159.29}"
    local vps_user="${VPS_SSH_USER:-root}"

    ssh -o ConnectTimeout=30 "$vps_user@$vps_host" << RESTORE
set -e
cd /opt/tamshai

BACKUP_PATH="$BACKUP_PATH"
ARCHIVE_FILE="\$BACKUP_PATH/mongodb/mongodump.archive.gz"

if [ ! -f "\$ARCHIVE_FILE" ]; then
    echo "MongoDB archive not found: \$ARCHIVE_FILE"
    exit 1
fi

echo "Restoring from archive..."
cat "\$ARCHIVE_FILE" | docker exec -i tamshai-mongodb mongorestore \
    --archive \
    --gzip \
    --drop

echo "MongoDB restore complete"
RESTORE
}

restore_redis_dev() {
    log_header "Restoring Redis (Dev)"

    local container="tamshai-redis"
    local redis_backup="$BACKUP_PATH/redis"

    if [ ! -d "$redis_backup" ]; then
        log_warn "Redis backup not found: $redis_backup"
        return 0
    fi

    local dump_file="$redis_backup/dump.rdb.gz"

    if [ ! -f "$dump_file" ]; then
        log_warn "Redis dump not found: $dump_file"
        return 0
    fi

    log_info "Restoring Redis data..."

    # Stop Redis, copy dump, restart
    docker stop "$container"

    # Decompress and copy
    gunzip -c "$dump_file" > /tmp/redis-dump.rdb
    docker cp /tmp/redis-dump.rdb "$container:/data/dump.rdb"
    rm /tmp/redis-dump.rdb

    docker start "$container"

    log_info "Redis restore complete"
}

restore_all() {
    log_header "Full Database Restore"

    local failed=0

    if [ "$ENV" = "dev" ]; then
        restore_postgres_dev || ((failed++))
        restore_mongodb_dev || ((failed++))
        restore_redis_dev || ((failed++))
    else
        restore_postgres_stage || ((failed++))
        restore_mongodb_stage || ((failed++))
    fi

    return $failed
}

restore_postgres() {
    if [ "$ENV" = "dev" ]; then
        restore_postgres_dev
    else
        restore_postgres_stage
    fi
}

restore_mongodb() {
    if [ "$ENV" = "dev" ]; then
        restore_mongodb_dev
    else
        restore_mongodb_stage
    fi
}

show_help() {
    echo "Database Restore Script"
    echo ""
    echo "Usage: $0 [environment] [backup_path] [database]"
    echo ""
    echo "Arguments:"
    echo "  environment  - dev or stage (default: dev)"
    echo "  backup_path  - Path to backup directory (required)"
    echo "  database     - all, postgres, or mongodb (default: all)"
    echo ""
    echo "Examples:"
    echo "  $0 dev ./backups/dev/20250102_120000/"
    echo "  $0 dev ./backups/dev/20250102_120000/ postgres"
    echo "  $0 stage /opt/tamshai/backups/20250102_120000/"
    echo ""
    echo "WARNING: This will DROP and recreate databases!"
}

main() {
    # Check for help first
    if [ "${1:-}" = "help" ] || [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
        show_help
        exit 0
    fi

    # Validate backup path
    if [ -z "$BACKUP_PATH" ]; then
        log_error "Backup path is required"
        echo ""
        show_help
        exit 1
    fi

    if [ "$ENV" = "dev" ] && [ ! -d "$BACKUP_PATH" ]; then
        log_error "Backup directory not found: $BACKUP_PATH"
        exit 1
    fi

    echo "Tamshai Database Restore"
    echo "Environment: $ENV"
    echo "Backup: $BACKUP_PATH"
    echo "Database: $DATABASE"
    echo ""

    # Confirm destructive operation
    confirm_restore

    case "$DATABASE" in
        all)
            restore_all
            ;;
        postgres|pg)
            restore_postgres
            ;;
        mongodb|mongo)
            restore_mongodb
            ;;
        *)
            log_error "Unknown database: $DATABASE"
            show_help
            exit 1
            ;;
    esac

    local exit_code=$?

    log_header "Restore Summary"
    if [ $exit_code -eq 0 ]; then
        log_info "Restore completed successfully"
    else
        log_error "Restore completed with errors"
    fi

    return $exit_code
}

main "$@"
