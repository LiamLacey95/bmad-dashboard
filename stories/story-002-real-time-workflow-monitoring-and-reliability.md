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
- [x] All acceptance criteria met
- [x] Tests passing
- [x] Code reviewed

## Complexity
5 points (1-5 scale)

---
