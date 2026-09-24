<#
.SYNOPSIS
  Register (or remove) the nightly trending-refresh Windows Scheduled Task.

.DESCRIPTION
  NOT AUTO-INSTALLED. Run manually in target env: `pwsh src/services/trending-scheduler.ps1`.

  Creates a Windows Scheduled Task that invokes `npm run trending:refresh`
  (-> src/services/trending-batch.js) once per day at 00:00 UTC.

  Uses the Schedule.Service COM object directly (native Task Scheduler 2.0 API),
  NOT schtasks.exe. This is the proven approach from the project memory
  (session-2026-07-12-wmi-solution.md): schtasks.exe hangs when driven from
  Node child_process, and Get-WmiObject Win32_ScheduledTask has incomplete
  property coverage. Schedule.Service is the object the ScheduledTask cmdlets
  wrap, so direct COM access is reliable here.

  Idempotent: unregisters an existing task of the same name before (re)creating
  it, so re-running never duplicates or errors.

.PARAMETER TaskName
  Scheduled Task name (default: "ToolforgeTrendingRefresh").

.PARAMETER RepoPath
  Absolute path to the repo root (working directory for `npm run`).
  Defaults to two levels up from this script (…\src\services -> repo root).

.PARAMETER DailyTimeUtc
  Time-of-day in UTC to run, "HH:mm" (default "00:00"). Converted to the box's
  local time at registration; see the DST note in docs/wave-d/TRENDING-SCHEDULER.md.

.PARAMETER Unregister
  Remove the task instead of creating it.

.EXAMPLE
  pwsh src/services/trending-scheduler.ps1
  pwsh src/services/trending-scheduler.ps1 -DailyTimeUtc "00:00"
  pwsh src/services/trending-scheduler.ps1 -Unregister
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$TaskName = "ToolforgeTrendingRefresh",
  [string]$RepoPath,
  [string]$DailyTimeUtc = "00:00",
  [switch]$Unregister,
  [switch]$DryRun,
  [switch]$ExportXml
)

$ErrorActionPreference = "Stop"

# TASK_TRIGGER_DAILY = 2, TASK_ACTION_EXEC = 0
# RegisterTaskDefinition flags: TASK_CREATE_OR_UPDATE = 6
# Logon type: TASK_LOGON_INTERACTIVE_TOKEN = 3
$TASK_TRIGGER_DAILY = 2
$TASK_ACTION_EXEC = 0
$TASK_CREATE_OR_UPDATE = 6
$TASK_LOGON_INTERACTIVE_TOKEN = 3
$TASK_FOLDER = "\"

# XML Escaping helper for task parameters
function Escape-XmlString {
  param([string]$str)
  if (-not $str) { return "" }
  return $str.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace('"', "&quot;").Replace("'", "&apos;")
}

# Construct valid Task Scheduler 2.0 XML Schema definition string
function Get-TaskDefinitionXml {
  param(
    [string]$TaskName,
    [string]$RepoPath,
    [string]$StartBoundary
  )

  $escapedTaskName = Escape-XmlString $TaskName
  $escapedRepoPath = Escape-XmlString $RepoPath
  $escapedCommand  = Escape-XmlString "$env:SystemRoot\System32\cmd.exe"
  $escapedArgs     = Escape-XmlString "/c npm run trending:refresh"
  $escapedAuthor   = Escape-XmlString "CIC Team"
  $escapedDesc     = Escape-XmlString "Nightly Toolforge marketplace trending refresh (npm run trending:refresh). Registered by trending-scheduler.ps1."

  return @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Author>$escapedAuthor</Author>
    <Description>$escapedDesc</Description>
  </RegistrationInfo>
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>$StartBoundary</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay>
        <DaysInterval>1</DaysInterval>
      </ScheduleByDay>
    </CalendarTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>true</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT1H</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>$escapedCommand</Command>
      <Arguments>$escapedArgs</Arguments>
      <WorkingDirectory>$escapedRepoPath</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"@
}

# Validate TaskName is non-empty
if (-not $TaskName -or $TaskName.Trim() -eq "") {
  throw "TaskName cannot be blank or empty."
}

# Validate DailyTimeUtc strictly matches two-digit 'HH:mm' format between 00:00 and 23:59
if (-not ($DailyTimeUtc -match '^(?:[01]\d|2[0-3]):[0-5]\d$')) {
  throw "DailyTimeUtc must be strictly two-digit 'HH:mm' between 00:00 and 23:59 (got '$DailyTimeUtc')."
}

# Resolve repo root: default to <scriptdir>\..\.. (src\services -> repo root).
if (-not $RepoPath -or $RepoPath.Trim() -eq "") {
  $RepoPath = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}
if (-not (Test-Path $RepoPath)) {
  throw "RepoPath does not exist: $RepoPath"
}

$parts = $DailyTimeUtc.Split(":")
$utcHour = [int]$parts[0]
$utcMinute = [int]$parts[1]

$nowUtc = [DateTime]::UtcNow
$todayUtcMidnight = [DateTime]::new($nowUtc.Year, $nowUtc.Month, $nowUtc.Day, $utcHour, $utcMinute, 0, [DateTimeKind]::Utc)
$startLocal = $todayUtcMidnight.ToLocalTime()
$startBoundary = $startLocal.ToString("yyyy-MM-ddTHH:mm:ss")

if ($ExportXml) {
  $xmlStr = Get-TaskDefinitionXml -TaskName $TaskName -RepoPath $RepoPath -StartBoundary $startBoundary
  Write-Output $xmlStr
  return
}

$isDryRun = $DryRun -or $WhatIfPreference

if ($Unregister) {
  if ($isDryRun -or -not $PSCmdlet.ShouldProcess($TaskName, "Unregister Scheduled Task")) {
    Write-Host "[DRY-RUN] Unregister scheduled task '$TaskName'"
    return
  }
  $service = New-Object -ComObject "Schedule.Service"
  $service.Connect()
  $rootFolder = $service.GetFolder($TASK_FOLDER)
  $removed = Remove-ExistingTask -Folder $rootFolder -Name $TaskName
  if ($removed) {
    Write-Host "Unregistered scheduled task '$TaskName'."
  } else {
    Write-Host "No scheduled task named '$TaskName' was found. Nothing to do."
  }
  return
}

# --- Register (idempotent: delete-if-exists, then create) ---

$escapedTaskName = Escape-XmlString $TaskName
$escapedRepoPath = Escape-XmlString $RepoPath

if ($isDryRun -or -not $PSCmdlet.ShouldProcess($TaskName, "Register Scheduled Task")) {
  Write-Host "[DRY-RUN] Register scheduled task:"
  Write-Host "  TaskName:    $escapedTaskName"
  Write-Host "  Command:     cmd.exe /c npm run trending:refresh"
  Write-Host "  WorkingDir:  $escapedRepoPath"
  Write-Host "  Daily at:    $DailyTimeUtc UTC  (local StartBoundary: $startBoundary)"
  Write-Host "  Escaped XML: <Task><Name>$escapedTaskName</Name><WorkingDirectory>$escapedRepoPath</WorkingDirectory></Task>"
  return
}

# Connect to the Task Scheduler service via COM ONLY when performing live mutation.
$service = New-Object -ComObject "Schedule.Service"
$service.Connect()
$rootFolder = $service.GetFolder($TASK_FOLDER)

function Remove-ExistingTask {
  param($Folder, $Name)
  try {
    $Folder.DeleteTask($Name, 0)
    Write-Host "Removed existing task: $Name"
    return $true
  } catch {
    return $false
  }
}

# Idempotency: remove any prior registration first.
Remove-ExistingTask -Folder $rootFolder -Name $TaskName | Out-Null

$taskDef = $service.NewTask(0)

$reg = $taskDef.RegistrationInfo
$reg.Description = "Nightly Toolforge marketplace trending refresh (npm run trending:refresh). Registered by trending-scheduler.ps1."
$reg.Author = "CIC Team"

$settings = $taskDef.Settings
$settings.Enabled = $true
$settings.StartWhenAvailable = $true      # run after a missed window (box asleep at 00:00)
$settings.DisallowStartIfOnBatteries = $false
$settings.StopIfGoingOnBatteries = $false
$settings.ExecutionTimeLimit = "PT1H"     # kill a hung refresh after 1 hour
$settings.MultipleInstances = 2           # IgnoreNew: don't stack overlapping runs

$trigger = $taskDef.Triggers.Create($TASK_TRIGGER_DAILY)
$trigger.StartBoundary = $startBoundary
$trigger.DaysInterval = 1
$trigger.Enabled = $true

# Action: run `npm run trending:refresh` in the repo dir via cmd.exe.
# npm resolves to npm.cmd on Windows; cmd.exe /c is the reliable launcher.
$action = $taskDef.Actions.Create($TASK_ACTION_EXEC)
$action.Path = "$env:SystemRoot\System32\cmd.exe"
$action.Arguments = "/c npm run trending:refresh"
$action.WorkingDirectory = $RepoPath

# Register under the current interactive user token.
$null = $rootFolder.RegisterTaskDefinition(
  $TaskName,
  $taskDef,
  $TASK_CREATE_OR_UPDATE,
  $null,   # user (null -> current user)
  $null,   # password
  $TASK_LOGON_INTERACTIVE_TOKEN
)

Write-Host "Registered scheduled task '$TaskName'."
Write-Host "  Command:   cmd.exe /c npm run trending:refresh"
Write-Host "  WorkingDir: $RepoPath"
Write-Host "  Daily at:   $DailyTimeUtc UTC  (local StartBoundary: $startBoundary)"
Write-Host "  Verify:     Get-ScheduledTask -TaskName '$TaskName' | Get-ScheduledTaskInfo"
Write-Host "  Rollback:   pwsh src/services/trending-scheduler.ps1 -Unregister"
