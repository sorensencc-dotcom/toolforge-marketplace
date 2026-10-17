<!--
title: "Toolforge Marketplace Documentation Index"
status: active
owner: chris
last-reviewed: 2026-10-17
brand: product-toolforge
-->

# Toolforge Marketplace Documentation Index

Index of all architecture specifications, visual diagrams, plugin guides, and operational runbooks for the Toolforge Marketplace.

---

## Architecture diagrams (Cathryn Lavery standard)

All diagrams below follow Cathryn Lavery's `diagram-design` standard using the updated 2026-10-17 tokens (`#f5f5f5` paper, `#2d3142` ink, `#4f5d75` muted, `#bf4520` burnt-tangerine accent, `Instrument Serif` titles, `Geist` sans node names, and `Geist Mono` technical sublabels).

| Diagram Name | Standalone HTML | Rendered PNG Asset | System Scope |
|---|---|---|---|
| **Marketplace Architecture** | [toolforge-marketplace-architecture.html](toolforge-marketplace-architecture.html) | `![Marketplace Architecture](toolforge-marketplace-architecture.png)` | Client ingress, Claude Code catalog, validation, REST API, UI, and PostgreSQL pool. |
| **Platform Execution Overview** | [toolforge-architecture-overview.html](toolforge-architecture-overview.html) | `![Architecture Overview](toolforge-architecture-overview.png)` | Gateway layer, sandboxed execution runtime, tool registry, and telemetry. |
| **WhichLLM Model Selection Topology** | [whichllm-architecture-topology.html](whichllm-architecture-topology.html) | `![WhichLLM Topology](whichllm-architecture-topology.png)` | TorqueQuery router, WhichLLM adapter, OpenRouter preview, and local weights. |
| **TRM Cognitive Gap Triage** | [trm-gap-triage-architecture.html](trm-gap-triage-architecture.html) | `![TRM Gap Triage](trm-gap-triage-architecture.png)` | Closed-loop gap triage, SQLite FTS5 search, query expansion, and RFC note synthesis. |

---

## Verified Claude Code marketplace plugins

| Plugin Name | Type | Directory / Target | Manifest Path | Status |
|---|---|---|---|---|
| **worktree-cleanup** | Local Plugin | `plugins/worktree-cleanup` | `plugins/worktree-cleanup/.claude-plugin/plugin.json` | Verified (`1.0.0`) |
| **morning-ingestion-pass** | Local Plugin | `plugins/morning-ingestion-pass` | `plugins/morning-ingestion-pass/.claude-plugin/plugin.json` | Verified (`1.0.0`) |
| **operational-ideas-harvest** | Local Plugin | `plugins/operational-ideas-harvest` | `plugins/operational-ideas-harvest/.claude-plugin/plugin.json` | Verified (`1.0.0`) |
| **toolforge-core** | External Repo | `github:sorensencc-dotcom/toolforge` | Pinned to release `v2.95.7` (`bdd6dca8d0...`) | Pinned (`v2.95.7`) |

---

## Marketplace core documentation

- [[Home]]: Primary overview of the Toolforge Marketplace, subsystems, and distribution channels.
- [[QUICKSTART]]: Step-by-step onboarding guide for Claude Code users and developers.
- [[INDEX]]: Complete index of skills, categories, and command parameters.
- [[GOVERNANCE]]: Operational governance, SemVer compliance rules, and strict validation policies.

---

## Operational and infrastructure runbooks

- [[TOOL_CREATION_GUIDE]]: Instructions for packaging and registering new tools into the catalog.
- [[OPERATOR_GUIDE]]: Day-to-day operations, registry maintenance, and cache invalidation.
- [[OPERATOR-COMMANDS]]: Command-line quick reference for operators and automated daemons.
- [[PRODUCTION_PREREQUISITES]]: Environmental requirements, PostgreSQL configuration, and network topology.
- [[OLLAMA_DEPLOYMENT_GUIDE]]: Local inference setup for background query expansion and model routing.
- [[OLLAMA_PROVIDER_SETUP]]: Provider adapter configuration for local open-weight LLMs.
- [[ROLLBACK_RUNBOOK]]: Emergency rollback procedures for corrupted migrations or database failovers.
- [[whichllm-model-selection-evaluator]]: BFCL evaluation benchmark and model routing thresholds.

---

## Audits and verification logs

- [[CHECKLIST]]: Release verification gate checklist.
- [[Log]]: Historical audit trail and change record.
