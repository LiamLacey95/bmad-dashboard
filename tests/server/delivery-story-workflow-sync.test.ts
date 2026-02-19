// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { InMemoryDeliveryRepository } from '../../src/server/dal/inMemoryDeliveryRepository.js';
import { InMemoryWorkflowRepository } from '../../src/server/dal/inMemoryWorkflowRepository.js';

describe('delivery repository story/workflow synchronization', () => {
  it('updates linked workflows when a story status changes', async () => {
    const workflowRepository = new InMemoryWorkflowRepository();
    const deliveryRepository = new InMemoryDeliveryRepository(workflowRepository, true);

    const occurredAtUtc = '2026-02-19T21:05:00.000Z';
    const change = await deliveryRepository.updateStoryStatus({
      storyId: 'story-301',
      toStatus: 'done',
      actorId: 'api-user',
      reason: 'resolved',
      occurredAtUtc
    });

    expect(change.story.status).toBe('done');
    expect(change.workflowUpdates).toHaveLength(1);
    expect(change.workflowUpdates[0].workflow.id).toBe('wf-1002');
    expect(change.workflowUpdates[0].workflow.status).toBe('done');
    expect(change.workflowUpdates[0].transition.toStatus).toBe('done');

    const projectContext = await deliveryRepository.getProjectContext('project-core');
    const linkedWorkflow = projectContext?.workflows.find((workflow) => workflow.id === 'wf-1002');
    expect(linkedWorkflow?.status).toBe('done');

    const syncStatus = await deliveryRepository.getSyncStatus();
    const workflowModuleStatus = syncStatus.find((module) => module.module === 'workflow');
    expect(workflowModuleStatus?.lastSuccessfulSyncAtUtc).toBe(occurredAtUtc);
  });
});
