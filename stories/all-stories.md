# Story 001: Platform Foundation and Dashboard Shell

## Story ID and Title
- **ID**: STORY-001
- **Title**: Establish project foundation, canonical status model, and app shell

## User Story
As a BMAD dashboard developer, I want a production-ready frontend/backend foundation with a shared status vocabulary, so that all feature modules can be built consistently and safely.

## Detailed Description
Build the MVP base architecture using the fixed stack: React + TypeScript + Tailwind frontend and Node.js + Express backend. Implement the dashboard shell with route scaffolding for `/workflows`, `/projects`, `/costs`, `/analytics`, `/documents`, and `/kanban`, plus global navigation, theme toggle, and stale/sync banner placeholders.

Create a shared canonical lifecycle model (`queued`, `in_progress`, `blocked`, `failed`, `done`, `canceled`) and expose it through backend metadata so all modules use the same terms. Set up baseline security and validation plumbing (auth middleware placeholder, request validation framework, error envelope format), plus observability scaffolding (structured logging and core metrics hooks).

## Acceptance Criteria
1. Frontend and backend applications run locally with documented startup commands and working health check (`GET /api/v1/health`).
2. App shell renders all six module routes with responsive navigation and light/dark theme toggle.
3. Canonical status model is centrally defined and available via `GET /api/v1/meta/status-model`.
4. Global stale/sync UI placeholders exist and are wired to application state store.
5. Backend includes standardized request validation and error response structure for all API handlers.

## Technical Notes
- Follow architecture sections on modular monolith boundaries and route-based module structure.
- Use Tailwind + CSS variables with `data-theme="light|dark"`; persist theme in `localStorage`.
- Add repository/DAL interface layer now, even before full persistence implementation, to preserve SQLite migration path.
- Add baseline observability hooks for `api_request_duration_ms` and request correlation IDs.

## Definition of Done
- [ ] All acceptance criteria met
- [ ] Tests passing
- [ ] Code reviewed

## Complexity
4 points (1-5 scale)

---

# Story 002: Real-Time Workflow Monitoring and Reliability

## Story ID and Title
- **ID**: STORY-002
- **Title**: Deliver live workflow monitoring with WebSocket reconnect, heartbeat, and stale-state transparency

## User Story
As an Engineering Manager and BMAD Operator, I want real-time workflow state and transition visibility with resilient connectivity, so that I can detect and act on blocked/failed execution quickly.

## Detailed Description
Implement workflow monitoring end-to-end: workflow list, blocked/failed filters, workflow detail timeline, and stale indicators. Add WebSocket protocol support for subscribe, heartbeat, reconnect backoff, and resync using `lastAckEventId`.

UI must update workflow rows and filters without manual refresh. Timeline must visually distinguish blocked/failed transitions and provide actionable empty/error states when transition data is unavailable. Stale state must surface globally and/or per module when freshness thresholds are exceeded, with last successful update timestamps.

## Acceptance Criteria
1. Workflow list shows ID/name, owner, status, and last transition timestamp from API and live updates.
2. Blocked/failed filter shows only matching workflows and updates within SLA when states change.
3. Workflow detail shows ordered transitions with blocked/failed transitions visually distinct.
4. WebSocket client sends heartbeat every configured interval, detects disconnect, and auto-reconnects with bounded exponential backoff.
5. On reconnect, client performs resync and only clears stale indicators after successful sync plus fresh event receipt.
6. If timeline data is missing/corrupt, UI shows explicit error/empty state with retry action.

## Technical Notes
- Use WS message contracts from architecture (`snapshot`, `event`, `stale_state`, `sync_status`, `error`).
- Implement heartbeat policy (15s interval, stale after missed heartbeats) and reconnect cap.
- Track freshness against target event-to-UI latency and expose `lastSuccessfulUpdateAt` in UI.
- Prioritize query/index support for `workflows(status, last_transition_at DESC)` and `workflow_transitions(workflow_id, occurred_at_utc)`.

## Definition of Done
- [ ] All acceptance criteria met
- [ ] Tests passing
- [ ] Code reviewed

## Complexity
5 points (1-5 scale)

---

# Story 003: Project Health and Kanban Cross-View Consistency

## Story ID and Title
- **ID**: STORY-003
- **Title**: Build project delivery views and story Kanban with consistency checks

## User Story
As a Product/Delivery Manager, I want project health and Kanban flow to stay consistent with workflow state, so that I can trust delivery readiness signals.

## Detailed Description
Implement project list/detail and story Kanban module. Project list must include owner, status, progress, due date, and risk/overdue indicators. Project detail must link related stories, workflows, and documents.

Implement Kanban board visibility with lifecycle columns and live story updates. For MVP scope control, default to read-only mode with a feature flag gate for editable mode. Add cross-view consistency checks that detect state divergence between project/story/workflow modules and display warning with last successful sync timestamp.

## Acceptance Criteria
1. Project list displays required fields with clear overdue/risk visual states.
2. Project detail includes context links to related stories, workflows, and documents.
3. Kanban board renders configured columns and cards showing title/ID, owner, and status metadata.
4. Story status changes from events are reflected in both Kanban and related project/workflow views without refresh.
5. If consistency check fails, UI shows warning with module and last successful sync time.
6. MVP defaults to read-only Kanban with explicit indicator; editable transitions remain disabled unless feature flag is enabled.

## Technical Notes
- Reuse canonical status vocabulary to prevent semantic drift.
- Implement `GET /projects`, `GET /projects/:id`, `GET /projects/:id/context`, and `GET /kanban/board`.
- If editable mode is later enabled, enforce role gate and audit trail on `PATCH /stories/:id/status`.
- Add consistency monitor service contract and failure metric emission.

## Definition of Done
- [ ] All acceptance criteria met
- [ ] Tests passing
- [ ] Code reviewed

## Complexity
5 points (1-5 scale)

---

# Story 004: Cost Tracking and Agent Analytics

## Story ID and Title
- **ID**: STORY-004
- **Title**: Implement cost dashboards and agent trend/outlier analytics with lineage drilldown

## User Story
As a Technical Stakeholder, I want cost and agent analytics views with flexible windows and lineage, so that I can detect spend and performance anomalies early.

## Detailed Description
Implement cost summary and timeseries widgets showing aggregate and per-project values for presets (`24h`, `7d`, `30d`) and custom ranges. Ensure missing data is marked unavailable, never displayed as zero.

Implement agent analytics trend comparison across selected agents/KPIs and outlier flags per metric/time point. Add lineage drilldown navigation so users can inspect source events/artifacts behind displayed analytics and outlier markers.

## Acceptance Criteria
1. Cost module shows aggregate total and per-project breakdown for selected window.
2. Time-window selection updates all cost widgets consistently.
3. Invalid custom window returns validation feedback and does not trigger broken query state.
4. Agent analytics supports multi-agent trend comparison with visible KPI units/definitions.
5. Outliers are visually distinct and drill down to lineage details.
6. When outlier calculation cannot run due to insufficient data, UI shows explicit reason.

## Technical Notes
- Implement `GET /costs/summary`, `GET /costs/timeseries`, `GET /analytics/agents/trends`, `GET /analytics/agents/outliers`, `GET /analytics/lineage/:lineageRef`, and `GET /meta/kpis`.
- Return `availability="unavailable"` for missing cost data.
- Back queries with indexes for `cost_events(project_id, occurred_at_utc DESC)` and `agent_metrics(agent_id, kpi_key, window_end_utc DESC)`.
- Use explicit KPI metadata model to support pending KPI finalization.

## Definition of Done
- [ ] All acceptance criteria met
- [ ] Tests passing
- [ ] Code reviewed

## Complexity
5 points (1-5 scale)

---

# Story 005: Document Viewer and Unified UX Theming

## Story ID and Title
- **ID**: STORY-005
- **Title**: Deliver in-app document viewing with dark-mode and responsive parity

## User Story
As a Product Manager, I want to open project/story artifacts inline with accessible dark and mobile support, so that I can validate context without leaving the dashboard.

## Detailed Description
Implement document listing and inline viewing from project/story context. Support MVP allowlisted MIME types and clear fallback behavior for unsupported/missing files. Ensure secure rendering boundaries and strict content-type handling.

Apply dark-mode parity and responsive behavior across all core modules (workflow, projects, costs, analytics, documents, kanban). Preserve readability of critical status colors in both themes and ensure navigation/actions remain usable on small screens.

## Acceptance Criteria
1. Users can open document links from project or story context and view supported files inline.
2. Unsupported or missing documents show explicit fallback/error state with actionable guidance.
3. Document rendering enforces MIME allowlist and prevents unsafe inline execution.
4. All major modules meet dark-mode parity with readable contrast for status-critical elements.
5. Core views remain usable across common desktop and mobile breakpoints without blocking critical actions.
6. Theme preference persists across sessions.

## Technical Notes
- Implement `GET /documents`, `GET /documents/:id`, and `GET /documents/:id/content`.
- Start with allowlist such as `text/markdown`, `application/pdf`, `application/json`; wire to configurable list for decision updates.
- Use overflow-safe table/chart/board patterns and mobile-first layouts.
- Ensure document rendering uses CSP-compatible, sanitized strategy.

## Definition of Done
- [ ] All acceptance criteria met
- [ ] Tests passing
- [ ] Code reviewed

## Complexity
4 points (1-5 scale)

---

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
- [ ] All acceptance criteria met
- [ ] Tests passing
- [ ] Code reviewed

## Complexity
5 points (1-5 scale)

---

# Story 007: Launch Polish, Documentation, and End-to-End Verification

## Story ID and Title
- **ID**: STORY-007
- **Title**: Complete QA, observability validation, and operational documentation for MVP readiness

## User Story
As a release stakeholder, I want validated reliability/usability and clear runbooks, so that MVP go/no-go can be decided with confidence.

## Detailed Description
Finalize automated and manual validation aligned to MVP exit criteria: real-time freshness, cross-view consistency, stale/reconnect handling, dark-mode usability parity, and responsive behavior. Build test coverage for critical APIs, WebSocket lifecycle, and failure paths.

Complete developer and operator documentation: setup, architecture boundaries, API/WS contracts, KPI glossary assumptions, decision log placeholders (SLA, KPIs, auth depth, document formats, Kanban mode), backup/restore basics, and incident triage runbook.

## Acceptance Criteria
1. Automated test suites cover critical flows: workflow real-time updates, reconnect/resync, cost windows, analytics outliers, document fallback, and sync status.
2. UAT checklist validates primary journeys and confirms dark/light parity on critical tasks.
3. Observability dashboards and alerts are configured for freshness, stale sessions, sync failures, and lock contention.
4. Documentation is published for setup, architecture, API/WS contracts, and operational runbook.
5. MVP exit criteria mapping is documented with pass/fail evidence for each criterion.

## Technical Notes
- Include API contract tests and WS protocol tests for `snapshot/event/stale_state/sync_status/error` behavior.
- Validate SLI metrics: `event_to_ui_latency_ms`, `websocket_reconnect_attempts_total`, `cross_view_consistency_failures_total`.
- Capture unresolved Phase 0 decisions in a tracked decision register.
- Ensure release checklist includes data backup verification for SQLite persistent volume.

## Definition of Done
- [ ] All acceptance criteria met
- [ ] Tests passing
- [ ] Code reviewed

## Complexity
3 points (1-5 scale)
