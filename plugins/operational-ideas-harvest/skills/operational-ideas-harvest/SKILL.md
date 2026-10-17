---
name: operational-ideas-harvest
description: Sweep operational notebooks and emit strongly-typed triage cards.
compatibility: claude-code
---

# Operational ideas harvest

## Trigger

Invoke this skill when:
- Parsing recent research, retro, or brainstorming notebooks for action items.
- Converting operational insights into backlog triage cards.
- Triaging pending technical debt and proposed architectural fixes.

## Input schema

| Parameter | Type | Required | Description |
|---|---|---|---|
| `--vault-path` | string | No | Directory path to target notebooks or documentation vaults (default: current directory). |
| `--sweep` | boolean | No | Initiate text extraction across all eligible notebook and journal files. |
| `--output-dir` | string | No | Destination directory for emitted triage card files. |
| `--min-confidence` | number | No | Minimum relevance score (0.0 to 1.0) required to produce a triage card (default: 0.7). |
| `--dry-run` | boolean | No | Output triage card payloads to stdout without writing files. |

## Output schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["harvest_id", "timestamp", "scanned_files", "triage_cards"],
  "properties": {
    "harvest_id": { "type": "string" },
    "timestamp": { "type": "string", "format": "date-time" },
    "scanned_files": { "type": "integer" },
    "triage_cards": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["card_id", "title", "source_file", "category", "confidence", "action_items"],
        "properties": {
          "card_id": { "type": "string" },
          "title": { "type": "string" },
          "source_file": { "type": "string" },
          "category": { "type": "string", "enum": ["feature", "refactor", "bugfix", "chore", "research"] },
          "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
          "action_items": {
            "type": "array",
            "items": { "type": "string" }
          }
        }
      }
    }
  }
}
```

## Execution workflow

1. To execute a notebook sweep, traverse target directories in `--vault-path` and extract candidate blocks.
2. To extract actionable insights, filter candidate blocks by priority markers and intent keywords.
3. To format strongly-typed triage cards, validate card metadata against the JSON schema.
4. To persist results, write each validated triage card to `--output-dir`.
