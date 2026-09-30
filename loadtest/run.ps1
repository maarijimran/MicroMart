# One-command load test runner.
#
#   .\loadtest\run.ps1                          # smoke test
#   .\loadtest\run.ps1 -Profile stress          # ramp to 2,000 req/s and find the breaking point
#   .\loadtest\run.ps1 -Profile steady -Rate 300 -Duration 2m
#   .\loadtest\run.ps1 -Profile ratelimit       # prove the per-IP rate limiter works
#
# What it does:
#   1. Finds k6 (on PATH, or downloads the portable binary into loadtest\.bin).
#   2. Starts a SEPARATE gateway on port 3099 from gateway\dist, pointed at your
#      running services. All k6 traffic comes from one IP, so this gateway has the
#      rate limit raised and uses its own Redis database (db 1) — your normal
#      gateway on :3000 and your own browsing are unaffected.
#   3. Runs the profile, prints the summary, saves JSON + CSV to loadtest\results.
#   4. Stops the test gateway, even if the run fails.
#
# Prerequisites: the services are running (.\start-dev.ps1) and the gateway is
# built (gateway\dist\main.js exists — `npm run build` in gateway\).

param(
    [ValidateSet('smoke', 'load', 'stress', 'spike', 'steady', 'soak', 'ratelimit')]
    [string]$Profile = 'smoke',
    [int]$Rate = 300,
    [string]$Duration = '1m',
    [int]$Port = 3099
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$repo = Split-Path $root
$results = Join-Path $root 'results'
New-Item -ItemType Directory -Force $results | Out-Null

# --- 1. k6 -------------------------------------------------------------------
$k6 = (Get-Command k6 -ErrorAction SilentlyContinue).Source
if (-not $k6) {
    $k6 = Join-Path $root '.bin\k6.exe'
    if (-not (Test-Path $k6)) {
        Write-Host 'k6 not found - downloading the portable binary...' -ForegroundColor Cyan
        $release = Invoke-RestMethod 'https://api.github.com/repos/grafana/k6/releases/latest'
        $asset = $release.assets | Where-Object { $_.name -like '*windows-amd64.zip' } | Select-Object -First 1
        $zip = Join-Path $env:TEMP $asset.name
        Invoke-WebRequest $asset.browser_download_url -OutFile $zip
        $unzipped = Join-Path $env:TEMP ('k6-' + [guid]::NewGuid())
        Expand-Archive $zip -DestinationPath $unzipped
        New-Item -ItemType Directory -Force (Join-Path $root '.bin') | Out-Null
        Move-Item (Get-ChildItem $unzipped -Recurse -Filter k6.exe | Select-Object -First 1).FullName $k6
        Remove-Item $zip, $unzipped -Recurse -Force
    }
}

# --- 2. test gateway -----------------------------------------------------------
$gatewayDir = Join-Path $repo 'gateway'
if (-not (Test-Path (Join-Path $gatewayDir 'dist\main.js'))) {
    throw 'gateway\dist\main.js not found. Run "npm run build" in gateway\ first.'
}

# The ratelimit profile keeps the normal limit (100/min) to prove it triggers.
$limit = if ($Profile -eq 'ratelimit') { '100' } else { '100000000' }
$redisDb = if ($Profile -eq 'ratelimit') { '2' } else { '1' }

$saved = @{}
$testEnv = @{
    PORT              = "$Port"
    OTEL_METRICS_PORT = "$($Port + 6400)"
    RATE_LIMIT_MAX    = $limit
    REDIS_URL         = "redis://localhost:6379/$redisDb"
}
foreach ($k in $testEnv.Keys) { $saved[$k] = [Environment]::GetEnvironmentVariable($k); [Environment]::SetEnvironmentVariable($k, $testEnv[$k]) }

$log = Join-Path $results 'test-gateway.log'
$gateway = $null
$exitCode = 1
try {
    Write-Host "Starting test gateway on :$Port ..." -ForegroundColor Cyan
    $gateway = Start-Process node -ArgumentList 'dist/main.js' -WorkingDirectory $gatewayDir -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput $log -RedirectStandardError "$log.err"
    foreach ($k in $testEnv.Keys) { [Environment]::SetEnvironmentVariable($k, $saved[$k]) }

    $ready = $false
    for ($i = 0; $i -lt 30 -and -not $ready; $i++) {
        Start-Sleep -Seconds 1
        try { $ready = (Invoke-WebRequest "http://127.0.0.1:$Port/health" -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch {}
    }
    if (-not $ready) { throw "Test gateway didn't start. See $log and $log.err" }

    # --- 3. run --------------------------------------------------------------
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    & $k6 run --quiet `
        -e PROFILE=$Profile -e RATE=$Rate -e DURATION=$Duration `
        -e BASE_URL="http://127.0.0.1:$Port" -e RESULTS_DIR="$results" `
        --out "csv=$results\$Profile-$stamp.csv" `
        (Join-Path $root 'api-load.js')
    $exitCode = $LASTEXITCODE
    if ($exitCode -eq 0) { Write-Host 'PASSED: all thresholds met.' -ForegroundColor Green }
    else { Write-Host 'FAILED: one or more thresholds were crossed (see above).' -ForegroundColor Yellow }
}
finally {
    # --- 4. cleanup ----------------------------------------------------------
    foreach ($k in $testEnv.Keys) { [Environment]::SetEnvironmentVariable($k, $saved[$k]) }
    if ($gateway -and -not $gateway.HasExited) {
        Stop-Process -Id $gateway.Id -Force
        Write-Host 'Test gateway stopped.' -ForegroundColor Cyan
    }
}
exit $exitCode
