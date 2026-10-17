---
name: morning-ingestion-pass
description: Deterministic morning ingestion pass and daily inbox signal digest.
compatibility: claude-code
---

# Morning ingestion pass

## Trigger

Invoke this skill when:
- Running scheduled daily ingestion routines at 06:00 AM ET.
- Performing manual morning inbox summaries and calendar checks.
- Verifying workspace drift against tracking registries before morning workflows.

## Input schema

| Parameter | Type | Required | Description |
|---|---|---|---|
| `--days` | integer | No | Calendar lookahead window in days (default: 7). |
| `--unread-only` | boolean | No | Ingest unread email messages from the past 24 hours (default: true). |
| `--classify` | boolean | No | Tag items into red (critical), yellow (actionable), or blue (fyi). |
| `--check-drift` | boolean | No | Audit workspace pointers against remote repository heads. |
| `--dry-run` | boolean | No | Print extracted telemetry without persisting records or alerts. |

## Output schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["date", "run_id", "status", "calendar_events", "inbox_digest", "drift_signals"],
  "properties": {
    "date": { "type": "string", "pattern": "^[0-9]{8}$" },
    "run_id": { "type": "string" },
    "status": { "type": "string", "enum": ["COMPLETE", "DEGRADED", "PARTIAL"] },
    "calendar_events": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "title": { "type": "string" },
          "start_time": { "type": "string", "format": "date-time" },
          "end_time": { "type": "string", "format": "date-time" }
        }
      }
    },
    "inbox_digest": {
      "type": "object",
      "properties": {
        "total_unread": { "type": "integer" },
        "red_items": { "type": "integer" },
        "yellow_items": { "type": "integer" },
        "newsletters": { "type": "integer" }
      }
    },
    "drift_signals": {
      "type": "array",
      "items": { "type": "string" }
    }
  }
}
```

## Execution workflow

1. To ingest calendar commitments, query the calendar provider for events in the next `--days` window.
2. To build the daily inbox digest, fetch unread emails from the last 24 hours and score priority items.
3. To execute drift checks, compare active workspace commit heads with upstream tracking remotes.
4. To finish the pass, assemble the structured telemetry payload and output the morning briefing summary.
