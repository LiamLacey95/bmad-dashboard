import type {
  ConsistencyWarning,
  KanbanBoard,
  ProjectContext,
  ProjectDetail,
  ProjectSummary,
  StoryStatusChange,
  SyncModuleStatus,
  SyncStatusPayload
} from '../../shared/delivery.js';
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

export interface ProjectQuery {
  statuses?: CanonicalStatus[];
  ownerId?: string;
  riskFlag?: boolean;
  overdue?: boolean;
}

export interface StoryStatusUpdateInput {
  storyId: string;
  toStatus: CanonicalStatus;
  actorId: string;
  reason: string | null;
  occurredAtUtc?: string;
}

export interface DeliveryRepository {
  getProjects(query: ProjectQuery): Promise<{ items: ProjectSummary[]; total: number }>;
  getProjectById(id: string): Promise<ProjectDetail | null>;
  getProjectContext(projectId: string): Promise<ProjectContext | null>;
  getKanbanBoard(projectId?: string): Promise<KanbanBoard>;
  updateStoryStatus(input: StoryStatusUpdateInput): Promise<StoryStatusChange>;
  getSyncStatus(): Promise<SyncModuleStatus[]>;
  setSyncStatus(status: SyncModuleStatus): Promise<void>;
}

export interface ConsistencyMonitor {
  checkConsistency(): Promise<SyncStatusPayload>;
  recordFailureMetrics(warnings: ConsistencyWarning[]): void;
}
