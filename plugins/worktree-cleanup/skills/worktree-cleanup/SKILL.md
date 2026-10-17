---
name: worktree-cleanup
description: Audit, safely triage, and prune git worktrees across local repositories.
compatibility: claude-code
---

# Worktree cleanup

## Trigger

Invoke this skill when:
- Git worktree listings contain orphaned, stale, or merged directories.
- Branch switches fail due to linked worktree locks.
- Disk reclamation passes target `.claude/worktrees/` or local scratch trees.

## Input schema

| Parameter | Type | Required | Description |
|---|---|---|---|
| `--path` | string | No | Root path to scan for git repositories (default: current directory). |
| `--audit` | boolean | No | Read-only scan of all registered worktrees and tracking metadata. |
| `--triage` | boolean | No | Classify worktrees into active, unmerged, and safe-to-prune sets. |
| `--prune` | boolean | No | Delete qualified directories and unregister worktrees. |
| `--dry-run` | boolean | No | Report scheduled prune actions without mutating filesystem state. |

## Output schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["timestamp", "audited_worktrees", "pruned_worktrees", "status"],
  "properties": {
    "timestamp": { "type": "string", "format": "date-time" },
    "audited_worktrees": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "path": { "type": "string" },
          "branch": { "type": "string" },
          "commit": { "type": "string" },
          "is_clean": { "type": "boolean" },
          "is_merged": { "type": "boolean" },
          "state": { "type": "string", "enum": ["active", "dirty", "stale", "pruned"] }
        }
      }
    },
    "pruned_worktrees": {
      "type": "array",
      "items": { "type": "string" }
    },
    "status": { "type": "string", "enum": ["AUDITED", "PRUNED", "NOOP"] }
  }
}
```

## Execution workflow

1. To list all worktrees, execute `git worktree list --porcelain`.
2. To triage uncommitted changes, check `git status --porcelain` in each candidate path.
3. To test merge state, inspect `git branch --merged` against the base branch.
4. To prune safe worktrees, remove target directories and run `git worktree prune`.
