# UAT Checklist (Story 007)

Date baseline: 2026-02-19
Owner: Release stakeholder + QA + Ops

## Primary journeys
- [ ] Workflow monitoring: list renders, blocked/failed filter works, timeline loads, retry handles unavailable timeline.
- [ ] Realtime lifecycle: socket connect -> subscribe -> sync_status `ok` -> fresh `event` clears stale.
- [ ] Reconnect/resync: disconnect simulated, reconnect attempt visible, `resync_request` restores state.
- [ ] Project context: related stories/workflows/documents links resolve correctly.
- [ ] Kanban parity: board reflects story updates and read-only behavior when `KANBAN_EDITABLE=false`.
- [ ] Cost windows: `24h`, `7d`, `30d`, and valid custom ranges return expected availability semantics.
- [ ] Analytics outliers: outlier rows show score/lineage and insufficient-data agents show explicit reason.
- [ ] Document viewer fallback: unsupported and missing content return explicit fallback payload guidance.
- [ ] Sync status visibility: `/api/v1/sync/status` shows module status, warnings, and timestamps.

## Dark and light parity checks
- [ ] Workflow status pills legible in light mode.
- [ ] Workflow status pills legible in dark mode.
- [ ] Error/warning panels readable in both themes.
- [ ] Global stale/sync indicators readable in both themes.
- [ ] Documents, costs, analytics, projects, and kanban retain readable contrast in both themes.

## Responsive checks
- [ ] Desktop >= 1280px: all six routes usable without clipped critical actions.
- [ ] Tablet 768-1024px: filters and tables remain reachable.
- [ ] Mobile <= 430px: horizontal overflow tables scroll; cards/controls remain operable.

## Evidence capture
- [ ] Attach screenshots for each module in light/dark.
- [ ] Attach short reconnect/resync recording.
- [ ] Link latest automated test run output.
