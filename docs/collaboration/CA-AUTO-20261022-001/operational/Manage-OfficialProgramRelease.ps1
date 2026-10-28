[CmdletBinding()]
param([ValidateSet('Prepare','Enable','Status','Rollback')][string]$Mode='Status')
$ErrorActionPreference='Stop'
$taskName='ClassicAtlas-LocalPipeline'
$config=Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $PSScriptRoot 'release-config.json') | ConvertFrom-Json
$snapshotPath=Join-Path $PSScriptRoot 'scheduler-prepared.json'
$backupPath=Join-Path $PSScriptRoot 'scheduler-before.xml'
$launcher=Join-Path $PSScriptRoot 'Invoke-OfficialProgramRelease.ps1'
$arguments="-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -File `"$launcher`" -Mode run"
function Invariant($task) {
  return [ordered]@{executionTimeLimit=$task.Settings.ExecutionTimeLimit;multipleInstances=[string]$task.Settings.MultipleInstances;restartCount=$task.Settings.RestartCount;restartInterval=$task.Settings.RestartInterval;startWhenAvailable=$task.Settings.StartWhenAvailable;allowHardTerminate=$task.Settings.AllowHardTerminate;disallowBattery=$task.Settings.DisallowStartIfOnBatteries;stopOnBattery=$task.Settings.StopIfGoingOnBatteries;wakeToRun=$task.Settings.WakeToRun;runOnlyIfIdle=$task.Settings.RunOnlyIfIdle;runOnlyIfNetworkAvailable=$task.Settings.RunOnlyIfNetworkAvailable;userId=$task.Principal.UserId;logonType=[string]$task.Principal.LogonType;runLevel=[string]$task.Principal.RunLevel;daysInterval=$task.Triggers[0].DaysInterval;triggerEnabled=$task.Triggers[0].Enabled;dailyTime=([datetimeoffset]$task.Triggers[0].StartBoundary).ToString('HH:mm')}
}
function Snapshot {
  $task=Get-ScheduledTask -TaskName $taskName -TaskPath '\'
  $info=Get-ScheduledTaskInfo -TaskName $taskName -TaskPath '\'
  return [ordered]@{sha=$config.sha;state=[string]$task.State;enabled=[bool]$task.Settings.Enabled;actionMatches=(@($task.Actions).Count -eq 1 -and $task.Actions[0].Execute -ceq $config.powershell -and $task.Actions[0].Arguments -ceq $arguments -and $task.Actions[0].WorkingDirectory -ceq $config.release);invariant=(Invariant $task);startBoundary=$task.Triggers[0].StartBoundary;nextRunKst=$info.NextRunTime.ToString('yyyy-MM-dd HH:mm:ss');lastRun=$info.LastRunTime.ToString('o');lastResult=$info.LastTaskResult;forcedRun=$false}
}
try {
  if($Mode -eq 'Rollback') {
    Disable-ScheduledTask -TaskName $taskName -TaskPath '\' | Out-Null
    & $config.node "--env-file=$($config.envFile)" (Join-Path $PSScriptRoot 'disable-policy.mjs')
    if($LASTEXITCODE -ne 0){throw 'POLICY_ROLLBACK_FAILED'}
    [xml]$old=Get-Content -Raw -Encoding UTF8 -LiteralPath $backupPath
    [xml]$current=Export-ScheduledTask -TaskName $taskName -TaskPath '\'
    $ns=New-Object Xml.XmlNamespaceManager($current.NameTable);$ns.AddNamespace('t',$current.DocumentElement.NamespaceURI)
    $oldNs=New-Object Xml.XmlNamespaceManager($old.NameTable);$oldNs.AddNamespace('t',$old.DocumentElement.NamespaceURI)
    $oldActions=$old.SelectSingleNode('/t:Task/t:Actions',$oldNs)
    $current.DocumentElement.ReplaceChild($current.ImportNode($oldActions,$true),$current.SelectSingleNode('/t:Task/t:Actions',$ns)) | Out-Null
    $current.SelectSingleNode('/t:Task/t:Settings/t:Enabled',$ns).InnerText='false'
    Register-ScheduledTask -TaskName $taskName -TaskPath '\' -Xml $current.OuterXml -Force | Out-Null
    [pscustomobject]@{rollback=$true;policyDisabled=$true;taskDisabled=$true;previousActionRestored=$true} | ConvertTo-Json -Compress
    exit 0
  }
  if($Mode -eq 'Prepare') {
    if(Test-Path -LiteralPath $snapshotPath){throw 'ALREADY_PREPARED'}
    if(!(Test-Path -LiteralPath $backupPath)){throw 'ROLLBACK_BACKUP_REQUIRED'}
    $production=Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $PSScriptRoot 'production-search-result.json') | ConvertFrom-Json
    $gateC=Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $PSScriptRoot 'gate-c-pass.json') | ConvertFrom-Json
    if(!$production.pass -or $production.sha -cne $config.sha -or $gateC.status -ne 'PASS'){throw 'DEPLOYMENT_OR_GATE_C_NOT_VERIFIED'}
    $task=Get-ScheduledTask -TaskName $taskName -TaskPath '\'
    if($task.State -ne 'Disabled' -or $task.Settings.Enabled){throw 'DISABLED_TASK_REQUIRED'}
    $before=Invariant $task
    if($before.dailyTime -ne '08:40' -or $before.daysInterval -ne 1 -or $before.multipleInstances -ne 'IgnoreNew' -or $before.executionTimeLimit -ne 'PT32M' -or $before.restartCount -ne 0){throw 'ORIGINAL_CONTRACT_MISMATCH'}
    $kst=[TimeZoneInfo]::FindSystemTimeZoneById('Korea Standard Time');$now=[TimeZoneInfo]::ConvertTimeFromUtc([datetime]::UtcNow,$kst)
    $next=$now.Date.AddHours(8).AddMinutes(40);if($next -le $now){$next=$next.AddDays(1)}
    $trigger=$task.Triggers[0];$trigger.StartBoundary=$next.ToString('yyyy-MM-ddTHH:mm:ss')+'+09:00'
    $action=New-ScheduledTaskAction -Execute $config.powershell -Argument $arguments -WorkingDirectory $config.release
    $settings=$task.Settings;$settings.Enabled=$false
    Set-ScheduledTask -TaskName $taskName -TaskPath '\' -Action $action -Trigger $trigger -Settings $settings | Out-Null
    $after=Snapshot
    if($after.enabled -or !$after.actionMatches -or (($before|ConvertTo-Json -Compress) -cne ($after.invariant|ConvertTo-Json -Compress))){throw 'PREPARED_TASK_MISMATCH'}
    $after.rollbackReady=$true;$after.nextBoundaryMovedToFuture=$true
    [IO.File]::WriteAllText($snapshotPath,($after|ConvertTo-Json -Depth 8),(New-Object Text.UTF8Encoding($false)))
    $after | ConvertTo-Json -Depth 8 -Compress
  } elseif($Mode -eq 'Enable') {
    $prepared=Get-Content -Raw -Encoding UTF8 -LiteralPath $snapshotPath | ConvertFrom-Json
    $before=Snapshot
    if(!$before.actionMatches -or $before.enabled -or $before.invariant.restartCount -ne 0){throw 'PREPARED_DISABLED_TASK_REQUIRED'}
    Enable-ScheduledTask -TaskName $taskName -TaskPath '\' | Out-Null
    $after=Snapshot
    if(!$after.enabled -or !$after.actionMatches -or $after.lastRun -cne $before.lastRun -or $after.state -ne 'Ready'){throw 'ENABLED_TASK_MISMATCH'}
    if(($after.invariant|ConvertTo-Json -Compress) -cne ($before.invariant|ConvertTo-Json -Compress)){throw 'TASK_SETTINGS_CHANGED'}
    [IO.File]::WriteAllText((Join-Path $PSScriptRoot 'scheduler-enabled.json'),($after|ConvertTo-Json -Depth 8),(New-Object Text.UTF8Encoding($false)))
    $after | ConvertTo-Json -Depth 8 -Compress
  } else { Snapshot | ConvertTo-Json -Depth 8 -Compress }
} catch {
  Disable-ScheduledTask -TaskName $taskName -TaskPath '\' -ErrorAction SilentlyContinue | Out-Null
  [pscustomobject]@{success=$false;mode=$Mode;code='SCHEDULE_VERIFICATION_FAILED';detail=$_.Exception.Message} | ConvertTo-Json -Compress
  exit 1
}
