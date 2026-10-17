<!--
title: "Toolforge Marketplace Quickstart"
status: active
owner: chris
last-reviewed: 2026-10-17
brand: product-toolforge
-->

# Toolforge Marketplace Quickstart

Guide for installing verified plugins in Claude Code and setting up the local development stack.

---

## 1. Claude Code plugin installation

To register the Toolforge Marketplace catalog in your local Claude Code CLI:

```bash
claude plugin marketplace add sorensencc-dotcom/toolforge-marketplace
```

To install verified plugins directly from the catalog:

```bash
# Worktree audit and safe pruning
claude plugin install worktree-cleanup@toolforge

# Morning ingestion pass and inbox signal digest
claude plugin install morning-ingestion-pass@toolforge

# Operational ideas harvest and triage cards
claude plugin install operational-ideas-harvest@toolforge

# Core Toolforge execution utilities (pinned to release v2.95.7)
claude plugin install toolforge-core@toolforge
```

To verify installed plugins:

```bash
claude plugin list
```

---

## 2. Local development stack setup

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- `jq` 1.6+

### Step-by-step setup

1. Clone the repository:
   ```bash
   git clone https://github.com/sorensencc-dotcom/toolforge-marketplace.git
   cd toolforge-marketplace
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   ```bash
   export DATABASE_URL="postgresql://localhost:5432/marketplace"
   export DB_POOL_MAX=50
   export PORT=3000
   ```

4. Run database migrations:
   ```bash
   npm run migrate
   ```

5. Launch the runtime API service:
   ```bash
   npm run api:dev
   ```

6. Launch the Vite web UI in a separate terminal:
   ```bash
   npm run ui:dev
   ```

Open `http://localhost:5173` to explore the marketplace UI.

---

## 3. Validation and static compilation workflow

To validate catalog schemas, prevent directory traversal, and enforce strict release pinning:

```bash
npm run validate:marketplace
```

To re-compile the static UI catalog artifact after modifying `.claude-plugin/marketplace.json`:

```bash
npm run build:catalog
```

---

## 4. Test execution

To execute the core test suite (unit, SemVer, resilient DB, and analytics):

```bash
npm test
```

To run web UI component tests:

```bash
npm run ui:test
```

To execute a full production build:

```bash
npm run ui:build
```
