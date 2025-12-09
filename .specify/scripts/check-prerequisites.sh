#!/bin/bash
# Check prerequisites for GitHub Spec Kit workflow

set -e

# Source common functions
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

PROJECT_ROOT=$(get_project_root)

log_info "Checking GitHub Spec Kit prerequisites..."

# Check for required directories
log_info "Checking directory structure..."

REQUIRED_DIRS=(
    "$PROJECT_ROOT/.specify"
    "$PROJECT_ROOT/.specify/memory"
    "$PROJECT_ROOT/.specify/scripts"
    "$PROJECT_ROOT/.specify/specs"
    "$PROJECT_ROOT/.github/templates"
)

for dir in "${REQUIRED_DIRS[@]}"; do
    if dir_exists "$dir"; then
        log_success "Found: $dir"
    else
        log_error "Missing: $dir"
        exit 1
    fi
done

# Check for required template files
log_info "Checking template files..."

REQUIRED_FILES=(
    "$PROJECT_ROOT/.github/templates/spec-template.md"
    "$PROJECT_ROOT/.github/templates/plan-template.md"
    "$PROJECT_ROOT/.github/templates/tasks-template.md"
)

for file in "${REQUIRED_FILES[@]}"; do
    if file_exists "$file"; then
        log_success "Found: $file"
    else
        log_error "Missing: $file"
        exit 1
    fi
done

# Check for constitution
log_info "Checking constitution..."

if file_exists "$PROJECT_ROOT/docs/architecture/constitution.md"; then
    log_success "Found: docs/architecture/constitution.md"
else
    log_error "Missing: docs/architecture/constitution.md"
    exit 1
fi

if [ -L "$PROJECT_ROOT/.specify/memory/constitution.md" ]; then
    log_success "Found symbolic link: .specify/memory/constitution.md"
else
    log_warning "Missing symbolic link: .specify/memory/constitution.md"
fi

# Check for git repository
log_info "Checking git repository..."

if [ -d "$PROJECT_ROOT/.git" ]; then
    log_success "Git repository found"
else
    log_warning "Not a git repository"
fi

log_success "All prerequisites checked successfully!"
