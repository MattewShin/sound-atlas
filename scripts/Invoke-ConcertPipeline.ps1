[CmdletBinding()]
param(
  [ValidateSet('plan','run','latest','help')][string]$Mode = 'plan',
  [string]$NodePath,
  [ValidateRange(1,1000)][int]$CleanupLimit = 100,
  [ValidateRange(1,1000)][int]$CollectLimit = 10,
  [ValidateRange(1,1000)][int]$OcrLimit = 3,
  [ValidateRange(1,1000)][int]$AnalysisLimit = 10,
  [ValidateRange(1,100)][int]$ListPages = 4,
  [ValidateRange(1,1000)][int]$DbPages = 20,
  [ValidateRange(1,1000)][int]$ImageChecks = 10,
  [ValidateRange(30,7200)][int]$MaxSeconds = 900,
  [ValidateRange(1,720)][int]$RecheckHours = 24
)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$pipelineExit = 2
try {
  if (-not $NodePath) { $NodePath = (Get-Command node -CommandType Application -ErrorAction Stop).Source }
  $NodePath = [IO.Path]::GetFullPath($NodePath)
  if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf)) { throw 'Node executable missing.' }
  $envFile = Join-Path $projectRoot '.env'
  $entry = Join-Path $projectRoot 'scripts\runConcertPipeline.mjs'
  Push-Location -LiteralPath $projectRoot
  try {
    $nodeArguments = @("--env-file-if-exists=$envFile", $entry, $Mode)
    if ($Mode -in @('run','plan')) {
      $nodeArguments += @('--collect-limit', "$CollectLimit", '--ocr-limit', "$OcrLimit", '--analysis-limit', "$AnalysisLimit", '--list-pages', "$ListPages", '--db-pages', "$DbPages", '--image-checks', "$ImageChecks", '--max-seconds', "$MaxSeconds", '--recheck-hours', "$RecheckHours", '--cleanup-limit', "$CleanupLimit")
    }
    & $NodePath @nodeArguments
    $pipelineExit = $LASTEXITCODE
  } finally { Pop-Location }
} catch {
  Write-Error 'Pipeline could not start. Check NodePath, project files and docs/LOCAL_PIPELINE.md.' -ErrorAction Continue
}
exit $pipelineExit
