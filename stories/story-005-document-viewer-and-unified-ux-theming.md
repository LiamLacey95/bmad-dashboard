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
- [x] All acceptance criteria met
- [x] Tests passing
- [x] Code reviewed

## Complexity
4 points (1-5 scale)

---
