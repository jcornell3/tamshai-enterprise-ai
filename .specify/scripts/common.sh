#!/bin/bash
# Common utility functions for GitHub Spec Kit scripts

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored messages
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Get project root directory
get_project_root() {
    cd "$(dirname "$0")/../.." && pwd
}

# Check if a directory exists
dir_exists() {
    [ -d "$1" ]
}

# Check if a file exists
file_exists() {
    [ -f "$1" ]
}

# Create directory if it doesn't exist
ensure_dir() {
    if ! dir_exists "$1"; then
        mkdir -p "$1"
        log_info "Created directory: $1"
    fi
}

# Get next spec number
get_next_spec_number() {
    local project_root=$(get_project_root)
    local specs_dir="$project_root/.specify/specs"

    if ! dir_exists "$specs_dir"; then
        echo "001"
        return
    fi

    local last_spec=$(ls -1 "$specs_dir" | grep -E '^[0-9]{3}-' | sort -r | head -1 | cut -d'-' -f1)

    if [ -z "$last_spec" ]; then
        echo "001"
    else
        printf "%03d" $((10#$last_spec + 1))
    fi
}

# Validate spec number format
validate_spec_number() {
    if [[ ! "$1" =~ ^[0-9]{3}$ ]]; then
        log_error "Invalid spec number format: $1 (expected: XXX, e.g., 001)"
        return 1
    fi
    return 0
}
