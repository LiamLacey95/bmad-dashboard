import type {
  AgentOutliersPayload,
  AgentTrendsPayload,
  CostBucket,
  CostSummaryPayload,
  CostTimeseriesPayload,
  CostWindowType,
  KpiDefinition,
  LineagePayload
} from '../../shared/costAnalytics.js';
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

export interface CostSummaryQuery {
  window: CostWindowType;
  start: string;
  end: string;
  projectId?: string;
}

export interface CostTimeseriesQuery {
  bucket: CostBucket;
  start: string;
  end: string;
  projectId?: string;
}

export interface AgentTrendsQuery {
  agentIds: string[];
  kpis: string[];
  start: string;
  end: string;
}

export interface AgentOutliersQuery {
  agentIds: string[];
  kpi: string;
  start: string;
  end: string;
}

export interface CostAnalyticsRepository {
  getCostSummary(query: CostSummaryQuery): Promise<CostSummaryPayload>;
  getCostTimeseries(query: CostTimeseriesQuery): Promise<CostTimeseriesPayload>;
  getAgentTrends(query: AgentTrendsQuery): Promise<AgentTrendsPayload>;
  getAgentOutliers(query: AgentOutliersQuery): Promise<AgentOutliersPayload>;
  getLineageByRef(lineageRef: string): Promise<LineagePayload | null>;
  getKpis(): Promise<KpiDefinition[]>;
  getSqliteIndexStatements(): string[];
}

export interface ConsistencyMonitor {
  checkConsistency(): Promise<SyncStatusPayload>;
  recordFailureMetrics(warnings: ConsistencyWarning[]): void;
}
