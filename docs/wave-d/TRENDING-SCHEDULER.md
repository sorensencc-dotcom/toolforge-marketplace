# Trending Scheduler — Install / Verify / Rollback Runbook

**Wave D deliverable. NOT auto-installed.** The scheduler script is a code
artifact. It registers a Windows Scheduled Task in a *provisioned target
environment*; it is never run automatically by this repo or by CI.

Script: `src/services/trending-scheduler.ps1`
Task invoked: `npm run trending:refresh` -> `src/services/trending-batch.js`
(`runTrendingRefresh(db)` — set-based `trending_metrics` upsert for all skills).

## What it does

Registers a Windows Scheduled Task (`ToolforgeTrendingRefresh`) that runs the
trending refresh once daily at **00:00 UTC**. Uses the **Schedule.Service COM**
API directly (Task Scheduler 2.0), per the project's proven pattern
(`session-2026-07-12-wmi-solution.md`) — `schtasks.exe` hangs when driven from
Node, and WMI's `Win32_ScheduledTask` has incomplete property coverage.

Key task settings:
- Daily trigger, `DaysInterval = 1`.
- `StartWhenAvailable = true` — if the box is asleep/off at 00:00, the run fires
  when it next wakes (avoids silently skipping a day).
- `ExecutionTimeLimit = PT1H` — a hung refresh is killed after an hour.
- `MultipleInstances = IgnoreNew` — overlapping runs never stack.
- Runs under the current interactive user token.

## Prerequisites (target env)

- Windows with Task Scheduler + PowerShell 7 (`pwsh`).
- Node.js >= 20 and `npm` on PATH (the task shells `cmd.exe /c npm run …`).
- Repo checked out; dependencies installed (`npm install`).
- `DATABASE_URL` reachable by the trending-refresh process at run time (set it in
  the machine/user environment, or a `.env` the batch loads via `dotenv`).

## Install

From the repo root, run **one** of:

```powershell
# via npm script
npm run trending:schedule

# or directly (equivalent)
pwsh src/services/trending-scheduler.ps1
```

Options:

```powershell
# custom UTC time-of-day (default 00:00)
pwsh src/services/trending-scheduler.ps1 -DailyTimeUtc "02:30"

# custom repo path / task name
pwsh src/services/trending-scheduler.ps1 -RepoPath "C:\dev" -TaskName "ToolforgeTrendingRefresh"
```

The script is **idempotent**: it deletes any existing task of the same name
before creating it, so re-running is safe and never duplicates the task.

## Verify

```powershell
# Task exists + last/next run + last result
Get-ScheduledTask -TaskName "ToolforgeTrendingRefresh" | Get-ScheduledTaskInfo

# Full definition (trigger, action, settings)
Get-ScheduledTask -TaskName "ToolforgeTrendingRefresh" | Format-List *

# Dry-run the task now (does not wait for 00:00)
Start-ScheduledTask -TaskName "ToolforgeTrendingRefresh"

# Confirm the underlying command works standalone
npm run trending:refresh
# -> "Trending refresh complete: <N> skills in <ms>ms"
```

A healthy run leaves `LastTaskResult = 0`. Non-zero indicates the batch failed —
check `DATABASE_URL`, DB reachability, and that migrations `0001`/`0002` are
applied (the batch writes `trending_metrics.trend_score`, added in `0002`).

## Rollback

```powershell
# via npm script
npm run trending:unschedule

# or directly (equivalent)
pwsh src/services/trending-scheduler.ps1 -Unregister
```

Removing the task stops future refreshes. The API keeps serving the last-good
`trending_metrics` rows (graceful degradation — trending is a slow-moving
signal), so unscheduling is non-destructive to reads.

## DST / timezone note

Task Scheduler triggers fire in **local** time. The script converts the desired
`00:00 UTC` to the box's local time *at registration* and sets that as the
`StartBoundary`. If the machine's local timezone observes DST, the effective UTC
fire time will shift by one hour across a DST boundary until the task is
re-registered. Options for a strict, DST-stable 00:00 UTC:

- Run the target box on UTC (recommended for servers), so local == UTC; or
- Re-run `npm run trending:schedule` after each DST transition (idempotent); or
- Accept the ±1h intra-day drift — trending is a 7/30-day window signal and is
  insensitive to an hour of scheduling jitter.
