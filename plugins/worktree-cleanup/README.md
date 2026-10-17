# Worktree cleanup

Audit, triage, and prune git worktrees across local repositories.

## Overview

Stale git worktrees accumulate across multi-branch and multi-agent development sessions, consuming disk space and locking branches. This plugin provides automated discovery, safety checks, and deterministic pruning of linked worktrees.

## Quick start

To audit active worktrees without modifying state:
```bash
claude plugin exec worktree-cleanup -- --audit
```

To run safe triage and list prune candidates:
```bash
claude plugin exec worktree-cleanup -- --triage
```

To prune merged and orphaned worktrees:
```bash
claude plugin exec worktree-cleanup -- --prune
```

## Features

- **Automated audit**: Inspect all registered git worktrees across target repositories.
- **Safety triage**: Verify git branch status, uncommitted changes, and merge states before staging deletions.
- **Deterministic pruning**: Remove directory paths, delete stale tracking metadata, and run `git worktree prune`.
