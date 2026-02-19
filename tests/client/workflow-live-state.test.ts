import { describe, expect, it } from 'vitest';
import type { WsEventMessage, WsStoryEventMessage } from '../../src/shared/workflows.js';
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

  it('applies workflow updates from story status events', () => {
    const seeded = workflowLiveReducer(initialWorkflowLiveState, {
      type: 'SET_INITIAL_WORKFLOWS',
      workflows: [
        {
          id: 'wf-1002',
          name: 'Nightly Regression',
          ownerId: 'bob',
          status: 'blocked',
          lastTransitionAt: '2026-02-19T20:00:00.000Z'
        }
      ]
    });

    const storyEvent: WsStoryEventMessage = {
      type: 'event',
      eventId: 'evt-2',
      module: 'story',
      entityType: 'story',
      entityId: 'story-301',
      eventType: 'story_status_changed',
      occurredAt: '2026-02-19T20:05:00.000Z',
      payload: {
        story: {
          id: 'story-301',
          projectId: 'project-core',
          title: 'Story',
          ownerId: 'alice',
          status: 'done',
          kanbanColumn: 'done',
          updatedAt: '2026-02-19T20:05:00.000Z'
        },
        project: {
          id: 'project-core',
          name: 'Core Delivery Controls',
          ownerId: 'alice',
          status: 'in_progress',
          progressPct: 75,
          dueAt: '2026-02-22T18:00:00.000Z',
          riskFlag: false,
          isOverdue: false,
          updatedAt: '2026-02-19T20:05:00.000Z'
        },
        workflowUpdates: [
          {
            workflow: {
              id: 'wf-1002',
              name: 'Nightly Regression',
              ownerId: 'bob',
              status: 'done',
              lastTransitionAt: '2026-02-19T20:05:00.000Z'
            },
            transition: {
              id: 'wt-9',
              workflowId: 'wf-1002',
              fromStatus: 'blocked',
              toStatus: 'done',
              occurredAtUtc: '2026-02-19T20:05:00.000Z',
              actorId: 'api-user',
              reason: 'resolved'
            }
          }
        ]
      },
      lineageRef: 'story-status:story-301:2026-02-19T20:05:00.000Z'
    };

    const updated = workflowLiveReducer(seeded, { type: 'WS_MESSAGE', message: storyEvent });
    expect(updated.workflows[0].status).toBe('done');
    expect(updated.transitionsByWorkflowId['wf-1002']).toHaveLength(1);
    expect(updated.lastAckEventId).toBe('evt-2');
    expect(updated.lastSuccessfulUpdateAt).toBe('2026-02-19T20:05:00.000Z');
  });
});
