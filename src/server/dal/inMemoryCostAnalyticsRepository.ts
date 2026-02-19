import type {
  AgentOutlierItem,
  AgentOutliersPayload,
  AgentTrendSeries,
  CostTimeseriesPayload,
  KpiDefinition,
  LineagePayload
} from '../../shared/costAnalytics.js';
import type {
  AgentOutliersQuery,
  AgentTrendsQuery,
  CostAnalyticsRepository,
  CostSummaryQuery,
  CostTimeseriesQuery
} from './interfaces.js';

interface CostEventRow {
  id: string;
  projectId: string;
  workflowId: string | null;
  agentId: string | null;
  costAmount: number;
  currency: string;
  occurredAtUtc: string;
  sourceEventId: string;
}

interface AgentMetricRow {
  id: string;
  agentId: string;
  agentName: string;
  kpiKey: string;
  kpiValue: number;
  unit: string;
  windowStartUtc: string;
  windowEndUtc: string;
  lineageRef: string;
}

interface ProjectRef {
  id: string;
  name: string;
}

function toMillis(value: string): number {
  return new Date(value).getTime();
}

function inRange(occurredAtUtc: string, start: string, end: string): boolean {
  const point = toMillis(occurredAtUtc);
  return point >= toMillis(start) && point <= toMillis(end);
}

function sumCost(rows: CostEventRow[]): number {
  return Number(rows.reduce((total, row) => total + row.costAmount, 0).toFixed(4));
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

export class InMemoryCostAnalyticsRepository implements CostAnalyticsRepository {
  private readonly projects: ProjectRef[] = [
    { id: 'project-core', name: 'Core Delivery Controls' },
    { id: 'project-billing', name: 'Billing Reliability Hardening' },
    { id: 'project-ui', name: 'UI Delivery Modernization' }
  ];

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

  private readonly costEvents: CostEventRow[] = [
    {
      id: 'cost-1',
      projectId: 'project-core',
      workflowId: 'wf-1001',
      agentId: 'agent-alpha',
      costAmount: 42.1,
      currency: 'USD',
      occurredAtUtc: '2026-02-19T04:00:00.000Z',
      sourceEventId: 'evt-cost-1'
    },
    {
      id: 'cost-2',
      projectId: 'project-core',
      workflowId: 'wf-1002',
      agentId: 'agent-beta',
      costAmount: 58.4,
      currency: 'USD',
      occurredAtUtc: '2026-02-19T10:00:00.000Z',
      sourceEventId: 'evt-cost-2'
    },
    {
      id: 'cost-3',
      projectId: 'project-billing',
      workflowId: 'wf-1003',
      agentId: 'agent-alpha',
      costAmount: 37.25,
      currency: 'USD',
      occurredAtUtc: '2026-02-18T13:00:00.000Z',
      sourceEventId: 'evt-cost-3'
    },
    {
      id: 'cost-4',
      projectId: 'project-ui',
      workflowId: 'wf-1004',
      agentId: 'agent-gamma',
      costAmount: 22.5,
      currency: 'USD',
      occurredAtUtc: '2026-02-17T15:00:00.000Z',
      sourceEventId: 'evt-cost-4'
    },
    {
      id: 'cost-5',
      projectId: 'project-core',
      workflowId: 'wf-1002',
      agentId: 'agent-beta',
      costAmount: 49.75,
      currency: 'USD',
      occurredAtUtc: '2026-02-16T08:00:00.000Z',
      sourceEventId: 'evt-cost-5'
    },
    {
      id: 'cost-6',
      projectId: 'project-billing',
      workflowId: 'wf-1003',
      agentId: 'agent-alpha',
      costAmount: 41.95,
      currency: 'USD',
      occurredAtUtc: '2026-02-12T09:00:00.000Z',
      sourceEventId: 'evt-cost-6'
    }
  ];

  private readonly agentMetrics: AgentMetricRow[] = [
    {
      id: 'metric-1',
      agentId: 'agent-alpha',
      agentName: 'Agent Alpha',
      kpiKey: 'latency_p95_ms',
      kpiValue: 320,
      unit: 'ms',
      windowStartUtc: '2026-02-16T00:00:00.000Z',
      windowEndUtc: '2026-02-16T23:59:59.000Z',
      lineageRef: 'lineage:metric:agent-alpha:latency:2026-02-16'
    },
    {
      id: 'metric-2',
      agentId: 'agent-alpha',
      agentName: 'Agent Alpha',
      kpiKey: 'latency_p95_ms',
      kpiValue: 305,
      unit: 'ms',
      windowStartUtc: '2026-02-17T00:00:00.000Z',
      windowEndUtc: '2026-02-17T23:59:59.000Z',
      lineageRef: 'lineage:metric:agent-alpha:latency:2026-02-17'
    },
    {
      id: 'metric-3',
      agentId: 'agent-alpha',
      agentName: 'Agent Alpha',
      kpiKey: 'latency_p95_ms',
      kpiValue: 630,
      unit: 'ms',
      windowStartUtc: '2026-02-18T00:00:00.000Z',
      windowEndUtc: '2026-02-18T23:59:59.000Z',
      lineageRef: 'lineage:outlier:agent-alpha:latency:2026-02-18'
    },
    {
      id: 'metric-4',
      agentId: 'agent-alpha',
      agentName: 'Agent Alpha',
      kpiKey: 'success_rate_pct',
      kpiValue: 96,
      unit: '%',
      windowStartUtc: '2026-02-17T00:00:00.000Z',
      windowEndUtc: '2026-02-17T23:59:59.000Z',
      lineageRef: 'lineage:metric:agent-alpha:success:2026-02-17'
    },
    {
      id: 'metric-5',
      agentId: 'agent-beta',
      agentName: 'Agent Beta',
      kpiKey: 'latency_p95_ms',
      kpiValue: 410,
      unit: 'ms',
      windowStartUtc: '2026-02-16T00:00:00.000Z',
      windowEndUtc: '2026-02-16T23:59:59.000Z',
      lineageRef: 'lineage:metric:agent-beta:latency:2026-02-16'
    },
    {
      id: 'metric-6',
      agentId: 'agent-beta',
      agentName: 'Agent Beta',
      kpiKey: 'latency_p95_ms',
      kpiValue: 420,
      unit: 'ms',
      windowStartUtc: '2026-02-17T00:00:00.000Z',
      windowEndUtc: '2026-02-17T23:59:59.000Z',
      lineageRef: 'lineage:metric:agent-beta:latency:2026-02-17'
    },
    {
      id: 'metric-7',
      agentId: 'agent-beta',
      agentName: 'Agent Beta',
      kpiKey: 'latency_p95_ms',
      kpiValue: 405,
      unit: 'ms',
      windowStartUtc: '2026-02-18T00:00:00.000Z',
      windowEndUtc: '2026-02-18T23:59:59.000Z',
      lineageRef: 'lineage:metric:agent-beta:latency:2026-02-18'
    },
    {
      id: 'metric-8',
      agentId: 'agent-beta',
      agentName: 'Agent Beta',
      kpiKey: 'success_rate_pct',
      kpiValue: 92,
      unit: '%',
      windowStartUtc: '2026-02-17T00:00:00.000Z',
      windowEndUtc: '2026-02-17T23:59:59.000Z',
      lineageRef: 'lineage:metric:agent-beta:success:2026-02-17'
    },
    {
      id: 'metric-9',
      agentId: 'agent-gamma',
      agentName: 'Agent Gamma',
      kpiKey: 'latency_p95_ms',
      kpiValue: 390,
      unit: 'ms',
      windowStartUtc: '2026-02-18T00:00:00.000Z',
      windowEndUtc: '2026-02-18T23:59:59.000Z',
      lineageRef: 'lineage:metric:agent-gamma:latency:2026-02-18'
    },
    {
      id: 'metric-10',
      agentId: 'agent-gamma',
      agentName: 'Agent Gamma',
      kpiKey: 'success_rate_pct',
      kpiValue: 90,
      unit: '%',
      windowStartUtc: '2026-02-18T00:00:00.000Z',
      windowEndUtc: '2026-02-18T23:59:59.000Z',
      lineageRef: 'lineage:metric:agent-gamma:success:2026-02-18'
    }
  ];

  private readonly lineageByRef = new Map<string, LineagePayload>([
    [
      'lineage:outlier:agent-alpha:latency:2026-02-18',
      {
        lineageRef: 'lineage:outlier:agent-alpha:latency:2026-02-18',
        events: [
          {
            id: 'evt-latency-alpha-2026-02-18-1',
            sourceSystem: 'workflow-runtime',
            occurredAtUtc: '2026-02-18T18:44:12.000Z',
            description: 'Regression run exceeded baseline latency threshold for agent alpha.'
          },
          {
            id: 'evt-latency-alpha-2026-02-18-2',
            sourceSystem: 'workflow-runtime',
            occurredAtUtc: '2026-02-18T20:09:30.000Z',
            description: 'Retry burst observed after timeout event family correlation.'
          }
        ],
        artifacts: [
          {
            id: 'doc-100',
            type: 'document',
            title: 'Reliability test plan',
            uri: '/documents?documentId=doc-100'
          },
          {
            id: 'wf-1002',
            type: 'workflow',
            title: 'Nightly Regression',
            uri: '/workflows?workflowId=wf-1002'
          }
        ]
      }
    ]
  ]);

  async getCostSummary(query: CostSummaryQuery) {
    const visibleProjects = this.projects.filter((project) => (query.projectId ? project.id === query.projectId : true));
    const filtered = this.costEvents.filter(
      (event) => inRange(event.occurredAtUtc, query.start, query.end) && (!query.projectId || event.projectId === query.projectId)
    );

    const projects = visibleProjects.map((project) => {
      const projectRows = filtered.filter((event) => event.projectId === project.id);
      if (!projectRows.length) {
        return {
          projectId: project.id,
          projectName: project.name,
          totalCost: null,
          currency: 'USD',
          availability: 'unavailable' as const
        };
      }

      return {
        projectId: project.id,
        projectName: project.name,
        totalCost: sumCost(projectRows),
        currency: projectRows[0]?.currency ?? 'USD',
        availability: 'available' as const
      };
    });

    return {
      window: query.window,
      start: query.start,
      end: query.end,
      aggregate: filtered.length
        ? {
            totalCost: sumCost(filtered),
            currency: filtered[0]?.currency ?? 'USD',
            availability: 'available' as const
          }
        : {
            totalCost: null,
            currency: 'USD',
            availability: 'unavailable' as const
          },
      projects
    };
  }

  async getCostTimeseries(query: CostTimeseriesQuery): Promise<CostTimeseriesPayload> {
    const durationMs = bucketDurationMs(query.bucket);
    const startMs = toMillis(query.start);
    const endMs = toMillis(query.end);

    const filtered = this.costEvents.filter(
      (event) => inRange(event.occurredAtUtc, query.start, query.end) && (!query.projectId || event.projectId === query.projectId)
    );

    const visibleProjects = this.projects.filter((project) => (query.projectId ? project.id === query.projectId : true));

    const buildPoints = (scopeProjectId?: string) => {
      const points: CostTimeseriesPayload['series'][number]['points'] = [];
      for (let cursor = startMs; cursor <= endMs; cursor += durationMs) {
        const bucketStart = new Date(cursor).toISOString();
        const bucketEnd = new Date(Math.min(cursor + durationMs - 1, endMs)).toISOString();
        const bucketRows = filtered.filter((event) => {
          const eventMs = toMillis(event.occurredAtUtc);
          if (eventMs < cursor || eventMs > Math.min(cursor + durationMs - 1, endMs)) {
            return false;
          }
          if (!scopeProjectId) {
            return true;
          }
          return event.projectId === scopeProjectId;
        });

        points.push(
          bucketRows.length
            ? {
                bucketStart,
                bucketEnd,
                totalCost: sumCost(bucketRows),
                availability: 'available'
              }
            : {
                bucketStart,
                bucketEnd,
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
      start: query.start,
      end: query.end,
      bucket: query.bucket,
      series
    };
  }

  async getAgentTrends(query: AgentTrendsQuery) {
    const filtered = this.agentMetrics.filter(
      (row) =>
        row.windowEndUtc >= query.start &&
        row.windowEndUtc <= query.end &&
        query.agentIds.includes(row.agentId) &&
        query.kpis.includes(row.kpiKey)
    );

    const seriesByKey = new Map<string, AgentTrendSeries>();

    filtered.forEach((row) => {
      const key = `${row.agentId}:${row.kpiKey}`;
      const kpi = this.kpis.find((item) => item.key === row.kpiKey);
      if (!kpi) {
        return;
      }

      const existing = seriesByKey.get(key);
      if (!existing) {
        seriesByKey.set(key, {
          agentId: row.agentId,
          agentName: row.agentName,
          kpiKey: row.kpiKey,
          kpiLabel: kpi.label,
          unit: kpi.unit,
          points: [
            {
              windowStartUtc: row.windowStartUtc,
              windowEndUtc: row.windowEndUtc,
              value: row.kpiValue,
              unit: row.unit,
              lineageRef: row.lineageRef
            }
          ]
        });
        return;
      }

      existing.points.push({
        windowStartUtc: row.windowStartUtc,
        windowEndUtc: row.windowEndUtc,
        value: row.kpiValue,
        unit: row.unit,
        lineageRef: row.lineageRef
      });
    });

    const series = [...seriesByKey.values()].map((entry) => ({
      ...entry,
      points: entry.points.sort((a, b) => toMillis(a.windowEndUtc) - toMillis(b.windowEndUtc))
    }));

    return {
      start: query.start,
      end: query.end,
      series,
      kpis: this.kpis.filter((kpi) => query.kpis.includes(kpi.key))
    };
  }

  async getAgentOutliers(query: AgentOutliersQuery): Promise<AgentOutliersPayload> {
    const kpi = this.kpis.find((item) => item.key === query.kpi);
    if (!kpi) {
      throw Object.assign(new Error(`KPI ${query.kpi} is not defined`), {
        statusCode: 404,
        code: 'NOT_FOUND'
      });
    }

    const items: AgentOutlierItem[] = [];
    const unavailable: AgentOutliersPayload['unavailable'] = [];

    query.agentIds.forEach((agentId) => {
      const rows = this.agentMetrics
        .filter(
          (row) =>
            row.agentId === agentId && row.kpiKey === query.kpi && row.windowEndUtc >= query.start && row.windowEndUtc <= query.end
        )
        .sort((a, b) => toMillis(a.windowEndUtc) - toMillis(b.windowEndUtc));

      const agentName = rows[0]?.agentName ?? agentId;
      if (rows.length < 3) {
        unavailable.push({
          agentId,
          agentName,
          kpiKey: query.kpi,
          reason: 'Outlier calculation requires at least 3 data points in selected window.',
          sampleSize: rows.length,
          minimumRequired: 3
        });
        return;
      }

      const values = rows.map((row) => row.kpiValue);
      rows.forEach((row) => {
        const score = Number(zScore(row.kpiValue, values).toFixed(2));
        if (Math.abs(score) < 1.25) {
          return;
        }

        items.push({
          agentId: row.agentId,
          agentName: row.agentName,
          kpiKey: row.kpiKey,
          kpiLabel: kpi.label,
          unit: row.unit,
          windowEndUtc: row.windowEndUtc,
          value: row.kpiValue,
          score,
          method: 'zscore',
          lineageRef: row.lineageRef
        });
      });
    });

    return {
      start: query.start,
      end: query.end,
      kpi: query.kpi,
      items: items.sort((a, b) => Math.abs(b.score) - Math.abs(a.score)),
      unavailable
    };
  }

  async getLineageByRef(lineageRef: string): Promise<LineagePayload | null> {
    const direct = this.lineageByRef.get(lineageRef);
    if (direct) {
      return direct;
    }

    const metric = this.agentMetrics.find((row) => row.lineageRef === lineageRef);
    if (!metric) {
      return null;
    }

    return {
      lineageRef,
      events: [
        {
          id: `evt-${metric.id}`,
          sourceSystem: 'agent-metrics-projection',
          occurredAtUtc: metric.windowEndUtc,
          description: `${metric.agentName} emitted ${metric.kpiKey}=${metric.kpiValue} ${metric.unit} for the measurement window.`
        }
      ],
      artifacts: [
        {
          id: metric.id,
          type: 'agent_metric',
          title: `${metric.agentName} ${metric.kpiKey}`,
          uri: `/analytics?lineageRef=${encodeURIComponent(lineageRef)}`
        }
      ]
    };
  }

  async getKpis(): Promise<KpiDefinition[]> {
    return this.kpis.map((kpi) => ({ ...kpi }));
  }

  getSqliteIndexStatements(): string[] {
    return [
      'CREATE INDEX IF NOT EXISTS idx_cost_events_project_time ON cost_events(project_id, occurred_at_utc DESC);',
      'CREATE INDEX IF NOT EXISTS idx_agent_metrics_agent_kpi_window_end ON agent_metrics(agent_id, kpi_key, window_end_utc DESC);'
    ];
  }
}
