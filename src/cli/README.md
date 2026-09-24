# Toolforge CLI

Command-line interface for Marketplace integration.

## Installation

```bash
npm install -g toolforge-marketplace
# or use local: node src/cli/index.js
```

## Commands

### toolforge list

List available skills.

**Options:**
- `--category, -c` — Filter by category
- `--limit, -l` — Number to show (default: 20)
- `--api-url` — API endpoint (default: http://localhost:3000)

**Examples:**
```bash
toolforge list
toolforge list --category linting --limit 50
toolforge list -c auth -l 10
```

**Output:**
```
Available Skills (42 total):

skill-name-1
  Category: linting
  Rating: 4.5 (23 reviews)
  Owner: user@example.com
  Description of the skill...

skill-name-2
  Category: auth
  Rating: 4.8 (15 reviews)
  Owner: another@example.com
  ...
```

---

### toolforge search `<query>`

Search for skills.

**Options:**
- `--limit, -l` — Number of results (default: 20)
- `--api-url` — API endpoint

**Examples:**
```bash
toolforge search auth
toolforge search "linting rules" --limit 5
toolforge search middleware -l 20 --api-url http://api.example.com
```

**Output:**
```
Search Results for "auth" (8 found):

skill-name
  Category: auth
  Rating: 4.5 (23 reviews)
  Owner: user@example.com
  Description...
  Install: toolforge install skill-name
```

---

### toolforge install `<skill-name>`

Install a skill.

**Options:**
- `--version, -v` — Specific version (default: latest)
- `--destination, -d` — Where to install (default: ./skills)
- `--api-url` — API endpoint

**Examples:**
```bash
toolforge install my-skill
toolforge install my-skill --version 1.2.0
toolforge install my-skill --destination ~/.toolforge/skills
toolforge install my-skill -v 1.0.0 -d /opt/skills
```

**Output:**
```
Installing skill: my-skill
✓ Successfully installed my-skill v1.5.0
  Location: ./skills
  Entrypoint: src/index.js
```

Creates `.toolforge-install.json` with metadata:
```json
{
  "skill": "my-skill",
  "skillId": "uuid",
  "version": "1.5.0",
  "installedAt": "2026-07-14T...",
  "entrypoint": "src/index.js",
  "runtime": "node"
}
```

---

## Global Options

- `--api-url` — Override API endpoint
- `--verbose, -v` — Enable debug output
- `--help, -h` — Show help

## Environment Variables

- `USER` — User identifier for install logging (defaults to 'cli-user')

## Integration with toolforge install

After installing a skill, the entrypoint and runtime info is saved in `.toolforge-install.json`. Use this to:
- Load and execute the skill
- Track installed versions
- Manage dependencies
