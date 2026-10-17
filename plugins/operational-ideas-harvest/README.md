# Operational ideas harvest

Sweep operational notebooks and emit strongly-typed triage cards.

## Overview

Operational ideas harvest scans research notebooks, incident retrospectives, and scratchpads for actionable concepts. It structures unstructured musings into typed, schema-validated triage cards ready for queue insertion.

## Quick start

To sweep notebooks and preview extracted candidates:
```bash
claude plugin exec operational-ideas-harvest -- --sweep --dry-run
```

To emit triage cards into a target directory:
```bash
claude plugin exec operational-ideas-harvest -- --sweep --output-dir ./triage
```

## Features

- **Notebook sweep**: Inspect Markdown and Jupyter notebooks for highlighted takeaways, action items, and problem statements.
- **Typed triage cards**: Generate JSON envelopes with severity, required effort, target systems, and verification criteria.
- **Deduplication**: Match proposed ideas against existing issues and backlog cards.
