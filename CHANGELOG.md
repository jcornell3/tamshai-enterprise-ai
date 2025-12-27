# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

*No unreleased changes*

## [1.5.0] - 2025-12-27

### Added

#### Flutter Desktop Client
- **Flutter/Dart unified client** for Windows, macOS, Linux, iOS, and Android
- **Windows-compatible OAuth authentication** with PKCE flow using local HTTP server
- **Biometric unlock** support (Windows Hello, Face ID, Touch ID)
- **SSE streaming** for real-time AI responses
- **Chat UI** with message bubbles, truncation warnings, and approval cards
- **Secure token storage** using platform-native secure storage
- Comprehensive widget tests and Keycloak setup scripts
- "Logout Previous Session" button for session management

#### Security Remediations (Phases 1-4)
- **Phase 1 (Critical)**: JWT audience validation, application-level rate limiting
- **Phase 2 (High)**: Deprecated token query parameter for SSE, GitHub Actions pinned to SHA
- **Phase 3 (Medium)**: Strict security headers, Keycloak startup validation
- **Phase 4 (Low)**: GDPR endpoints (stub), security documentation
- Separate dev/prod Keycloak realm configurations
- Terraform refactored to use Secret Manager for all secrets
- Git history cleaned of development credentials

#### QA & Testing Infrastructure
- **Playwright E2E tests** for MCP Gateway with full authentication flow
- **k6 performance tests** with load testing scenarios
- **Comprehensive unit tests** for MCP Gateway (prompt defense, token revocation, PII scrubbing)
- **Flutter widget tests** for auth provider and UI components
- **Integration tests** for RBAC and query scenarios
- Codecov integration with **70% coverage thresholds**
- Node.js matrix builds (v20, v22)
- Flutter build verification in CI

#### DevOps & CI/CD
- **Pre-commit hooks** with gitleaks and detect-secrets for secret detection
- **Trivy container scanning** in CI pipeline
- **SBOM generation** with Anchore (SPDX and CycloneDX formats)
- qlty static analysis with TruffleHog secret scanning
- Hadolint Dockerfile linting
- ShellCheck for shell scripts

#### API & Documentation
- **OpenAPI/Swagger UI** documentation at `/api-docs`
- Comprehensive development setup in README
- Project status badge
- Security compliance and QA testing specifications
- React Native to Flutter migration documentation
- CODE_OF_CONDUCT.md

#### Infrastructure
- **VPS deployment infrastructure** (Terraform, cloud-init, Caddy)
- Path-based routing (no subdomains required)
- Dependabot configuration for all package ecosystems
- GitHub issue templates (bug report, feature request, security, QA debt)
- Pull request template

#### MCP Servers
- Budget status query with formatted output (MCP Finance)
- Query scenario integration tests
- Auto-pagination for large result sets
- "My team" query handling improvements

### Changed

- Architecture updated to v1.4.1 with Flutter Desktop complete
- Truncation warnings now injected into Claude system prompt (GAP-001)
- SSE parser handles `status: pending_confirmation` correctly (GAP-003)
- Keycloak claim validation warnings added (GAP-005)
- User claims added to access token for better AI context
- MCP HR uses queryWithRLS for user lookup in team queries

### Fixed

- SDD compliance gaps (GAP-001 through GAP-005) remediated
- Token refresh race conditions in Flutter client
- Column name in MCP HR team query (email not personal_email)
- User profile extraction from ID token on startup
- MCP Gateway 'text' type SSE event handling
- Keycloak issuer configuration
- TOTP credentials preserved during test runs
- Integration tests updated for Windows compatibility

### Security

- Pre-commit hooks prevent secret commits (gitleaks, detect-secrets)
- Trivy container image scanning
- tfsec Terraform security scanning
- GitHub Actions pinned to SHA commits
- Rate limiting: 100/min general, 10/min AI queries
- Token query parameter deprecated (security risk)
- Development credentials separated from production configs

### Deprecated

- **Spec 006 (Electron Desktop)**: Superseded by Flutter (ADR-004 → ADR-005)
- **Spec 008 (React Native Unified)**: Superseded by Flutter due to Windows instability
- GET `/api/query` with token in query parameter (use POST with Authorization header)

### Removed

- React Native Windows client code (replaced by Flutter)
- Electron desktop client code (replaced by Flutter)

## [1.4.0] - 2025-12-03

### Added

- MCP Operational Review updates (v1.4)
- SSE transport protocol specification
- LLM-friendly error schemas
- Truncation warning requirement
- Human-in-the-loop requirement for write operations
- Detailed GCP cost breakdown

### Changed

- Updated architecture document to v1.4

## [1.3.0] - 2025-11-29

### Added

- Deep security review updates (v1.3)
- LLM data handling specifications
- Admin MFA (WebAuthn) requirements
- Device posture and JML process details
- Encryption at rest and network segmentation
- Backup/DR and SIEM readiness sections
- Rate limiting and error handling guidelines

### Changed

- Updated architecture document to v1.3

## [1.2.0] - 2025-11-29

### Added

- Security review findings (v1.2)
- Prompt injection defense strategies
- mTLS for East-West traffic
- Row Level Security (RLS) implementation details
- Token revocation handling
- MFA recovery workflow
- High Availability (HA) cost estimates

### Changed

- Updated architecture document to v1.2

## [1.1.0] - 2025-11-29

### Added

- MFA and hierarchical access model
- Sample application definitions
- Security architecture diagram

### Changed

- Updated architecture document to v1.1

## [1.0.0] - 2025-11-28

### Added

- Initial architecture specification
- Constitutional framework (5 articles)
- MCP Gateway design
- Keycloak SSO integration
- Docker Compose development environment
- Sample data for HR, Finance, Sales, Support
- Basic documentation

---

[Unreleased]: https://github.com/jcornell3/tamshai-enterprise-ai/compare/v1.5.0...HEAD
[1.5.0]: https://github.com/jcornell3/tamshai-enterprise-ai/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/jcornell3/tamshai-enterprise-ai/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/jcornell3/tamshai-enterprise-ai/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/jcornell3/tamshai-enterprise-ai/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/jcornell3/tamshai-enterprise-ai/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/jcornell3/tamshai-enterprise-ai/releases/tag/v1.0.0
