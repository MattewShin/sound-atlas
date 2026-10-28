[CmdletBinding()]
param([ValidateSet('verify','run')][string]$Mode='verify')
$ErrorActionPreference='Stop'
$config=Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $PSScriptRoot 'release-config.json') | ConvertFrom-Json
$launcher=Join-Path $PSScriptRoot 'launch-release.mjs'
& $config.node "--env-file=$($config.envFile)" $launcher $Mode
exit $LASTEXITCODE
