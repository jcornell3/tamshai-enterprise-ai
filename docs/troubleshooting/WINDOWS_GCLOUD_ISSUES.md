# Windows/Git Bash gcloud Troubleshooting

**Created**: January 9, 2026
**Context**: GCP Phase 1 Production Deployment
**Environment**: Windows 11, Git Bash, Google Cloud SDK 551.0.0

## Summary

During GCP Phase 1 deployment, multiple issues were encountered when attempting to use `gcloud` commands programmatically from Git Bash on Windows. These issues prevented automated log retrieval and SSH access, requiring manual browser-based alternatives.

---

## Issue 1: gcloud Command Not Found in PATH After Auto-Compaction

### Problem

After Claude Code's conversation auto-compaction (memory management), the gcloud PATH configuration was lost, causing all subsequent gcloud commands to fail.

### Error Message

```bash
Exit code 127: /usr/bin/bash: line 1: gcloud: command not found
```

### Root Cause

The Google Cloud SDK installation path contains spaces:
```
C:\Users\jcorn\AppData\Local\Google Cloud SDK\google-cloud-sdk\bin\gcloud.cmd
```

This path must be explicitly added to PATH in each shell session, and the configuration was not persisted in CLAUDE.md for reference after auto-compaction.

### Solution

1. **Document PATH in CLAUDE.md** (lines 652-671):
```bash
# Windows (Git Bash / WSL)
export PATH="$PATH:/c/Users/jcorn/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin"

# Verify gcloud is accessible
gcloud --version
```

2. **Add to every Bash command**:
```bash
PATH="$PATH:/c/Users/jcorn/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin" gcloud ...
```

### Prevention

- Always document environment-specific configurations in CLAUDE.md
- Add PATH export to project-level shell scripts
- Consider creating a `.envrc` file with `direnv` for automatic PATH setup

---

## Issue 2: gcloud Commands via cmd.exe Fail with Path Spaces

### Problem

When trying to invoke gcloud through `cmd.exe` to avoid Git Bash issues, commands with paths containing spaces fail to execute.

### Error Messages

```bash
# Attempt 1: Direct path reference
'C:\Users\jcorn\AppData\Local\Google\Cloud' is not recognized as an internal or external command

# Attempt 2: Using /c/ Unix-style path
/c/Users/jcorn/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin/gcloud: line 72: readlink: command not found
```

### Root Cause

1. **Windows CMD**: Spaces in path require proper quoting, but the shell interprets the path incorrectly
2. **Git Bash with gcloud.cmd**: The `.cmd` wrapper script uses Windows-specific commands (`readlink`, `dirname`) that don't exist in Git Bash

### Attempted Solutions

```bash
# Failed Attempt 1: Direct cmd.exe invocation
cmd.exe /c "\"C:\Users\jcorn\AppData\Local\Google Cloud SDK\google-cloud-sdk\bin\gcloud.cmd\" logging read ..."
# Result: Command returns immediately without output

# Failed Attempt 2: Using gcloud without .cmd extension
export PATH="$PATH:/c/Users/jcorn/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin"
gcloud logging read ...
# Result: /usr/bin/bash: line 72: readlink: command not found

# Failed Attempt 3: Direct Python invocation
cd infrastructure/terraform/gcp && gcloud.cmd logging read ...
# Result: exec: python: not found (Python not in PATH)
```

### Working Solution

Use Git Bash with full Unix-style PATH (no spaces) and ensure all Unix utilities are available:

```bash
PATH="$PATH:/c/Users/jcorn/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin" \
  gcloud logging read "..." --project=... --format=json
```

**However**: This still fails if gcloud's wrapper script depends on Unix utilities not in Git Bash.

### Workaround

For log retrieval, use GCP Console web interface instead of CLI.

---

## Issue 3: Python Subprocess PATH Resolution

### Problem

When attempting to use Python to call gcloud programmatically (to work around Git Bash issues), subprocess fails to find the gcloud executable even with explicit PATH environment variable.

### Error Message

```python
FileNotFoundError: [WinError 2] The system cannot find the file specified
```

### Code That Failed

```python
import subprocess

result = subprocess.run(
    ['gcloud', 'auth', 'print-access-token'],
    capture_output=True,
    text=True,
    env={'PATH': '/c/Users/jcorn/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin:' + subprocess.os.environ.get('PATH', '')}
)
```

### Root Cause

1. **Path Format Mismatch**: Python on Windows expects Windows-style paths (`C:\...`), not Unix-style (`/c/...`)
2. **Executable Extension**: `gcloud` is actually `gcloud.cmd` on Windows, but subprocess.run doesn't automatically add extensions
3. **Shell Requirements**: The `.cmd` file requires `cmd.exe` to execute, not direct invocation

### Attempted Fix

```python
# Attempt 1: Use gcloud.cmd explicitly
subprocess.run(['gcloud.cmd', 'auth', 'print-access-token'], ...)
# Result: Still fails - PATH format issue

# Attempt 2: Use full Windows path
subprocess.run(['C:\\Users\\jcorn\\AppData\\Local\\Google Cloud SDK\\google-cloud-sdk\\bin\\gcloud.cmd'], ...)
# Result: File not found (space in path not handled)
```

### Working Solution (Not Implemented)

Use `shell=True` with proper quoting:

```python
import subprocess
import shlex

gcloud_path = r'"C:\Users\jcorn\AppData\Local\Google Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"'
cmd = f'{gcloud_path} auth print-access-token'

result = subprocess.run(
    cmd,
    shell=True,
    capture_output=True,
    text=True
)
```

**Security Note**: Using `shell=True` has security implications. Only use with trusted input.

---

## Issue 4: gcloud SSH Commands Timeout

### Problem

SSH commands to Compute Engine VMs via gcloud timeout during connection, preventing programmatic access to utility VMs.

### Error Message

```
WARNING: You do not have an SSH key for gcloud.
WARNING: SSH keygen will be executed to generate a key.
Updating instance ssh metadata...done.
Waiting for SSH key to propagate.
FATAL ERROR: Network error: Connection timed out
```

### Root Cause

1. **Firewall Rules**: SSH access (port 22) may be restricted by GCP firewall rules
2. **IAP Tunneling**: Instance may require Identity-Aware Proxy (IAP) for SSH
3. **Key Propagation**: New SSH keys take time to propagate to instance metadata

### Attempted Command

```bash
gcloud compute ssh tamshai-prod-mcp-gateway \
  --zone=us-central1-a \
  --project=gen-lang-client-0553641830 \
  --command="docker ps"
```

### Solution

Use GCP Console browser-based SSH instead:

1. Navigate to: Compute Engine → VM instances
2. Click "SSH" button next to instance name
3. Browser opens authenticated SSH session automatically

**Advantages**:
- No firewall configuration needed
- No local SSH key management
- Works immediately without key propagation delay

---

## Issue 5: IAM Permission Propagation Delays

### Problem

After granting `roles/logging.viewer` to the service account, log retrieval still fails with PERMISSION_DENIED errors.

### Error Message

```
ERROR: (gcloud.logging.read) PERMISSION_DENIED: Permission denied for all log views.
This command is authenticated as claude-deployer@gen-lang-client-0553641830.iam.gserviceaccount.com
```

### Root Cause

IAM permission changes can take 1-5 minutes to propagate globally. The service account credentials are cached locally and on GCP.

### Timeline

- 17:00 UTC: Granted `logging.viewer` role
- 17:02 UTC: Re-authenticated service account (`gcloud auth activate-service-account`)
- 17:03 UTC: Attempted log read - PERMISSION_DENIED
- 17:05 UTC: Attempted log read - PERMISSION_DENIED
- 17:30 UTC: Manual browser access to logs - SUCCESS (user account has permissions)

### Workaround

Use GCP Console with user account (jcore3@gmail.com) which has Owner role:

https://console.cloud.google.com/logs/viewer?project=gen-lang-client-0553641830

---

## Recommendations for Future Deployments

### 1. Use GCP Console for Interactive Tasks

**When to use browser**:
- Log viewing and analysis
- SSH access to VMs
- Debugging Cloud Run revisions
- One-time configuration tasks

**When to use CLI**:
- Automated deployments (Terraform)
- CI/CD pipelines
- Bulk operations
- Scripted tasks

### 2. Test gcloud Commands in Simple Shell First

Before using complex Bash tool invocations, test commands in a simple terminal:

```bash
# Open Windows Terminal or PowerShell
gcloud auth list
gcloud projects list
gcloud run services list --region=us-central1 --project=...
```

This verifies:
- Authentication works
- PATH is correct
- Permissions are propagated

### 3. Pre-Grant All Required Roles

Don't wait until encountering permission errors. Grant all anticipated roles upfront:

```bash
# From DEPLOYMENT_STATUS.md - all 13 roles needed:
- roles/run.admin
- roles/cloudsql.admin
- roles/compute.instanceAdmin.v1
- roles/compute.networkAdmin
- roles/compute.securityAdmin
- roles/secretmanager.admin
- roles/iam.serviceAccountAdmin
- roles/iam.serviceAccountUser
- roles/resourcemanager.projectIamAdmin
- roles/run.invoker (for specific services)
- roles/storage.admin
- roles/artifactregistry.admin
- roles/vpcaccess.admin
- roles/logging.viewer  # ADD THIS UPFRONT
```

### 4. Document Environment Configuration Prominently

**In CLAUDE.md** (project-level documentation):
- gcloud SDK PATH configuration
- Python environment setup
- Known Windows/Git Bash limitations
- Manual workarounds for blocked operations

**In DEPLOYMENT_STATUS.md** (deployment tracking):
- Issues encountered
- Solutions applied
- Manual steps required

### 5. Use Terraform Outputs for Service Information

Instead of querying gcloud repeatedly, capture information during deployment:

```hcl
# infrastructure/terraform/gcp/outputs.tf
output "mcp_gateway_url" {
  value = module.cloudrun.mcp_gateway_url
}

output "keycloak_url" {
  value = module.cloudrun.keycloak_url
}

output "mcp_suite_urls" {
  value = module.cloudrun.mcp_suite_urls
}
```

Then retrieve via:
```bash
terraform output -json > deployment-info.json
```

---

## Current Status (January 9, 2026)

**What Works**:
- ✅ Terraform infrastructure deployment (all gcloud API calls via Terraform provider)
- ✅ Docker image builds via gcloud CLI
- ✅ Service listing and status checks
- ✅ IAM role management

**What Doesn't Work Programmatically**:
- ❌ Cloud Logging log retrieval (permission propagation + PATH issues)
- ❌ SSH to Compute Engine VMs (timeout, requires IAP or browser SSH)
- ❌ Python subprocess invocation of gcloud (PATH + extension handling)

**Workaround Status**:
- ✅ Using GCP Console browser interface for logs
- ✅ Using browser-based SSH for VM access
- ✅ Manual verification steps documented

**Impact on Deployment**:
- Slows debugging but doesn't block deployment
- Requires manual log review to diagnose container failures
- All infrastructure operations work via Terraform

---

## Related Files

- `CLAUDE.md` - gcloud PATH documentation (lines 652-671)
- `infrastructure/terraform/gcp/DEPLOYMENT_STATUS.md` - Issue #16 (container startup failures)
- `docs/plans/GCP_PROD_PHASE_1_COST_SENSITIVE.md` - Updated with 13 IAM roles in Appendix B

---

*This document will be updated as new solutions are discovered or issues are resolved.*
