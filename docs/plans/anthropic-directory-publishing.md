# Anthropic directory publishing plan

Plan for submitting Toolforge Marketplace plugins and connectors to the official Anthropic Claude Directory.

---

## Objectives

1. Submit Toolforge plugins (`worktree-cleanup`, `morning-ingestion-pass`, `operational-ideas-harvest`, and `toolforge-core`) to the Anthropic Claude Directory.
2. Maintain organization-level ownership under Cast Iron Productions LLC.
3. Establish continuous directory validation and update pipelines.

---

## Directory submission models

Anthropic accepts two kinds of listings in the developer portal:

| Dimension | Plugin bundle | MCP connector |
|---|---|---|
| **Payload** | Directory containing skills, hooks, commands, agents, and configuration | Remote MCP server endpoint accessible over HTTPS or SSE |
| **Origin** | Public GitHub repository | Live server URL with optional OAuth configuration |
| **Display** | Listed as a plugin with component breakdown | Listed as a connector for Claude desktop and web |
| **Telemetry** | Installation count, version adoption, and skill usage | Health checks, latency, and tool-level invocation rates |

---

## Pre-submission requirements

Before initiating a submission at `claude.ai/directory/manage`, confirm the following prerequisites:

1. **Account tier.** The submitting account must hold a paid plan (Pro, Max, Team, or Enterprise).
2. **Organization role.** The submitter must hold the Owner role or have explicit Directory permissions assigned under Organization settings.
3. **Repository visibility.** The GitHub repository must be public before the submission is approved and listed.
4. **Manifest integrity.** Every plugin bundle must pass `scripts/validate.sh --strict` with zero schema errors, path traversal attempts, or floating branch references.

---

## Pre-submission checklist

- [ ] Verify repository visibility is public on `github.com/sorensencc-dotcom/toolforge-marketplace`.
- [ ] Confirm `.claude-plugin/marketplace.json` defines owner as `Cast Iron Productions LLC` with `info@castironcharlie.com`.
- [ ] Run `npm run validate:marketplace` locally and verify that all 4 plugins pass strict validation.
- [ ] Run `npm test` to confirm test suite integrity.
- [ ] Verify that each plugin directory contains a complete `README.md`, `.claude-plugin/plugin.json`, and valid `SKILL.md` documents.
- [ ] Confirm external repository sources pin immutable release tags or 40-character commit SHAs.

---

## Submission workflow

### 1. Access the developer portal

To access the directory management console, navigate to [claude.ai/directory/manage](https://claude.ai/directory/manage) in an authenticated browser session.

### 2. Register the plugin bundle

1. In the developer portal, select **Submit new**.
2. Under **What would you like to submit?**, choose **Plugin bundle**.
3. Supply the GitHub repository URL (`https://github.com/sorensencc-dotcom/toolforge-marketplace`).
4. Select the target plugin folder (such as `plugins/worktree-cleanup`).
5. Complete the checklist items covering description, author attribution, and icon assets.
6. Submit the bundle for review.

### 3. Review and scanning lifecycle

After submission, Anthropic processes the listing through three phases:

1. **Automated validation.** Scans manifest structure, permission requirements, and file integrity.
2. **Security scan.** Audits dependencies, network endpoints, and sandboxing compliance.
3. **Human review.** Evaluates functionality and user experience against the Anthropic Software Directory Policy.

---

## Post-publishing maintenance

To push updates after directory approval, merge changes directly to the tracked production branch. The Anthropic Directory automatically scans new commits and distributes updates to active installations.
