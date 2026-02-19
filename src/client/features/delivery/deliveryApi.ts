import type {
  KanbanBoard,
  ProjectContext,
  ProjectDetail,
  ProjectSummary,
  SyncStatusPayload
} from '../../../shared/delivery.js';

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

export async function fetchProjects(): Promise<ProjectSummary[]> {
  const response = await fetch('/api/v1/projects');
  const payload = await parseJson<ResponseEnvelope<{ items: ProjectSummary[]; total: number }>>(response);
  return payload.data.items;
}

export async function fetchProjectDetail(projectId: string): Promise<ProjectDetail> {
  const response = await fetch(`/api/v1/projects/${projectId}`);
  const payload = await parseJson<ResponseEnvelope<ProjectDetail>>(response);
  return payload.data;
}

export async function fetchProjectContext(projectId: string): Promise<ProjectContext> {
  const response = await fetch(`/api/v1/projects/${projectId}/context`);
  const payload = await parseJson<ResponseEnvelope<ProjectContext>>(response);
  return payload.data;
}

export async function fetchKanbanBoard(projectId?: string): Promise<KanbanBoard> {
  const params = new URLSearchParams();
  if (projectId) {
    params.set('projectId', projectId);
  }

  const query = params.toString();
  const response = await fetch(`/api/v1/kanban/board${query ? `?${query}` : ''}`);
  const payload = await parseJson<ResponseEnvelope<KanbanBoard>>(response);
  return payload.data;
}

export async function fetchSyncStatus(): Promise<SyncStatusPayload> {
  const response = await fetch('/api/v1/sync/status');
  const payload = await parseJson<ResponseEnvelope<SyncStatusPayload>>(response);
  return payload.data;
}
