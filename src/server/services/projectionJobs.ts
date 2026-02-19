import type { DatabaseSync } from 'node:sqlite';
import { inTransaction, withSqliteRetry } from '../dal/sqlite/database.js';
import { metricsRegistry } from '../observability/metrics.js';

function todayWindow(occurredAtUtc: string): { start: string; end: string } {
  const day = occurredAtUtc.slice(0, 10);
  return {
    start: `${day}T00:00:00.000Z`,
    end: `${day}T23:59:59.999Z`
  };
}

export class ProjectionJobs {
  constructor(private readonly db: DatabaseSync) {}

  runAll(): void {
    withSqliteRetry(() => {
      inTransaction(this.db, () => {
        this.projectWorkflows();
        this.projectStories();
        this.projectProjects();
        this.projectCostAggregates();
        this.projectAnalyticsAggregates();
      });
    });

    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO sync_state(id, module, last_successful_sync_at_utc, last_attempt_at_utc, status, error_message, stale_reason)
         VALUES('sync-projections', 'sync', ?, ?, 'ok', NULL, NULL)
         ON CONFLICT(module)
         DO UPDATE SET last_successful_sync_at_utc=excluded.last_successful_sync_at_utc,
                       last_attempt_at_utc=excluded.last_attempt_at_utc,
                       status='ok',
                       error_message=NULL,
                       stale_reason=NULL`
      )
      .run(now, now);
  }

  private projectWorkflows(): void {
    const rows = this.db.prepare('SELECT id, project_id, story_id, status, last_transition_at FROM workflows').all() as Array<{
      id: string;
      project_id: string;
      story_id: string | null;
      status: string;
      last_transition_at: string;
    }>;

    const upsert = this.db.prepare(
      `INSERT INTO workflow_read_model(workflow_id, project_id, story_id, status, last_transition_at_utc, lineage_ref)
       VALUES(?, ?, ?, ?, ?, ?)
       ON CONFLICT(workflow_id) DO UPDATE SET
       project_id=excluded.project_id,
       story_id=excluded.story_id,
       status=excluded.status,
       last_transition_at_utc=excluded.last_transition_at_utc,
       lineage_ref=excluded.lineage_ref`
    );

    rows.forEach((row) => {
      upsert.run(row.id, row.project_id, row.story_id, row.status, row.last_transition_at, `workflow:${row.id}:${row.last_transition_at}`);
    });
  }

  private projectStories(): void {
    const rows = this.db.prepare('SELECT id, project_id, status, kanban_column, updated_at FROM stories').all() as Array<{
      id: string;
      project_id: string;
      status: string;
      kanban_column: string;
      updated_at: string;
    }>;

    const upsert = this.db.prepare(
      `INSERT INTO story_read_model(story_id, project_id, status, kanban_column, updated_at_utc, lineage_ref)
       VALUES(?, ?, ?, ?, ?, ?)
       ON CONFLICT(story_id) DO UPDATE SET
       project_id=excluded.project_id,
       status=excluded.status,
       kanban_column=excluded.kanban_column,
       updated_at_utc=excluded.updated_at_utc,
       lineage_ref=excluded.lineage_ref`
    );

    rows.forEach((row) => {
      upsert.run(row.id, row.project_id, row.status, row.kanban_column, row.updated_at, `story:${row.id}:${row.updated_at}`);
    });
  }

  private projectProjects(): void {
    const rows = this.db
      .prepare(
        `SELECT
            p.id,
            p.updated_at,
            COALESCE(ROUND((SUM(CASE WHEN s.status IN ('done', 'canceled') THEN 1 ELSE 0 END) * 100.0) / NULLIF(COUNT(s.id), 0)), 0) AS progress_pct,
            MAX(CASE WHEN s.status IN ('blocked', 'failed') THEN 1 ELSE 0 END) AS risk_flag,
            CASE
              WHEN COUNT(s.id) = 0 THEN 'queued'
              WHEN SUM(CASE WHEN s.status IN ('done', 'canceled') THEN 1 ELSE 0 END) = COUNT(s.id) THEN 'done'
              WHEN SUM(CASE WHEN s.status = 'failed' THEN 1 ELSE 0 END) > 0 THEN 'failed'
              WHEN SUM(CASE WHEN s.status = 'blocked' THEN 1 ELSE 0 END) > 0 THEN 'blocked'
              WHEN SUM(CASE WHEN s.status = 'in_progress' THEN 1 ELSE 0 END) > 0 THEN 'in_progress'
              ELSE 'queued'
            END AS derived_status
         FROM projects p
         LEFT JOIN stories s ON s.project_id = p.id
         GROUP BY p.id`
      )
      .all() as Array<{
      id: string;
      updated_at: string;
      progress_pct: number;
      risk_flag: number;
      derived_status: string;
    }>;

    const upsertModel = this.db.prepare(
      `INSERT INTO project_read_model(project_id, status, progress_pct, risk_flag, updated_at_utc, lineage_ref)
       VALUES(?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET
       status=excluded.status,
       progress_pct=excluded.progress_pct,
       risk_flag=excluded.risk_flag,
       updated_at_utc=excluded.updated_at_utc,
       lineage_ref=excluded.lineage_ref`
    );
    const updateProject = this.db.prepare(
      'UPDATE projects SET status = ?, progress_pct = ?, risk_flag = ?, updated_at = ? WHERE id = ?'
    );

    rows.forEach((row) => {
      upsertModel.run(row.id, row.derived_status, Number(row.progress_pct), row.risk_flag, row.updated_at, `project:${row.id}:${row.updated_at}`);
      updateProject.run(row.derived_status, Number(row.progress_pct), row.risk_flag, row.updated_at, row.id);
    });
  }

  private projectCostAggregates(): void {
    const rows = this.db.prepare('SELECT id, project_id, cost_amount, currency, occurred_at_utc FROM cost_events').all() as Array<{
      id: string;
      project_id: string;
      cost_amount: number;
      currency: string;
      occurred_at_utc: string;
    }>;

    const grouped = new Map<string, { projectId: string; start: string; end: string; total: number; currency: string; lineageIds: string[] }>();
    rows.forEach((row) => {
      const window = todayWindow(row.occurred_at_utc);
      const key = `${row.project_id}:${window.start}`;
      const existing = grouped.get(key) ?? {
        projectId: row.project_id,
        start: window.start,
        end: window.end,
        total: 0,
        currency: row.currency,
        lineageIds: []
      };
      existing.total += row.cost_amount;
      existing.lineageIds.push(row.id);
      grouped.set(key, existing);
    });

    const upsert = this.db.prepare(
      `INSERT INTO cost_aggregate_daily(id, project_id, window_start_utc, window_end_utc, total_cost, currency, lineage_ref)
       VALUES(?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id, window_start_utc, window_end_utc) DO UPDATE SET
       total_cost=excluded.total_cost,
       currency=excluded.currency,
       lineage_ref=excluded.lineage_ref`
    );

    grouped.forEach((item) => {
      const lineageRef = `cost-aggregate:${item.projectId}:${item.start}`;
      upsert.run(`${item.projectId}:${item.start}`, item.projectId, item.start, item.end, Number(item.total.toFixed(4)), item.currency, lineageRef);
    });
  }

  private projectAnalyticsAggregates(): void {
    const rows = this.db.prepare('SELECT id, agent_id, kpi_key, kpi_value, window_start_utc, window_end_utc FROM agent_metrics').all() as Array<{
      id: string;
      agent_id: string;
      kpi_key: string;
      kpi_value: number;
      window_start_utc: string;
      window_end_utc: string;
    }>;

    const grouped = new Map<
      string,
      { agentId: string; kpiKey: string; start: string; end: string; values: number[]; latest: number; lineage: string[] }
    >();

    rows.forEach((row) => {
      const key = `${row.agent_id}:${row.kpi_key}:${row.window_start_utc}`;
      const current = grouped.get(key) ?? {
        agentId: row.agent_id,
        kpiKey: row.kpi_key,
        start: row.window_start_utc,
        end: row.window_end_utc,
        values: [],
        latest: row.kpi_value,
        lineage: []
      };
      current.values.push(row.kpi_value);
      current.latest = row.kpi_value;
      current.lineage.push(row.id);
      grouped.set(key, current);
    });

    const upsert = this.db.prepare(
      `INSERT INTO analytics_aggregate_daily(id, agent_id, kpi_key, window_start_utc, window_end_utc, avg_value, latest_value, lineage_ref)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(agent_id, kpi_key, window_start_utc, window_end_utc) DO UPDATE SET
       avg_value=excluded.avg_value,
       latest_value=excluded.latest_value,
       lineage_ref=excluded.lineage_ref`
    );

    grouped.forEach((item) => {
      const avg = item.values.reduce((sum, value) => sum + value, 0) / item.values.length;
      const lineageRef = `analytics-aggregate:${item.agentId}:${item.kpiKey}:${item.start}`;
      upsert.run(
        `${item.agentId}:${item.kpiKey}:${item.start}`,
        item.agentId,
        item.kpiKey,
        item.start,
        item.end,
        Number(avg.toFixed(4)),
        Number(item.latest.toFixed(4)),
        lineageRef
      );
    });
  }

  markSyncFailure(module: string, errorMessage: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO sync_state(id, module, last_successful_sync_at_utc, last_attempt_at_utc, status, error_message, stale_reason)
         VALUES(?, ?, NULL, ?, 'error', ?, 'projection_failure')
         ON CONFLICT(module)
         DO UPDATE SET last_attempt_at_utc=excluded.last_attempt_at_utc,
                       status='error',
                       error_message=excluded.error_message,
                       stale_reason='projection_failure'`
      )
      .run(`sync-${module}`, module, now, errorMessage);
    metricsRegistry.incrementSyncFailure(module);
  }
}
