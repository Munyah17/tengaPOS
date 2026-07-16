# Installs the TengaPOS Print Agent on this till so it's always running in
# the background (starts automatically at login, no manual double-click).
#
# Run this ONCE per till, from an elevated ("Run as Administrator")
# PowerShell window:
#   powershell -ExecutionPolicy Bypass -File Install-TengaPrintAgent.ps1

#Requires -RunAsAdministrator

$Port = 38471
$InstallDir = "$env:ProgramData\TengaPOS\PrintAgent"
$TaskName = "TengaPOS Print Agent"

Write-Host "Installing TengaPOS Print Agent..." -ForegroundColor Cyan

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item -Path "$PSScriptRoot\TengaPOS-PrintAgent.ps1" -Destination "$InstallDir\TengaPOS-PrintAgent.ps1" -Force

# Reserve the port for the current user so the agent can start without
# needing admin rights every time it runs.
$urlAcl = netsh http show urlacl url="http://+:$Port/" 2>$null
if ($urlAcl -notmatch [regex]::Escape("http://+:$Port/")) {
    Write-Host "Reserving port $Port for $env:USERDOMAIN\$env:USERNAME..."
    netsh http add urlacl url="http://+:$Port/" user="$env:USERDOMAIN\$env:USERNAME" | Out-Null
}

# Run hidden, at logon, for the current user — restarts automatically if it
# ever stops (e.g. after Windows Update reboots the till).
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$InstallDir\TengaPOS-PrintAgent.ps1`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal | Out-Null

Write-Host "Starting it now..."
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 2

try {
    $status = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/status" -TimeoutSec 5
    Write-Host "`nSuccess — Print Agent is running." -ForegroundColor Green
    Write-Host "Default printer: $($status.defaultPrinter)"
    Write-Host "All printers seen on this machine: $($status.printers -join ', ')"
    Write-Host "`nGo back to the TengaPOS receipt screen and try 'POS Printer' again."
} catch {
    Write-Host "`nInstalled, but couldn't confirm it's responding yet. Give it a few seconds and reload the TengaPOS page, or check Task Scheduler for '$TaskName'." -ForegroundColor Yellow
}
