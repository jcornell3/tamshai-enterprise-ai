# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.4.x   | :white_check_mark: |
| < 1.4   | :x:                |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please report it responsibly.

### How to Report

**DO NOT** create a public GitHub issue for security vulnerabilities.

Instead, please report security issues via one of these methods:

1. **GitHub Security Advisories** (Preferred):
   - Go to the repository's Security tab
   - Click "Report a vulnerability"
   - Provide detailed information about the vulnerability

2. **Email**: If GitHub Security Advisories is not available, contact the repository maintainers directly.

### What to Include

Please include the following information in your report:

- **Description**: A clear description of the vulnerability
- **Impact**: The potential security impact
- **Reproduction Steps**: Step-by-step instructions to reproduce the issue
- **Affected Components**: Which services/files are affected
- **Suggested Fix**: If you have ideas on how to fix it (optional)

### Response Timeline

- **Initial Response**: Within 48 hours of submission
- **Status Update**: Within 7 days with preliminary assessment
- **Resolution Target**: Critical vulnerabilities within 14 days, others within 30 days

### What to Expect

1. **Acknowledgment**: We'll acknowledge receipt of your report promptly
2. **Assessment**: We'll investigate and determine severity
3. **Updates**: We'll keep you informed of our progress
4. **Credit**: With your permission, we'll credit you in the security advisory

### Scope

The following are in scope for security reports:

- Authentication/Authorization bypasses
- Data exposure vulnerabilities
- SQL/NoSQL injection
- Command injection
- Cross-site scripting (XSS)
- Cross-site request forgery (CSRF)
- Server-side request forgery (SSRF)
- Insecure direct object references
- Sensitive data in logs
- Secrets exposed in code
- Dependency vulnerabilities (critical severity)

### Out of Scope

- Denial of Service (DoS) attacks
- Social engineering attacks
- Physical security issues
- Issues in third-party dependencies (report upstream)
- Issues requiring unlikely user interaction
- Self-XSS

## Security Best Practices

### For Contributors

1. **Never commit secrets** - Use environment variables and `.env` files (gitignored)
2. **Validate input** - All user input must be validated and sanitized
3. **Use parameterized queries** - Prevent SQL injection
4. **Follow least privilege** - Request only necessary permissions
5. **Keep dependencies updated** - Run `npm audit` regularly
6. **Review your code** - Check for security issues before submitting PRs

### Environment Variables

Sensitive configuration must be stored in environment variables:

- `CLAUDE_API_KEY` - Anthropic API key
- `KEYCLOAK_ADMIN_PASSWORD` - Keycloak admin credentials
- `POSTGRES_PASSWORD` - Database credentials
- `JWT_SECRET` - JWT signing secret

**Never** hardcode these values or commit them to the repository.

## Security Features

This project implements defense-in-depth security:

1. **Authentication**: Keycloak OIDC with TOTP MFA
2. **Authorization**: Role-Based Access Control (RBAC)
3. **API Security**: Kong Gateway with rate limiting
4. **Input Validation**: Prompt injection defense
5. **Token Management**: Short-lived JWTs with Redis revocation
6. **Data Access**: PostgreSQL Row Level Security
7. **Static Analysis**: CodeQL, Trivy, TruffleHog via qlty
8. **Dependency Scanning**: Dependabot and OSV-Scanner

## Security Advisories

Security advisories will be published via GitHub Security Advisories. Subscribe to the repository to receive notifications.

## Acknowledgments

We thank the following individuals for responsibly disclosing security issues:

*No security issues have been reported yet.*

---

Thank you for helping keep Tamshai Enterprise AI secure!
