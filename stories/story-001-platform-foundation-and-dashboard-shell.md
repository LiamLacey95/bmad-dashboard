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
- [x] All acceptance criteria met
- [x] Tests passing
- [x] Code reviewed

## Complexity
4 points (1-5 scale)

---
