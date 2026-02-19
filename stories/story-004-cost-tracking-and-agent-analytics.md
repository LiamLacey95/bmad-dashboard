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