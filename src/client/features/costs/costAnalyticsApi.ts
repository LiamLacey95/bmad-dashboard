import type {
  AgentOutliersPayload,
  AgentTrendsPayload,
  CostSummaryPayload,
  CostTimeseriesPayload,
  KpiDefinition,
  LineagePayload
} from '../../../shared/costAnalytics.js';

interface ResponseEnvelope<T> {
  data: T;
}

interface ErrorResponse {
  error?: {
    message?: string;
  };
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => ({}))) as ErrorResponse;
    throw new Error(errorPayload.error?.message ?? `Request failed (${response.status})`);
  }

  return (await response.json()) as T;
}

export async function fetchCostSummary(input: {
  window: '24h' | '7d' | '30d' | 'custom';
  start?: string;
  end?: string;
  projectId?: string;
}): Promise<CostSummaryPayload> {
  const params = new URLSearchParams();
  params.set('window', input.window);
  if (input.start) {
    params.set('start', input.start);
  }
  if (input.end) {
    params.set('end', input.end);
  }
  if (input.projectId) {
    params.set('projectId', input.projectId);
  }

  const response = await fetch(`/api/v1/costs/summary?${params.toString()}`);
  const payload = await parseJson<ResponseEnvelope<CostSummaryPayload>>(response);
  return payload.data;
}

export async function fetchCostTimeseries(input: {
  bucket: 'hour' | 'day';
  start: string;
  end: string;
  projectId?: string;
}): Promise<CostTimeseriesPayload> {
  const params = new URLSearchParams();
  params.set('bucket', input.bucket);
  params.set('start', input.start);
  params.set('end', input.end);
  if (input.projectId) {
    params.set('projectId', input.projectId);
  }

  const response = await fetch(`/api/v1/costs/timeseries?${params.toString()}`);
  const payload = await parseJson<ResponseEnvelope<CostTimeseriesPayload>>(response);
  return payload.data;
}

export async function fetchKpis(): Promise<KpiDefinition[]> {
  const response = await fetch('/api/v1/meta/kpis');
  const payload = await parseJson<ResponseEnvelope<{ items: KpiDefinition[]; total: number }>>(response);
  return payload.data.items;
}

export async function fetchAgentTrends(input: {
  agentIds: string[];
  kpis: string[];
  start: string;
  end: string;
}): Promise<AgentTrendsPayload> {
  const params = new URLSearchParams();
  params.set('agentIds', input.agentIds.join(','));
  params.set('kpis', input.kpis.join(','));
  params.set('start', input.start);
  params.set('end', input.end);

  const response = await fetch(`/api/v1/analytics/agents/trends?${params.toString()}`);
  const payload = await parseJson<ResponseEnvelope<AgentTrendsPayload>>(response);
  return payload.data;
}

export async function fetchAgentOutliers(input: {
  agentIds: string[];
  kpi: string;
  start: string;
  end: string;
}): Promise<AgentOutliersPayload> {
  const params = new URLSearchParams();
  params.set('agentIds', input.agentIds.join(','));
  params.set('kpi', input.kpi);
  params.set('start', input.start);
  params.set('end', input.end);

  const response = await fetch(`/api/v1/analytics/agents/outliers?${params.toString()}`);
  const payload = await parseJson<ResponseEnvelope<AgentOutliersPayload>>(response);
  return payload.data;
}

export async function fetchLineage(lineageRef: string): Promise<LineagePayload> {
  const response = await fetch(`/api/v1/analytics/lineage/${encodeURIComponent(lineageRef)}`);
  const payload = await parseJson<ResponseEnvelope<LineagePayload>>(response);
  return payload.data;
}
