# Starts every MicroMart service and the frontend in its own PowerShell window
# in watch mode, so each one gets its own visible log.
#
# Usage (from the repo root):
#   .\start-dev.ps1           # the six Node apps + frontend (http://localhost:3006)
#   .\start-dev.ps1 -Infra    # also `docker compose up -d` the infra stack first
#
# Close a window (or Ctrl+C in it) to stop that one service.

param(
    [switch]$Infra
)

$root = $PSScriptRoot

# Same order as Full-System-Setup.md: gateway last, after everything it calls.
$apps = @(
    @{ Name = "auth";         Path = "services\auth" },
    @{ Name = "catalog";      Path = "services\catalog" },
    @{ Name = "order";        Path = "services\order" },
    @{ Name = "payment";      Path = "services\payment" },
    @{ Name = "notification"; Path = "services\notification" },
    @{ Name = "gateway";      Path = "gateway" },
    @{ Name = "frontend";     Path = "frontend"; Script = "dev" }
)

if ($Infra) {
    Write-Host "Starting infra containers..." -ForegroundColor Cyan
    docker compose -f (Join-Path $root "infra\docker-compose.yml") up -d
    if (-not $?) {
        Write-Host "docker compose failed - is Docker Desktop running?" -ForegroundColor Red
        exit 1
    }
}

foreach ($app in $apps) {
    $dir = Join-Path $root $app.Path
    if (-not (Test-Path (Join-Path $dir "package.json"))) {
        Write-Host "Skipping $($app.Name): no package.json in $dir" -ForegroundColor Yellow
        continue
    }

    $script = if ($app.Script) { $app.Script } else { "start:dev" }

    # Runs inside the new window: set its title, cd into the service, start it.
    $command = "`$Host.UI.RawUI.WindowTitle = 'MicroMart - $($app.Name)'; " +
               "Set-Location '$dir'; npm run $script"

    Start-Process powershell.exe -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $command
    Write-Host "Launched $($app.Name)" -ForegroundColor Green
}
