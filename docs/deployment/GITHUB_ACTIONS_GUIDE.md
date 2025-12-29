# GitHub Actions CI/CD Pipeline Guide

Complete guide to understanding, configuring, and operating the Tamshai DevSecOps pipeline.

## Table of Contents
1. [Overview](#overview)
2. [Pipeline Architecture](#pipeline-architecture)
3. [Stage-by-Stage Breakdown](#stage-by-stage-breakdown)
4. [Configuration](#configuration)
5. [Usage Guide](#usage-guide)
6. [Security Tools Explained](#security-tools-explained)
7. [Troubleshooting](#troubleshooting)
8. [Customization](#customization)
9. [Best Practices](#best-practices)

## Overview

### What This Pipeline Does

The `deploy.yml` workflow provides a complete DevSecOps pipeline that:

1. **Scans for vulnerabilities** in code, dependencies, containers, and infrastructure
2. **Builds and tests** your application
3. **Plans infrastructure changes** with Terraform
4. **Deploys to staging** automatically (develop branch)
5. **Deploys to production** with manual approval (main branch)
6. **Verifies deployment** with health checks and E2E tests
7. **Logs everything** for audit and compliance

### Pipeline Flow

```
┌──────────────────────────────────────────────────────────────┐
│                    Developer Push                            │
│                          │                                   │
│                          ▼                                   │
│                  ┌───────────────┐                          │
│                  │  Code Quality │                          │
│                  │   & Linting   │                          │
│                  └───────┬───────┘                          │
│                          │                                   │
│                          ▼                                   │
│              ┌───────────────────────┐                      │
│              │  Security Scanning    │                      │
│              │  • Code (SAST)        │                      │
│              │  • Secrets            │                      │
│              │  • Dependencies       │                      │
│              │  • Containers         │                      │
│              │  • Infrastructure     │                      │
│              └───────────┬───────────┘                      │
│                          │                                   │
│                          ▼                                   │
│                  ┌───────────────┐                          │
│                  │ Build & Test  │                          │
│                  └───────┬───────┘                          │
│                          │                                   │
│                          ▼                                   │
│                  ┌───────────────┐                          │
│                  │ Terraform Plan│                          │
│                  └───────┬───────┘                          │
│                          │                                   │
│              ┌───────────┴──────────────┐                   │
│              │                           │                   │
│              ▼                           ▼                   │
│    ┌──────────────────┐      ┌──────────────────┐          │
│    │ Deploy Staging   │      │Deploy Production │          │
│    │  (auto)          │      │ (manual approval)│          │
│    └──────────────────┘      └──────────────────┘          │
│                                         │                    │
│                                         ▼                    │
│                              ┌──────────────────┐           │
│                              │ Post-Deploy Tests│           │
│                              └──────────────────┘           │
└──────────────────────────────────────────────────────────────┘
```

## Pipeline Architecture

### 7 Main Stages

**Stage 1: Code Quality (2-3 minutes)**
- Python formatting (Black)
- Linting (Flake8, Pylint)
- Type checking (MyPy)
- Runs on: Every push and PR

**Stage 2: Security Scanning (5-7 minutes)**
- Secret detection (GitGuardian)
- SAST (Semgrep)
- Dependency scanning (Safety, Snyk)
- Container scanning (Trivy, Grype)
- Runs on: Every push and PR

**Stage 3: Infrastructure Security (2-3 minutes)**
- Terraform validation
- Infrastructure scanning (tfsec, Checkov)
- Runs on: Every push and PR

**Stage 4: Build & Test (3-5 minutes)**
- Docker image building
- Unit tests
- Integration tests
- Coverage reporting
- Runs on: After security passes

**Stage 5: Terraform Plan (1-2 minutes)**
- Infrastructure change preview
- Cost estimation
- Plan saved for apply
- Runs on: After build & test

**Stage 6: Deploy to Staging (2-3 minutes)**
- Automatic deployment
- Secrets from Vault
- Health checks
- Runs on: `develop` branch only

**Stage 7: Deploy to Production (5-10 minutes)**
- Manual approval required
- Terraform apply
- Blue-green deployment
- Health checks
- Smoke tests
- Runs on: `main` branch only

**Total Pipeline Time:**
- PR/Push to develop: ~15-20 minutes (including staging deploy)
- Production deploy: ~20-30 minutes (including approval wait)

## Stage-by-Stage Breakdown

### Stage 1: Code Quality

```yaml
code-quality:
  name: Code Quality & Linting
  runs-on: ubuntu-latest
  steps:
    - name: Checkout code
      uses: actions/checkout@v4
      with:
        fetch-depth: 0  # Full history for better analysis
    
    - name: Set up Python
      uses: actions/setup-python@v5
      with:
        python-version: '3.11'
        cache: 'pip'
    
    - name: Install dependencies
      run: |
        pip install -r requirements.txt
        pip install pylint black flake8 mypy
    
    - name: Run Black (formatter check)
      run: black --check .
    
    - name: Run Flake8
      run: flake8 . --count --select=E9,F63,F7,F82 --show-source --statistics
    
    - name: Run Pylint
      run: pylint **/*.py --exit-zero
    
    - name: Run MyPy (type checking)
      run: mypy . --ignore-missing-imports
```

**What it does:**
- **Black**: Checks if code is formatted correctly
- **Flake8**: Finds syntax errors and code smells
- **Pylint**: Deep code analysis (errors, warnings, conventions)
- **MyPy**: Type checking for Python

**When it fails:**
- Formatting issues → Run `black .` locally
- Syntax errors → Fix code errors
- Type errors → Add type hints or ignore with `# type: ignore`

**Skip this stage:**
```yaml
# Add to job:
if: github.event_name != 'pull_request' || contains(github.event.head_commit.message, '[skip-lint]')
```

### Stage 2: Security Scanning - Code

```yaml
security-scan-code:
  name: Security - Code Scanning
  runs-on: ubuntu-latest
  permissions:
    security-events: write
    actions: read
    contents: read
  steps:
    # GitGuardian - Secret Detection
    - name: GitGuardian Scan
      uses: GitGuardian/ggshield-action@v1
      env:
        GITGUARDIAN_API_KEY: ${{ secrets.GITGUARDIAN_API_KEY }}
    
    # Semgrep - SAST
    - name: Run Semgrep
      uses: returntocorp/semgrep-action@v1
      with:
        config: >-
          p/security-audit
          p/python
          p/docker
          p/ci
    
    # Safety - Python Dependency Scanning
    - name: Run Safety (Python)
      run: |
        pip install safety
        safety check --json --continue-on-error
    
    # Snyk - Multi-language Dependency Scanning
    - name: Snyk Security Scan
      uses: snyk/actions/python@master
      continue-on-error: true
      env:
        SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
      with:
        args: --severity-threshold=high
```

**What it does:**
- **GitGuardian**: Scans for hardcoded secrets (API keys, passwords, tokens)
- **Semgrep**: Static analysis for security vulnerabilities
- **Safety**: Checks Python dependencies for known CVEs
- **Snyk**: Multi-language dependency scanning

**When it fails:**
- Secret detected → Remove and rotate the secret
- Vulnerability found → Update dependency or apply patch
- High severity CVE → Must fix before merge

**Optional: Make secret scanning required**
```yaml
# Remove continue-on-error to block on findings
- name: GitGuardian Scan
  uses: GitGuardian/ggshield-action@v1
  # Remove: continue-on-error: true
```

### Stage 3: Security Scanning - Containers

```yaml
security-scan-containers:
  name: Security - Container Scanning
  runs-on: ubuntu-latest
  steps:
    - name: Build Docker images
      run: docker-compose build
    
    - name: Run Trivy vulnerability scanner
      uses: aquasecurity/trivy-action@master
      with:
        image-ref: 'tamshai-api:latest'
        format: 'sarif'
        output: 'trivy-results.sarif'
        severity: 'CRITICAL,HIGH'
    
    - name: Upload Trivy results to GitHub Security
      uses: github/codeql-action/upload-sarif@v3
      with:
        sarif_file: 'trivy-results.sarif'
    
    - name: Run Grype
      uses: anchore/scan-action@v3
      with:
        image: 'tamshai-api:latest'
        severity-cutoff: high
        fail-build: true
```

**What it does:**
- **Trivy**: Scans container images for OS and language vulnerabilities
- **Grype**: Alternative scanner for redundancy
- **SARIF upload**: Results appear in GitHub Security tab

**When it fails:**
- Update base image (e.g., `ubuntu:22.04` → `ubuntu:24.04`)
- Update vulnerable packages in Dockerfile
- Pin specific package versions

**Viewing results:**
- Go to: Repository → Security → Code scanning alerts
- Filter by: Container scanning

### Stage 4: Infrastructure Security

```yaml
terraform-security:
  name: Terraform Security Scanning
  runs-on: ubuntu-latest
  defaults:
    run:
      working-directory: ./terraform
  steps:
    - name: Setup Terraform
      uses: hashicorp/setup-terraform@v3
      with:
        terraform_version: ${{ env.TERRAFORM_VERSION }}
        cli_config_credentials_token: ${{ secrets.TF_API_TOKEN }}
    
    - name: Terraform Format Check
      run: terraform fmt -check -recursive
    
    - name: Terraform Init
      run: terraform init
    
    - name: Terraform Validate
      run: terraform validate
    
    - name: tfsec Security Scan
      uses: aquasecurity/tfsec-action@v1.0.3
      with:
        working_directory: ./terraform
        soft_fail: false
    
    - name: Checkov Scan
      uses: bridgecrewio/checkov-action@master
      with:
        directory: ./terraform
        framework: terraform
        soft_fail: true
```

**What it does:**
- **tfsec**: Scans Terraform for security misconfigurations
- **Checkov**: Policy-as-code scanning
- **Terraform validate**: Syntax and configuration validation

**Common issues:**
```hcl
# Issue: S3 bucket not encrypted
resource "aws_s3_bucket" "example" {
  bucket = "my-bucket"
  # Fix: Add encryption
  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        sse_algorithm = "AES256"
      }
    }
  }
}

# Issue: Security group too permissive
resource "aws_security_group_rule" "example" {
  type        = "ingress"
  from_port   = 22
  to_port     = 22
  protocol    = "tcp"
  cidr_blocks = ["0.0.0.0/0"]  # ❌ Too open
  # Fix: Restrict to specific IPs
  # cidr_blocks = ["1.2.3.4/32"]
}
```

### Stage 5: Build & Test

```yaml
build-and-test:
  name: Build and Test
  runs-on: ubuntu-latest
  needs: [code-quality, security-scan-code]
  steps:
    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v3
    
    - name: Build Docker images
      run: docker-compose build
    
    - name: Run unit tests
      run: |
        docker-compose run --rm api pytest tests/ -v --cov=app --cov-report=xml
    
    - name: Run integration tests
      run: |
        docker-compose up -d
        sleep 10  # Wait for services
        docker-compose run --rm api pytest tests/integration/ -v
        docker-compose down
    
    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage.xml
```

**What it does:**
- Builds Docker images
- Runs unit tests with coverage
- Runs integration tests
- Uploads coverage report

**Test requirements:**
```python
# tests/test_example.py
def test_api_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"

# tests/integration/test_database.py
def test_database_connection():
    db = get_database()
    result = db.execute("SELECT 1")
    assert result is not None
```

**Debugging failed tests:**
```yaml
# Add to see test output
- name: Run unit tests
  run: |
    docker-compose run --rm api pytest tests/ -v -s  # -s shows print statements
```

### Stage 6: Terraform Plan

```yaml
terraform-plan:
  name: Terraform Plan
  runs-on: ubuntu-latest
  needs: [terraform-security, build-and-test]
  outputs:
    plan_status: ${{ steps.plan.outcome }}
  steps:
    - name: Terraform Init
      run: terraform init
    
    - name: Terraform Plan
      id: plan
      run: |
        terraform plan -no-color -out=tfplan
        terraform show -no-color tfplan > plan.txt
    
    - name: Upload plan
      uses: actions/upload-artifact@v4
      with:
        name: terraform-plan
        path: terraform/tfplan
        retention-days: 5
    
    - name: Comment PR with plan
      if: github.event_name == 'pull_request'
      uses: actions/github-script@v7
      with:
        script: |
          const fs = require('fs');
          const plan = fs.readFileSync('terraform/plan.txt', 'utf8');
          const output = `#### Terraform Plan 📖
          
          <details><summary>Show Plan</summary>
          
          \`\`\`
          ${plan}
          \`\`\`
          
          </details>`;
          
          github.rest.issues.createComment({
            issue_number: context.issue.number,
            owner: context.repo.owner,
            repo: context.repo.repo,
            body: output
          });
```

**What it does:**
- Creates Terraform plan (what will change)
- Saves plan for later apply
- Comments plan on PR for review

**Reading Terraform Plans:**
```
# Green + means resource will be created
+ resource "hcloud_server" "tamshai_prod" {
    + name = "tamshai-prod-01"
    ...
  }

# Yellow ~ means resource will be modified
~ resource "hcloud_firewall" "tamshai" {
    ~ rule {
      - port = "22"
      + port = "2222"
    }
  }

# Red - means resource will be destroyed
- resource "hcloud_server" "old_server" {
    - name = "old-server"
    ...
  }
```

### Stage 7: Deploy to Staging

```yaml
deploy-staging:
  name: Deploy to Staging
  runs-on: ubuntu-latest
  needs: [terraform-plan]
  if: github.ref == 'refs/heads/develop'
  environment:
    name: staging
    url: https://staging.tamshai.com
  steps:
    - name: Get secrets from Vault
      uses: hashicorp/vault-action@v2
      id: vault
      with:
        url: ${{ secrets.VAULT_ADDR }}
        method: approle
        roleId: ${{ secrets.VAULT_ROLE_ID }}
        secretId: ${{ secrets.VAULT_SECRET_ID }}
        secrets: |
          kv/data/staging/database password | DB_PASSWORD ;
          kv/data/staging/keycloak client_secret | KEYCLOAK_SECRET
    
    - name: Deploy to Staging VPS
      uses: appleboy/ssh-action@master
      env:
        DB_PASSWORD: ${{ steps.vault.outputs.DB_PASSWORD }}
        KEYCLOAK_SECRET: ${{ steps.vault.outputs.KEYCLOAK_SECRET }}
      with:
        host: ${{ secrets.STAGING_HOST }}
        username: deploy
        key: ${{ secrets.SSH_PRIVATE_KEY }}
        envs: DB_PASSWORD,KEYCLOAK_SECRET
        script: |
          cd /opt/tamshai-staging
          
          # Create .env from Vault secrets
          cat > .env <<EOF
          DB_PASSWORD=${DB_PASSWORD}
          KEYCLOAK_CLIENT_SECRET=${KEYCLOAK_SECRET}
          EOF
          
          # Deploy
          docker-compose pull
          docker-compose up -d
          
          # Health check
          sleep 10
          curl -f http://localhost:8000/health || exit 1
          
          # Cleanup
          docker system prune -af
```

**What it does:**
- Triggers on push to `develop` branch
- Fetches secrets from Vault
- SSHes into staging VPS
- Creates `.env` file with secrets
- Deploys via docker-compose
- Runs health check
- Cleans up old images

**Troubleshooting staging deploy:**
```bash
# SSH into staging VPS
ssh deploy@<STAGING_IP>

# Check logs
cd /opt/tamshai-staging
docker-compose logs -f

# Check services
docker-compose ps

# Restart if needed
docker-compose restart api
```

### Stage 8: Deploy to Production

```yaml
deploy-production:
  name: Deploy to Production
  runs-on: ubuntu-latest
  needs: [terraform-plan]
  if: github.ref == 'refs/heads/main'
  environment:
    name: production
    url: https://tamshai.com
  steps:
    - name: Terraform Apply
      run: |
        terraform init
        terraform apply tfplan
    
    - name: Get production secrets from Vault
      uses: hashicorp/vault-action@v2
      id: vault
      with:
        url: ${{ secrets.VAULT_ADDR }}
        method: approle
        roleId: ${{ secrets.VAULT_ROLE_ID }}
        secretId: ${{ secrets.VAULT_SECRET_ID }}
        secrets: |
          kv/data/production/database password | DB_PASSWORD ;
          kv/data/production/keycloak client_secret | KEYCLOAK_SECRET
    
    - name: Deploy to Production VPS
      uses: appleboy/ssh-action@master
      env:
        DB_PASSWORD: ${{ steps.vault.outputs.DB_PASSWORD }}
        COMMIT_SHA: ${{ github.sha }}
      with:
        host: ${{ secrets.PRODUCTION_HOST }}
        username: deploy
        key: ${{ secrets.SSH_PRIVATE_KEY }}
        envs: DB_PASSWORD,COMMIT_SHA
        script: |
          cd /opt/tamshai
          
          # Backup database
          docker-compose exec -T postgres pg_dump -U tamshai tamshai > backup_$(date +%Y%m%d_%H%M%S).sql
          
          # Create .env
          cat > .env <<EOF
          DB_PASSWORD=${DB_PASSWORD}
          COMMIT_SHA=${COMMIT_SHA}
          EOF
          
          # Blue-green deployment
          docker-compose up -d --no-deps --build api
          
          # Health check
          sleep 15
          if ! curl -f http://localhost:8000/health; then
            echo "Health check failed, rolling back"
            docker-compose rollback api
            exit 1
          fi
          
          # Update remaining services
          docker-compose up -d
          
          # Log deployment
          echo "$(date -u) - Deployed ${COMMIT_SHA}" >> /var/log/deployments.log
    
    - name: Notify deployment
      uses: 8398a7/action-slack@v3
      if: always()
      with:
        status: ${{ job.status }}
        webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

**What it does:**
- Requires manual approval (configured in GitHub environment)
- Applies Terraform changes
- Backs up database before deploy
- Blue-green deployment (minimal downtime)
- Health check with automatic rollback
- Slack notification

**Manual Approval Process:**
1. Workflow pauses at production deploy
2. Approvers get notification
3. Review Terraform plan
4. Approve or reject in GitHub UI
5. Workflow continues or cancels

## Configuration

### Required GitHub Secrets

```
# Terraform Cloud
TF_API_TOKEN          = <from terraform.io user settings>

# Hetzner Cloud
HETZNER_TOKEN         = <from hetzner.com security → api tokens>

# HashiCorp Vault
VAULT_ADDR            = https://<VPS_IP>:8200
VAULT_ROLE_ID         = <from vault read auth/approle/role/github-actions/role-id>
VAULT_SECRET_ID       = <from vault write -f auth/approle/role/github-actions/secret-id>

# Deployment
PRODUCTION_HOST       = <VPS IP address>
STAGING_HOST          = <Staging VPS IP> (optional)
SSH_PRIVATE_KEY       = <contents of ~/.ssh/tamshai_rsa>

# Optional: Security Tools
GITGUARDIAN_API_KEY   = <from gitguardian.com>
SNYK_TOKEN            = <from snyk.io>

# Optional: Notifications
SLACK_WEBHOOK         = <Slack incoming webhook URL>
```

### Environment Configuration

**Create Production Environment:**
1. Go to: Settings → Environments → New environment
2. Name: `production`
3. Protection rules:
   - ✅ Required reviewers: Select 2 people
   - ✅ Wait timer: 5 minutes
4. Deployment branches: Only `main`
5. Save

**Create Staging Environment:**
1. Name: `staging`
2. Protection rules: None (auto-deploy)
3. Deployment branches: Only `develop`

### Workflow Configuration

**Enable/Disable Stages:**

```yaml
# Disable a job
security-scan-code:
  if: false  # Add this line
  
# Run only on specific branches
deploy-staging:
  if: github.ref == 'refs/heads/develop' && contains(github.event.head_commit.message, '[deploy]')

# Skip on specific commit messages
code-quality:
  if: "!contains(github.event.head_commit.message, '[skip-ci]')"
```

**Adjust Timeouts:**

```yaml
jobs:
  build-and-test:
    timeout-minutes: 30  # Default is 360 (6 hours)
```

**Parallel Execution:**

```yaml
# These run in parallel (no 'needs')
jobs:
  code-quality:
    # runs independently
  
  security-scan-code:
    # runs independently
  
  # This waits for both above
  build-and-test:
    needs: [code-quality, security-scan-code]
```

## Usage Guide

### Daily Development Workflow

**1. Create Feature Branch:**
```bash
git checkout -b feature/new-feature
# Make changes
git add .
git commit -m "feat: Add new feature"
git push origin feature/new-feature
```

**2. Open Pull Request:**
- Pipeline runs automatically
- Security scans
- Terraform plan (if infrastructure changed)
- Comments on PR with results

**3. Address Issues:**
```bash
# If code quality fails
black .
pylint app/

# If security scan fails
# Remove hardcoded secrets
# Update vulnerable dependencies
pip install --upgrade package-name

# Push fixes
git add .
git commit -m "fix: Address security findings"
git push
```

**4. Merge to Develop:**
```bash
# After PR approval
git checkout develop
git merge feature/new-feature
git push origin develop
# Triggers automatic staging deployment
```

**5. Deploy to Production:**
```bash
# Create release PR
git checkout -b release/v1.0.0
git push origin release/v1.0.0
# Get PR approved

# Merge to main
git checkout main
git merge release/v1.0.0
git push origin main
# Triggers production deployment (with approval)
```

### Emergency Hotfix Workflow

```bash
# 1. Branch from main
git checkout main
git checkout -b hotfix/critical-bug

# 2. Fix the bug
# Make minimal changes

# 3. Push and create PR to main
git push origin hotfix/critical-bug
# Open PR to main

# 4. After approval, merge
# Will trigger production deployment

# 5. Backport to develop
git checkout develop
git cherry-pick <commit-hash>
git push origin develop
```

### Viewing Pipeline Results

**GitHub UI:**
1. Go to: Actions tab
2. Click on workflow run
3. View each job's logs
4. Download artifacts (test coverage, Terraform plans)

**Security Findings:**
1. Go to: Security tab
2. Code scanning alerts
3. Filter by: Tool, severity, status

**Terraform Plans:**
- View in PR comments
- Or download artifact from Actions run

### Manual Workflow Triggers

```bash
# Via GitHub UI
# Go to: Actions → Tamshai DevSecOps Pipeline → Run workflow

# Via GitHub CLI
gh workflow run deploy.yml -f environment=staging

# Via API
curl -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/OWNER/REPO/actions/workflows/deploy.yml/dispatches \
  -d '{"ref":"main"}'
```

## Security Tools Explained

### GitGuardian
**What it scans:** Hardcoded secrets (API keys, passwords, certificates)
**How it works:** Pattern matching + machine learning
**Cost:** Free for public repos, paid for private
**Setup:** Sign up at gitguardian.com, get API key

### Semgrep
**What it scans:** Security vulnerabilities, code quality
**How it works:** Pattern-based AST analysis
**Cost:** Free (open source)
**Rulesets:**
- `p/security-audit`: Security best practices
- `p/python`: Python-specific vulnerabilities
- `p/docker`: Dockerfile security
- `p/ci`: CI/CD security

### Trivy
**What it scans:** Container OS packages, language dependencies
**How it works:** CVE database matching
**Cost:** Free (open source)
**Databases:** NVD, Alpine, Debian, Ubuntu, etc.

### tfsec
**What it scans:** Terraform misconfigurations
**How it works:** Static analysis rules
**Cost:** Free (open source)
**Example rules:**
- S3 buckets must be encrypted
- Security groups must not be 0.0.0.0/0
- IAM policies must not be too permissive

### Checkov
**What it scans:** Infrastructure as Code policies
**How it works:** Policy-as-code framework
**Cost:** Free (basic), paid (enterprise)
**Supports:** Terraform, CloudFormation, Kubernetes, Dockerfile

## Troubleshooting

### Common Issues

**Issue: "Workflow run failed"**
```yaml
# Check which job failed
# Click on failed job in GitHub UI
# View logs for error details

# Common causes:
# 1. Test failures
# 2. Security vulnerabilities found
# 3. Terraform plan has errors
# 4. Deployment health check failed
```

**Issue: "Vault authentication failed"**
```bash
# Check Vault is running
ssh root@<VPS_IP>
vault status

# Check Vault secrets are correct in GitHub
# Settings → Secrets → VAULT_ADDR, VAULT_ROLE_ID, VAULT_SECRET_ID

# Test Vault login locally
vault write auth/approle/login \
  role_id="$VAULT_ROLE_ID" \
  secret_id="$VAULT_SECRET_ID"
```

**Issue: "SSH connection failed"**
```bash
# Check SSH key is correct
# Settings → Secrets → SSH_PRIVATE_KEY

# Test SSH locally
ssh -i ~/.ssh/tamshai_rsa deploy@<VPS_IP>

# Check VPS allows SSH from GitHub Actions IPs
# GitHub uses changing IPs, so allow all or use self-hosted runner
```

**Issue: "Terraform plan shows unexpected changes"**
```bash
# Pull latest Terraform state
terraform init
terraform refresh

# Check if someone made manual changes
terraform plan

# If manual changes needed, import:
terraform import <resource_type>.<name> <id>
```

**Issue: "Docker build fails"**
```bash
# Check Dockerfile syntax
docker build -t test .

# Check if base image exists
docker pull python:3.11

# Check for network issues
# Add retry logic to workflow
```

### Debugging Tips

**Enable Debug Logging:**
```yaml
# Add to workflow
env:
  ACTIONS_RUNNER_DEBUG: true
  ACTIONS_STEP_DEBUG: true
```

**SSH into Runner (while running):**
```yaml
# Add step to workflow
- name: Setup tmate session
  uses: mxschmitt/action-tmate@v3
  if: failure()
```

**Local Testing:**
```bash
# Install act (runs GitHub Actions locally)
brew install act

# Run workflow locally
act -j build-and-test

# With secrets
act -j deploy-staging --secret-file .secrets
```

## Customization

### Add Custom Security Checks

```yaml
jobs:
  custom-security:
    runs-on: ubuntu-latest
    steps:
      - name: Check for TODO comments in production
        run: |
          if git grep -n "TODO" app/; then
            echo "ERROR: TODO comments found in production code"
            exit 1
          fi
      
      - name: Verify no test data in migrations
        run: |
          if grep -r "test@example.com" migrations/; then
            echo "ERROR: Test data in migrations"
            exit 1
          fi
```

### Add Performance Tests

```yaml
performance-tests:
  needs: [deploy-staging]
  runs-on: ubuntu-latest
  steps:
    - name: Run load tests
      run: |
        pip install locust
        locust -f tests/load_test.py \
          --host https://staging.tamshai.com \
          --users 100 \
          --spawn-rate 10 \
          --run-time 5m \
          --headless
```

### Add Database Migration Checks

```yaml
migration-check:
  runs-on: ubuntu-latest
  steps:
    - name: Check migrations are reversible
      run: |
        python manage.py migrate
        python manage.py migrate app_name zero
        python manage.py migrate
```

### Add Custom Notifications

```yaml
notify-teams:
  needs: [deploy-production]
  if: always()
  runs-on: ubuntu-latest
  steps:
    - name: Notify Microsoft Teams
      uses: aliencube/microsoft-teams-actions@v0.8.0
      with:
        webhook_uri: ${{ secrets.TEAMS_WEBHOOK }}
        title: 'Production Deployment'
        summary: 'Status: ${{ job.status }}'
```

## Best Practices

### 1. Branch Strategy

```
main (production)
  ← release/v1.0.0 (release candidates)
    ← develop (staging)
      ← feature/* (features)
      ← fix/* (bug fixes)
      ← hotfix/* (emergency fixes to main)
```

### 2. Commit Messages

```bash
# Use conventional commits
feat: Add user authentication
fix: Resolve database connection timeout
docs: Update API documentation
chore: Upgrade dependencies
test: Add integration tests for API
refactor: Simplify user service
perf: Optimize database queries

# Skip CI when needed
docs: Update README [skip-ci]
chore: Fix typo [skip-lint]
```

### 3. Secret Management

```yaml
# ❌ Never do this
env:
  API_KEY: "hardcoded-key-123"

# ✅ Always use Vault
- name: Get secrets
  uses: hashicorp/vault-action@v2
  with:
    secrets: kv/data/production/api key | API_KEY
```

### 4. Deployment Safety

```yaml
# Always include health checks
- name: Health Check
  run: |
    for i in {1..30}; do
      if curl -f http://localhost:8000/health; then
        echo "Health check passed"
        exit 0
      fi
      sleep 2
    done
    echo "Health check failed"
    exit 1

# Always have rollback strategy
- name: Deploy
  run: docker-compose up -d
  
- name: Health Check
  if: success()
  run: curl -f http://localhost:8000/health
  
- name: Rollback on failure
  if: failure()
  run: |
    docker-compose rollback
    exit 1
```

### 5. Cost Optimization

```yaml
# Use caching
- name: Cache Python packages
  uses: actions/cache@v3
  with:
    path: ~/.cache/pip
    key: ${{ runner.os }}-pip-${{ hashFiles('**/requirements.txt') }}

# Use self-hosted runners for frequent builds
jobs:
  build:
    runs-on: self-hosted  # Free, unlimited minutes
```

### 6. Testing in CI

```yaml
# Fail fast on tests
- name: Unit Tests
  run: pytest tests/ -x  # -x stops on first failure

# Parallel test execution
- name: Test Shard 1
  run: pytest tests/ --shard-id=0 --num-shards=4

# Test against multiple versions
strategy:
  matrix:
    python-version: [3.9, 3.10, 3.11]
```

## Monitoring & Observability

### Workflow Insights

```bash
# View workflow metrics
# Settings → Actions → General → Workflow run usage

# Check:
# - Average run time
# - Success rate
# - Failed runs
# - Minutes used
```

### Audit Logging

```yaml
audit-log:
  runs-on: ubuntu-latest
  if: always()
  steps:
    - name: Log deployment
      run: |
        curl -X POST https://audit.tamshai.com/events \
          -H "Content-Type: application/json" \
          -d '{
            "event": "deployment",
            "actor": "${{ github.actor }}",
            "commit": "${{ github.sha }}",
            "status": "${{ job.status }}",
            "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
          }'
```

## Next Steps

1. ✅ Understand pipeline architecture
2. ✅ Configure GitHub secrets
3. ✅ Set up environments
4. ✅ Test with feature branch
5. ⬜ Customize security checks
6. ⬜ Add monitoring/alerting
7. ⬜ Document team runbooks
8. ⬜ Train team on workflows

## Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Workflow Syntax](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions)
- [Security Hardening](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)
- [Vault GitHub Actions](https://github.com/hashicorp/vault-action)
- [Terraform GitHub Actions](https://github.com/hashicorp/setup-terraform)
