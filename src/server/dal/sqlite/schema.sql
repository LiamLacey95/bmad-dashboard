PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  owner_team TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  status TEXT NOT NULL,
  progress_pct INTEGER NOT NULL,
  due_at TEXT NOT NULL,
  risk_flag INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  status TEXT NOT NULL,
  kanban_column TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  story_id TEXT,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  status TEXT NOT NULL,
  last_transition_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE SET NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS domain_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  project_id TEXT,
  story_id TEXT,
  workflow_id TEXT,
  occurred_at_utc TEXT NOT NULL,
  ingested_at_utc TEXT NOT NULL,
  source_system TEXT NOT NULL,
  correlation_id TEXT,
  payload_json TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (story_id) REFERENCES stories(id),
  FOREIGN KEY (workflow_id) REFERENCES workflows(id)
);

CREATE TABLE IF NOT EXISTS workflow_transitions (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  occurred_at_utc TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  reason TEXT,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cost_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  workflow_id TEXT,
  agent_id TEXT,
  cost_amount REAL NOT NULL,
  currency TEXT NOT NULL,
  occurred_at_utc TEXT NOT NULL,
  source_event_id TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (workflow_id) REFERENCES workflows(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id),
  FOREIGN KEY (source_event_id) REFERENCES domain_events(id)
);

CREATE TABLE IF NOT EXISTS agent_metrics (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  kpi_key TEXT NOT NULL,
  kpi_value REAL NOT NULL,
  unit TEXT NOT NULL,
  window_start_utc TEXT NOT NULL,
  window_end_utc TEXT NOT NULL,
  lineage_ref TEXT NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS agent_outliers (
  id TEXT PRIMARY KEY,
  agent_metric_id TEXT NOT NULL,
  score REAL NOT NULL,
  method TEXT NOT NULL,
  flagged_at_utc TEXT NOT NULL,
  lineage_ref TEXT NOT NULL,
  FOREIGN KEY (agent_metric_id) REFERENCES agent_metrics(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  story_id TEXT,
  title TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  checksum TEXT NOT NULL,
  created_at TEXT NOT NULL,
  content TEXT,
  content_base64 TEXT,
  is_available INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sync_state (
  id TEXT PRIMARY KEY,
  module TEXT NOT NULL UNIQUE,
  last_successful_sync_at_utc TEXT,
  last_attempt_at_utc TEXT,
  status TEXT NOT NULL,
  error_message TEXT,
  stale_reason TEXT
);

CREATE TABLE IF NOT EXISTS client_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  connected_at_utc TEXT NOT NULL,
  last_heartbeat_at_utc TEXT NOT NULL,
  connection_state TEXT NOT NULL,
  last_ack_event_id TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS project_read_model (
  project_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  progress_pct INTEGER NOT NULL,
  risk_flag INTEGER NOT NULL,
  updated_at_utc TEXT NOT NULL,
  lineage_ref TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS story_read_model (
  story_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  status TEXT NOT NULL,
  kanban_column TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  lineage_ref TEXT NOT NULL,
  FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workflow_read_model (
  workflow_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  story_id TEXT,
  status TEXT NOT NULL,
  last_transition_at_utc TEXT NOT NULL,
  lineage_ref TEXT NOT NULL,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS cost_aggregate_daily (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  window_start_utc TEXT NOT NULL,
  window_end_utc TEXT NOT NULL,
  total_cost REAL NOT NULL,
  currency TEXT NOT NULL,
  lineage_ref TEXT NOT NULL,
  UNIQUE(project_id, window_start_utc, window_end_utc)
);

CREATE TABLE IF NOT EXISTS analytics_aggregate_daily (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  kpi_key TEXT NOT NULL,
  window_start_utc TEXT NOT NULL,
  window_end_utc TEXT NOT NULL,
  avg_value REAL NOT NULL,
  latest_value REAL NOT NULL,
  lineage_ref TEXT NOT NULL,
  UNIQUE(agent_id, kpi_key, window_start_utc, window_end_utc)
);

CREATE TABLE IF NOT EXISTS projection_state (
  id TEXT PRIMARY KEY,
  projector_name TEXT NOT NULL UNIQUE,
  last_event_id TEXT,
  last_run_at_utc TEXT,
  status TEXT NOT NULL,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS lineage_refs (
  id TEXT PRIMARY KEY,
  lineage_ref TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL,
  created_at_utc TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_domain_events_entity_time
  ON domain_events(entity_type, entity_id, occurred_at_utc DESC);
CREATE INDEX IF NOT EXISTS idx_domain_events_occurred
  ON domain_events(occurred_at_utc DESC);
CREATE INDEX IF NOT EXISTS idx_cost_events_project_time
  ON cost_events(project_id, occurred_at_utc DESC);
CREATE INDEX IF NOT EXISTS idx_agent_metrics_agent_kpi_window_end
  ON agent_metrics(agent_id, kpi_key, window_end_utc DESC);
CREATE INDEX IF NOT EXISTS idx_workflows_status_transition
  ON workflows(status, last_transition_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_status_due
  ON projects(status, due_at);
CREATE INDEX IF NOT EXISTS idx_stories_column_updated
  ON stories(kanban_column, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_transitions_workflow_occurred
  ON workflow_transitions(workflow_id, occurred_at_utc);
