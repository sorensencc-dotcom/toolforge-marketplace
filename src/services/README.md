# Phase 9 Services

Backend business logic for analytics and metric aggregation.

## Analytics Service

Logs installations and calculates trending metrics.

**Core Functions:**

### logInstall(db, payload)

Log a skill installation event.

**Parameters:**
- `skillId` (required) — UUID of skill
- `versionId` (optional) — UUID of specific version
- `userId` (required) — Email or identifier of installer
- `status` (optional, default: 'success') — 'success' or 'failed'
- `errorMessage` (optional) — Error details if status='failed'

**Example:**
```javascript
import { logInstall } from './src/services/analytics.js';

await logInstall(db, {
  skillId: 'uuid-here',
  versionId: 'version-uuid',
  userId: 'user@example.com',
  status: 'success',
});
```

---

### updateTrendingForSkill(db, skillId)

Recalculate trending metrics for a skill.

**Calculates:**
- `installs_7d` — Successful installs in last 7 days
- `installs_30d` — Successful installs in last 30 days
- `rating_avg` — Average rating score
- `rating_count` — Total ratings
- `trend_direction` — 'up', 'down', or 'stable' (vs previous 7 days)

**Example:**
```javascript
await updateTrendingForSkill(db, skillId);
```

---

### getBatchTrending(db, options)

Fetch trending skills (read-only).

**Options:**
- `window` — '7d' or '30d' (default: '30d')
- `limit` — Results limit (default: 50)

**Example:**
```javascript
const trending = await getBatchTrending(db, { window: '7d', limit: 20 });
```

---

### getInstallStats(db, skillId, options)

Get daily installation breakdown.

**Options:**
- `days` — Time window in days (default: 30)

**Returns:**
```javascript
[
  {
    date: '2026-07-14',
    count: 42,        // total attempts
    successes: 40,    // successful installs
    failures: 2       // failed installs
  }
]
```

---

### getInstallSuccess(db, skillId)

Get overall installation success rate.

**Returns:**
```javascript
{
  total: 100,
  successes: 95,
  failures: 5,
  successRate: 95.00
}
```

---

## Error Handling

```javascript
import { logInstall, AnalyticsError } from './src/services/analytics.js';

try {
  await logInstall(db, { skillId, userId });
} catch (error) {
  if (error instanceof AnalyticsError) {
    console.error('Analytics error:', error.message);
  }
}
```

---

## Testing

```bash
npm test src/services/
```

Tests validate input validation (no DB required for unit tests).
Integration tests require running database.
