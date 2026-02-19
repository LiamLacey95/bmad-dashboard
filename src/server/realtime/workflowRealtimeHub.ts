import { EventEmitter } from 'node:events';
import { WORKFLOW_MODULE, type ServerToClientMessage, type WsEventMessage } from '../../shared/workflows.js';
import type { WorkflowRepository } from '../dal/interfaces.js';

const HUB_EVENT = 'message';

export interface WorkflowRealtimeHub {
  getSnapshotMessage(): Promise<ServerToClientMessage>;
  getMessagesAfter(lastAckEventId: string | null): ServerToClientMessage[];
  onMessage(listener: (message: ServerToClientMessage) => void): () => void;
  publishTransition(args: {
    workflowId: string;
    toStatus: import('../../shared/statusModel.js').CanonicalStatus;
    actorId: string;
    reason: string | null;
    occurredAtUtc?: string;
  }): Promise<void>;
}

export class InMemoryWorkflowRealtimeHub implements WorkflowRealtimeHub {
  private readonly emitter = new EventEmitter();
  private readonly replayLog: WsEventMessage[] = [];
  private eventSequence = 0;
  private snapshotVersion = 1;

  constructor(private readonly workflowRepository: WorkflowRepository) {}

  async getSnapshotMessage(): Promise<ServerToClientMessage> {
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

    const index = this.replayLog.findIndex((event) => event.eventId === lastAckEventId);
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
}
