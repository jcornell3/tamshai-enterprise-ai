#!/bin/bash
# =============================================================================
# Tamshai Database Backup
# =============================================================================
#
# Create backups of Tamshai databases.
#
# Usage:
#   ./backup.sh [database] [options]
#
# Databases:
#   all         - All databases (default)
#   postgres    - PostgreSQL databases (HR, Finance)
#   mongodb     - MongoDB database
#   keycloak    - Keycloak database
#
# Options:
#   --output, -o <dir>   Output directory (default: ./backups)
#   --compress           Compress with gzip
#   --timestamp          Add timestamp to filename (default)
#
# Examples:
#   ./backup.sh                      # Backup all databases
#   ./backup.sh postgres             # Backup PostgreSQL only
#   ./backup.sh --output /backups    # Custom output directory
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

DATABASE="${1:-all}"
OUTPUT_DIR="${PROJECT_ROOT}/backups"
COMPRESS=true
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Parse options
shift || true
while [ $# -gt 0 ]; do
    case "$1" in
        --output|-o) OUTPUT_DIR="$2"; shift 2 ;;
        --compress) COMPRESS=true; shift ;;
        --no-compress) COMPRESS=false; shift ;;
        *) shift ;;
    esac
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Create output directory
mkdir -p "$OUTPUT_DIR"

backup_postgres() {
    log_info "Backing up PostgreSQL databases..."

    local container="tamshai-postgres"

    if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        log_error "PostgreSQL container is not running"
        return 1
    fi

    local databases=("tamshai" "tamshai_hr" "tamshai_finance" "keycloak")

    for db in "${databases[@]}"; do
        local filename="postgres_${db}_${TIMESTAMP}.sql"
        local filepath="$OUTPUT_DIR/$filename"

        log_info "  Backing up $db..."

        docker exec "$container" pg_dump -U tamshai -d "$db" > "$filepath" 2>/dev/null || {
            log_warn "  Database $db not found or empty, skipping"
            rm -f "$filepath"
            continue
        }

        if [ "$COMPRESS" = "true" ] && [ -f "$filepath" ]; then
            gzip "$filepath"
            log_info "  Created: ${filename}.gz"
        elif [ -f "$filepath" ]; then
            log_info "  Created: $filename"
        fi
    done

    log_info "PostgreSQL backup complete"
}

backup_mongodb() {
    log_info "Backing up MongoDB..."

    local container="tamshai-mongodb"

    if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        log_error "MongoDB container is not running"
        return 1
    fi

    local filename="mongodb_${TIMESTAMP}"
    local filepath="$OUTPUT_DIR/$filename"

    # Use mongodump for MongoDB backup
    docker exec "$container" mongodump --out "/tmp/$filename" --quiet 2>/dev/null || {
        log_warn "MongoDB backup failed"
        return 1
    }

    # Copy from container
    docker cp "$container:/tmp/$filename" "$filepath"
    docker exec "$container" rm -rf "/tmp/$filename"

    if [ "$COMPRESS" = "true" ]; then
        tar -czf "${filepath}.tar.gz" -C "$OUTPUT_DIR" "$filename"
        rm -rf "$filepath"
        log_info "  Created: ${filename}.tar.gz"
    else
        log_info "  Created: $filename/"
    fi

    log_info "MongoDB backup complete"
}

backup_keycloak() {
    log_info "Backing up Keycloak realm..."

    local container="tamshai-keycloak"

    if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        log_error "Keycloak container is not running"
        return 1
    fi

    local filename="keycloak_realm_${TIMESTAMP}.json"
    local filepath="$OUTPUT_DIR/$filename"

    # Export realm configuration
    docker exec "$container" /opt/keycloak/bin/kc.sh export \
        --realm tamshai-corp \
        --file "/tmp/realm-export.json" \
        --users skip 2>/dev/null || {
            log_warn "Keycloak realm export failed (may need admin auth)"
            return 1
        }

    docker cp "$container:/tmp/realm-export.json" "$filepath"
    docker exec "$container" rm -f "/tmp/realm-export.json"

    if [ "$COMPRESS" = "true" ]; then
        gzip "$filepath"
        log_info "  Created: ${filename}.gz"
    else
        log_info "  Created: $filename"
    fi

    log_info "Keycloak backup complete"
}

show_help() {
    echo "Database Backup"
    echo ""
    echo "Usage: $0 [database] [options]"
    echo ""
    echo "Databases:"
    echo "  all        - All databases (default)"
    echo "  postgres   - PostgreSQL databases"
    echo "  mongodb    - MongoDB database"
    echo "  keycloak   - Keycloak realm export"
    echo ""
    echo "Options:"
    echo "  --output, -o <dir>   Output directory"
    echo "  --compress           Compress backups (default)"
    echo "  --no-compress        Don't compress"
    echo ""
    echo "Backups are saved to: $OUTPUT_DIR"
}

main() {
    echo "=========================================="
    echo "Tamshai Database Backup"
    echo "=========================================="
    echo "Timestamp: $TIMESTAMP"
    echo "Output: $OUTPUT_DIR"
    echo ""

    case "$DATABASE" in
        all)
            backup_postgres || true
            backup_mongodb || true
            backup_keycloak || true
            ;;
        postgres)
            backup_postgres
            ;;
        mongodb)
            backup_mongodb
            ;;
        keycloak)
            backup_keycloak
            ;;
        help|--help|-h)
            show_help
            exit 0
            ;;
        *)
            log_error "Unknown database: $DATABASE"
            echo ""
            show_help
            exit 1
            ;;
    esac

    echo ""
    echo "=========================================="
    log_info "Backup complete"
    log_info "Files saved to: $OUTPUT_DIR"
    ls -lh "$OUTPUT_DIR"/*${TIMESTAMP}* 2>/dev/null || true
}

main "$@"
