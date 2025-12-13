<#
.SYNOPSIS
    Tamshai Mobile Development - Windows Firewall Configuration

.DESCRIPTION
    Configures Windows Firewall to allow inbound connections for mobile development.
    Creates firewall rules for Keycloak, Kong Gateway, and MCP services.

.EXAMPLE
    .\scripts\windows\setup-mobile-firewall.ps1

.EXAMPLE
    .\scripts\windows\setup-mobile-firewall.ps1 -Force

.PARAMETER Force
    Remove existing rules before creating new ones

.NOTES
    Author: Tamshai Corp
    Version: 1.0.0
    Requires: Administrator privileges
    Requires: PowerShell 5.1+

.LINK
    cleanup-mobile-firewall.ps1 - Remove firewall rules
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)]
    [switch]$Force
)

#Requires -RunAsAdministrator

# Error handling
$ErrorActionPreference = "Stop"

# Rule name prefix
$RulePrefix = "Tamshai Mobile Dev"

# Services to configure
$Services = @(
    @{
        Name = "Keycloak (Identity Provider)"
        Ports = @(8180)
        Protocol = "TCP"
        Description = "Allow mobile devices to authenticate via Keycloak OIDC"
    },
    @{
        Name = "Kong Gateway (API Gateway)"
        Ports = @(8100, 8101)
        Protocol = "TCP"
        Description = "Allow mobile devices to access Kong Gateway (proxy + admin)"
    },
    @{
        Name = "MCP Gateway (AI Orchestration)"
        Ports = @(3100)
        Protocol = "TCP"
        Description = "Allow mobile devices to send AI queries to MCP Gateway"
    },
    @{
        Name = "MCP Servers (HR, Finance, Sales, Support)"
        Ports = @(3101, 3102, 3103, 3104)
        Protocol = "TCP"
        Description = "Allow mobile devices to access MCP servers (for direct testing)"
    },
    @{
        Name = "Redis (Token Cache)"
        Ports = @(6380)
        Protocol = "TCP"
        Description = "Allow mobile devices to connect to Redis (for testing only)"
    }
)

#------------------------------------------------------------------------------
# Function: Write colored output
#------------------------------------------------------------------------------
function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )

    $colors = @{
        "Red" = "Red"
        "Green" = "Green"
        "Yellow" = "Yellow"
        "Blue" = "Cyan"
        "White" = "White"
    }

    Write-Host $Message -ForegroundColor $colors[$Color]
}

#------------------------------------------------------------------------------
# Function: Display header
#------------------------------------------------------------------------------
function Show-Header {
    Write-ColorOutput "╔════════════════════════════════════════════════════════════════╗" "Blue"
    Write-ColorOutput "║  Tamshai Mobile Development - Firewall Configuration          ║" "Blue"
    Write-ColorOutput "╚════════════════════════════════════════════════════════════════╝" "Blue"
    Write-Host ""
}

#------------------------------------------------------------------------------
# Function: Check if running as administrator
#------------------------------------------------------------------------------
function Test-Administrator {
    $currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

#------------------------------------------------------------------------------
# Function: Remove existing rules
#------------------------------------------------------------------------------
function Remove-ExistingRules {
    Write-ColorOutput "→ Checking for existing rules..." "Blue"

    $existingRules = Get-NetFirewallRule -DisplayName "$RulePrefix*" -ErrorAction SilentlyContinue

    if ($existingRules) {
        Write-ColorOutput "  Found $($existingRules.Count) existing rule(s)" "Yellow"

        if ($Force) {
            Write-ColorOutput "→ Removing existing rules (--Force specified)..." "Blue"
            $existingRules | Remove-NetFirewallRule
            Write-ColorOutput "✓ Removed $($existingRules.Count) rule(s)" "Green"
        } else {
            Write-ColorOutput "⚠ Existing rules found. Use -Force to remove them first." "Yellow"
            Write-Host ""
            Write-Host "Existing rules:"
            $existingRules | ForEach-Object {
                Write-Host "  - $($_.DisplayName)"
            }
            Write-Host ""
            Write-Host "Run with -Force to remove existing rules:"
            Write-Host "  .\scripts\windows\setup-mobile-firewall.ps1 -Force"
            exit 1
        }
    } else {
        Write-ColorOutput "✓ No existing rules found" "Green"
    }
}

#------------------------------------------------------------------------------
# Function: Create firewall rule
#------------------------------------------------------------------------------
function New-FirewallRule {
    param(
        [string]$DisplayName,
        [int[]]$Ports,
        [string]$Protocol,
        [string]$Description
    )

    $ruleName = "$RulePrefix - $DisplayName"

    try {
        # Create inbound rule
        New-NetFirewallRule `
            -DisplayName $ruleName `
            -Direction Inbound `
            -Protocol $Protocol `
            -LocalPort $Ports `
            -Action Allow `
            -Profile Private,Domain `
            -Description $Description `
            -Enabled True `
            | Out-Null

        $portsStr = $Ports -join ", "
        Write-ColorOutput "✓ Created rule: $DisplayName (Ports: $portsStr)" "Green"

    } catch {
        Write-ColorOutput "✗ Failed to create rule: $DisplayName" "Red"
        Write-ColorOutput "  Error: $_" "Red"
        throw
    }
}

#------------------------------------------------------------------------------
# Function: Verify rules were created
#------------------------------------------------------------------------------
function Test-FirewallRules {
    Write-ColorOutput "→ Verifying firewall rules..." "Blue"

    $createdRules = Get-NetFirewallRule -DisplayName "$RulePrefix*" -ErrorAction SilentlyContinue

    if ($createdRules) {
        Write-ColorOutput "✓ Verified $($createdRules.Count) firewall rule(s)" "Green"
        return $true
    } else {
        Write-ColorOutput "✗ No firewall rules found after creation" "Red"
        return $false
    }
}

#------------------------------------------------------------------------------
# Function: Display summary
#------------------------------------------------------------------------------
function Show-Summary {
    param([int]$RuleCount)

    Write-Host ""
    Write-ColorOutput "╔════════════════════════════════════════════════════════════════╗" "Green"
    Write-ColorOutput "║  ✓ Windows Firewall Configured for Mobile Development         ║" "Green"
    Write-ColorOutput "╚════════════════════════════════════════════════════════════════╝" "Green"
    Write-Host ""
    Write-ColorOutput "Created Rules: $RuleCount" "Blue"
    Write-Host ""
    Write-ColorOutput "Allowed Ports:" "Blue"
    foreach ($service in $Services) {
        $portsStr = $service.Ports -join ", "
        Write-Host "  - $($service.Name): $portsStr"
    }
    Write-Host ""
    Write-ColorOutput "Security:" "Blue"
    Write-Host "  - Rules apply to Private and Domain network profiles only"
    Write-Host "  - Public networks (coffee shops, airports) will still block connections"
    Write-Host "  - Ensure your home/work network is set to Private or Domain profile"
    Write-Host ""
    Write-ColorOutput "Next Steps:" "Blue"
    Write-Host ""
    Write-Host "  1. Verify network profile is Private or Domain:"
    Write-ColorOutput "     Get-NetConnectionProfile" "Yellow"
    Write-Host ""
    Write-Host "  2. If network is Public, change to Private:"
    Write-ColorOutput "     Set-NetConnectionProfile -InterfaceAlias `"Wi-Fi`" -NetworkCategory Private" "Yellow"
    Write-Host ""
    Write-Host "  3. Start Docker services with mobile override:"
    Write-ColorOutput "     cd infrastructure\docker" "Yellow"
    Write-ColorOutput "     docker compose -f docker-compose.yml -f docker-compose.mobile.yml up -d" "Yellow"
    Write-Host ""
    Write-Host "  4. Test connectivity from mobile device:"
    Write-Host "     - Open browser on mobile device"
    Write-Host "     - Navigate to: http://<YOUR_IP>:8180/health/ready"
    Write-Host "     - Should see Keycloak health check response"
    Write-Host ""
    Write-ColorOutput "Troubleshooting:" "Blue"
    Write-Host "  - Still can't connect? Check network profile (step 1 above)"
    Write-Host "  - View created rules: Get-NetFirewallRule -DisplayName `"$RulePrefix*`""
    Write-Host "  - Remove rules: .\scripts\windows\cleanup-mobile-firewall.ps1"
    Write-Host "  - Test with: Test-NetConnection -ComputerName <YOUR_IP> -Port 8180"
    Write-Host ""
}

#------------------------------------------------------------------------------
# Main Execution
#------------------------------------------------------------------------------
function Main {
    # Show header
    Show-Header

    # Verify administrator
    if (-not (Test-Administrator)) {
        Write-ColorOutput "✗ This script requires administrator privileges" "Red"
        Write-Host ""
        Write-Host "Please run PowerShell as Administrator and try again:"
        Write-Host "  1. Right-click PowerShell"
        Write-Host "  2. Select 'Run as Administrator'"
        Write-Host "  3. Re-run this script"
        exit 1
    }

    Write-ColorOutput "✓ Running as Administrator" "Green"
    Write-Host ""

    # Remove existing rules if Force specified
    Remove-ExistingRules

    # Create firewall rules
    Write-ColorOutput "→ Creating firewall rules..." "Blue"

    $ruleCount = 0
    foreach ($service in $Services) {
        New-FirewallRule `
            -DisplayName $service.Name `
            -Ports $service.Ports `
            -Protocol $service.Protocol `
            -Description $service.Description

        $ruleCount++
    }

    # Verify rules
    if (-not (Test-FirewallRules)) {
        Write-ColorOutput "✗ Failed to verify firewall rules" "Red"
        exit 1
    }

    # Show summary
    Show-Summary -RuleCount $ruleCount
}

# Run main
try {
    Main
} catch {
    Write-ColorOutput "Error: $_" "Red"
    exit 1
}
