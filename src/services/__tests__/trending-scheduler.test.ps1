# PowerShell Task Scheduler Registration Guard Smoke Test
# Location: src/services/__tests__/trending-scheduler.test.ps1

$ErrorActionPreference = "Stop"
$script:pass = 0
$script:fail = 0

function Assert-True {
    param([bool]$Condition, [string]$Label)
    if ($Condition) {
        Write-Host "  PASS: $Label" -ForegroundColor Green
        $script:pass++
    } else {
        Write-Host "  FAIL: $Label" -ForegroundColor Red
        $script:fail++
    }
}

$schedulerScript = Join-Path $PSScriptRoot "..\trending-scheduler.ps1"
Assert-True (Test-Path $schedulerScript) "trending-scheduler.ps1 script file exists"

# 1. XML Extraction and Schema Validation via [xml] parser
$xmlString = & pwsh $schedulerScript -TaskName "ToolforgeXmlTest" -DailyTimeUtc "00:00" -ExportXml *>&1 | Out-String
$xmlExit = $LASTEXITCODE
Assert-True ($xmlExit -eq 0) "-ExportXml exits 0"

[xml]$taskXml = $xmlString
Assert-True ($null -ne $taskXml.Task) "Exported XML parses as valid XML document"
Assert-True ($taskXml.Task.RegistrationInfo.Author -eq "CIC Team") "XML Author is 'CIC Team'"
Assert-True ($taskXml.Task.Triggers.CalendarTrigger.StartBoundary -match "^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$") "XML StartBoundary is ISO8601 formatted"
Assert-True ($taskXml.Task.Triggers.CalendarTrigger.ScheduleByDay.DaysInterval -eq "1") "XML DaysInterval is 1"
Assert-True ($taskXml.Task.Principals.Principal.LogonType -eq "InteractiveToken") "XML Principal LogonType is InteractiveToken"
Assert-True ($taskXml.Task.Settings.ExecutionTimeLimit -eq "PT1H") "XML ExecutionTimeLimit is PT1H"
Assert-True ($taskXml.Task.Settings.MultipleInstancesPolicy -eq "IgnoreNew") "XML MultipleInstancesPolicy is IgnoreNew"
Assert-True ($taskXml.Task.Actions.Exec.Command -match "cmd\.exe$") "XML Action Command points to cmd.exe"
Assert-True ($taskXml.Task.Actions.Exec.Arguments -eq "/c npm run trending:refresh") "XML Action Arguments is '/c npm run trending:refresh'"
Assert-True ($taskXml.Task.Actions.Exec.WorkingDirectory -match "toolforge|dev") "XML Action WorkingDirectory matches repo path"

# 2. Quotes, Ampersands, Angle Brackets, and Special Character Escaping
$specialTaskName = "Task_&_<Angle>_""Quote""_'Apos'"
$specialXmlString = & pwsh $schedulerScript -TaskName $specialTaskName -ExportXml *>&1 | Out-String
Assert-True ($LASTEXITCODE -eq 0) "ExportXml with quotes, ampersands, and angle brackets exits 0"
[xml]$specialXml = $specialXmlString
Assert-True ($null -ne $specialXml.Task) "XML containing special characters parses cleanly without schema syntax errors"

# 3. Timezone / UTC-to-Local conversion tests (00:00 UTC, 12:00 UTC, 23:59 UTC)
$timesToTest = @("00:00", "12:00", "23:59")
foreach ($t in $timesToTest) {
    $timeXmlStr = & pwsh $schedulerScript -DailyTimeUtc $t -ExportXml *>&1 | Out-String
    [xml]$timeXml = $timeXmlStr
    $boundary = $timeXml.Task.Triggers.CalendarTrigger.StartBoundary
    Assert-True ($boundary -match "^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$") "DailyTimeUtc '$t' generates valid local StartBoundary ($boundary)"
}

# 4. Strict Format Validation for DailyTimeUtc (rejects 3:00, 03:0, 24:00, 25:99, abc)
$invalidTimes = @("3:00", "03:0", "24:00", "25:99", "abc")
foreach ($inv in $invalidTimes) {
    $invOutput = & pwsh $schedulerScript -DailyTimeUtc $inv -DryRun *>&1 | Out-String
    $invExit = $LASTEXITCODE
    Assert-True ($invExit -ne 0) "Strict validation rejects invalid DailyTimeUtc '$inv'"
    Assert-True ($invOutput -match "DailyTimeUtc must be strictly two-digit") "Output contains strict format error for '$inv'"
}

# 5. Blank Task Name & Invalid Path Validation
$blankNameOutput = & pwsh $schedulerScript -TaskName "" -DryRun *>&1 | Out-String
Assert-True ($LASTEXITCODE -ne 0) "Blank TaskName returns non-zero exit code"
Assert-True ($blankNameOutput -match "TaskName cannot be blank") "Blank TaskName throws descriptive error"

$invalidPathOutput = & pwsh $schedulerScript -RepoPath "C:\nonexistent_repo_dir_12345" -DryRun *>&1 | Out-String
Assert-True ($LASTEXITCODE -ne 0) "Non-existent RepoPath returns non-zero exit code"
Assert-True ($invalidPathOutput -match "RepoPath does not exist") "Non-existent RepoPath throws descriptive error"

# 6. Dry-run and -WhatIf execution without COM instantiation
$dryRunOutput = & pwsh $schedulerScript -TaskName "DryRunNoComTest" -DryRun *>&1 | Out-String
Assert-True ($LASTEXITCODE -eq 0) "-DryRun mode exits 0"
Assert-True ($dryRunOutput -match "\[DRY-RUN\] Register scheduled task") "-DryRun outputs dry-run summary"

$whatIfOutput = & pwsh $schedulerScript -TaskName "WhatIfNoComTest" -WhatIf *>&1 | Out-String
Assert-True ($LASTEXITCODE -eq 0) "-WhatIf flag exits 0"
Assert-True ($whatIfOutput -match "\[DRY-RUN\] Register scheduled task") "-WhatIf triggers dry-run protection"

$unregWhatIf = & pwsh $schedulerScript -TaskName "UnregWhatIfTest" -Unregister -WhatIf *>&1 | Out-String
Assert-True ($LASTEXITCODE -eq 0) "-Unregister -WhatIf exits 0"
Assert-True ($unregWhatIf -match "\[DRY-RUN\] Unregister scheduled task") "-Unregister -WhatIf triggers dry-run protection"

Write-Host ""
Write-Host "Results: $script:pass passed, $script:fail failed" -ForegroundColor $(if ($script:fail -eq 0) { "Green" } else { "Red" })
if ($script:fail -gt 0) { exit 1 }
exit 0
