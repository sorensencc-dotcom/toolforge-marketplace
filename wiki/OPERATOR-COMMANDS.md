<!--
title: "Toolforge Phase 1.4–1.7 Operator Commands"
status: active
owner: chris
last-reviewed: 2026-09-27
brand: product-toolforge
-->

# Toolforge Phase 1.4–1.7 Operator Commands

Quick reference for running and testing all components.

---

## One-Command Full Test

```powershell
cd C:\dev\toolforge\utilities
./toolforgeSkillValidator.ps1 -Verbose
```

This runs:
1. Full validation suite
2. Dependency graph (1.4)
3. Metadata generator (1.5)
4. Health check (1.6)
5. Cowork auto-sync (1.7)

**Duration:** ~2-3 minutes  
**Output:** 6 reports + 1 JSON registry

---

## Individual Component Tests

### Phase 1.4 — Dependency Graph

```powershell
cd C:\dev\toolforge\utilities
./toolforgeDependencyGraph.ps1 -Verbose

# View output
code C:\dev\toolforge\skills\SKILLPACK-DEPENDENCY-GRAPH.md
```

**Checks:**
- ✅ Cycles
- ✅ Orphans
- ✅ Missing deps
- ✅ Dependency depth

---

### Phase 1.5 — Metadata Generator

```powershell
cd C:\dev\toolforge\utilities
./toolforgeMetadataGenerator.ps1 -Verbose

# View JSON
$meta = Get-Content C:\dev\toolforge\skills\SKILLPACK-METADATA.json | ConvertFrom-Json
$meta | ConvertTo-Json -Depth 3 | code

# View summary
code C:\dev\toolforge\skills\SKILLPACK-METADATA-SUMMARY.md
```

**Output:**
- `SKILLPACK-METADATA.json` (canonical registry)
- `SKILLPACK-METADATA-SUMMARY.md` (human-readable)

---

### Phase 1.6 — Health Check

```powershell
cd C:\dev\toolforge\utilities
./toolforgeSkillHealthCheck.ps1 -Verbose

# View results
code C:\dev\toolforge\skills\SKILLPACK-RUNTIME-HEALTH.md

# Extract health summary
Select-String -Path "C:\dev\toolforge\skills\SKILLPACK-RUNTIME-HEALTH.md" -Pattern "✅|⚠️|❌" | Select-Object -First 20
```

**Checks per skill:**
- Entrypoint existence
- Runtime availability
- Dependencies availability
- Syntax validation (dry-run)
- Manifest consistency
- Audit log presence

---

### Phase 1.7 — Cowork Auto-Sync

```powershell
cd C:\dev\toolforge\daemons
./cowork-auto-sync.ps1 -Verbose

# View sync report
code C:\dev\toolforge\audit\COWORK-AUTO-SYNC-REPORT.md

# Verify registry updated
code C:\dev\toolforge\audit\COWORK-REGISTERED-SKILLS.md
```

**Actions:**
- Scans canonical skills
- Compares with Cowork
- Registers new skills
- Updates changed skills
- Triggers all validators

---

## Common Operations

### View All Health Status

```powershell
# Quick health snapshot
$health = Get-Content C:\dev\toolforge\skills\SKILLPACK-RUNTIME-HEALTH.md | Select-String "✅|⚠️|❌" | Select-Object -First 5
$health | Write-Host -ForegroundColor Cyan
```

### List All Skills

```powershell
$meta = Get-Content C:\dev\toolforge\skills\SKILLPACK-METADATA.json | ConvertFrom-Json
$meta.skills | Select-Object id, version, status, @{n='health';e={$_.health.overall}} | Format-Table
```

### Check Skill Dependencies

```powershell
$meta = Get-Content C:\dev\toolforge\skills\SKILLPACK-METADATA.json | ConvertFrom-Json
$skillId = "tool-lifecycle-manager"
$meta.skills | Where-Object {$_.id -eq $skillId} | Select-Object -ExpandProperty dependencies
```

### Export Metadata for External Use

```powershell
$meta = Get-Content C:\dev\toolforge\skills\SKILLPACK-METADATA.json | ConvertFrom-Json
$meta | ConvertTo-Json -Depth 10 | Out-File "C:\dev\toolforge\audit\METADATA-EXPORT-$(Get-Date -Format 'yyyy-MM-dd').json"
```

---

## Troubleshooting

### "Dependency Graph Shows All Orphans"

Skills with no internal dependencies (normal for independent skills).

**Fix:** Add dependencies to skill SKILL.json:

```json
{
  "dependencies": {
    "internal": ["required-skill"],
    "external": ["external-tool"]
  }
}
```

---

### "Health Check Shows WARN on Audit Log"

Skills haven't been executed yet (no runtime history).

**Fix:** Run the skill once:

```powershell
cd C:\dev\toolforge
./run-tool.ps1 -Skill tool-lifecycle-manager
```

---

### "Metadata JSON Parse Error"

Corrupted or incomplete JSON generation.

**Fix:** Regenerate:

```powershell
cd C:\dev\toolforge\utilities
Remove-Item C:\dev\toolforge\skills\SKILLPACK-METADATA.json -Force
./toolforgeMetadataGenerator.ps1 -Verbose
```

---

### "Cowork Sync Reports Errors"

Validators triggered but failed.

**Check logs:**

```powershell
code C:\dev\toolforge\audit\COWORK-AUTO-SYNC-REPORT.md

# Look for:
# - Phase 1: "Scanned: X skills scanned"
# - Phase 3: "Phase 3 complete: X registered, Y updated"
# - Phase 5: "Triggered: ..." or "Error triggering ..."
```

---

## Scheduled Automation

### Register Daily Sync

```powershell
$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -File C:\dev\toolforge\daemons\cowork-auto-sync.ps1"

$trigger = New-ScheduledTaskTrigger -Daily -At 09:15AM

Register-ScheduledTask `
  -Action $action `
  -Trigger $trigger `
  -TaskName "ToolforgeCoworkAutoSync" `
  -Description "Sync Toolforge ↔ Cowork daily"
```

### Verify Scheduled Job

```powershell
Get-ScheduledTask -TaskName "ToolforgeCoworkAutoSync" | Select-Object State, LastRunTime, NextRunTime
```

### Manual Trigger

```powershell
Start-ScheduledTask -TaskName "ToolforgeCoworkAutoSync"
```

---

## Slack Notifications

All components support Slack notifications if configured.

**Setup:**

```powershell
# Set webhook URL
$env:SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/T.../B.../..."

# Run sync (will post to Slack)
cd C:\dev\toolforge\daemons
./cowork-auto-sync.ps1
```

---

## Reports Location

| Phase | Report | Path |
|-------|--------|------|
| 1.4 | Dependency Graph | `skills/SKILLPACK-DEPENDENCY-GRAPH.md` |
| 1.5 | Metadata (JSON) | `skills/SKILLPACK-METADATA.json` |
| 1.5 | Metadata (Summary) | `skills/SKILLPACK-METADATA-SUMMARY.md` |
| 1.6 | Runtime Health | `skills/SKILLPACK-RUNTIME-HEALTH.md` |
| 1.7 | Cowork Sync | `audit/COWORK-AUTO-SYNC-REPORT.md` |

---

**Last Updated:** 2026-06-28  
**Operator Guide Version:** 1.0  
**Phases Covered:** 1.4, 1.5, 1.6, 1.7

