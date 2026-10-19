[CmdletBinding(SupportsShouldProcess=$true)]
param(
  [ValidateSet('Preview','Register','Status','Disable','Stop','Remove')][string]$Action = 'Preview',
  [ValidateSet('custom','initial','daily')][string]$Profile = 'custom',
  [ValidateSet('ac-only','allow-battery')][string]$PowerPolicy = 'ac-only',
  [bool]$WakeToRun = $true,
  [ValidatePattern('^[A-Za-z0-9 _.\-]{1,100}$')][string]$TaskName = 'ClassicAtlas-LocalPipeline',
  [ValidatePattern('^([01][0-9]|2[0-3]):[0-5][0-9]$')][string]$Time = '09:00',
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
function Get-PipelineTaskSnapshot {
  try {
    $registered = Get-ScheduledTask -TaskName $TaskName -TaskPath '\' -ErrorAction Stop
    $info = Get-ScheduledTaskInfo -TaskName $TaskName -TaskPath '\' -ErrorAction Stop
    $batchSeconds = $null
    if (($registered.Actions.Arguments -join ' ') -match '-MaxSeconds\s+(\d+)') { $batchSeconds = [int]$Matches[1] }
    $taskSeconds = [System.Xml.XmlConvert]::ToTimeSpan($registered.Settings.ExecutionTimeLimit).TotalSeconds
    $settings = $registered.Settings
    return [PSCustomObject]@{ TaskName=$registered.TaskName; State=[string]$registered.State; Actions=@($registered.Actions | Select-Object Execute,Arguments,WorkingDirectory); Triggers=@($registered.Triggers | Select-Object StartBoundary,DaysInterval,Enabled); ExecutionTimeLimit=$settings.ExecutionTimeLimit; ExecutionTimeLimitSeconds=$taskSeconds; BatchMaxSeconds=$batchSeconds; TimeoutCompatible=$(if ($null -eq $batchSeconds) { 'UNKNOWN' } else { $taskSeconds -ge ($batchSeconds+120) }); LastRunTime=$info.LastRunTime.ToString('o'); NextRunTime=$info.NextRunTime.ToString('o'); LastTaskResult=$info.LastTaskResult; StartWhenAvailable=$settings.StartWhenAvailable; MultipleInstances=[string]$settings.MultipleInstances; Principal=($registered.Principal | Select-Object LogonType,RunLevel,UserId); TerminationSettings=[PSCustomObject]@{AllowHardTerminate=$settings.AllowHardTerminate;DisallowStartIfOnBatteries=$settings.DisallowStartIfOnBatteries;StopIfGoingOnBatteries=$settings.StopIfGoingOnBatteries;RunOnlyIfIdle=$settings.RunOnlyIfIdle;StopOnIdleEnd=$settings.IdleSettings.StopOnIdleEnd;RunOnlyIfNetworkAvailable=$settings.RunOnlyIfNetworkAvailable;WakeToRun=$settings.WakeToRun;RestartCount=$settings.RestartCount} }
  } catch { return [PSCustomObject]@{ TaskName=$TaskName; ReadStatus='UNAVAILABLE_OR_NOT_REGISTERED'; ErrorId=$_.FullyQualifiedErrorId } }
}
if ($Action -in @('Disable','Stop','Remove')) {
  $task = Get-ScheduledTask -TaskName $TaskName -TaskPath '\' -ErrorAction SilentlyContinue
  if (-not $task) { Write-Output 'Task is not registered.'; return }
  switch ($Action) {
    'Disable' { if ($PSCmdlet.ShouldProcess($TaskName,'Disable future runs')) { Disable-ScheduledTask -TaskName $TaskName -TaskPath '\' } }
    'Stop' { if ($PSCmdlet.ShouldProcess($TaskName,'Stop current scheduled run')) { Stop-ScheduledTask -TaskName $TaskName -TaskPath '\' } }
    'Remove' { if ($PSCmdlet.ShouldProcess($TaskName,'Unregister task')) { Unregister-ScheduledTask -TaskName $TaskName -TaskPath '\' -Confirm:$false } }
  }
  return
}
if (-not $NodePath) { $NodePath = (Get-Command node -CommandType Application -ErrorAction Stop).Source }
$NodePath = [IO.Path]::GetFullPath($NodePath)
if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf)) { throw 'Node executable missing.' }
$entry = Join-Path $projectRoot 'scripts\Invoke-ConcertPipeline.ps1'
$powershellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
if ($entry.Contains('"') -or $NodePath.Contains('"')) { throw 'Unsupported quotation mark in path.' }
$arguments = "-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -File `"$entry`" -Mode run -Profile $Profile -NodePath `"$NodePath`" -CollectLimit $CollectLimit -OcrLimit $OcrLimit -AnalysisLimit $AnalysisLimit -ListPages $ListPages -DbPages $DbPages -ImageChecks $ImageChecks -MaxSeconds $MaxSeconds -RecheckHours $RecheckHours -CleanupLimit $CleanupLimit"
$zone = Get-TimeZone
$userName = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$userSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$firstRun = [datetime]::Today.Add([TimeSpan]::Parse($Time))
if ($firstRun -le (Get-Date)) { $firstRun = $firstRun.AddDays(1) }
function Test-PipelineTaskConfiguration($actual) {
  $differences = New-Object 'System.Collections.Generic.List[string]'
  if ($actual.ReadStatus) {
    return [PSCustomObject]@{RuntimeVerified=$false;RuntimeVerificationScope='REGISTERED_CONFIGURATION';BatchExecutionVerified=$false;ConfigurationDifferences=@('RegistrationUnavailable')}
  }
  if (@($actual.Actions).Count -ne 1 -or $actual.Actions[0].Execute -ne $powershellExe -or $actual.Actions[0].Arguments -cne $arguments -or $actual.Actions[0].WorkingDirectory -ne $projectRoot) { $differences.Add('Action') }
  if (-not (Test-Path -LiteralPath $entry -PathType Leaf) -or -not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'WindowsBatchPower.ps1') -PathType Leaf)) { $differences.Add('RuntimeFiles') }
  if ($actual.ExecutionTimeLimitSeconds -ne ($MaxSeconds+120)) { $differences.Add('ExecutionTimeLimit') }
  if ($actual.StartWhenAvailable -ne $true) { $differences.Add('StartWhenAvailable') }
  if ($actual.MultipleInstances -notin @('IgnoreNew','2')) { $differences.Add('MultipleInstances') }
  $principalSid = $null
  try {
    if ($actual.Principal.UserId -match '^S-1-') { $principalSid = $actual.Principal.UserId }
    else { $principalSid = (New-Object Security.Principal.NTAccount($actual.Principal.UserId)).Translate([Security.Principal.SecurityIdentifier]).Value }
  } catch { } # An unresolvable account never verifies as the current user.
  if ([string]$actual.Principal.LogonType -notin @('Interactive','InteractiveToken','3') -or [string]$actual.Principal.RunLevel -notin @('Limited','0') -or $principalSid -ne $userSid) { $differences.Add('Principal') }
  if (@($actual.Triggers).Count -ne 1 -or $actual.Triggers[0].DaysInterval -ne 1 -or $actual.Triggers[0].Enabled -ne $true -or ([datetime]$actual.Triggers[0].StartBoundary).ToString('HH:mm') -ne $Time) { $differences.Add('DailyTrigger') }
  $expected = @{WakeToRun=$WakeToRun;DisallowStartIfOnBatteries=($PowerPolicy -eq 'ac-only');StopIfGoingOnBatteries=($PowerPolicy -eq 'ac-only');RunOnlyIfIdle=$false;StopOnIdleEnd=$false;RunOnlyIfNetworkAvailable=$false;AllowHardTerminate=$true;RestartCount=0}
  foreach ($key in $expected.Keys) { if ($actual.TerminationSettings.$key -ne $expected[$key]) { $differences.Add($key) } }
  return [PSCustomObject]@{ RuntimeVerified=($differences.Count -eq 0); RuntimeVerificationScope='REGISTERED_CONFIGURATION'; BatchExecutionVerified=$false; ConfigurationDifferences=@($differences.ToArray()) }
}
$snapshot = Get-PipelineTaskSnapshot
$verification = Test-PipelineTaskConfiguration $snapshot
if ($Action -eq 'Status') {
  foreach ($property in $verification.PSObject.Properties) { $snapshot | Add-Member -NotePropertyName $property.Name -NotePropertyValue $property.Value }
  $snapshot | Add-Member -NotePropertyName ProposedWakeToRun -NotePropertyValue $WakeToRun
  $snapshot | ConvertTo-Json -Depth 6
  return
}
if ($Action -eq 'Preview') {
  [PSCustomObject]@{ TaskName=$TaskName; Time=$Time; FirstRunBoundary=$firstRun.ToString('o'); TimeZone=$zone.Id; User=$userName; Executable=$powershellExe; Arguments=$arguments; WorkingDirectory=$projectRoot; LogonType='Interactive'; RunLevel='Limited'; StartWhenAvailable=$true; MultipleInstances='IgnoreNew'; Profile=$Profile; BatchMaxSeconds=$MaxSeconds; ExecutionTimeLimitSeconds=($MaxSeconds+120); ExecutionTimeLimit=[System.Xml.XmlConvert]::ToString([TimeSpan]::FromSeconds($MaxSeconds+120)); PowerPolicy=$PowerPolicy; WakeToRun=$WakeToRun; DisallowStartIfOnBatteries=($PowerPolicy -eq 'ac-only'); StopIfGoingOnBatteries=($PowerPolicy -eq 'ac-only'); RunOnlyIfIdle=$false; StopOnIdleEnd=$false; AllowHardTerminate=$true; Registered=$snapshot; RuntimeVerified=$verification.RuntimeVerified; RuntimeVerificationScope=$verification.RuntimeVerificationScope; BatchExecutionVerified=$false; ConfigurationDifferences=$verification.ConfigurationDifferences } | ConvertTo-Json -Depth 6
  return
}
if ($zone.Id -ne 'Korea Standard Time') { throw 'PC time zone is not Korea Standard Time. Registration stopped; no system settings changed.' }
if (Get-ScheduledTask -TaskName $TaskName -TaskPath '\' -ErrorAction SilentlyContinue) { throw 'Task already exists. Inspect it with Status, then explicitly Remove it before replacement.' }
if ($PSCmdlet.ShouldProcess($TaskName,"Register daily at $Time Korea Standard Time for the current logged-in user")) {
  $scheduledAction = New-ScheduledTaskAction -Execute $powershellExe -Argument $arguments -WorkingDirectory $projectRoot
  # Start with a future boundary; registration must never launch a missed run.
  $scheduledTrigger = New-ScheduledTaskTrigger -Daily -At $firstRun
  $principal = New-ScheduledTaskPrincipal -UserId $userName -LogonType Interactive -RunLevel Limited
  $settingsArgs = @{ StartWhenAvailable=$true; MultipleInstances='IgnoreNew'; ExecutionTimeLimit=(New-TimeSpan -Seconds ($MaxSeconds + 120)); DontStopOnIdleEnd=$true; WakeToRun=$WakeToRun }
  if ($PowerPolicy -eq 'allow-battery') { $settingsArgs.AllowStartIfOnBatteries=$true; $settingsArgs.DontStopIfGoingOnBatteries=$true }
  $settings = New-ScheduledTaskSettingsSet @settingsArgs
  Register-ScheduledTask -TaskName $TaskName -TaskPath '\' -Action $scheduledAction -Trigger $scheduledTrigger -Principal $principal -Settings $settings -Description 'Classic Atlas local collection/OCR/program batch. Manual review remains required.'
}
