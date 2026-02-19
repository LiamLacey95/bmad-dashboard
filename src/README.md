# BMAD Dashboard Foundation and Launch Readiness

## Stack
- Frontend: React + TypeScript + Tailwind (`src/client`)
- Backend: Node.js + Express (`src/server`)
- Shared contracts: TypeScript (`src/shared`)

## Run locally
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start backend API:
   ```bash
   npm run dev:server
   ```
3. Start frontend app:
   ```bash
   npm run dev:client
   ```

Frontend runs on `http://localhost:5173` and proxies `/api/*` to backend (`http://localhost:3001`).

## Verify acceptance criteria
- Health check:
  ```bash
  curl http://localhost:3001/api/v1/health
  ```
- Canonical status model:
  ```bash
  curl http://localhost:3001/api/v1/meta/status-model
  ```
- Workflow list and blocked/failed filtering:
  ```bash
  curl "http://localhost:3001/api/v1/workflows?status=blocked,failed"
  ```
- Workflow transitions:
  ```bash
  curl "http://localhost:3001/api/v1/workflows/wf-1002/transitions?limit=10"
  ```
- Project list:
  ```bash
  curl "http://localhost:3001/api/v1/projects"
  ```
- Project context:
  ```bash
  curl "http://localhost:3001/api/v1/projects/project-core/context"
  ```
- Kanban board:
  ```bash
  curl "http://localhost:3001/api/v1/kanban/board"
  ```
- Document list:
  ```bash
  curl "http://localhost:3001/api/v1/documents?projectId=project-core"
  ```
- Document metadata:
  ```bash
  curl "http://localhost:3001/api/v1/documents/doc-101"
  ```
- Document content payload:
  ```bash
  curl "http://localhost:3001/api/v1/documents/doc-101/content"
  ```
- Sync and consistency status:
  ```bash
  curl "http://localhost:3001/api/v1/sync/status"
  ```

## Realtime protocol
- WebSocket endpoint: `ws://localhost:3001/ws` (or `wss://<host>/ws`)
- Client messages: `auth`, `subscribe`, `heartbeat`, `resync_request`
- `subscribe.topics` supports: `workflow`, `project`, `story`, `sync`
- Server messages: `snapshot`, `event`, `stale_state`, `sync_status`, `error`

## Kanban mode flag
- MVP defaults to read-only Kanban.
- Set `KANBAN_EDITABLE=true` to enable the `PATCH /api/v1/stories/:id/status` transition route.

## SQLite persistence mode
- Default runtime remains in-memory for local fast iteration and tests.
- Set `PERSISTENCE_BACKEND=sqlite` to enable SQLite-backed repositories.
- Optional DB path: `SQLITE_PATH=/tmp/bmad-dashboard.sqlite`.
- SQLite startup enables WAL mode + busy timeout and applies migrations automatically.
- Projection jobs run every 15s in SQLite mode and refresh workflow/project/story/cost/analytics read models.

## Document MIME allowlist
- Inline rendering defaults to: `text/markdown`, `application/pdf`, `application/json`.
- Override with: `DOCUMENT_INLINE_MIME_ALLOWLIST="text/markdown,application/pdf,application/json"`.

## Test
```bash
npm test
```

## Story 007 launch readiness artifacts
- UAT checklist: `src/ops/uat-checklist.md`
- Observability dashboard and alerts: `src/ops/observability-dashboard-and-alerts.md`
- Operational runbook (setup, boundaries, contracts, backup/restore, triage): `src/ops/operations-runbook.md`
- Decision register: `src/ops/decision-register.md`
- MVP exit criteria evidence: `src/ops/mvp-exit-criteria-evidence.md`
