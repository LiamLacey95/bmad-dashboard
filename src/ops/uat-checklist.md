# UAT Checklist (Story 007)

Execution date: 2026-02-19
Owner: Release stakeholder + QA + Ops
Execution mode: Local MVP validation (API + WS + client routes)

## Primary journeys
- [x] Workflow monitoring: list renders, blocked/failed filter works, timeline loads, retry handles unavailable timeline.
- [x] Realtime lifecycle: socket connect -> subscribe -> sync_status `ok` -> fresh `event` clears stale.
- [x] Reconnect/resync: disconnect simulated, reconnect attempt visible, `resync_request` restores state.
- [x] Project context: related stories/workflows/documents links resolve correctly.
- [x] Kanban parity: board reflects story updates and read-only behavior when `KANBAN_EDITABLE=false`.
- [x] Cost windows: `24h`, `7d`, `30d`, and valid custom ranges return expected availability semantics.
- [x] Analytics outliers: outlier rows show score/lineage and insufficient-data agents show explicit reason.
- [x] Document viewer fallback: unsupported and missing content return explicit fallback payload guidance.
- [x] Sync status visibility: `/api/v1/sync/status` shows module status, warnings, and timestamps.

## Dark and light parity checks
- [x] Workflow status pills legible in light mode.
- [x] Workflow status pills legible in dark mode.
- [x] Error/warning panels readable in both themes.
- [x] Global stale/sync indicators readable in both themes.
- [x] Documents, costs, analytics, projects, and kanban retain readable contrast in both themes.

## Responsive checks
- [x] Desktop >= 1280px: all six routes usable without clipped critical actions.
- [x] Tablet 768-1024px: filters and tables remain reachable.
- [x] Mobile <= 430px: horizontal overflow tables scroll; cards/controls remain operable.

## Evidence capture
- [x] Attach screenshots for each module in light/dark.
- [x] Attach short reconnect/resync recording.
- [x] Link latest automated test run output.

## Evidence links
- Automated suite coverage: `tests/server/workflow-websocket-gateway.test.ts`, `tests/server/cost-analytics-routes.test.ts`, `tests/server/document-routes.test.ts`, `tests/server/project-kanban-sync-routes.test.ts`, `tests/server/sqlite-persistence-and-projection.test.ts`, `tests/client/workflow-live-state.test.ts`, `tests/client/cost-analytics-pages.test.tsx`, `tests/client/documents-page.test.tsx`, `tests/client/delivery-pages.test.tsx`.
- Reconnect/resync replay assertion: `tests/server/workflow-websocket-gateway.test.ts` (`replays missed workflow events after reconnect resync_request`).
- Observability/ops references: `src/ops/observability-dashboard-and-alerts.md`, `src/ops/operations-runbook.md`.
