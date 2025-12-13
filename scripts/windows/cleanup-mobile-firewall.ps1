<#
.SYNOPSIS
    Tamshai Mobile Development - Windows Firewall Cleanup

.DESCRIPTION
    Removes all Windows Firewall rules created for mobile development.
    This script undoes changes made by setup-mobile-firewall.ps1.

.EXAMPLE
    .\scripts\windows\cleanup-mobile-firewall.ps1

.EXAMPLE
    .\scripts\windows\cleanup-mobile-firewall.ps1 -WhatIf

.PARAMETER WhatIf
    Show what rules would be removed without actually removing them

.NOTES
    Author: Tamshai Corp
    Version: 1.0.0
    Requires: Administrator privileges
    Requires: PowerShell 5.1+

.LINK
    setup-mobile-firewall.ps1 - Create firewall rules
#>

[CmdletBinding(SupportsShouldProcess=$true)]
param(
    [Parameter(Mandatory=$false)]
    [switch]$WhatIf
)

#Requires -RunAsAdministrator

# Error handling
$ErrorActionPreference = "Stop"

# Rule name prefix
$RulePrefix = "Tamshai Mobile Dev"

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
    Write-ColorOutput "║  Tamshai Mobile Development - Firewall Cleanup                ║" "Blue"
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
# Function: Find existing rules
#------------------------------------------------------------------------------
function Get-TamshaiFirewallRules {
    Write-ColorOutput "→ Searching for Tamshai firewall rules..." "Blue"

    $rules = Get-NetFirewallRule -DisplayName "$RulePrefix*" -ErrorAction SilentlyContinue

    if ($rules) {
        Write-ColorOutput "✓ Found $($rules.Count) rule(s) to remove" "Green"
        return $rules
    } else {
        Write-ColorOutput "✓ No Tamshai firewall rules found" "Green"
        return $null
    }
}

#------------------------------------------------------------------------------
# Function: Display rules to be removed
#------------------------------------------------------------------------------
function Show-RulesToRemove {
    param($Rules)

    Write-Host ""
    Write-ColorOutput "Rules to be removed:" "Yellow"
    Write-Host ""

    foreach ($rule in $Rules) {
        # Get port information
        $portFilter = $rule | Get-NetFirewallPortFilter
        $portsStr = if ($portFilter.LocalPort) {
            $portFilter.LocalPort -join ", "
        } else {
            "Any"
        }

        Write-Host "  ✗ $($rule.DisplayName)"
        Write-Host "    - Ports: $portsStr"
        Write-Host "    - Direction: $($rule.Direction)"
        Write-Host "    - Action: $($rule.Action)"
        Write-Host "    - Enabled: $($rule.Enabled)"
        Write-Host ""
    }
}

#------------------------------------------------------------------------------
# Function: Remove firewall rules
#------------------------------------------------------------------------------
function Remove-FirewallRules {
    param($Rules)

    if ($WhatIf) {
        Write-ColorOutput "→ [WHATIF] Would remove $($Rules.Count) rule(s)" "Yellow"
        return $true
    }

    Write-ColorOutput "→ Removing firewall rules..." "Blue"

    try {
        $Rules | Remove-NetFirewallRule -ErrorAction Stop
        Write-ColorOutput "✓ Removed $($Rules.Count) firewall rule(s)" "Green"
        return $true
    } catch {
        Write-ColorOutput "✗ Failed to remove firewall rules" "Red"
        Write-ColorOutput "  Error: $_" "Red"
        return $false
    }
}

#------------------------------------------------------------------------------
# Function: Verify rules were removed
#------------------------------------------------------------------------------
function Test-RulesRemoved {
    Write-ColorOutput "→ Verifying rules were removed..." "Blue"

    $remainingRules = Get-NetFirewallRule -DisplayName "$RulePrefix*" -ErrorAction SilentlyContinue

    if ($remainingRules) {
        Write-ColorOutput "✗ Some rules still exist (count: $($remainingRules.Count))" "Red"
        return $false
    } else {
        Write-ColorOutput "✓ All rules successfully removed" "Green"
        return $true
    }
}

#------------------------------------------------------------------------------
# Function: Display summary
#------------------------------------------------------------------------------
function Show-Summary {
    param(
        [int]$RemovedCount,
        [bool]$WhatIfMode
    )

    Write-Host ""

    if ($WhatIfMode) {
        Write-ColorOutput "╔════════════════════════════════════════════════════════════════╗" "Yellow"
        Write-ColorOutput "║  [WHATIF] No changes were made                                ║" "Yellow"
        Write-ColorOutput "╚════════════════════════════════════════════════════════════════╝" "Yellow"
        Write-Host ""
        Write-Host "To actually remove the rules, run:"
        Write-ColorOutput "  .\scripts\windows\cleanup-mobile-firewall.ps1" "Yellow"
    } else {
        Write-ColorOutput "╔════════════════════════════════════════════════════════════════╗" "Green"
        Write-ColorOutput "║  ✓ Firewall Rules Removed                                      ║" "Green"
        Write-ColorOutput "╚════════════════════════════════════════════════════════════════╝" "Green"
        Write-Host ""
        Write-ColorOutput "Removed Rules: $RemovedCount" "Blue"
    }

    Write-Host ""
    Write-ColorOutput "What This Means:" "Blue"
    Write-Host "  - Mobile devices can no longer connect to Tamshai services"
    Write-Host "  - Inbound connections on ports 8180, 8100, 3100-3104, 6380 are blocked"
    Write-Host "  - Local development (localhost) is unaffected"
    Write-Host ""
    Write-ColorOutput "To Re-enable Mobile Development:" "Blue"
    Write-Host "  Run: .\scripts\windows\setup-mobile-firewall.ps1"
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

    # Find existing rules
    $rules = Get-TamshaiFirewallRules

    if (-not $rules) {
        Write-Host ""
        Write-ColorOutput "Nothing to do - no Tamshai firewall rules found" "Green"
        exit 0
    }

    # Show rules to be removed
    Show-RulesToRemove $rules

    # Confirm removal (unless WhatIf)
    if (-not $WhatIf) {
        $confirmation = Read-Host "Remove $($rules.Count) firewall rule(s)? (y/N)"
        if ($confirmation -ne 'y' -and $confirmation -ne 'Y') {
            Write-ColorOutput "✗ Operation cancelled by user" "Yellow"
            exit 0
        }
    }

    # Remove rules
    $success = Remove-FirewallRules $rules

    if (-not $success) {
        exit 1
    }

    # Verify removal (skip in WhatIf mode)
    if (-not $WhatIf) {
        $verified = Test-RulesRemoved
        if (-not $verified) {
            Write-ColorOutput "⚠ Warning: Some rules may not have been removed" "Yellow"
        }
    }

    # Show summary
    Show-Summary -RemovedCount $rules.Count -WhatIfMode $WhatIf
}

# Run main
try {
    Main
} catch {
    Write-ColorOutput "Error: $_" "Red"
    exit 1
}
