# Product Requirements Document (PRD)

## Product
BMAD Development Operations Dashboard

## Document Control
| Field | Value |
|---|---|
| Version | 1.0 (Draft for stakeholder alignment) |
| Date | February 19, 2026 |
| Owner | Product Management (Priya) |
| Status | Draft |
| Related Brief | `docs/project-brief.md` |

## 1. Product Vision and Objectives

### Vision
Provide a single, trusted operational cockpit for BMAD development so managers and operators can monitor workflow health, delivery progress, cost, and agent performance in near real time and act before issues become delays.

### Problem Statement
Operational signals are fragmented across tools and logs, creating delayed decisions, unclear ownership, and low confidence in cost/performance trends.

### Product Objectives (MVP)
1. Unify six core operational modules in one responsive web dashboard.
2. Deliver near real-time updates via WebSocket for workflow, project/story status, and cost changes.
3. Enable rapid detection of blocked/failed work, delivery risk, and cost anomalies.
4. Provide credible agent analytics grounded in consistent event/timestamp lineage.
5. Ensure full dark-mode usability across major workflows.

### Business Outcomes
- Shorter mean time to detect and respond to workflow/project issues.
- Improved on-time delivery confidence.
- Better cost awareness and intervention timing.
- Reduced context-switching across tools.

## 2. Users, Personas, and Key Journeys

### Primary Personas
| Persona | Goals | Pain Points Today | MVP Value |
|---|---|---|---|
| Engineering Manager | Keep delivery on track, remove blockers quickly | Fragmented status data, delayed risk visibility | Real-time workflow + project health with ownership and due-date signals |
| Product/Project Manager | Track scope/progress and story flow | Inconsistent story/workflow status, manual updates | Unified project + Kanban + artifact access in one place |
| BMAD Operator | Monitor workflow execution and failures | Hard to trace state transitions, reconnect uncertainty | State timeline, blocked/failed alerts, stale-state indicators |
| Technical Stakeholder | Validate outcomes and efficiency | No trusted performance/cost baseline | Agent trend/outlier and cost views with filterable windows |

### Core User Journeys
1. Workflow Intervention Journey
- User opens dashboard and sees current workflows with state and last update time.
- User filters to blocked/failed workflows.
- User inspects transition timeline and ownership.
- User opens linked story/project artifact and takes corrective action.

2. Delivery Readiness Journey
- User reviews project list with progress, owner, and due-date risk.
- User opens Kanban for story flow context.
- User confirms status consistency between project/workflow/story views.

3. Cost and Performance Review Journey
- User selects time window (e.g., 24h/7d/30d/custom).
- User compares aggregate cost vs per-project cost trend.
- User reviews agent trend comparison and outlier flags.
- User drills into underlying events/artifacts for context.

4. Artifact Validation Journey
- User navigates from project/story to related document.
- User views artifact inline without leaving dashboard.
- User returns to operational context with preserved filters.

## 3. Scope and Prioritization (MoSCoW)

### Must Have (MVP)
| Feature | Description | Notes |
|---|---|---|
| Unified Dashboard Shell | Single web app navigation for all modules | Responsive web only |
| Workflow Monitoring | Current state, transition timeline, blocked/failed visibility | Real-time updates required |
| Project Management Views | Status, ownership, progress, due-date awareness | List + detail context |
| Cost Tracking | Aggregate + per-project cost, time-window filtering | Near real-time updates |
| Agent Analytics | Trend comparison + outlier detection | KPI definitions pending final alignment |
| Document Viewer | In-app view from project/story context | Initial formats to be finalized |
| Story Kanban | Story lifecycle board visibility | MVP editability pending decision |
| WebSocket Real-Time Layer | Push updates, reconnect, heartbeat, stale-state indication | No manual refresh dependency |
| Dark Mode | First-class support across major views | Accessibility-sensitive |

### Should Have (Post-MVP / Phase 1.1)
| Feature | Description |
|---|---|
| Saved filters/views | Persist user filter presets |
| Basic notifications | In-app indicator for critical blocked/failed transitions |
| Export snapshots | Download lightweight CSV/image snapshots for reviews |

### Could Have (Future)
| Feature | Description |
|---|---|
| Forecasting hints | Trend extrapolation without full ML |
| External integrations | Pull from additional PM/dev systems |
| Role-granular personalization | Dashboard layout per role |

### Won’t Have (MVP)
- Mobile-native application.
- Multi-tenant billing/complex enterprise permissions.
- Advanced forecasting/ML scoring.
- Deep third-party integrations beyond core BMAD data.

## 4. Functional Requirements and User Stories

### Epic A: Real-Time Workflow Monitoring

**Story A1: Live workflow state overview**
- As an Engineering Manager, I want to see current workflow state for all active workflows so I can identify issues immediately.
- Priority: Must
- Acceptance Criteria:
1. Given active workflows exist, when the user opens Workflow Monitoring, then each row shows workflow ID/name, current state, owner, and last state-change timestamp.
2. Given a workflow state changes in backend events, when the event is processed, then UI reflects the new state without manual refresh.
3. Given no update has been received within stale threshold, when threshold is exceeded, then workflow row/dashboard shows stale indicator.

**Story A2: Transition timeline visibility**
- As a BMAD Operator, I want transition history with timestamps so I can diagnose where execution slowed or failed.
- Priority: Must
- Acceptance Criteria:
1. Given a selected workflow, when opening details, then timeline lists ordered transitions with timestamps and resulting state.
2. Given blocked/failed transitions occur, when present in timeline, then they are visually distinguishable from normal transitions.
3. Given transition data is unavailable/corrupt, when timeline is requested, then UI shows explicit error/empty state and recovery action.

**Story A3: Blocked/failed filtering**
- As an Engineering Manager, I want to filter blocked or failed workflows so I can prioritize interventions.
- Priority: Must
- Acceptance Criteria:
1. Given mixed workflow states, when blocked/failed filter is enabled, then list returns only matching workflows.
2. Given live updates, when a workflow becomes blocked/failed, then it appears in filtered results within SLA window.
3. Given filter active, when a workflow recovers, then it is removed from filtered list automatically.

### Epic B: Project Delivery Tracking

**Story B1: Project health view**
- As a Product Manager, I want status, ownership, progress, and due-date context so I can assess delivery risk quickly.
- Priority: Must
- Acceptance Criteria:
1. Project list shows name, owner, status, progress indicator, due date, and risk flag.
2. Overdue projects are visually distinct from on-track projects.
3. Project details preserve context links to related stories/workflows/documents.

**Story B2: Cross-view consistency**
- As a Delivery Lead, I want project/story/workflow states to align so I can trust the dashboard.
- Priority: Must
- Acceptance Criteria:
1. Status vocabulary is consistent across modules (no conflicting labels for same lifecycle state).
2. Story status updates from Kanban are reflected in project summary and related workflow context.
3. If synchronization fails, user sees inconsistency warning and last successful sync time.

### Epic C: Cost Tracking

**Story C1: Aggregate and per-project cost visibility**
- As a Technical Stakeholder, I want both top-level and per-project cost views so I can manage spend proactively.
- Priority: Must
- Acceptance Criteria:
1. Cost page includes aggregate total and per-project breakdown for selected time window.
2. Values update when time window changes (preset or custom).
3. Missing cost data is explicitly marked as unavailable, not treated as zero.

**Story C2: Time-window filtering**
- As a Manager, I want flexible time windows so I can compare recent vs historical spend.
- Priority: Must
- Acceptance Criteria:
1. User can select at least 24h, 7d, 30d, and custom range filters.
2. Filter selection updates charts/tables consistently across cost widgets.
3. Invalid custom ranges show validation and prevent broken queries.

### Epic D: Agent Analytics

**Story D1: Agent trend comparison**
- As an Engineering Manager, I want to compare agent trends over time so I can detect degradation or improvement.
- Priority: Must
- Acceptance Criteria:
1. Analytics supports multi-agent comparison across selected period.
2. Trend visualization clearly indicates direction (up/down/flat) for each KPI.
3. KPI definitions and units are visible in context (tooltip/legend/metadata).

**Story D2: Outlier detection visibility**
- As a BMAD Operator, I want outlier indicators so I can investigate abnormal agent behavior early.
- Priority: Must
- Acceptance Criteria:
1. Outliers are flagged distinctly and tied to specific metric/time point.
2. User can drill from outlier to relevant underlying events/artifacts.
3. If outlier calculation cannot run (insufficient data), UI shows explicit reason.

### Epic E: Document Viewer

**Story E1: In-app artifact viewing**
- As a Product Manager, I want to view documents in-app from project/story context so I can avoid context switching.
- Priority: Must
- Acceptance Criteria:
1. User can open linked artifact from project or story detail.
2. Document renders inline within dashboard container.
3. Unsupported or missing formats/files show clear fallback/error state.

### Epic F: Story Kanban

**Story F1: Story lifecycle board visibility**
- As a Delivery Lead, I want to see stories grouped by lifecycle stage so I can monitor flow and bottlenecks.
- Priority: Must
- Acceptance Criteria:
1. Kanban displays configured lifecycle columns with story cards.
2. Story cards show at least title/ID, owner, and status metadata.
3. Board updates reflect live story status changes without page refresh.

**Story F2: Kanban interaction mode (decision-gated)**
- As a Product Manager, I want explicit MVP behavior for board interaction so delivery scope is controlled.
- Priority: Must (Scope Decision)
- Acceptance Criteria (Read-Only option):
1. Drag-and-drop is disabled in MVP.
2. Board clearly indicates read-only state.
3. Status changes only occur through upstream systems/events.
- Acceptance Criteria (Editable option):
1. Authorized users can drag cards between allowed columns.
2. Column move triggers immediate update event and audit record.
3. Rejected/invalid transitions show clear error and roll back UI state.

### Epic G: Real-Time Reliability and UX Trust

**Story G1: WebSocket resilience**
- As any dashboard user, I want the app to recover from connection drops so monitoring remains reliable.
- Priority: Must
- Acceptance Criteria:
1. Client detects disconnect and attempts reconnect automatically with bounded retry policy.
2. Heartbeat mechanism detects silent disconnects.
3. On reconnect, client performs state sync and clears stale indicator only after successful sync.

**Story G2: Stale-state transparency**
- As any dashboard user, I want to know when data may be outdated so I can make safe decisions.
- Priority: Must
- Acceptance Criteria:
1. Global or per-module stale badge appears when freshness threshold exceeded.
2. UI shows last successful update timestamp.
3. Stale badge clears automatically when fresh data resumes.

### Epic H: Theming and Responsiveness

**Story H1: Dark mode parity**
- As a frequent operator, I want dark mode across major views so long-running usage is comfortable and legible.
- Priority: Must
- Acceptance Criteria:
1. Workflow, Projects, Cost, Agent Analytics, Document Viewer, and Kanban have dark-mode styles.
2. Critical status colors remain distinguishable and readable in dark mode.
3. Theme preference persists across sessions.

**Story H2: Responsive web support**
- As a user on different screen sizes, I want usable responsive layouts so I can monitor from desktop or mobile browser.
- Priority: Must
- Acceptance Criteria:
1. Core views are usable on common desktop and mobile web breakpoints.
2. Navigation remains accessible without feature loss on small screens.
3. Tables/charts/boards handle overflow gracefully without blocking critical actions.

## 5. Non-Functional Requirements

### Performance and Freshness
- Real-time update target (proposed): <= 3 seconds from backend event ingestion to visible UI update under normal load.
- Initial page load target (proposed): <= 3 seconds on standard internal network conditions.
- Time filter queries should return interactive results within acceptable operational latency (target to be finalized with engineering).

### Reliability and Availability
- WebSocket reconnect and state resync required.
- Heartbeat required to detect stale/disconnected channels.
- Clear stale-state communication required for decision safety.

### Data Integrity and Lineage
- Event timestamps must be consistent and timezone-safe.
- Status definitions shared across modules to prevent semantic drift.
- Metrics shown in analytics must include definitional lineage (what metric means, source event family).

### Scalability and Architecture Constraints
- MVP supports single-instance Node/Express with SQLite and moderate concurrency.
- Data access boundaries should preserve future migration path from SQLite to a higher-concurrency store.

### Security and Access (MVP)
- Auth/RBAC scope to be finalized; minimum viable control must prevent unauthorized access to operational data.
- Auditability required for any mutable actions included in MVP (e.g., editable Kanban if approved).

### Accessibility and Usability
- Major views must maintain readable contrast in dark mode and light mode.
- Error and empty states must be actionable and human-readable.

## 6. Success Metrics and KPIs

### Product-Level Success Metrics (MVP)
| Metric | Definition | Target (Initial) | Notes |
|---|---|---|---|
| Real-time freshness | % of events reflected in UI within SLA | >= 95% within finalized SLA | SLA currently proposed at <= 3s |
| Detection speed | Median time to identify blocked/failed workflows | 30% improvement vs baseline | Baseline to be captured pre-launch |
| Operational coverage | % of required modules used in a weekly review | >= 90% sessions touch 3+ modules | Proxy for unified workflow adoption |
| Cross-view consistency | % of sampled story/workflow/project states matching | >= 99% | Trust metric |
| Dashboard reliability | Session time without unresolved stale/disconnect state | >= 99% of monitored sessions | Requires heartbeat/reconnect telemetry |
| Dark mode usability | Critical-task completion parity dark vs light mode | No significant drop | Validate via UAT |

### Agent Performance KPI Framework (To Finalize)
Candidate KPI families for alignment session:
- Throughput: completed tasks/stories per period.
- Cycle time: median time from in-progress to done.
- Quality proxy: rework/reopen rate.
- Acceptance proxy: first-pass acceptance rate.
- Efficiency proxy: cost per completed story/task.

## 7. Assumptions, Dependencies, and Constraints

### Assumptions
- BMAD event streams for workflow, story, project, cost, and agent activity are available.
- Stakeholders accept SQLite-backed single-instance MVP for moderate usage.
- Responsive web app is sufficient for initial field usage.

### Dependencies
- Canonical lifecycle/status schema across workflow, project, and story entities.
- Cost attribution model and granularity rules.
- Agent identity mapping and activity event instrumentation.
- Document storage/serving for initial supported file formats.

### Fixed Technical Constraints
- Frontend: React + TypeScript + Tailwind.
- Backend: Node.js + Express.
- Database: SQLite.
- Real-time channel: WebSocket.

## 8. Risks and Mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| KPI ambiguity for agent performance | Low trust in analytics and disputes | Lock KPI glossary before build completion |
| Real-time SLA not finalized | Conflicting implementation expectations | Align on numeric SLA and stale threshold in phase gate |
| WebSocket instability | Stale or misleading dashboard | Heartbeat, reconnect, resync, visible stale flags |
| State divergence across modules | Loss of trust and bad decisions | Canonical status mapping + consistency checks |
| SQLite write contention growth | Latency and update lag | Monitor write pressure and preserve migration-ready DAL |
| Scope creep (analytics/auth/Kanban edits) | MVP delay | Enforce MoSCoW gate and decision log |

## 9. Open Decisions and Required Alignment
| Decision | Options | Owner(s) | Needed By |
|---|---|---|---|
| Agent performance KPI set | Throughput/cycle/quality/acceptance/efficiency mix | PM + Eng + Ops | Before sprint execution |
| Real-time SLA | 1s / 3s / 5s event-to-UI | PM + Eng | Before NFR sign-off |
| MVP auth/RBAC depth | Minimal auth vs role-limited access | PM + Security + Eng | Before implementation freeze |
| Document formats | e.g., Markdown/PDF/JSON/etc. | PM + Eng | Before viewer finalization |
| Kanban interaction | Read-only vs editable drag/drop | PM + Delivery + Eng | Before scope lock |
| Data retention windows | 30/90/180 days (or alternative) | PM + Finance + Ops | Before analytics tuning |
| Capacity target | Max concurrent users/workflows | PM + Eng | Before performance test plan |

## 10. Release Plan and Roadmap

### Phase 0: Alignment and Definition (Immediate)
- Finalize open decisions in Section 9.
- Approve KPI glossary and SLA targets.
- Lock MVP scope contract (especially Kanban editability and auth depth).

### Phase 1: MVP Build
- Deliver Must-have modules in unified dashboard shell.
- Implement real-time pipeline with reconnect/heartbeat/stale handling.
- Deliver dark-mode parity and responsive behavior for major views.
- Validate consistency across workflow/project/story surfaces.

### Phase 2: Hardening and Launch Readiness
- Run UAT on high-priority user journeys.
- Verify KPI instrumentation, lineage, and telemetry dashboards.
- Performance/reliability validation against agreed concurrency target.
- Complete documentation and operational runbook.

### Phase 3: Post-MVP Enhancements
- Add Should-have items (saved views, basic notifications, exports).
- Reassess data store scaling path if usage exceeds moderate assumptions.
- Plan deeper analytics and integrations based on adoption data.

## 11. MVP Exit Criteria (Go/No-Go)
1. All Must-have stories are accepted with passing criteria.
2. Real-time freshness meets agreed SLA in validation environment.
3. Workflow/project/story consistency checks meet target threshold.
4. Dark mode and responsive usability pass UAT for primary personas.
5. Critical open decisions are resolved and documented.

## 12. Appendix: Definitions
- Stale State: UI condition where latest confirmed backend sync exceeds freshness threshold.
- Outlier: Metric value materially deviating from established trend/baseline for an agent.
- Metric Lineage: Traceability from displayed KPI to underlying events, timestamps, and transformations.
