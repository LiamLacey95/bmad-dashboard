import type { CanonicalStatus } from './statusModel.js';
import { PROJECT_MODULE, STORY_MODULE, SYNC_MODULE, type StoryStatusChange, type SyncStatusPayload } from './delivery.js';

export const WORKFLOW_MODULE = 'workflow' as const;

export type WorkflowModule = typeof WORKFLOW_MODULE;
export type RealtimeModule = WorkflowModule | typeof PROJECT_MODULE | typeof STORY_MODULE | typeof SYNC_MODULE;

export interface WorkflowSummary {
  id: string;
  name: string;
  ownerId: string;
  status: CanonicalStatus;
  lastTransitionAt: string;
}

export interface WorkflowTransition {
  id: string;
  workflowId: string;
  fromStatus: CanonicalStatus | null;
  toStatus: CanonicalStatus;
  occurredAtUtc: string;
  actorId: string;
  reason: string | null;
}

export interface WorkflowSnapshotData {
  workflows: WorkflowSummary[];
}

export interface WsWorkflowSnapshotMessage {
  type: 'snapshot';
  module: WorkflowModule;
  version: number;
  generatedAt: string;
  data: WorkflowSnapshotData;
}

export interface WsEventMessage {
  type: 'event';
  eventId: string;
  module: WorkflowModule;
  entityType: 'workflow';
  entityId: string;
  eventType: 'workflow_transition';
  occurredAt: string;
  payload: {
    workflow: WorkflowSummary;
    transition: WorkflowTransition;
  };
  lineageRef: string;
}

export interface WsStoryEventMessage {
  type: 'event';
  eventId: string;
  module: typeof STORY_MODULE;
  entityType: 'story';
  entityId: string;
  eventType: 'story_status_changed';
  occurredAt: string;
  payload: StoryStatusChange;
  lineageRef: string;
}

export interface WsStaleStateMessage {
  type: 'stale_state';
  module: RealtimeModule;
  isStale: boolean;
  lastSuccessfulUpdateAt: string | null;
  reason: string;
}

export interface WsSyncStatusMessage {
  type: 'sync_status';
  module: RealtimeModule;
  status: 'ok' | 'syncing' | 'error';
  lastSuccessfulSyncAt: string | null;
  error: string | null;
}

export interface WsErrorMessage {
  type: 'error';
  code: string;
  message: string;
  recoverable: boolean;
}

export interface WsSyncSnapshotMessage {
  type: 'snapshot';
  module: typeof SYNC_MODULE;
  version: number;
  generatedAt: string;
  data: SyncStatusPayload;
}

export type ServerToClientMessage =
  | WsWorkflowSnapshotMessage
  | WsSyncSnapshotMessage
  | WsEventMessage
  | WsStoryEventMessage
  | WsStaleStateMessage
  | WsSyncStatusMessage
  | WsErrorMessage;

export interface WsAuthMessage {
  type: 'auth';
  token?: string;
}

export interface WsSubscribeMessage {
  type: 'subscribe';
  topics: string[];
}

export interface WsHeartbeatMessage {
  type: 'heartbeat';
  ts: string;
}

export interface WsResyncRequestMessage {
  type: 'resync_request';
  lastAckEventId: string | null;
}

export type ClientToServerMessage =
  | WsAuthMessage
  | WsSubscribeMessage
  | WsHeartbeatMessage
  | WsResyncRequestMessage;
