// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { InMemoryWorkflowRepository } from '../../src/server/dal/inMemoryWorkflowRepository';
import { InMemoryWorkflowRealtimeHub } from '../../src/server/realtime/workflowRealtimeHub';

describe('workflow realtime hub', () => {
  it('replays events after the provided ack id', async () => {
    const repository = new InMemoryWorkflowRepository();
    const hub = new InMemoryWorkflowRealtimeHub(repository);

    await hub.publishTransition({
      workflowId: 'wf-1001',
      toStatus: 'blocked',
      actorId: 'test',
      reason: 'blocked'
    });

    await hub.publishTransition({
      workflowId: 'wf-1001',
      toStatus: 'in_progress',
      actorId: 'test',
      reason: 'resumed'
    });

    const allEvents = hub.getMessagesAfter(null);
    expect(allEvents).toHaveLength(2);

    const eventId = (allEvents[0] as { eventId: string }).eventId;
    const replay = hub.getMessagesAfter(eventId);
    expect(replay).toHaveLength(1);
    expect((replay[0] as { eventId: string }).eventId).not.toBe(eventId);
  });

  it('returns a workflow snapshot message', async () => {
    const repository = new InMemoryWorkflowRepository();
    const hub = new InMemoryWorkflowRealtimeHub(repository);

    const snapshot = await hub.getSnapshotMessage();

    expect(snapshot.type).toBe('snapshot');
    if (snapshot.type === 'snapshot') {
      expect(snapshot.data.workflows.length).toBeGreaterThan(0);
    }
  });
});
