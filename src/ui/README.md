# Toolforge Marketplace UI

React SPA for skill discovery and installation.

## Features

- **Skill Browser** — List, search, filter by category
- **Skill Detail** — View metadata, versions, ratings
- **Installation Flow** — Install skills with status feedback
- **Responsive Design** — Mobile + desktop optimized

## Architecture

**Pages:**
- `pages/SkillList.jsx` — Browse skills with search/filter
- `pages/SkillDetail.jsx` — View skill details + versions

**Components:**
- `components/SearchBar.jsx` — Search + category filter
- `components/SkillCard.jsx` — Skill preview card

**Styling:**
- `styles/App.css` — Global styles (500+ lines)

## Setup

```bash
npm install
npm run ui:dev
```

Runs on `http://localhost:5173` with proxy to API on `http://localhost:3000`.

## Build

```bash
npm run ui:build
```

Outputs to `dist/` directory (production-ready SPA).

## API Integration

Connects to:
- `GET /api/v1/skills` — List skills
- `GET /api/v1/skills/search` — Search
- `GET /api/v1/skills/{id}` — Detail
- `GET /api/v1/skills/{id}/versions` — Versions

All requests handled via axios with error handling + loading states.

## Design System

**Colors:**
- Primary: #667eea (purple)
- Success: #28a745 (green)
- Background: #f5f5f5 (light gray)

**Typography:**
- Font family: System fonts (Apple, Segoe UI, Roboto)
- Responsive sizing (1rem base)

**Components:**
- Cards with hover effects
- Badge system (categories, versions)
- Modal-free navigation (back button)
