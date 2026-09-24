# Phase 9 Marketplace API

REST API v1 for skill discovery and metadata.

## Endpoints

### GET /api/v1/skills

List published skills (paginated).

**Query Parameters:**
- `category` (optional) — Filter by category (e.g., "linting", "auth")
- `status` (optional, default: "published") — Skill status
- `limit` (optional, default: 50, max: 100) — Results per page
- `offset` (optional, default: 0) — Pagination offset
- `sort` (optional, default: "created_at") — Sort by: created_at, updated_at, name

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "skill-name",
      "category": "linting",
      "description": "...",
      "icon_url": "https://...",
      "owner": "user@example.com",
      "status": "published",
      "created_at": "2026-07-14T...",
      "updated_at": "2026-07-14T..."
    }
  ]
}
```

**Performance Target:** <100ms (p99)

---

### GET /api/v1/skills/search

Full-text search across skill names and descriptions.

**Query Parameters:**
- `q` (required) — Search query
- `limit` (optional, default: 50, max: 100) — Results per page
- `offset` (optional, default: 0) — Pagination offset

**Response:**
```json
{
  "data": [
    { "id": "uuid", "name": "...", "category": "...", ... }
  ]
}
```

**Performance Target:** <200ms (p99)

---

### GET /api/v1/skills/:id

Get skill detail with rating aggregate.

**Response:**
```json
{
  "data": {
    "id": "uuid",
    "name": "skill-name",
    "category": "...",
    "description": "...",
    "manifest_json": { ... },
    "rating": {
      "average": 4.5,
      "count": 23
    }
  }
}
```

**Errors:**
- 404: Skill not found

**Performance Target:** <50ms (p99)

---

### GET /api/v1/skills/:id/versions

Get all versions for a skill.

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "skill_id": "uuid",
      "version_tag": "1.2.0",
      "release_date": "2026-07-14",
      "changelog": "...",
      "checksum": "sha256...",
      "status": "published",
      "created_at": "2026-07-14T..."
    }
  ]
}
```

**Errors:**
- 404: Skill not found

---

### GET /api/v1/skills/trending

Get trending skills by installs (7d or 30d).

**Query Parameters:**
- `window` (optional, default: "30d") — Time window: "7d" or "30d"
- `limit` (optional, default: 50, max: 100) — Results per page

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "skill_id": "uuid",
      "name": "skill-name",
      "category": "linting",
      "installs_7d": 1250,
      "installs_30d": 5840,
      "rating_avg": 4.7,
      "rating_count": 156,
      "trend_direction": "up",
      "calculated_at": "2026-07-14T..."
    }
  ]
}
```

**Performance Target:** <100ms (p99)

---

## Setup

```bash
npm install
export DATABASE_URL="postgresql://user:pass@localhost/marketplace_dev"
npm run migrate
npm run api:dev
```

## Tests

```bash
npm test
```

## Error Handling

All endpoints return error responses as:
```json
{
  "error": "Human-readable error message"
}
```

Status codes:
- 200: Success
- 400: Bad request (missing required params)
- 404: Resource not found
- 500: Server error
