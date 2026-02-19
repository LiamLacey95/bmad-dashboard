import type { CanonicalStatus } from './statusModel.js';
import type { WorkflowSummary, WorkflowTransition } from './workflows.js';

export const PROJECT_MODULE = 'project' as const;
export const STORY_MODULE = 'story' as const;
export const SYNC_MODULE = 'sync' as const;

export type ProjectModule = typeof PROJECT_MODULE;
export type StoryModule = typeof STORY_MODULE;
export type SyncModule = typeof SYNC_MODULE;

export interface ProjectSummary {
  id: string;
  name: string;
  ownerId: string;
  status: CanonicalStatus;
  progressPct: number;
  dueAt: string;
  riskFlag: boolean;
  isOverdue: boolean;
  updatedAt: string;
}

export interface ProjectDetail extends ProjectSummary {
  description: string;
}

export interface StorySummary {
  id: string;
  projectId: string;
  title: string;
  ownerId: string;
  status: CanonicalStatus;
  kanbanColumn: string;
  updatedAt: string;
}

export interface DocumentReference {
  id: string;
  projectId: string;
  storyId: string | null;
  title: string;
  mimeType: string;
}

export interface WorkflowReference {
  id: string;
  projectId: string;
  storyId: string | null;
  name: string;
  ownerId: string;
  status: CanonicalStatus;
  lastTransitionAt: string;
}

export interface ProjectContext {
  project: ProjectDetail;
  stories: StorySummary[];
  workflows: WorkflowReference[];
  documents: DocumentReference[];
}

export interface KanbanCard {
  id: string;
  storyId: string;
  title: string;
  ownerId: string;
  status: CanonicalStatus;
  projectId: string;
  projectName: string;
  updatedAt: string;
}

export interface KanbanColumn {
  id: string;
  label: string;
  statuses: CanonicalStatus[];
  cards: KanbanCard[];
}

export interface KanbanBoard {
  projectId: string | null;
  readOnly: boolean;
  editable: boolean;
  editableModeReason: string;
  columns: KanbanColumn[];
  generatedAt: string;
}

export interface SyncModuleStatus {
  module: ProjectModule | StoryModule | 'workflow';
  status: 'ok' | 'syncing' | 'error';
  lastSuccessfulSyncAtUtc: string | null;
  lastAttemptAtUtc: string | null;
  errorMessage: string | null;
}

export interface ConsistencyWarning {
  module: ProjectModule | StoryModule | 'workflow';
  message: string;
  lastSuccessfulSyncAtUtc: string | null;
}

export interface SyncStatusPayload {
  modules: SyncModuleStatus[];
  warnings: ConsistencyWarning[];
  checkedAtUtc: string;
}

export interface StoryStatusChange {
  story: StorySummary;
  project: ProjectSummary;
  workflowUpdates: Array<{
    workflow: WorkflowSummary;
    transition: WorkflowTransition;
  }>;
}
