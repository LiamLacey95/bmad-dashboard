-- Story 004 index requirements for SQLite-backed deployments.
CREATE INDEX IF NOT EXISTS idx_cost_events_project_time
  ON cost_events(project_id, occurred_at_utc DESC);

CREATE INDEX IF NOT EXISTS idx_agent_metrics_agent_kpi_window_end
  ON agent_metrics(agent_id, kpi_key, window_end_utc DESC);
