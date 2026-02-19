import type { DatabaseSync } from 'node:sqlite';
import type {
  AgentOutlierItem,
  AgentOutliersPayload,
  AgentTrendSeries,
  CostSummaryPayload,
  CostTimeseriesPayload,
  KpiDefinition,
  LineagePayload
} from '../../../shared/costAnalytics.js';
import type {
  AgentOutliersQuery,
  AgentTrendsQuery,
  CostAnalyticsRepository,
  CostSummaryQuery,
  CostTimeseriesQuery
} from '../interfaces.js';
import { withSqliteRetry } from './database.js';

function toMillis(value: string): number {
  return new Date(value).getTime();
}

function inRange(ts: string, start: string, end: string): boolean {
  const point = toMillis(ts);
  return point >= toMillis(start) && point <= toMillis(end);
}

function sumCost(rows: Array<{ cost_amount: number }>): number {
  return Number(rows.reduce((acc, row) => acc + row.cost_amount, 0).toFixed(4));
}

function bucketDurationMs(bucket: CostTimeseriesQuery['bucket']): number {
  return bucket === 'hour' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
}

function stdDev(values: number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function zScore(value: number, values: number[]): number {
  const mean = values.reduce((sum, item) => sum + item, 0) / values.length;
  const sigma = stdDev(values);
  if (sigma === 0) {
    return 0;
  }
  return (value - mean) / sigma;
}

export class SqliteCostAnalyticsRepository implements CostAnalyticsRepository {
  private readonly kpis: KpiDefinition[] = [
    {
      key: 'latency_p95_ms',
      label: 'Latency P95',
      unit: 'ms',
      definition: '95th percentile completion latency for agent tasks within each measurement window.',
      directionality: 'lower_is_better',
      finalized: true
    },
    {
      key: 'success_rate_pct',
      label: 'Success Rate',
      unit: '%',
      definition: 'Percentage of successful outcomes for agent-executed tasks over the measurement window.',
      directionality: 'higher_is_better',
      finalized: true
    },
    {
      key: 'review_quality_score',
      label: 'Review Quality Score',
      unit: 'score',
      definition: 'Composite score from quality rubric checks; pending final threshold and weighting agreement.',
      directionality: 'higher_is_better',
      finalized: false
    }
  ];

  constructor(private readonly db: DatabaseSync) {}

  async getCostSummary(query: CostSummaryQuery): Promise<CostSummaryPayload> {
    return withSqliteRetry(() => {
      const projects = this.db.prepare('SELECT id, name FROM projects ORDER BY name ASC').all() as Array<{
        id: string;
        name: string;
      }>;
      const visibleProjects = projects.filter((project) => (query.projectId ? project.id === query.projectId : true));

      const rows = this.db
        .prepare('SELECT project_id, cost_amount, currency, occurred_at_utc FROM cost_events')
        .all() as Array<{
        project_id: string;
        cost_amount: number;
        currency: string;
        occurred_at_utc: string;
      }>;

      const filtered = rows.filter(
        (row) => inRange(row.occurred_at_utc, query.start, query.end) && (!query.projectId || row.project_id === query.projectId)
      );

      return {
        window: query.window,
        start: query.start,
        end: query.end,
        aggregate: filtered.length
          ? {
              totalCost: sumCost(filtered),
              currency: filtered[0]?.currency ?? 'USD',
              availability: 'available'
            }
          : {
              totalCost: null,
              currency: 'USD',
              availability: 'unavailable'
            },
        projects: visibleProjects.map((project) => {
          const projectRows = filtered.filter((row) => row.project_id === project.id);
          if (!projectRows.length) {
            return {
              projectId: project.id,
              projectName: project.name,
              totalCost: null,
              currency: 'USD',
              availability: 'unavailable'
            };
          }

          return {
            projectId: project.id,
            projectName: project.name,
            totalCost: sumCost(projectRows),
            currency: projectRows[0]?.currency ?? 'USD',
            availability: 'available'
          };
        })
      };
    });
  }

  async getCostTimeseries(query: CostTimeseriesQuery): Promise<CostTimeseriesPayload> {
    return withSqliteRetry(() => {
      const durationMs = bucketDurationMs(query.bucket);
      const startMs = toMillis(query.start);
      const endMs = toMillis(query.end);

      const projects = this.db.prepare('SELECT id, name FROM projects ORDER BY name ASC').all() as Array<{
        id: string;
        name: string;
      }>;
      const visibleProjects = projects.filter((project) => (query.projectId ? project.id === query.projectId : true));

      const rows = this.db
        .prepare('SELECT project_id, cost_amount, occurred_at_utc FROM cost_events')
        .all() as Array<{
        project_id: string;
        cost_amount: number;
        occurred_at_utc: string;
      }>;
      const filtered = rows.filter(
        (row) => inRange(row.occurred_at_utc, query.start, query.end) && (!query.projectId || row.project_id === query.projectId)
      );

      const buildPoints = (scopeProjectId?: string) => {
        const points: CostTimeseriesPayload['series'][number]['points'] = [];
        for (let cursor = startMs; cursor <= endMs; cursor += durationMs) {
          const bucketEndMs = Math.min(cursor + durationMs - 1, endMs);
          const bucketRows = filtered.filter((row) => {
            const eventMs = toMillis(row.occurred_at_utc);
            if (eventMs < cursor || eventMs > bucketEndMs) {
              return false;
            }
            if (!scopeProjectId) {
              return true;
            }
            return row.project_id === scopeProjectId;
          });

          points.push(
            bucketRows.length
              ? {
                  bucketStart: new Date(cursor).toISOString(),
                  bucketEnd: new Date(bucketEndMs).toISOString(),
                  totalCost: sumCost(bucketRows),
                  availability: 'available'
                }
              : {
                  bucketStart: new Date(cursor).toISOString(),
                  bucketEnd: new Date(bucketEndMs).toISOString(),
                  totalCost: null,
                  availability: 'unavailable'
                }
          );
        }

        return points;
      };

      const series: CostTimeseriesPayload['series'] = [
        {
          scope: 'aggregate',
          projectId: null,
          projectName: 'All projects',
          points: buildPoints()
        },
        ...visibleProjects.map((project) => ({
          scope: 'project' as const,
          projectId: project.id,
          projectName: project.name,
          points: buildPoints(project.id)
        }))
      ];

      return {
        bucket: query.bucket,
        start: query.start,
        end: query.end,
        series
      };
    });
  }

  async getAgentTrends(query: AgentTrendsQuery) {
    return withSqliteRetry(() => {
      const rows = this.db
        .prepare(
          `SELECT m.id, m.agent_id, a.name AS agent_name, m.kpi_key, m.kpi_value, m.unit, m.window_start_utc, m.window_end_utc, m.lineage_ref
           FROM agent_metrics m
           INNER JOIN agents a ON a.id = m.agent_id`
        )
        .all() as Array<{
        id: string;
        agent_id: string;
        agent_name: string;
        kpi_key: string;
        kpi_value: number;
        unit: string;
        window_start_utc: string;
        window_end_utc: string;
        lineage_ref: string;
      }>;

      const filtered = rows.filter(
        (row) =>
          query.agentIds.includes(row.agent_id) &&
          query.kpis.includes(row.kpi_key) &&
          inRange(row.window_end_utc, query.start, query.end)
      );

      const seriesByKey = new Map<string, AgentTrendSeries>();
      filtered
        .sort((a, b) => toMillis(a.window_end_utc) - toMillis(b.window_end_utc))
        .forEach((row) => {
          const key = `${row.agent_id}:${row.kpi_key}`;
          const current = seriesByKey.get(key) ?? {
            agentId: row.agent_id,
            agentName: row.agent_name,
            kpiKey: row.kpi_key,
            unit: row.unit,
            points: []
          };
          current.points.push({
            windowStartUtc: row.window_start_utc,
            windowEndUtc: row.window_end_utc,
            value: row.kpi_value,
            lineageRef: row.lineage_ref
          });
          seriesByKey.set(key, current);
        });

      return {
        start: query.start,
        end: query.end,
        series: [...seriesByKey.values()]
      };
    });
  }

  async getAgentOutliers(query: AgentOutliersQuery): Promise<AgentOutliersPayload> {
    const trends = await this.getAgentTrends({
      agentIds: query.agentIds,
      kpis: [query.kpi],
      start: query.start,
      end: query.end
    });

    const outliers: AgentOutlierItem[] = [];
    trends.series.forEach((series) => {
      const values = series.points.map((point) => point.value);
      series.points.forEach((point) => {
        const score = zScore(point.value, values);
        if (Math.abs(score) < 2) {
          return;
        }
        outliers.push({
          agentId: series.agentId,
          agentName: series.agentName,
          kpiKey: series.kpiKey,
          value: point.value,
          score: Number(score.toFixed(4)),
          method: 'z_score',
          windowEndUtc: point.windowEndUtc,
          lineageRef: point.lineageRef
        });
      });
    });

    return {
      start: query.start,
      end: query.end,
      kpi: query.kpi,
      outliers: outliers.sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    };
  }

  async getLineageByRef(lineageRef: string): Promise<LineagePayload | null> {
    return withSqliteRetry(() => {
      const row = this.db
        .prepare('SELECT payload_json FROM lineage_refs WHERE lineage_ref = ? LIMIT 1')
        .get(lineageRef) as { payload_json: string } | undefined;
      if (!row) {
        return null;
      }

      return JSON.parse(row.payload_json) as LineagePayload;
    });
  }

  async getKpis(): Promise<KpiDefinition[]> {
    return this.kpis;
  }

  getSqliteIndexStatements(): string[] {
    return [
      'CREATE INDEX IF NOT EXISTS idx_cost_events_project_time ON cost_events(project_id, occurred_at_utc DESC);',
      'CREATE INDEX IF NOT EXISTS idx_agent_metrics_agent_kpi_window_end ON agent_metrics(agent_id, kpi_key, window_end_utc DESC);'
    ];
  }
}
