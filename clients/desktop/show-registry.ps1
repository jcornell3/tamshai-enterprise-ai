$key = "HKCU:\Software\Classes\tamshai-ai\shell\open\command"
if (Test-Path $key) {
    $cmd = (Get-ItemProperty -Path $key).'(Default)'
    Write-Host "Current command:"
    Write-Host $cmd
} else {
    Write-Host "Not registered"
}
