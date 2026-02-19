# Project Brief: BMAD Development Monitoring Dashboard

## 1. Project Overview

### Purpose
Build a web-based dashboard to monitor and manage BMAD framework application development across workflow execution, project delivery, cost, and agent performance.

### Problem Statement
BMAD development activity is likely distributed across tools and logs, making it difficult to get real-time visibility into progress, bottlenecks, cost trends, and team/agent effectiveness. Stakeholders need a single operational view for decision-making and intervention.

### Goals
- Provide near real-time visibility into BMAD workflow and project status.
- Improve delivery control through centralized project and story tracking.
- Enable data-driven optimization of agent utilization and cost.
- Reduce time spent switching between systems for operational oversight.

## 2. Target Users and Primary Use Cases

### Target Users
- Engineering managers and delivery leads
- Product/project managers
- BMAD operators and AI workflow coordinators
- Technical stakeholders reviewing project health and output quality

### Core Use Cases
- Monitor current workflow state, stage transitions, and blocked items in real time.
- Track projects and stories (including Kanban status) to manage scope and throughput.
- View cost metrics by project, workflow, or time period.
- Analyze agent performance trends (speed, output volume, quality proxy metrics).
- Open and review generated documents/artifacts without leaving the dashboard.
- Receive live updates via WebSocket rather than manual refresh.

## 3. Scope and Key Functionality

### In Scope (MVP)
- Real-time workflow monitoring dashboard
- Project management views
- Cost tracking view
- Agent performance analytics view
- Document viewer
- Story Kanban board
- WebSocket-based live updates
- Dark mode UI support

### Functional Expectations by Feature
- Real-time workflow monitoring:
  - Current status per workflow/project
  - Stage/state transitions with timestamps
  - Visibility of blocked/failed items
- Project management:
  - Project list/detail with status and ownership
  - Progress indicators and due-date awareness
- Cost tracking:
  - Aggregated and per-project cost views
  - Time-window filtering
- Agent performance analytics:
  - Comparative metrics per agent over time
  - Identification of outliers and trends
- Document viewer:
  - In-app rendering of key BMAD docs/artifacts
  - Quick access from related project/story context
- Story Kanban:
  - Columns reflecting story lifecycle
  - Story metadata and movement visibility
- Live updates:
  - Push updates for workflow/status/cost/story changes
  - Graceful reconnect behavior for unstable sessions

### Out of Scope (Initial Phase)
- Multi-tenant billing and complex permissions
- Advanced forecasting/ML prediction
- Deep external integrations beyond core BMAD data sources
- Mobile-native app (responsive web only)

## 4. Technical Context and Constraints

### Required Stack
- Frontend: React + TypeScript + Tailwind CSS
- Backend: Node.js + Express
- Database: SQLite
- Real-time channel: WebSocket

### Architectural Constraints and Implications
- SQLite favors lightweight deployment and simplicity but may constrain concurrent write throughput at scale.
- WebSocket introduces connection lifecycle and reconnection complexity that must be managed for reliable UX.
- Analytics quality depends on consistent event logging and timestamp fidelity.
- Dark mode must be designed as a first-class requirement, not a post-hoc theme.

### Non-Functional Priorities
- Responsiveness for operational usage
- Data freshness for real-time monitoring
- Clear, low-friction navigation between modules
- Reliable behavior under moderate concurrent usage

## 5. Success Criteria (Measurable)

- Dashboard reflects workflow/project state changes within a near real-time target window (to be finalized; suggested <= 3 seconds from backend event to UI update under normal load).
- Users can access all primary modules (workflow, projects, cost, agent analytics, documents, Kanban) from a unified interface without switching tools.
- Stakeholders can identify blocked workflows and high-cost trends in one session without manual data extraction.
- Story status and workflow status remain consistent across Kanban and monitoring views.
- Dark mode is fully usable across all major views with no unreadable or low-contrast critical UI elements.

## 6. Assumptions

- BMAD workflow, project, story, cost, and agent data sources are available or can be instrumented.
- Core stakeholders accept a single-instance SQLite-backed deployment for the first release.
- Authentication/authorization requirements are minimal or deferred in MVP.
- Initial usage volume is moderate and compatible with SQLite + single backend service.

## 7. Risks and Mitigations

- Data consistency risk:
  - Risk: Divergent states between modules (e.g., Kanban vs workflow monitor).
  - Mitigation: Define canonical event model and shared status definitions early.
- Real-time reliability risk:
  - Risk: Dropped WebSocket connections and stale UI state.
  - Mitigation: Reconnect strategy, heartbeat checks, and visible sync state in UI.
- Metrics trust risk:
  - Risk: Agent performance and cost analytics are disputed if data lineage is unclear.
  - Mitigation: Traceable metric definitions and timestamped event provenance.
- Scalability risk:
  - Risk: SQLite and single-node backend limitations under growth.
  - Mitigation: Keep data access layer abstracted to allow future DB migration.
- Scope creep risk:
  - Risk: Expanding analytics and PM features delays MVP.
  - Mitigation: Prioritize core monitoring and management flows for first release.

## 8. Dependencies

- Access to BMAD runtime/event data
- Defined project/story schema and status lifecycle
- Cost attribution model (what counts as cost and at what granularity)
- Agent identity and activity tracking conventions

## 9. Open Questions

- What exact KPIs define “agent performance” (speed, quality, rework rate, acceptance rate, etc.)?
- What is the required real-time SLA for UI updates (e.g., 1s, 3s, 5s)?
- What authentication and role-based access controls are required for MVP?
- What document formats must the viewer support initially?
- Should Kanban support editing/drag-and-drop in MVP, or be read-only first?
- What historical retention window is required for cost and performance analytics?
- What maximum concurrent users/workflows should the initial architecture support?

## 10. Recommended Next Clarification Step

Run a short stakeholder alignment session to finalize KPI definitions, real-time SLA, and MVP boundary decisions (especially editability, access control, and analytics depth), then lock acceptance criteria for phase 1 delivery.
