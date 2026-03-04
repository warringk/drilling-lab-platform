# Claude Code Project Instructions — Drilling Lab Platform

## What This Repo Is

This is the **web application** for The Drilling Lab — a React + Express app served at `app.drillinglab.ai`.

- `src/` — React frontend (Vite + React Router, dark theme, Plotly charts)
- `api/` — Express API routes that query TimescaleDB (`silver.*` tables)
- `public/` — static assets
- `dist/` — Vite build output (not committed)

## What This Repo Is NOT

This repo does **not** contain:
- Python scripts, enrichment pipeline, data transforms
- MongoDB ingestion, NOV/Pason API clients
- Config files (YAML signal specs, rig mappings, thresholds)
- Schema registry, semantic layer

Those live in the **drilling_lab** repo at `~/drilling_lab/`. The boundary is the database: Python scripts write to `silver.*` tables in TimescaleDB, this app reads from them.

## Architecture

```
Python pipeline (drilling_lab repo)
    ↓ writes
TimescaleDB silver.* tables (on legionraw)
    ↑ reads
Express API (this repo, api/)
    ↑ calls
React frontend (this repo, src/)
```

## Key Conventions

### Frontend
- Dark theme: `paper_bgcolor: '#1f1f1f'`, `plot_bgcolor: '#1f1f1f'`, `font.color: '#e0e0e0'`
- Plotly for all charts (react-plotly.js)
- Hash router: `/#/section-kpis`, `/#/rig-state-test`, etc.
- Auth: `?k=kurt2024` auto-login, `sessions.js` skips server check for `auto_` tokens
- Nav: `Locker.jsx` is the main shell with sidebar NavItems

### API
- Shared PG pool: `api/db.js` (max 10 connections)
- Shared well service: `api/wellsService.js` — `getRigs()`, `getWells()`, `getByLicense()`
- Routes mounted in `api/production.js`
- TimescaleDB column names use American spelling: `license` (not `licence`)

### Deployment
```bash
npx vite build
rsync -av --delete --exclude api/ dist/ sandbox:/var/www/drilling-lab-app/
rsync -av api/ sandbox:/var/www/drilling-lab-app/api/
ssh sandbox 'systemctl --user restart drilling-lab-app'
```

### Database (read-only from this repo)
- `silver.edr_1s` — 1-second EDR data with enrichment columns
- `silver.wells` — well metadata, `drilling_phases` JSONB
- `silver.operation_events` — operation envelopes (Layer 4)
- `silver.section_kpis` — pre-computed section KPIs
- `silver.connection_events` — connection decomposition (Layer 5b)
- `silver.trip_events` — trip events (Layer 5a)
- `silver.timelog` — Pason/NOV timelogs

## Pages

| Route | File | Description |
|-------|------|-------------|
| `/` | `Locker.jsx` | Main shell / home |
| `/section-kpis` | `SectionKpis.jsx` | Operation breakdowns per section |
| `/rig-state-test` | `RigStateTest.jsx` | Rig state QC with channel panels |
| `/edr-tagger` | `EDRTagger.jsx` | EDR data browser |
| `/charts` | `DaysVsDepth.jsx` | Days vs depth comparison |
| `/chart-playground` | `ChartPlayground.jsx` | AI-powered chart builder |

## Non-Negotiable Rules

1. **Read-only database access** — never write to `silver.*` tables from the API
2. **Dark theme everywhere** — all Plotly charts must use dark backgrounds
3. **Shared pool** — use `require('../db')`, never create new Pool instances
4. **Shared well service** — use `require('../wellsService')` for well metadata queries
5. **No secrets in git** — `.env` files stay out of version control
