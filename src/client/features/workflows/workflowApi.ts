import type { WorkflowSummary, WorkflowTransition } from '../../../shared/workflows.js';

interface WorkflowListResponse {
  data: {
    items: WorkflowSummary[];
    total: number;
    page: number;
    pageSize: number;
  };
}

interface WorkflowTransitionResponse {
  data: {
    items: WorkflowTransition[];
    workflowId: string;
  };
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

export async function fetchWorkflows(statusFilter?: string): Promise<WorkflowSummary[]> {
  const params = new URLSearchParams();
  if (statusFilter) {
    params.set('status', statusFilter);
  }

  const query = params.toString();
  const response = await fetch(`/api/v1/workflows${query ? `?${query}` : ''}`);
  const payload = await parseJson<WorkflowListResponse>(response);
  return payload.data.items;
}

export async function fetchWorkflowTransitions(workflowId: string): Promise<WorkflowTransition[]> {
  const response = await fetch(`/api/v1/workflows/${workflowId}/transitions?limit=100`);
  const payload = await parseJson<WorkflowTransitionResponse>(response);
  return payload.data.items;
}
