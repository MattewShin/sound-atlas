[CmdletBinding(SupportsShouldProcess=$true)]
param(
  [ValidateSet('Preview','Register','Status','Disable','Stop','Remove')][string]$Action = 'Preview',
  [ValidatePattern('^[A-Za-z0-9 _.\-]{1,100}$')][string]$TaskName = 'ClassicAtlas-LocalPipeline',
  [ValidatePattern('^([01][0-9]|2[0-3]):[0-5][0-9]$')][string]$Time = '09:00',
  [string]$NodePath,
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
if ($Action -in @('Status','Disable','Stop','Remove')) {
  $task = Get-ScheduledTask -TaskName $TaskName -TaskPath '\' -ErrorAction SilentlyContinue
  if (-not $task) { Write-Output 'Task is not registered.'; return }
  switch ($Action) {
    'Status' { $task | Select-Object TaskName,State; Get-ScheduledTaskInfo -TaskName $TaskName -TaskPath '\' }
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
$arguments = "-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -File `"$entry`" -Mode run -NodePath `"$NodePath`" -CollectLimit $CollectLimit -OcrLimit $OcrLimit -AnalysisLimit $AnalysisLimit -ListPages $ListPages -DbPages $DbPages -ImageChecks $ImageChecks -MaxSeconds $MaxSeconds -RecheckHours $RecheckHours"
$zone = Get-TimeZone
$userName = [Security.Principal.WindowsIdentity]::GetCurrent().Name
if ($Action -eq 'Preview') {
  [PSCustomObject]@{ TaskName=$TaskName; Time=$Time; TimeZone=$zone.Id; User=$userName; Executable=$powershellExe; Arguments=$arguments; WorkingDirectory=$projectRoot; LogonType='Interactive'; RunLevel='Limited'; StartWhenAvailable=$true; MultipleInstances='IgnoreNew' } | ConvertTo-Json
  return
}
if ($zone.Id -ne 'Korea Standard Time') { throw 'PC time zone is not Korea Standard Time. Registration stopped; no system settings changed.' }
if (Get-ScheduledTask -TaskName $TaskName -TaskPath '\' -ErrorAction SilentlyContinue) { throw 'Task already exists. Inspect it with Status, then explicitly Remove it before replacement.' }
if ($PSCmdlet.ShouldProcess($TaskName,"Register daily at $Time Korea Standard Time for the current logged-in user")) {
  $scheduledAction = New-ScheduledTaskAction -Execute $powershellExe -Argument $arguments -WorkingDirectory $projectRoot
  $scheduledTrigger = New-ScheduledTaskTrigger -Daily -At ([datetime]::ParseExact($Time,'HH:mm',[Globalization.CultureInfo]::InvariantCulture))
  $principal = New-ScheduledTaskPrincipal -UserId $userName -LogonType Interactive -RunLevel Limited
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Seconds ($MaxSeconds + 120))
  Register-ScheduledTask -TaskName $TaskName -TaskPath '\' -Action $scheduledAction -Trigger $scheduledTrigger -Principal $principal -Settings $settings -Description 'Classic Atlas local collection/OCR/program batch. Manual review remains required.'
}
