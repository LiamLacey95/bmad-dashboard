import type { CanonicalStatus } from '../../shared/statusModel.js';
import type { WorkflowSummary, WorkflowTransition } from '../../shared/workflows.js';

export interface StatusModelRepository {
  getStatusModel(): Promise<{
    statuses: CanonicalStatus[];
    allowedTransitions: Record<CanonicalStatus, CanonicalStatus[]>;
  }>;
}

export interface WorkflowQuery {
  statuses?: CanonicalStatus[];
  ownerId?: string;
  projectId?: string;
  page?: number;
  pageSize?: number;
}

export interface WorkflowRepository {
  getWorkflows(query: WorkflowQuery): Promise<{ items: WorkflowSummary[]; total: number }>;
  getWorkflowById(id: string): Promise<WorkflowSummary | null>;
  getWorkflowTransitions(workflowId: string, limit: number): Promise<WorkflowTransition[]>;
  applyWorkflowTransition(input: {
    workflowId: string;
    toStatus: CanonicalStatus;
    actorId: string;
    reason: string | null;
    occurredAtUtc?: string;
  }): Promise<{ workflow: WorkflowSummary; transition: WorkflowTransition }>;
}
