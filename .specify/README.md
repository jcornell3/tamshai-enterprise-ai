# GitHub Spec Kit for Tamshai Enterprise AI

This directory contains the GitHub Spec Kit structure for managing feature specifications, implementation plans, and tasks for the Tamshai Enterprise AI project.

## Directory Structure

```
.specify/
├── memory/
│   └── constitution.md      # Symbolic link to project constitution
├── scripts/
│   ├── common.sh            # Common utility functions
│   ├── check-prerequisites.sh   # Verify Spec Kit setup
│   ├── create-new-feature.sh    # Create new feature spec
│   ├── setup-plan.sh        # Generate implementation plan
│   └── update-claude-md.sh  # Update CLAUDE.md with specs
└── specs/
    ├── 001-foundation/      # Infrastructure & Identity
    ├── 002-security-layer/  # mTLS & RLS
    ├── 003-mcp-core/        # Gateway & Prompt Defense
    ├── 004-mcp-suite/       # Domain Data Services
    ├── 005-sample-apps/     # Web Portals
    └── 006-ai-desktop/      # Electron Client
```

## Quick Start

### Check Prerequisites
```bash
cd .specify/scripts
./check-prerequisites.sh
```

### Create a New Feature Specification
```bash
cd .specify/scripts
./create-new-feature.sh --name "customer-risk-score"
```

This will:
1. Auto-generate the next spec number (e.g., 007)
2. Create a new directory under `.specify/specs/`
3. Copy templates for `spec.md`, `plan.md`, and `tasks.md`

### Update CLAUDE.md with Spec References
```bash
cd .specify/scripts
./update-claude-md.sh
```

This scans all specifications and updates `CLAUDE.md` with a summary.

## Specification Workflow

### 1. Specify Phase
When you have a new feature idea:
- Run `./create-new-feature.sh` to create the spec structure
- Edit `spec.md` to define:
  - Business intent and user story
  - Access control requirements
  - MCP tool definitions
  - User interaction scenarios
  - Success criteria

### 2. Plan Phase
Once the spec is approved:
- Edit `plan.md` to break down implementation into phases
- Define database changes, service layer logic, MCP interface, and testing
- Review the plan with the team

### 3. Task Phase
When ready to implement:
- Edit `tasks.md` to create specific, actionable tasks
- Group tasks by service boundary (Database, MCP Server, Gateway, Testing)
- Use `[P]` markers to indicate priority tasks

### 4. Implementation Phase
During development:
- Reference the constitution at `.specify/memory/constitution.md`
- Follow the patterns documented in existing specs
- Update task statuses as you complete work

## Constitution

The project constitution defines core principles and standards that all implementations must follow:

- **Article I:** Security & Zero Trust Imperative (RLS, Fail Secure, PII Masking)
- **Article II:** The Model Context Protocol (MCP) Standard
- **Article III:** Testing & Verification
- **Article IV:** Infrastructure & Consistency
- **Article V:** Client-Side Security

Read the full constitution at: [docs/architecture/constitution.md](../docs/architecture/constitution.md)

## Templates

Templates for creating new specifications are located in `.github/templates/`:

- **spec-template.md:** Feature specification template
- **plan-template.md:** Implementation plan template
- **tasks-template.md:** Task breakdown template

## Current Specifications

### 001-foundation (COMPLETED ✓)
Foundation infrastructure with Docker Compose, Keycloak, databases, and API gateway.

### 002-security-layer (IN PROGRESS ⚡)
mTLS and Row Level Security implementation for defense-in-depth.

### 003-mcp-core (CURRENT ⚡)
MCP Gateway with JWT validation, role-based routing, and prompt injection defense.

### 004-mcp-suite (PLANNED 🔲)
Domain-specific MCP servers for HR, Finance, Sales, and Support data.

### 005-sample-apps (PLANNED 🔲)
Web applications demonstrating SSO and RBAC enforcement.

### 006-ai-desktop (PLANNED 🔲)
Electron-based AI assistant with secure token storage.

## Scripts Reference

### common.sh
Utility functions used by other scripts:
- Color output functions (`log_info`, `log_success`, etc.)
- Project root detection
- Spec number management

### check-prerequisites.sh
Verifies that the GitHub Spec Kit is properly set up:
- Checks for required directories
- Validates template files
- Verifies constitution exists

### create-new-feature.sh
Creates a new feature specification:
```bash
./create-new-feature.sh --name FEATURE_NAME [--spec-number XXX]
```

### setup-plan.sh
Reviews and validates an implementation plan:
```bash
./setup-plan.sh --spec SPEC_DIR
```

### update-claude-md.sh
Updates CLAUDE.md with a summary of all specifications:
```bash
./update-claude-md.sh
```

## Tips for Writing Specifications

1. **Be Specific:** Clearly define the user story, business value, and success criteria.
2. **Security First:** Always document access control requirements and PII risks.
3. **Follow Constitution:** Reference relevant articles from the constitution.
4. **Think in Layers:** Consider how the feature affects each layer (Gateway, MCP Server, Database).
5. **Test Coverage:** Define integration tests that verify RBAC enforcement.

## Integration with Claude Code

The specifications in this directory are automatically referenced in `CLAUDE.md` to help Claude Code understand the project structure and implementation patterns. When working on a feature, Claude can:

- Reference the spec to understand requirements
- Follow the plan to implement in the correct order
- Use the task list to track progress
- Apply patterns from the constitution

---

*For more information about the Tamshai Enterprise AI project, see the main [README.md](../README.md) and [CLAUDE.md](../CLAUDE.md).*
