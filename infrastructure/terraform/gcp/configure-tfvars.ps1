# Configure terraform.tfvars with GCP credentials
# This script helps you securely populate terraform.tfvars with values from GitHub secrets

Write-Host "`n==================================================" -ForegroundColor Cyan
Write-Host "Tamshai GCP Phase 1 - Terraform Configuration" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

Write-Host "`nThis script will help you configure terraform.tfvars with your GCP credentials."
Write-Host "You'll need to provide two values from GitHub secrets:`n"

# Get GCP Project ID
Write-Host "1. GCP_PROJECT_ID" -ForegroundColor Yellow
Write-Host "   Get from: https://github.com/jcornell3/tamshai-enterprise-ai/settings/secrets/actions"
Write-Host "   Or from: GCP Console (https://console.cloud.google.com/)`n"
$gcpProjectId = Read-Host "Enter your GCP Project ID"

# Get MongoDB Atlas URI
Write-Host "`n2. MONGODB_ATLAS_URI_PROD" -ForegroundColor Yellow
Write-Host "   Get from: https://github.com/jcornell3/tamshai-enterprise-ai/settings/secrets/actions"
Write-Host "   Or from: MongoDB Atlas (https://cloud.mongodb.com/)"
Write-Host "   Format: mongodb+srv://tamshai_app:<password>@<cluster>.mongodb.net/tamshai`n"
$mongoUri = Read-Host "Enter your MongoDB Atlas URI"

# Validate inputs
if ([string]::IsNullOrWhiteSpace($gcpProjectId)) {
    Write-Host "`nError: GCP Project ID cannot be empty" -ForegroundColor Red
    exit 1
}

if ([string]::IsNullOrWhiteSpace($mongoUri)) {
    Write-Host "`nError: MongoDB URI cannot be empty" -ForegroundColor Red
    exit 1
}

if (-not $mongoUri.StartsWith("mongodb+srv://")) {
    Write-Host "`nWarning: MongoDB URI should start with 'mongodb+srv://'" -ForegroundColor Yellow
    $continue = Read-Host "Continue anyway? (y/n)"
    if ($continue -ne "y") {
        exit 1
    }
}

# Read current terraform.tfvars
$tfvarsPath = Join-Path $PSScriptRoot "terraform.tfvars"
$content = Get-Content $tfvarsPath -Raw

# Replace placeholders
$content = $content -replace 'project_id\s*=\s*"YOUR_GCP_PROJECT_ID_HERE"', "project_id = `"$gcpProjectId`""
$content = $content -replace 'mongodb_atlas_uri\s*=\s*"YOUR_MONGODB_ATLAS_URI_HERE"', "mongodb_atlas_uri = `"$mongoUri`""

# Write updated terraform.tfvars
Set-Content -Path $tfvarsPath -Value $content -NoNewline

Write-Host "`n==================================================" -ForegroundColor Green
Write-Host "✓ terraform.tfvars configured successfully!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green

Write-Host "`nConfiguration summary:" -ForegroundColor Cyan
Write-Host "  GCP Project ID: $gcpProjectId"
Write-Host "  MongoDB URI: mongodb+srv://***@***.mongodb.net/tamshai (redacted)"
Write-Host "  File: $tfvarsPath"

Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "  1. cd infrastructure\terraform\gcp"
Write-Host "  2. terraform init"
Write-Host "  3. terraform plan"
Write-Host "  4. terraform apply"

Write-Host "`n⚠️  IMPORTANT: Never commit terraform.tfvars to git!" -ForegroundColor Red
Write-Host "   This file is gitignored and contains sensitive credentials.`n"
