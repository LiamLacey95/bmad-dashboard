# Story 006: Persistence, Sync Integrity, and Error Handling Hardening

## Story ID and Title
- **ID**: STORY-006
- **Title**: Implement SQLite persistence, projection jobs, and robust error/recovery flows

## User Story
As a dashboard operator, I want durable data, reliable sync status, and actionable failures, so that I can trust the system during transient issues and recover quickly.

## Detailed Description
Implement SQLite schema and DAL repositories for operational entities, event lineage, costs, analytics, documents, and sync state. Enable WAL mode, short transactions, batched event writes, busy timeout, and retry handling for lock contention.

Implement projection/aggregation jobs and sync integrity endpoints, including per-module sync status and stale-state reasons. Standardize error handling across REST and WebSocket paths with recoverable vs non-recoverable signaling and consistent UI messaging.

## Acceptance Criteria
1. SQLite schema and migrations create all MVP core tables, constraints, and required indexes.
2. DAL uses parameterized queries and retry/busy-timeout policy for transient lock errors.
3. Projection jobs update read models for workflow/project/story/cost/analytics with traceable lineage.
4. `GET /sync/status` returns module-level status, last successful sync, last attempt, and error details.
5. REST and WS errors follow a consistent contract including code, message, and recoverability context.
6. UI surfaces stale/sync failures with actionable recovery actions and timestamps.

## Technical Notes
- Implement architecture tables including `domain_events`, `workflow_transitions`, `cost_events`, `agent_metrics`, `agent_outliers`, `documents`, and `sync_state`.
- Set `PRAGMA journal_mode=WAL;` and configure DAL transaction boundaries to reduce contention.
- Add consistency and reliability metrics: `sync_failures_total`, `stale_state_active_sessions_ratio`, `sqlite_write_lock_wait_ms`.
- Ensure timestamp handling is UTC-safe (`occurred_at_utc`, `ingested_at_utc`, etc.).

## Definition of Done
- [x] All acceptance criteria met
- [x] Tests passing
- [x] Code reviewed

## Complexity
5 points (1-5 scale)

---
