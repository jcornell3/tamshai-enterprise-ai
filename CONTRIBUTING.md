# Contributing to Tamshai Enterprise AI

Thank you for your interest in contributing to Tamshai Enterprise AI! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Branching Strategy](#branching-strategy)
- [Commit Message Conventions](#commit-message-conventions)
- [Testing Requirements](#testing-requirements)
- [Code Quality Standards](#code-quality-standards)
- [Pull Request Process](#pull-request-process)
- [Security Requirements](#security-requirements)

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md). We are committed to providing a welcoming and inclusive environment for all contributors.

## Getting Started

### Prerequisites

- Docker Desktop 4.0+ with Docker Compose v2+
- Node.js 20+ and npm 10+
- Flutter SDK 3.0+ (for client development)
- Terraform 1.0+ (for infrastructure changes)
- Git

### Setup

1. Fork and clone the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/tamshai-enterprise-ai.git
   cd tamshai-enterprise-ai
   ```

2. Run the setup script:
   ```bash
   ./scripts/setup-dev.sh
   ```

3. Install dependencies for the component you're working on:
   ```bash
   # MCP Gateway
   cd services/mcp-gateway && npm install

   # Flutter Client
   cd clients/unified_flutter && flutter pub get

   # Integration Tests
   cd tests/integration && npm install
   ```

## Development Workflow

1. **Create a branch** from `main` for your work
2. **Make your changes** following our coding standards
3. **Write/update tests** to cover your changes
4. **Run tests locally** to ensure they pass
5. **Commit your changes** using conventional commits
6. **Push your branch** and create a pull request

## Branching Strategy

We use a simplified GitFlow branching model:

| Branch Pattern | Purpose |
|---------------|---------|
| `main` | Production-ready code |
| `feature/*` | New features |
| `fix/*` | Bug fixes |
| `hotfix/*` | Urgent production fixes |
| `docs/*` | Documentation updates |
| `refactor/*` | Code refactoring |
| `test/*` | Test additions/updates |

### Examples

```bash
# New feature
git checkout -b feature/add-user-notifications

# Bug fix
git checkout -b fix/token-refresh-race-condition

# Documentation
git checkout -b docs/update-api-reference
```

## Commit Message Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Code style (formatting, semicolons, etc.) |
| `refactor` | Code refactoring |
| `test` | Adding or updating tests |
| `chore` | Maintenance tasks |
| `perf` | Performance improvements |
| `ci` | CI/CD changes |
| `build` | Build system changes |
| `revert` | Reverting previous commits |

### Scopes

| Scope | Component |
|-------|-----------|
| `gateway` | MCP Gateway service |
| `mcp-hr` | MCP HR server |
| `mcp-finance` | MCP Finance server |
| `mcp-sales` | MCP Sales server |
| `mcp-support` | MCP Support server |
| `flutter` | Flutter unified client |
| `web` | Web clients |
| `desktop` | Desktop client |
| `infra` | Infrastructure/Terraform |
| `docker` | Docker configuration |
| `ci` | CI/CD workflows |
| `deps` | Dependencies |

### Examples

```bash
feat(gateway): add SSE streaming support for Claude responses
fix(flutter): resolve token refresh race condition
docs(readme): update installation instructions
test(gateway): add RBAC integration tests
chore(deps): update Anthropic SDK to v0.31.0
```

## Testing Requirements

### By Language

#### Node.js (TypeScript)

```bash
cd services/mcp-gateway

# Run unit tests
npm test

# Run with coverage
npm test -- --coverage

# Run integration tests (requires services)
npm run test:integration
```

**Requirements:**
- Minimum 70% code coverage for new code
- All new features must have unit tests
- Integration tests for API endpoints

#### Flutter (Dart)

```bash
cd clients/unified_flutter

# Run tests
flutter test

# Run with coverage
flutter test --coverage

# Analyze code
flutter analyze
```

**Requirements:**
- Widget tests for new UI components
- Unit tests for services and providers
- No analyzer warnings

#### Terraform

```bash
cd infrastructure/terraform

# Validate configuration
terraform validate

# Format check
terraform fmt -check -recursive
```

**Requirements:**
- All Terraform changes must pass validation
- Code must be properly formatted

### Test Naming Conventions

| Language | Pattern |
|----------|---------|
| TypeScript | `*.test.ts`, `*.spec.ts` |
| Dart | `*_test.dart` |
| Python | `test_*.py`, `*_test.py` |

## Code Quality Standards

### Static Analysis

We use [qlty](https://qlty.sh) for static analysis. Before submitting a PR:

```bash
# Install qlty CLI
npm install -g @qltysh/qlty

# Run checks
qlty check

# Auto-fix issues
qlty fmt
```

### Linting

| Language | Tool | Config |
|----------|------|--------|
| TypeScript | ESLint | `.eslintrc.js` |
| Dart | flutter_lints | `analysis_options.yaml` |
| Shell | ShellCheck | `.qlty/configs/.shellcheckrc` |
| Docker | Hadolint | `.qlty/configs/.hadolint.yaml` |

### Formatting

| Language | Tool |
|----------|------|
| TypeScript | Prettier |
| Dart | `dart format` |
| Terraform | `terraform fmt` |

## Pull Request Process

### Before Creating a PR

- [ ] Branch is up to date with `main`
- [ ] All tests pass locally
- [ ] Code has been linted and formatted
- [ ] Documentation has been updated if needed
- [ ] Commit messages follow conventions

### PR Requirements

1. **Title**: Follow conventional commit format
2. **Description**: Complete the PR template
3. **Tests**: All CI checks must pass
4. **Review**: At least one approval required
5. **No conflicts**: Must be mergeable

### PR Template

PRs must include:
- Summary of changes
- Type of change
- Testing performed
- Risk assessment
- Related issues

## Security Requirements

### Before Submitting

- [ ] No secrets or credentials in code
- [ ] No hardcoded API keys or passwords
- [ ] Sensitive data logged appropriately (redacted)
- [ ] Input validation for all user input
- [ ] SQL/NoSQL injection prevention
- [ ] XSS prevention for any HTML output

### Dependency Changes

When adding new dependencies:
1. Check for known vulnerabilities: `npm audit` / `flutter pub outdated`
2. Verify the package is actively maintained
3. Review the package license
4. Document why the dependency is needed

### Sensitive Files

Never commit:
- `.env` files
- `*.pem`, `*.key`, `*.crt` certificates
- `credentials.json`, `secrets.json`
- `terraform.tfvars`

## Getting Help

- **Documentation**: See `CLAUDE.md` for detailed project information
- **Issues**: Create an issue for bugs or feature requests
- **Discussions**: Use GitHub Discussions for questions

## Recognition

Contributors will be recognized in:
- GitHub contributors list
- Release notes for significant contributions
- CHANGELOG.md for features and fixes

---

Thank you for contributing to Tamshai Enterprise AI!
