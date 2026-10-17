<!--
title: "Toolforge Marketplace & Tool Catalog Index"
status: active
owner: chris
last-reviewed: 2026-10-17
brand: product-toolforge
-->

# Toolforge Marketplace & Tool Catalog Index

Comprehensive catalog index of registered Claude Code plugins, marketplace API routes, architecture diagrams, and staging verification gates.

---

## Registered Claude Code plugins

| Plugin Name | Category | Scope | Source Specification | Install Command | Status |
|---|---|---|---|---|---|
| **worktree-cleanup** | Workflow / Git | Workspace triage and disk reclamation | Local (`./plugins/worktree-cleanup`) | `claude plugin install worktree-cleanup@toolforge` | Verified (`1.0.0`) |
| **morning-ingestion-pass** | Ingestion / Automation | Daily inbox triage and calendar digest | Local (`./plugins/morning-ingestion-pass`) | `claude plugin install morning-ingestion-pass@toolforge` | Verified (`1.0.0`) |
| **operational-ideas-harvest** | Extraction / Research | Notebook sweep and triage card generation | Local (`./plugins/operational-ideas-harvest`) | `claude plugin install operational-ideas-harvest@toolforge` | Verified (`1.0.0`) |
| **toolforge-core** | Core Platform | MCP adapters, execution engine, and dispatchers | External (`github:sorensencc-dotcom/toolforge`) | `claude plugin install toolforge-core@toolforge` | Pinned (`v2.95.7`) |

---

## Architectural diagrams (Cathryn Lavery standard)

Visual architecture specifications conforming to Cathryn Lavery's `diagram-design` standard (updated 2026-10-17):

1. **Marketplace Architecture** ([toolforge-marketplace-architecture.html](toolforge-marketplace-architecture.html))
   - Covers: Ingress, Claude Code catalog, validation, runtime API, Vite UI, and PostgreSQL pool.
   - Asset: `![Marketplace Architecture](toolforge-marketplace-architecture.png)`

2. **Platform Execution Overview** ([toolforge-architecture-overview.html](toolforge-architecture-overview.html))
   - Covers: Gateway authentication, sandbox execution runtime, tool registry, and storage.
   - Asset: `![Architecture Overview](toolforge-architecture-overview.png)`

3. **WhichLLM Model Selection Topology** ([whichllm-architecture-topology.html](whichllm-architecture-topology.html))
   - Covers: TorqueQuery router, WhichLLM adapter, OpenRouter preview, and local weights.
   - Asset: `![WhichLLM Topology](whichllm-architecture-topology.png)`

4. **TRM Cognitive Gap Triage** ([trm-gap-triage-architecture.html](trm-gap-triage-architecture.html))
   - Covers: Gap ingestion, FTS5 pre-sync, cognitive expansion, and RFC document synthesis.
   - Asset: `![TRM Gap Triage](trm-gap-triage-architecture.png)`

---

## Documentation and navigation map

### Setup and quickstart
- [[Home]]: Primary overview of the marketplace architecture and Claude Code integration.
- [[QUICKSTART]]: Quickstart instructions for Claude Code and local development.
- [[DOCS_INDEX]]: Master documentation catalog.
- [[GOVERNANCE]]: Marketplace governance rules, SemVer enforcement, and strict validation.

### Operational guides and runbooks
- [[TOOL_CREATION_GUIDE]]: Standard operating procedure for authoring new marketplace tools.
- [[OPERATOR_GUIDE]]: Runbook for managing tool state and database indexes.
- [[OPERATOR-COMMANDS]]: Direct command reference for operators.
- [[PRODUCTION_PREREQUISITES]]: Checklist of 28 infrastructure prerequisites for live deployment.
- [[OLLAMA_DEPLOYMENT_GUIDE]]: Deployment guide for local background LLM models.
- [[OLLAMA_PROVIDER_SETUP]]: Configuration reference for local Ollama providers.
- [[ROLLBACK_RUNBOOK]]: Procedures for rolling back database migrations and services.
- [[whichllm-model-selection-evaluator]]: Benchmarking and routing rules for WhichLLM.

### Audit logs
- [[CHECKLIST]]: Verification gate checklist.
- [[Log]]: Historical audit trail.
