# Operations Runbook (Story 007)

## Setup and startup
1. Install dependencies: `npm install`
2. Start backend: `npm run dev:server`
3. Start frontend: `npm run dev:client`
4. Open dashboard: `http://localhost:5173`

## Runtime modes
- In-memory default: fast local iteration.
- SQLite mode:
  - `PERSISTENCE_BACKEND=sqlite`
  - Optional path: `SQLITE_PATH=/tmp/bmad-dashboard.sqlite`
  - WAL mode and migrations are applied at startup.

## Architecture boundaries
- `src/client`: React UI, route modules, WS clients, theme/responsive UX.
- `src/server/routes`: API boundary and validation.
- `src/server/services`: consistency and projection logic.
- `src/server/realtime`: WS protocol lifecycle and event fanout.
- `src/server/dal`: repository implementations (in-memory and SQLite).
- `src/shared`: API and WS contract types.

## API and WS contract quick reference
- REST base: `/api/v1`
- Health: `GET /health`
- Workflow: `GET /workflows`, `GET /workflows/:id/transitions`
- Cost: `GET /costs/summary`, `GET /costs/timeseries`
- Analytics: `GET /analytics/agents/trends`, `/outliers`, `/lineage/:lineageRef`
- Documents: `GET /documents`, `GET /documents/:id/content`
- Sync: `GET /sync/status`

WS endpoint: `/ws`
- Client: `auth`, `subscribe`, `heartbeat`, `resync_request`
- Server: `snapshot`, `event`, `stale_state`, `sync_status`, `error`

## KPI glossary assumptions
- Freshness KPI: `event_to_ui_latency_ms` tracks server dispatch lag as MVP proxy.
- Reconnect KPI: `websocket_reconnect_attempts_total` increments per `resync_request`.
- Consistency KPI: `cross_view_consistency_failures_total` increments on story/workflow mismatch warnings.

## Backup and restore (SQLite)
1. Stop writes or stop service.
2. Backup DB file:
   - `cp "$SQLITE_PATH" "$SQLITE_PATH.$(date +%Y%m%d%H%M%S).bak"`
3. Verify backup exists and file size > 0.
4. Restore:
   - Stop service.
   - Replace DB file with backup copy.
   - Restart service and call `GET /api/v1/health` + `GET /api/v1/sync/status`.

## Incident triage
1. Check `GET /api/v1/health` and app logs for immediate failures.
2. Check `GET /api/v1/sync/status` for module errors and warning drift.
3. Check WS behavior:
   - stale spikes
   - reconnect spikes
   - missing `sync_status` `ok` after reconnect
4. If SQLite mode, inspect lock wait metric and recent sync failure increments.
5. If cross-view warnings grow, inspect story/workflow linked entities and recent transitions.
