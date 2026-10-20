[CmdletBinding()]
param(
  [ValidateSet('plan','run','latest','help')][string]$Mode = 'plan',
  [ValidateSet('custom','initial','daily')][string]$Profile = 'custom',
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
if ($Profile -ne 'custom') {
  $profileValues = @{ CollectLimit = $(if ($Profile -eq 'initial') { 20 } else { 10 }); OcrLimit = 20; AnalysisLimit = 20; ImageChecks = 40; MaxSeconds = 1800 }
  foreach ($name in $profileValues.Keys) { if (-not $PSBoundParameters.ContainsKey($name)) { Set-Variable -Name $name -Value $profileValues[$name] } }
}
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$pipelineExit = 2
function Quote-NativeArgument([string]$Value) {
  return '"' + [regex]::Replace([regex]::Replace($Value, '(\\*)"', '$1$1\"'), '(\\+)$', '$1$1') + '"'
}
function Write-LaunchReceipt($Value, [string]$Path) {
  $temporary = $Path + '.' + [guid]::NewGuid().ToString() + '.tmp'
  try {
    [IO.File]::WriteAllText($temporary, ($Value | ConvertTo-Json -Depth 6), (New-Object Text.UTF8Encoding($false)))
    if ([IO.File]::Exists($Path)) { [IO.File]::Replace($temporary, $Path, [System.Management.Automation.Language.NullString]::Value) } else { [IO.File]::Move($temporary, $Path) }
  } finally { if ([IO.File]::Exists($temporary)) { [IO.File]::Delete($temporary) } }
}
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
    if ($Mode -ne 'run') {
      & $NodePath @nodeArguments
      $pipelineExit = $LASTEXITCODE
    } else {
      $launchId = [guid]::NewGuid().ToString()
      $launchDirectory = Join-Path $projectRoot '.cache\concert-pipeline\launches'
      [IO.Directory]::CreateDirectory($launchDirectory) | Out-Null
      $receiptPath = Join-Path $launchDirectory ($launchId + '.json')
      $stdoutPath = Join-Path $launchDirectory ($launchId + '.stdout.log')
      $stderrPath = Join-Path $launchDirectory ($launchId + '.stderr.log')
      $receipt = [ordered]@{launch_id=$launchId;status='STARTING';parent_pid=$PID;started_at=[datetime]::UtcNow.ToString('o');node_pid=$null;node_started_at=$null;node_finished_at=$null;node_exit_code=$null;node_exit_code_unsigned=$null;stdout_path=$stdoutPath;stderr_path=$stderrPath;finished_at=$null}
      Write-LaunchReceipt $receipt $receiptPath
      $nodeProcess = New-Object Diagnostics.Process
      $startInfo = New-Object Diagnostics.ProcessStartInfo
      $startInfo.FileName = $NodePath
      $startInfo.Arguments = (($nodeArguments | ForEach-Object { Quote-NativeArgument $_ }) -join ' ')
      $startInfo.WorkingDirectory = $projectRoot
      $startInfo.UseShellExecute = $false
      $startInfo.CreateNoWindow = $true
      $startInfo.RedirectStandardOutput = $true
      $startInfo.RedirectStandardError = $true
      $startInfo.RedirectStandardInput = $true
      $startInfo.EnvironmentVariables['CLASSIC_ATLAS_LAUNCH_ID'] = $launchId
      $nodeProcess.StartInfo = $startInfo
      $outFile = $null; $errFile = $null; $systemAwake = $null
      $receipt.system_awake = [ordered]@{requested=$true;flags='ES_CONTINUOUS | ES_SYSTEM_REQUIRED';display_required=$false;activation_succeeded=$false;activation_error=$null;activated_at=$null;release_succeeded=$null;release_error=$null;released_at=$null}
      try {
        $outFile = [IO.File]::Open($stdoutPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
        $errFile = [IO.File]::Open($stderrPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
        try {
          . (Join-Path $PSScriptRoot 'WindowsBatchPower.ps1')
          $systemAwake = Start-BatchSystemAwake
          $receipt.system_awake.activation_succeeded = $systemAwake.Active
          if ($systemAwake.Active) { $receipt.system_awake.activated_at = [datetime]::UtcNow.ToString('o') }
          else { $receipt.system_awake.activation_error = [ordered]@{native_code=$systemAwake.ActivationError;type=$systemAwake.FailureType} }
        } catch {
          $receipt.system_awake.activation_error = [ordered]@{type=$_.Exception.GetType().FullName}
        }
        if (-not $receipt.system_awake.activation_succeeded) {
          $warning = 'SYSTEM_AWAKE_REQUEST_FAILED: continuing with current Windows power policy.'
          [Console]::Error.WriteLine($warning)
          $warningBytes = [Text.Encoding]::UTF8.GetBytes($warning + [Environment]::NewLine)
          $errFile.Write($warningBytes,0,$warningBytes.Length)
        }
        Write-LaunchReceipt $receipt $receiptPath
        if (-not $nodeProcess.Start()) { throw 'Node start failed.' }
        $nodeProcess.StandardInput.Close()
        $receipt.node_pid = $nodeProcess.Id
        $receipt.node_started_at = $nodeProcess.StartTime.ToUniversalTime().ToString('o')
        $receipt.status = 'RUNNING'
        Write-LaunchReceipt $receipt $receiptPath
        # Concurrent binary stream drains avoid pipe-buffer deadlock. Wait for
        # the actual child and both streams, not merely the launcher creation.
        $outCopy = $nodeProcess.StandardOutput.BaseStream.CopyToAsync($outFile)
        $errCopy = $nodeProcess.StandardError.BaseStream.CopyToAsync($errFile)
        $nodeProcess.WaitForExit()
        $pipelineExit = $nodeProcess.ExitCode
        $outCopy.GetAwaiter().GetResult(); $errCopy.GetAwaiter().GetResult()
        $outFile.Flush(); $errFile.Flush()
        $outFile.Dispose(); $outFile = $null
        $errFile.Dispose(); $errFile = $null
        # The Node entry point reports its actual imported version; do not keep
        # a second hardcoded version in the scheduled action or PowerShell.
        $versionLine = [IO.File]::ReadLines($stdoutPath) | Where-Object { $_ -match '"event":"analysis_version"' } | Select-Object -First 1
        if ($versionLine) {
          try {
            $versionInfo = $versionLine | ConvertFrom-Json
            $receipt.matcher_version = $versionInfo.matcher_version
            $receipt.catalog_hash = $versionInfo.catalog_hash
            $receipt.rollout = $versionInfo.rollout
          } catch { $receipt.version_record_error = 'VERSION_EVENT_INVALID' }
        }
        $receipt.node_exit_code = $pipelineExit
        $receipt.node_exit_code_unsigned = [uint32]([long]$pipelineExit -band 0xffffffffL)
        $receipt.node_finished_at = $nodeProcess.ExitTime.ToUniversalTime().ToString('o')
        $receipt.status = switch ($pipelineExit) { 0 {'SUCCESS'} 1 {'PARTIAL'} 2 {'FATAL'} 3 {'DUPLICATE_SKIPPED'} default {if ($receipt.node_exit_code_unsigned -eq 3221225786) {'EXTERNAL_CONTROL_TERMINATION'} else {'NATIVE_EXIT_FAILURE'}} }
        if ($pipelineExit -eq 0) {
          $resultLine = [IO.File]::ReadLines($stdoutPath) | Where-Object { $_ -match '"event":"pipeline_result"' } | Select-Object -Last 1
          if ($resultLine) {
            try { if (($resultLine | ConvertFrom-Json).status -eq 'SKIPPED_ROLLOUT_GATE') { $receipt.status = 'SKIPPED_ROLLOUT_GATE' } }
            catch { $receipt.result_record_error = 'RESULT_EVENT_INVALID' }
          }
        }
        if ([IO.File]::Exists($stdoutPath)) { [Console]::Out.Write([IO.File]::ReadAllText($stdoutPath)) }
        if ([IO.File]::Exists($stderrPath)) { [Console]::Error.Write([IO.File]::ReadAllText($stderrPath)) }
      } catch {
        $receipt.status = 'WRAPPER_FAILED'
        $receipt.wrapper_error = [ordered]@{code=$_.FullyQualifiedErrorId;type=$_.Exception.GetType().FullName;line=$_.InvocationInfo.ScriptLineNumber}
        throw
      } finally {
        try {
          if ($null -ne $systemAwake) {
            try {
              $systemAwake.Dispose()
              if ($systemAwake.Active) {
                $receipt.system_awake.release_succeeded = $systemAwake.Released
                $receipt.system_awake.release_error = $systemAwake.ReleaseError
                $receipt.system_awake.released_at = [datetime]::UtcNow.ToString('o')
              }
            } catch { $receipt.system_awake.release_succeeded=$false; $receipt.system_awake.release_error=$_.Exception.GetType().FullName }
          }
          $receipt.finished_at = [datetime]::UtcNow.ToString('o')
          Write-LaunchReceipt $receipt $receiptPath
        } finally {
          if ($null -ne $outFile) { $outFile.Dispose() }; if ($null -ne $errFile) { $errFile.Dispose() }
          # Dispose closes this wrapper's handle; never kill by process name or
          # repeat child-tree termination during shutdown.
          $nodeProcess.Dispose()
        }
      }
    }
  } finally { Pop-Location }
} catch {
  [Console]::Error.WriteLine(('Pipeline wrapper failure: {0}; line {1}' -f $_.FullyQualifiedErrorId,$_.InvocationInfo.ScriptLineNumber))
  Write-Error 'Pipeline could not start. Check NodePath, project files and docs/LOCAL_PIPELINE.md.' -ErrorAction Continue
}
exit $pipelineExit
