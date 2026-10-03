$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

function Invoke-CheckedDocker {
    param([string[]]$DockerArgs)
    & docker @DockerArgs
    if ($LASTEXITCODE -ne 0) { throw "Docker verification failed (exit $LASTEXITCODE)." }
}

Push-Location -LiteralPath $projectRoot
try {
    Invoke-CheckedDocker -DockerArgs @('compose', 'up', '--build', '-d', '--wait')
    Invoke-CheckedDocker -DockerArgs @('compose', '--profile', 'test', 'run', '--rm', 'backend-tests')
    Invoke-CheckedDocker -DockerArgs @('compose', 'exec', '-T', 'backend', 'alembic', 'check')
    Invoke-CheckedDocker -DockerArgs @('compose', 'exec', '-T', 'frontend', 'npm', 'test')
    Invoke-CheckedDocker -DockerArgs @('compose', 'exec', '-T', 'frontend', 'npm', 'run', 'build')
    Invoke-CheckedDocker -DockerArgs @('compose', 'ps', '-a')
    Write-Output 'Foundation verification passed. Run the documented Playwright command for browser validation.'
} finally {
    Pop-Location
}
