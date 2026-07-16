# Removes the TengaPOS Print Agent from this till: stops it, deletes the
# scheduled task, and releases the reserved port. Run elevated.

#Requires -RunAsAdministrator

$Port = 38471
$TaskName = "TengaPOS Print Agent"
$InstallDir = "$env:ProgramData\TengaPOS\PrintAgent"

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
netsh http delete urlacl url="http://+:$Port/" 2>$null | Out-Null
Remove-Item -Recurse -Force -Path $InstallDir -ErrorAction SilentlyContinue

Write-Host "TengaPOS Print Agent removed." -ForegroundColor Green
