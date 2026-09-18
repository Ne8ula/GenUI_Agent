$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$gateway = Join-Path $env:USERPROFILE '.claude/model-gateway/model-gateway.js'
if (-not (Test-Path -LiteralPath $gateway)) {
    throw 'Model Gateway is not installed. Follow docs/development/AGENT_WORKFLOW.md.'
}
Push-Location $repoRoot
try {
    node $gateway doctor
    if ($LASTEXITCODE -ne 0) {
        throw 'Gateway is not ready. Complete its login/setup and rerun this launcher.'
    }
    # No permission bypass, user-setting changes, or automatic Git operations.
    claude --model 'claude-gpt-6-astra[1m]' --effort high @args
} finally {
    Pop-Location
}
