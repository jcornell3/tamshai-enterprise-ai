# Gitignore Index

**Generated**: January 15, 2026
**Last Updated**: January 15, 2026
**Total Gitignore Files**: 27
**Total .example Files**: 12

This index catalogs all `.gitignore` files in the Tamshai Enterprise AI repository and documents what each pattern ignores.

**Legend**: Files marked with `[ ]` should have a corresponding `.example` file to help developers set up their environment.

---

## Root `.gitignore`

The main gitignore file at the repository root. These patterns apply globally.

### Dependencies & Build Outputs

| Pattern | Description |
|---------|-------------|
| `node_modules/` | npm/yarn package dependencies |
| `.npm/` | npm cache directory |
| `dist/` | Compiled/bundled output |
| `build/` | Build artifacts |
| `*.js.map` | JavaScript source maps |

### Environment & Configuration Files

| Pattern | Description | Has .example |
|---------|-------------|--------------|
| `.env` | Environment variables with secrets | [x] `infrastructure/docker/.env.example` |
| `.env.local` | Local environment overrides | [x] All web apps |
| `.env.*.local` | Environment-specific local overrides | [x] Via .env.example |
| `*.env` | Any environment file | [x] Via .env.example |
| `docker-compose.override.yml` | Docker Compose local overrides | [x] `docker-compose.override.yml.example` |

### IDE & Editor Files

| Pattern | Description |
|---------|-------------|
| `.idea/` | JetBrains IDE settings |
| `.vscode/` | VS Code settings |
| `*.swp` | Vim swap files |
| `*.swo` | Vim swap files |
| `*~` | Editor backup files |

### OS Files

| Pattern | Description |
|---------|-------------|
| `.DS_Store` | macOS Finder metadata |
| `Thumbs.db` | Windows thumbnail cache |

### Logs

| Pattern | Description |
|---------|-------------|
| `logs/` | Log directory |
| `*.log` | Log files |
| `npm-debug.log*` | npm debug logs |

### Test Coverage

| Pattern | Description |
|---------|-------------|
| `coverage/` | Test coverage reports |
| `.nyc_output/` | NYC coverage output |

### Terraform

| Pattern | Description | Has .example |
|---------|-------------|--------------|
| `.terraform/` | Terraform working directory | N/A |
| `*.tfstate` | Terraform state files (contain secrets) | N/A |
| `*.tfstate.*` | Terraform state backups | N/A |
| `*.tfplan` | Terraform plan files | N/A |
| `.terraform.lock.hcl` | Terraform dependency lock | N/A |
| `terraform.tfvars` | Terraform variables (may contain secrets) | [x] GCP + VPS |
| `infrastructure/terraform/vps/.keys/` | VPS SSH keys | N/A |

### Temporary Files

| Pattern | Description |
|---------|-------------|
| `tmp/` | Temporary directory |
| `temp/` | Temporary directory |
| `*.tmp` | Temporary files |

### Secrets & Credentials

| Pattern | Description | Has .example |
|---------|-------------|--------------|
| `*.pem` | PEM certificate/key files | N/A (generated) |
| `*.key` | Private key files | N/A (generated) |
| `*.crt` | Certificate files | N/A (generated) |
| `/secrets/` | Secrets directory | N/A |
| `/credentials/` | Credentials directory | N/A |
| `infrastructure/docker/certs/` | mTLS certificates (generated) | N/A |
| `keycloak/realm-export-with-secrets.json` | Keycloak realm with secrets | N/A |
| `admin_token.txt` | Admin access tokens | N/A |
| `token.json` | Token files | N/A |
| `*_credentials.json` | Credential JSON files | [x] `credentials.json.example` |
| `*_user.json` | User credential files | N/A |
| `eve_*.json` | Executive user test files | N/A |
| `claude-deployer-key.json` | GCP service account key | [x] `credentials.json.example` |

### Mobile Builds

| Pattern | Description |
|---------|-------------|
| `*.apk` | Android application packages |
| `*.aab` | Android app bundles |
| `*.ipa` | iOS application archives |
| `*.app` | macOS application bundles |
| `android/.gradle/` | Android Gradle cache |
| `android/app/build/` | Android build output |
| `ios/Pods/` | iOS CocoaPods dependencies |
| `ios/build/` | iOS build output |

### Electron Builds

| Pattern | Description |
|---------|-------------|
| `release/` | Electron release builds |

### Python

| Pattern | Description |
|---------|-------------|
| `__pycache__/` | Python bytecode cache |
| `*.pyc` | Python compiled files |
| `.venv/` | Python virtual environment |
| `venv/` | Python virtual environment |

### Local Data Directories

| Pattern | Description |
|---------|-------------|
| `minio_data/` | MinIO object storage data |
| `postgres_data/` | PostgreSQL database data |
| `mongodb_data/` | MongoDB database data |
| `elasticsearch_data/` | Elasticsearch index data |

### Claude Code / GitHub Spec Kit

| Pattern | Description |
|---------|-------------|
| `.claude/` | Claude Code local data |
| `.claude/settings.local.json` | Claude Code local settings |

### Specification Notes

| Pattern | Description |
|---------|-------------|
| `*.spec.txt` | Temporary spec notes |
| `tamshai-enterprise-ai-spec.txt` | Project spec notes |

### Playwright (E2E Testing)

| Pattern | Description |
|---------|-------------|
| `tests/e2e/playwright-report/` | Playwright HTML reports |
| `tests/e2e/test-results/` | Playwright test results |

---

## Terraform Gitignores

### `infrastructure/terraform/gcp/.gitignore`

GCP production Terraform configuration.

| Pattern | Description | Has .example |
|---------|-------------|--------------|
| `*.tfstate` | Terraform state files | N/A |
| `*.tfstate.*` | State backups | N/A |
| `.terraform/` | Terraform working directory | N/A |
| `.terraform.lock.hcl` | Dependency lock file | N/A |
| `*.tfplan` | Plan files (contain sensitive data) | N/A |
| `tfplan` | Default plan file name | N/A |
| `*.tfplan.json` | JSON plan output | N/A |
| `terraform.tfvars` | Variable definitions | [x] `terraform.tfvars.example` |
| `*.auto.tfvars` | Auto-loaded variable files | [ ] Low priority |
| `crash.log` | Terraform crash logs | N/A |
| `crash.*.log` | Crash log variants | N/A |
| `credentials.json` | GCP credentials | [x] `credentials.json.example` |
| `service-account*.json` | Service account keys | [x] `credentials.json.example` |
| `gcp-sa-key.json` | GCP service account key | [x] `credentials.json.example` |
| `cicd-sa-key.json` | CI/CD service account key | [x] `credentials.json.example` |
| `override.tf` | Terraform overrides | N/A |
| `override.tf.json` | JSON overrides | N/A |
| `*_override.tf` | Named overrides | N/A |
| `*_override.tf.json` | JSON named overrides | N/A |
| `.terraformrc` | Terraform CLI config | N/A |
| `terraform.rc` | Terraform CLI config | N/A |

### `infrastructure/terraform/dev/.gitignore`

Local development Terraform configuration.

| Pattern | Description | Has .example |
|---------|-------------|--------------|
| `*.tfstate` | Terraform state files | N/A |
| `*.tfstate.*` | State backups | N/A |
| `*.tfstate.backup` | Explicit backups | N/A |
| `.terraform/` | Terraform working directory | N/A |
| `.terraform.lock.hcl` | Dependency lock file | N/A |
| `*.tfvars.json` | JSON variable files | N/A |
| `crash.log` | Terraform crash logs | N/A |
| `crash.*.log` | Crash log variants | N/A |
| `override.tf` | Terraform overrides | N/A |
| `override.tf.json` | JSON overrides | N/A |
| `*_override.tf` | Named overrides | N/A |
| `*_override.tf.json` | JSON named overrides | N/A |
| `*.tfplan` | Plan files | N/A |
| `.keys/` | SSH keys directory | N/A |
| `.terraformrc` | Terraform CLI config | N/A |
| `terraform.rc` | Terraform CLI config | N/A |

**Note:** Dev uses `dev.tfvars` (committed) with safe defaults. Override via `TF_VAR_*` environment variables.

### `infrastructure/terraform/keycloak/.gitignore`

Keycloak Terraform provider configuration.

| Pattern | Description | Has .example |
|---------|-------------|--------------|
| `*.tfstate` | Terraform state files | N/A |
| `*.tfstate.*` | State backups | N/A |
| `*.tfstate.backup` | Explicit backups | N/A |
| `crash.log` | Terraform crash logs | N/A |
| `crash.*.log` | Crash log variants | N/A |
| `*.tfplan` | Plan files | N/A |
| `.terraform/` | Terraform working directory | N/A |
| `.terraform.lock.hcl` | Dependency lock file | N/A |
| `override.tf` | Terraform overrides | N/A |
| `override.tf.json` | JSON overrides | N/A |
| `*_override.tf` | Named overrides | N/A |
| `*_override.tf.json` | JSON named overrides | N/A |
| `.terraformrc` | Terraform CLI config | N/A |
| `terraform.rc` | Terraform CLI config | N/A |
| `secrets.tfvars` | Secrets variable file | [x] `secrets.tfvars.example` |
| `*.secret.tfvars` | Secret variable files | [x] `secrets.tfvars.example` |

---

## Flutter Gitignores

### `clients/unified_flutter/.gitignore`

Main Flutter unified client.

| Pattern | Description |
|---------|-------------|
| `*.class` | Java class files |
| `*.log` | Log files |
| `*.pyc` | Python compiled files |
| `*.swp` | Vim swap files |
| `.DS_Store` | macOS metadata |
| `.atom/` | Atom editor settings |
| `.build/` | Build directory |
| `.buildlog/` | Build logs |
| `.history` | Local history |
| `.svn/` | SVN metadata |
| `.swiftpm/` | Swift Package Manager |
| `migrate_working_dir/` | Migration working directory |
| `*.iml` | IntelliJ module files |
| `*.ipr` | IntelliJ project files |
| `*.iws` | IntelliJ workspace files |
| `.idea/` | IntelliJ settings |
| `**/doc/api/` | Generated API documentation |
| `**/ios/Flutter/.last_build_id` | iOS build tracking |
| `.dart_tool/` | Dart tool cache |
| `.flutter-plugins-dependencies` | Flutter plugin dependencies |
| `.pub-cache/` | Pub package cache |
| `.pub/` | Pub directory |
| `/build/` | Build output |
| `/coverage/` | Test coverage |
| `app.*.symbols` | Debug symbols |
| `app.*.map.json` | Obfuscation maps |
| `/android/app/debug` | Android debug builds |
| `/android/app/profile` | Android profile builds |
| `/android/app/release` | Android release builds |

### `clients/unified_flutter/android/.gitignore`

Flutter Android-specific ignores (standard Flutter template).

### `clients/unified_flutter/ios/.gitignore`

Flutter iOS-specific ignores (standard Flutter template).

### `clients/unified_flutter/macos/.gitignore`

Flutter macOS-specific ignores (standard Flutter template).

### `clients/unified_flutter/windows/.gitignore`

Flutter Windows-specific ignores (standard Flutter template).

---

## Web Client Gitignores

### `clients/web/apps/portal/.gitignore`

Portal web application (also applies to: finance, hr, sales, support).

| Pattern | Description |
|---------|-------------|
| `logs` | Log directory |
| `*.log` | Log files |
| `npm-debug.log*` | npm debug logs |
| `yarn-debug.log*` | Yarn debug logs |
| `yarn-error.log*` | Yarn error logs |
| `pnpm-debug.log*` | pnpm debug logs |
| `lerna-debug.log*` | Lerna debug logs |
| `node_modules` | npm dependencies |
| `dist` | Build output |
| `dist-ssr` | SSR build output |
| `*.local` | Local files |
| `.vscode/*` | VS Code settings (except extensions.json) |
| `!.vscode/extensions.json` | Keep VS Code extensions |
| `.idea` | IntelliJ settings |
| `.DS_Store` | macOS metadata |
| `*.suo` | Visual Studio user options |
| `*.ntvs*` | Node.js Tools for VS |
| `*.njsproj` | Node.js project files |
| `*.sln` | Visual Studio solution |
| `*.sw?` | Vim swap files |

---

## Test Gitignores

### `tests/e2e/.gitignore`

Playwright E2E tests.

| Pattern | Description |
|---------|-------------|
| `.totp-backups/` | TOTP backup files (temporary) |
| `.totp-secrets/` | TOTP secrets (persisted for test resilience) |

---

## Deprecated Client Gitignores

### `clients/desktop/.gitignore`

Electron desktop client (DEPRECATED - use unified_flutter).

### `clients/unified/.gitignore`

React Native unified client (DEPRECATED - use unified_flutter).

### `clients/unified/windows/.gitignore`

React Native Windows-specific ignores (DEPRECATED).

### `clients/unified/windows/tamshai-ai-unified/.gitignore`

React Native Windows app-specific ignores (DEPRECATED).

---

## Other Gitignores

### `.qlty/.gitignore`

Qlty code quality tool cache.

### `apps/tamshai-website/.gitignore`

Corporate website static files.

---

## Summary of .example File Status

The following patterns represent files that should have `.example` templates:

| Pattern | Location | Status | Notes |
|---------|----------|--------|-------|
| [x] `.env` | Root | **Complete** | `infrastructure/docker/.env.example` |
| [x] `.env.local` | Web apps | **Complete** | All 5 web apps have `.env.example` |
| [x] `docker-compose.override.yml` | Docker | **Complete** | `docker-compose.override.yml.example` created |
| [x] `terraform.tfvars` | Terraform dirs | **Complete** | GCP and VPS have `.tfvars.example` |
| [x] `credentials.json` | GCP | **Complete** | `credentials.json.example` created |
| [x] `secrets.tfvars` | Keycloak | **Complete** | `secrets.tfvars.example` created |
| [ ] `*.auto.tfvars` | GCP | Low priority | Not commonly used |

### All .example Files

| File | Location | Purpose |
|------|----------|---------|
| `.env.example` | `infrastructure/docker/` | Docker Compose environment template |
| `docker-compose.override.yml.example` | `infrastructure/docker/` | Docker Compose local customization template |
| `.env.example` | `clients/web/` | Web client root environment template |
| `.env.example` | `clients/web/apps/portal/` | Portal app environment template |
| `.env.example` | `clients/web/apps/finance/` | Finance app environment template |
| `.env.example` | `clients/web/apps/hr/` | HR app environment template |
| `.env.example` | `clients/web/apps/sales/` | Sales app environment template |
| `.env.example` | `clients/web/apps/support/` | Support app environment template |
| `terraform.tfvars.example` | `infrastructure/terraform/gcp/` | GCP production Terraform variables |
| `terraform.tfvars.example` | `infrastructure/terraform/vps/` | VPS staging Terraform variables |
| `secrets.tfvars.example` | `infrastructure/terraform/keycloak/` | Keycloak Terraform secrets |
| `credentials.json.example` | `infrastructure/terraform/gcp/` | GCP service account key template |
| `dev.tfvars` | `infrastructure/terraform/dev/` | Dev Terraform variables (committed, safe defaults) |

---

## Security Notes

1. **Never commit secrets**: All patterns marked with "Needs .example" contain or may contain sensitive data
2. **Use environment variables**: Prefer `$VAR` references over hardcoded values
3. **Use Terraform Cloud/Vault**: For production secrets management
4. **Rotate exposed secrets immediately**: If any ignored file is accidentally committed

---

*This index was generated January 15, 2026.*
