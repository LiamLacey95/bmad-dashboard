import type { CanonicalStatus } from './statusModel.js';

export const WORKFLOW_MODULE = 'workflow' as const;

export type WorkflowModule = typeof WORKFLOW_MODULE;

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

export interface WsSnapshotMessage {
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

export interface WsStaleStateMessage {
  type: 'stale_state';
  module: WorkflowModule;
  isStale: boolean;
  lastSuccessfulUpdateAt: string | null;
  reason: string;
}

export interface WsSyncStatusMessage {
  type: 'sync_status';
  module: WorkflowModule;
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

export type ServerToClientMessage =
  | WsSnapshotMessage
  | WsEventMessage
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
