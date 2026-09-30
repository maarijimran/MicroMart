@echo off
rem Double-click launcher for start-dev.ps1 (bypasses the PowerShell execution policy).
rem Pass -Infra to also start the Docker infra stack: start-dev.cmd -Infra
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-dev.ps1" %*
