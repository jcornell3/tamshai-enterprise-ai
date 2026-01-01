# Set Vault Secrets Script
# Run this after copying values from the GitHub Actions job summary
# Usage: .\scripts\set-vault-secrets.ps1

$repo = "jcornell3/tamshai-enterprise-ai"

Write-Host "=== Vault Secrets Setup ===" -ForegroundColor Cyan
Write-Host "Get values from: https://github.com/$repo/actions/runs/20647438669" -ForegroundColor Yellow
Write-Host ""

# Prompt for each value
$key1 = Read-Host "Enter VAULT_UNSEAL_KEY_1"
$key2 = Read-Host "Enter VAULT_UNSEAL_KEY_2"
$key3 = Read-Host "Enter VAULT_UNSEAL_KEY_3"
$key4 = Read-Host "Enter VAULT_UNSEAL_KEY_4"
$key5 = Read-Host "Enter VAULT_UNSEAL_KEY_5"
$token = Read-Host "Enter VAULT_ROOT_TOKEN"
$addr = Read-Host "Enter VAULT_ADDR (e.g., https://5.78.159.29:8200)"

Write-Host ""
Write-Host "Setting secrets..." -ForegroundColor Green

# Set each secret
$key1 | gh secret set VAULT_UNSEAL_KEY_1 --repo $repo
$key2 | gh secret set VAULT_UNSEAL_KEY_2 --repo $repo
$key3 | gh secret set VAULT_UNSEAL_KEY_3 --repo $repo
$key4 | gh secret set VAULT_UNSEAL_KEY_4 --repo $repo
$key5 | gh secret set VAULT_UNSEAL_KEY_5 --repo $repo
$token | gh secret set VAULT_ROOT_TOKEN --repo $repo
$addr | gh secret set VAULT_ADDR --repo $repo

Write-Host ""
Write-Host "All Vault secrets set successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Delete the workflow run to remove credentials from logs"
Write-Host "2. Consider removing /root/vault-init.txt from VPS"
