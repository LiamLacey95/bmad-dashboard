import { describe, expect, it } from 'vitest';
import type { WsEventMessage } from '../../src/shared/workflows.js';
import {
  calculateReconnectDelayMs,
  initialWorkflowLiveState,
  selectFilteredWorkflows,
  workflowLiveReducer
} from '../../src/client/features/workflows/liveState';

describe('workflow live reducer', () => {
  it('filters to blocked and failed only', () => {
    const state = workflowLiveReducer(initialWorkflowLiveState, {
      type: 'SET_INITIAL_WORKFLOWS',
      workflows: [
        {
          id: 'wf-1',
          name: 'A',
          ownerId: 'a',
          status: 'blocked',
          lastTransitionAt: '2026-02-19T10:00:00.000Z'
        },
        {
          id: 'wf-2',
          name: 'B',
          ownerId: 'b',
          status: 'failed',
          lastTransitionAt: '2026-02-19T09:00:00.000Z'
        },
        {
          id: 'wf-3',
          name: 'C',
          ownerId: 'c',
          status: 'done',
          lastTransitionAt: '2026-02-19T08:00:00.000Z'
        }
      ]
    });

    const filtered = selectFilteredWorkflows({ ...state, filter: 'blocked_failed' });
    expect(filtered.map((workflow) => workflow.id)).toEqual(['wf-1', 'wf-2']);
  });

  it('keeps stale true after sync status until a fresh event is received', () => {
    const afterOpen = workflowLiveReducer(initialWorkflowLiveState, { type: 'SOCKET_OPEN' });
    const afterSync = workflowLiveReducer(afterOpen, {
      type: 'WS_MESSAGE',
      message: {
        type: 'sync_status',
        module: 'workflow',
        status: 'ok',
        lastSuccessfulSyncAt: '2026-02-19T20:00:00.000Z',
        error: null
      }
    });

    expect(afterSync.stale).toBe(true);

    const eventMessage: WsEventMessage = {
      type: 'event',
      eventId: 'evt-1',
      module: 'workflow',
      entityType: 'workflow',
      entityId: 'wf-1',
      eventType: 'workflow_transition',
      occurredAt: '2026-02-19T20:01:00.000Z',
      payload: {
        workflow: {
          id: 'wf-1',
          name: 'workflow',
          ownerId: 'owner',
          status: 'blocked',
          lastTransitionAt: '2026-02-19T20:01:00.000Z'
        },
        transition: {
          id: 'wt-1',
          workflowId: 'wf-1',
          fromStatus: 'in_progress',
          toStatus: 'blocked',
          occurredAtUtc: '2026-02-19T20:01:00.000Z',
          actorId: 'owner',
          reason: 'dependency'
        }
      },
      lineageRef: 'workflow-transition:wt-1'
    };

    const afterEvent = workflowLiveReducer(afterSync, {
      type: 'WS_MESSAGE',
      message: eventMessage
    });

    expect(afterEvent.stale).toBe(false);
    expect(afterEvent.lastAckEventId).toBe('evt-1');
    expect(afterEvent.lastSuccessfulUpdateAt).toBe('2026-02-19T20:01:00.000Z');
  });

  it('computes bounded reconnect delay', () => {
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      const delay = calculateReconnectDelayMs(attempt);
      expect(delay).toBeGreaterThanOrEqual(400);
      expect(delay).toBeLessThanOrEqual(36_000);
    }
  });
});
