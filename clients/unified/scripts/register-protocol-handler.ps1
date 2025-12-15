# Register com.tamshai.ai:// protocol handler for Windows development
# Run this script as Administrator

param(
    [string]$ExePath = ""
)

# If no path provided, try to find the exe
if (-not $ExePath) {
    $possiblePaths = @(
        "$PSScriptRoot\..\windows\TamshaiAiUnified.Package\bin\x64\Debug\AppX\TamshaiAiUnified\TamshaiAiUnified.exe",
        "$PSScriptRoot\..\windows\x64\Debug\TamshaiAiUnified.exe",
        "$PSScriptRoot\..\windows\TamshaiAiUnified.Package\bin\x64\Debug\TamshaiAiUnified\TamshaiAiUnified.exe"
    )

    foreach ($path in $possiblePaths) {
        $resolved = Resolve-Path $path -ErrorAction SilentlyContinue
        if ($resolved -and (Test-Path $resolved)) {
            $ExePath = $resolved.Path
            Write-Host "Found executable at: $ExePath"
            break
        }
    }
}

if (-not $ExePath -or -not (Test-Path $ExePath)) {
    Write-Error "Could not find TamshaiAiUnified.exe. Please provide path with -ExePath parameter."
    Write-Host "Usage: .\register-protocol-handler.ps1 -ExePath 'C:\path\to\TamshaiAiUnified.exe'"
    exit 1
}

$protocolName = "com.tamshai.ai"

Write-Host "Registering protocol handler: $protocolName"
Write-Host "Executable: $ExePath"

# Check for admin rights
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warning "This script requires Administrator privileges to modify the registry."
    Write-Host "Please run PowerShell as Administrator and try again."
    exit 1
}

try {
    # Create the protocol key
    $keyPath = "HKCR:\$protocolName"

    # Remove existing key if present
    if (Test-Path $keyPath) {
        Remove-Item -Path $keyPath -Recurse -Force
        Write-Host "Removed existing protocol registration"
    }

    # Create new key structure
    New-Item -Path $keyPath -Force | Out-Null
    Set-ItemProperty -Path $keyPath -Name "(Default)" -Value "URL:Tamshai AI Protocol"
    Set-ItemProperty -Path $keyPath -Name "URL Protocol" -Value ""

    # Create shell\open\command structure
    New-Item -Path "$keyPath\shell" -Force | Out-Null
    New-Item -Path "$keyPath\shell\open" -Force | Out-Null
    New-Item -Path "$keyPath\shell\open\command" -Force | Out-Null

    # Set the command to run - pass the URL as a command line argument
    # The "%1" gets replaced with the full URL (e.g., com.tamshai.ai://callback?code=...)
    $command = "`"$ExePath`" -- `"%1`""
    Set-ItemProperty -Path "$keyPath\shell\open\command" -Name "(Default)" -Value $command

    Write-Host ""
    Write-Host "SUCCESS: Protocol handler registered!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Registry key created at: HKEY_CLASSES_ROOT\$protocolName"
    Write-Host "Command: $command"
    Write-Host ""
    Write-Host "IMPORTANT: When the browser redirects to $protocolName://callback,"
    Write-Host "Windows will launch a NEW instance of the app with the URL as argument."
    Write-Host ""
    Write-Host "To test, try opening this URL in a browser:"
    Write-Host "  $protocolName://callback?test=123"
    Write-Host ""
}
catch {
    Write-Error "Failed to register protocol handler: $_"
    exit 1
}
