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
- [x] All acceptance criteria met
- [x] Tests passing
- [x] Code reviewed

## Complexity
5 points (1-5 scale)

---


## QA Feedback (Retry Required)
Core delivery endpoints, Kanban rendering, consistency warning display, and MVP read-only gating are implemented and covered by passing automated tests; however, two acceptance criteria are not fully met: project detail context is rendered as plain text instead of navigable links, and workflow view does not react to story status events for cross-view synchronization.

## Fixes Needed
Please address the issues above in your next implementation attempt.
