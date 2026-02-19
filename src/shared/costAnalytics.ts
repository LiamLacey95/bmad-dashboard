export type CostWindowPreset = '24h' | '7d' | '30d';
export type CostWindowType = CostWindowPreset | 'custom';
export type CostBucket = 'hour' | 'day';
export type DataAvailability = 'available' | 'unavailable';

export interface TimeWindow {
  start: string;
  end: string;
}

export interface CostAggregate {
  totalCost: number | null;
  currency: string;
  availability: DataAvailability;
}

export interface CostProjectSummary extends CostAggregate {
  projectId: string;
  projectName: string;
}

export interface CostSummaryPayload {
  window: CostWindowType;
  start: string;
  end: string;
  aggregate: CostAggregate;
  projects: CostProjectSummary[];
}

export interface CostTimeseriesPoint {
  bucketStart: string;
  bucketEnd: string;
  totalCost: number | null;
  availability: DataAvailability;
}

export interface CostTimeseriesSeries {
  scope: 'aggregate' | 'project';
  projectId?: string;
  projectName?: string;
  points: CostTimeseriesPoint[];
}

export interface CostTimeseriesPayload {
  start: string;
  end: string;
  bucket: CostBucket;
  series: CostTimeseriesSeries[];
}

export interface KpiDefinition {
  key: string;
  label: string;
  unit: string;
  definition: string;
  directionality: 'higher_is_better' | 'lower_is_better' | 'target_range';
  finalized: boolean;
}

export interface AgentTrendPoint {
  windowStartUtc: string;
  windowEndUtc: string;
  value: number;
  unit: string;
  lineageRef: string;
}

export interface AgentTrendSeries {
  agentId: string;
  agentName: string;
  kpiKey: string;
  kpiLabel: string;
  unit: string;
  points: AgentTrendPoint[];
}

export interface AgentTrendsPayload {
  start: string;
  end: string;
  series: AgentTrendSeries[];
  kpis: KpiDefinition[];
}

export interface AgentOutlierItem {
  agentId: string;
  agentName: string;
  kpiKey: string;
  kpiLabel: string;
  unit: string;
  windowEndUtc: string;
  value: number;
  score: number;
  method: string;
  lineageRef: string;
}

export interface AgentOutlierUnavailable {
  agentId: string;
  agentName: string;
  kpiKey: string;
  reason: string;
  sampleSize: number;
  minimumRequired: number;
}

export interface AgentOutliersPayload {
  start: string;
  end: string;
  kpi: string;
  items: AgentOutlierItem[];
  unavailable: AgentOutlierUnavailable[];
}

export interface LineageEvent {
  id: string;
  sourceSystem: string;
  occurredAtUtc: string;
  description: string;
}

export interface LineageArtifact {
  id: string;
  type: string;
  title: string;
  uri: string;
}

export interface LineagePayload {
  lineageRef: string;
  events: LineageEvent[];
  artifacts: LineageArtifact[];
}
