import { EventEmitter } from 'node:events';
import { SYNC_MODULE, type StoryStatusChange, type SyncStatusPayload } from '../../shared/delivery.js';
import { WORKFLOW_MODULE, type ServerToClientMessage, type WsEventMessage } from '../../shared/workflows.js';
import type { ConsistencyMonitor, WorkflowRepository } from '../dal/interfaces.js';

const HUB_EVENT = 'message';

export interface WorkflowRealtimeHub {
  getSnapshotMessage(module?: 'workflow' | 'sync'): Promise<ServerToClientMessage>;
  getMessagesAfter(lastAckEventId: string | null): ServerToClientMessage[];
  onMessage(listener: (message: ServerToClientMessage) => void): () => void;
  publishTransition(args: {
    workflowId: string;
    toStatus: import('../../shared/statusModel.js').CanonicalStatus;
    actorId: string;
    reason: string | null;
    occurredAtUtc?: string;
  }): Promise<void>;
  publishStoryStatusChange(change: StoryStatusChange): Promise<void>;
}

export class InMemoryWorkflowRealtimeHub implements WorkflowRealtimeHub {
  private readonly emitter = new EventEmitter();
  private readonly replayLog: ServerToClientMessage[] = [];
  private eventSequence = 0;
  private snapshotVersion = 1;

  constructor(
    private readonly workflowRepository: WorkflowRepository,
    private readonly consistencyMonitor?: ConsistencyMonitor
  ) {}

  async getSnapshotMessage(module: 'workflow' | 'sync' = 'workflow'): Promise<ServerToClientMessage> {
    if (module === 'sync') {
      const syncData: SyncStatusPayload = this.consistencyMonitor
        ? await this.consistencyMonitor.checkConsistency()
        : {
            modules: [],
            warnings: [],
            checkedAtUtc: new Date().toISOString()
          };

      return {
        type: 'snapshot',
        module: SYNC_MODULE,
        version: this.snapshotVersion,
        generatedAt: new Date().toISOString(),
        data: syncData
      };
    }

    const workflows = await this.workflowRepository.getWorkflows({ page: 1, pageSize: 200 });

    return {
      type: 'snapshot',
      module: WORKFLOW_MODULE,
      version: this.snapshotVersion,
      generatedAt: new Date().toISOString(),
      data: {
        workflows: workflows.items
      }
    };
  }

  getMessagesAfter(lastAckEventId: string | null): ServerToClientMessage[] {
    if (!lastAckEventId) {
      return [...this.replayLog];
    }

    const index = this.replayLog.findIndex(
      (event) => event.type === 'event' && event.eventId === lastAckEventId
    );
    if (index < 0) {
      return [];
    }

    return this.replayLog.slice(index + 1);
  }

  onMessage(listener: (message: ServerToClientMessage) => void): () => void {
    this.emitter.on(HUB_EVENT, listener);
    return () => {
      this.emitter.off(HUB_EVENT, listener);
    };
  }

  async publishTransition(args: {
    workflowId: string;
    toStatus: import('../../shared/statusModel.js').CanonicalStatus;
    actorId: string;
    reason: string | null;
    occurredAtUtc?: string;
  }): Promise<void> {
    const transitionResult = await this.workflowRepository.applyWorkflowTransition(args);
    const eventId = `evt-${++this.eventSequence}`;

    const eventMessage: WsEventMessage = {
      type: 'event',
      eventId,
      module: WORKFLOW_MODULE,
      entityType: 'workflow',
      entityId: transitionResult.workflow.id,
      eventType: 'workflow_transition',
      occurredAt: transitionResult.transition.occurredAtUtc,
      payload: {
        workflow: transitionResult.workflow,
        transition: transitionResult.transition
      },
      lineageRef: `workflow-transition:${transitionResult.transition.id}`
    };

    this.replayLog.push(eventMessage);
    if (this.replayLog.length > 1_000) {
      this.replayLog.shift();
    }

    this.snapshotVersion += 1;
    this.emitter.emit(HUB_EVENT, eventMessage);
  }

  async publishStoryStatusChange(change: StoryStatusChange): Promise<void> {
    const eventId = `evt-${++this.eventSequence}`;
    const eventMessage: ServerToClientMessage = {
      type: 'event',
      eventId,
      module: 'story',
      entityType: 'story',
      entityId: change.story.id,
      eventType: 'story_status_changed',
      occurredAt: change.story.updatedAt,
      payload: change,
      lineageRef: `story-status:${change.story.id}:${change.story.updatedAt}`
    };

    this.replayLog.push(eventMessage);
    if (this.replayLog.length > 1_000) {
      this.replayLog.shift();
    }

    this.snapshotVersion += 1;
    this.emitter.emit(HUB_EVENT, eventMessage);
  }
}
