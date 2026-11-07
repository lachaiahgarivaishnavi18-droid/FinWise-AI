param([switch]$Install)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if (Test-Path -LiteralPath '.env') {
    foreach ($line in Get-Content -LiteralPath '.env') {
        if ($line -match '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
            [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim().Trim('"').Trim("'"), 'Process')
        }
    }
}
if ($Install) {
    if (-not (Test-Path -LiteralPath '.venv312\Scripts\python.exe')) { python -m venv .venv312 }
    & '.\.venv312\Scripts\python.exe' -m pip install -r backend/requirements-core.txt
    if ($LASTEXITCODE -ne 0) { throw 'Python dependency installation failed.' }
    pnpm install
    if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
    pnpm build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
}
& '.\.venv312\Scripts\python.exe' -m backend.bootstrap
if ($LASTEXITCODE -ne 0) { throw 'Database initialization failed.' }
& '.\.venv312\Scripts\python.exe' -m backend.app
