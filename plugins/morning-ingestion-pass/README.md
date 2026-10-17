# Morning ingestion pass

Automate morning calendar ingestion, inbox classification, and drift checks.

## Overview

Morning ingestion aggregates signals across calendar events and unread inbox messages, filters operational alerts from newsletters, and verifies synchronization across knowledge repositories.

## Quick start

To run a dry-run ingestion pass:
```bash
claude plugin exec morning-ingestion-pass -- --dry-run
```

To execute a full morning pass and generate the briefing:
```bash
claude plugin exec morning-ingestion-pass -- --days 7 --classify
```

## Features

- **Calendar ingestion**: Extract upcoming scheduled commitments within a 7-day lookahead window.
- **Inbox classification**: Parse unread messages, score priority items, and isolate newsletters.
- **Drift verification**: Assert consistency between local workspaces and external tracking registries.
