<#
.SYNOPSIS
    Tamshai Mobile Development - Host Discovery Script (Windows)

.DESCRIPTION
    Automatically detects the LAN IP address of the development machine and generates
    a .env.mobile file for React Native mobile app development.

.EXAMPLE
    .\scripts\discover-mobile-host.ps1

.EXAMPLE
    $env:MOBILE_HOST_IP = "192.168.1.100"
    .\scripts\discover-mobile-host.ps1

.OUTPUTS
    infrastructure/docker/.env.mobile - Environment file with host IP

.NOTES
    Author: Tamshai Corp
    Version: 1.0.0
    Requires: PowerShell 5.1+
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)]
    [string]$ManualIP = $env:MOBILE_HOST_IP
)

# Error handling
$ErrorActionPreference = "Stop"

# Configuration
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$DockerDir = Join-Path $ProjectRoot "infrastructure\docker"
$EnvFile = Join-Path $DockerDir ".env.mobile"

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
    Write-ColorOutput "║  Tamshai Mobile Development - Host Discovery                  ║" "Blue"
    Write-ColorOutput "╚════════════════════════════════════════════════════════════════╝" "Blue"
    Write-Host ""
}

#------------------------------------------------------------------------------
# Function: Detect primary LAN IP address
#------------------------------------------------------------------------------
function Get-LanIPAddress {
    Write-ColorOutput "→ Detecting LAN IP address..." "Blue"

    try {
        # Method 1: Get active network adapters with IPv4 addresses
        $networkAdapters = Get-NetIPAddress -AddressFamily IPv4 |
            Where-Object {
                $_.InterfaceAlias -notlike "*Loopback*" -and
                $_.InterfaceAlias -notlike "*Bluetooth*" -and
                $_.IPAddress -notlike "127.*" -and
                $_.IPAddress -notlike "169.254.*" -and  # APIPA addresses
                $_.PrefixOrigin -eq "Dhcp" -or $_.PrefixOrigin -eq "Manual"
            } |
            Sort-Object -Property InterfaceIndex |
            Select-Object -First 1

        if ($networkAdapters) {
            $lanIP = $networkAdapters.IPAddress
            Write-ColorOutput "✓ Detected LAN IP: $lanIP" "Green"
            return $lanIP
        }

        # Method 2: Fallback - Get default gateway route
        $defaultRoute = Get-NetRoute -DestinationPrefix "0.0.0.0/0" |
            Where-Object { $_.InterfaceAlias -notlike "*Loopback*" } |
            Select-Object -First 1

        if ($defaultRoute) {
            $adapter = Get-NetIPAddress -InterfaceIndex $defaultRoute.InterfaceIndex -AddressFamily IPv4 |
                Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
                Select-Object -First 1

            if ($adapter) {
                $lanIP = $adapter.IPAddress
                Write-ColorOutput "✓ Detected LAN IP: $lanIP" "Green"
                return $lanIP
            }
        }

        # If we get here, no valid IP found
        throw "No valid LAN IP address detected"

    } catch {
        Write-ColorOutput "✗ Failed to detect LAN IP: $_" "Red"
        Write-Host ""
        Write-Host "Please manually find your LAN IP and run:"
        Write-Host "  `$env:MOBILE_HOST_IP = `"<your-ip>`""
        Write-Host "  .\scripts\discover-mobile-host.ps1"
        Write-Host ""
        Write-Host "To find your IP, run: ipconfig"
        exit 1
    }
}

#------------------------------------------------------------------------------
# Function: Validate IP address format
#------------------------------------------------------------------------------
function Test-IPAddress {
    param([string]$IP)

    $ipRegex = "^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$"

    if ($IP -notmatch $ipRegex) {
        Write-ColorOutput "✗ Invalid IP address format: $IP" "Red"
        return $false
    }

    # Check if localhost
    if ($IP -eq "127.0.0.1") {
        Write-ColorOutput "✗ Detected localhost (127.0.0.1)" "Red"
        Write-Host ""
        Write-Host "Localhost will not work for mobile development."
        Write-Host "Please ensure your machine has a LAN connection."
        return $false
    }

    return $true
}

#------------------------------------------------------------------------------
# Function: Test connectivity
#------------------------------------------------------------------------------
function Test-Connectivity {
    param([string]$IP)

    Write-ColorOutput "→ Testing connectivity to $IP..." "Blue"

    try {
        # Test if we can create a listener on this IP (verifies it's our IP)
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse($IP), 0)
        $listener.Start()
        $listener.Stop()

        Write-ColorOutput "✓ IP is accessible" "Green"
        return $true
    } catch {
        Write-ColorOutput "⚠ Could not verify connectivity: $_" "Yellow"
        Write-ColorOutput "  Proceeding anyway..." "Yellow"
        return $true
    }
}

#------------------------------------------------------------------------------
# Function: Generate .env.mobile file
#------------------------------------------------------------------------------
function New-EnvironmentFile {
    param([string]$LanIP)

    Write-ColorOutput "→ Generating $EnvFile..." "Blue"

    # Ensure directory exists
    if (-not (Test-Path $DockerDir)) {
        New-Item -ItemType Directory -Path $DockerDir -Force | Out-Null
    }

    # Backup existing file
    if (Test-Path $EnvFile) {
        $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
        $backup = "$EnvFile.backup.$timestamp"
        Copy-Item $EnvFile $backup
        Write-ColorOutput "⚠ Backed up existing file to $(Split-Path -Leaf $backup)" "Yellow"
    }

    # Generate content
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $content = @"
# Tamshai Mobile Development - Auto-generated Environment File
#
# Generated: $timestamp
# Host IP: $LanIP
#
# This file is used by docker-compose.mobile.yml to configure services
# for React Native mobile app development over LAN.
#
# DO NOT commit this file to git (.env.mobile is in .gitignore)

#------------------------------------------------------------------------------
# HOST CONFIGURATION
#------------------------------------------------------------------------------

# Development machine's LAN IP address
MOBILE_HOST_IP=$LanIP

#------------------------------------------------------------------------------
# KEYCLOAK CONFIGURATION (Mobile Override)
#------------------------------------------------------------------------------

# Keycloak hostname (accessible from mobile device)
KC_HOSTNAME=$LanIP
KC_HOSTNAME_PORT=8180
KC_HOSTNAME_STRICT=false
KC_HOSTNAME_STRICT_HTTPS=false

# Public URL for mobile apps
KEYCLOAK_URL=http://${LanIP}:8180

#------------------------------------------------------------------------------
# MCP GATEWAY CONFIGURATION (Mobile Override)
#------------------------------------------------------------------------------

# MCP Gateway URL (accessible from mobile device)
MCP_GATEWAY_URL=http://${LanIP}:3100

# CORS origins (allow mobile app)
CORS_ORIGINS=http://${LanIP}:8100,tamshai-mobile://oauth/callback,http://localhost:*

#------------------------------------------------------------------------------
# KONG GATEWAY CONFIGURATION (Mobile Override)
#------------------------------------------------------------------------------

# Kong admin and proxy URLs
KONG_ADMIN_URL=http://${LanIP}:8001
KONG_PROXY_URL=http://${LanIP}:8100

#------------------------------------------------------------------------------
# REDIS CONFIGURATION (Mobile Override)
#------------------------------------------------------------------------------

# Redis host (for token revocation)
REDIS_HOST=$LanIP
REDIS_PORT=6380

#------------------------------------------------------------------------------
# DATABASE CONFIGURATION (Read-Only - No Override Needed)
#------------------------------------------------------------------------------

# PostgreSQL, MongoDB, Elasticsearch are accessed via MCP servers
# Mobile apps do NOT connect directly to databases

#------------------------------------------------------------------------------
# MOBILE APP CONFIGURATION
#------------------------------------------------------------------------------

# OAuth redirect URI
MOBILE_REDIRECT_URI=tamshai-mobile://oauth/callback

# App environment
NODE_ENV=development
"@

    # Write file
    Set-Content -Path $EnvFile -Value $content -Encoding UTF8

    Write-ColorOutput "✓ Generated $EnvFile" "Green"
}

#------------------------------------------------------------------------------
# Function: Display usage instructions
#------------------------------------------------------------------------------
function Show-Instructions {
    param([string]$LanIP)

    Write-Host ""
    Write-ColorOutput "╔════════════════════════════════════════════════════════════════╗" "Green"
    Write-ColorOutput "║  ✓ Mobile Development Environment Ready                       ║" "Green"
    Write-ColorOutput "╚════════════════════════════════════════════════════════════════╝" "Green"
    Write-Host ""
    Write-ColorOutput "Host IP: " "Blue" -NoNewline
    Write-Host $LanIP
    Write-Host ""
    Write-ColorOutput "Next Steps:" "Blue"
    Write-Host ""
    Write-Host "  1. Configure Windows Firewall (REQUIRED):"
    Write-ColorOutput "     .\scripts\windows\setup-mobile-firewall.ps1" "Yellow"
    Write-Host ""
    Write-Host "  2. Start Docker services with mobile override:"
    Write-ColorOutput "     cd infrastructure\docker" "Yellow"
    Write-ColorOutput "     docker compose -f docker-compose.yml -f docker-compose.mobile.yml up -d" "Yellow"
    Write-Host ""
    Write-Host "  3. Verify services are accessible from mobile device:"
    Write-ColorOutput "     curl http://${LanIP}:8180/health/ready  # Keycloak" "Yellow"
    Write-ColorOutput "     curl http://${LanIP}:3100/health        # MCP Gateway" "Yellow"
    Write-Host ""
    Write-Host "  4. Configure mobile app to use these URLs:"
    Write-Host "     - Keycloak: http://${LanIP}:8180"
    Write-Host "     - MCP Gateway: http://${LanIP}:3100"
    Write-Host "     - Kong Gateway: http://${LanIP}:8100"
    Write-Host ""
    Write-ColorOutput "Important:" "Blue"
    Write-Host "  - Ensure your mobile device is on the same network as this machine"
    Write-Host "  - Run setup-mobile-firewall.ps1 to allow inbound connections"
    Write-Host "  - Test connectivity with ping from mobile device"
    Write-Host ""
    Write-ColorOutput "Troubleshooting:" "Blue"
    Write-Host "  - Cannot connect from mobile: Run setup-mobile-firewall.ps1"
    Write-Host "  - Services unhealthy: Review docker-compose logs"
    Write-Host "  - Wrong IP detected: Set `$env:MOBILE_HOST_IP and re-run"
    Write-Host ""
}

#------------------------------------------------------------------------------
# Main Execution
#------------------------------------------------------------------------------
function Main {
    Show-Header

    # Determine LAN IP
    $lanIP = $ManualIP
    if ([string]::IsNullOrWhiteSpace($lanIP)) {
        $lanIP = Get-LanIPAddress
    } else {
        Write-ColorOutput "⚠ Using manually specified IP: $lanIP" "Yellow"
    }

    # Validate IP
    if (-not (Test-IPAddress $lanIP)) {
        exit 1
    }

    # Test connectivity
    Test-Connectivity $lanIP | Out-Null

    # Generate .env.mobile
    New-EnvironmentFile $lanIP

    # Show instructions
    Show-Instructions $lanIP
}

# Run main
try {
    Main
} catch {
    Write-ColorOutput "Error: $_" "Red"
    exit 1
}
