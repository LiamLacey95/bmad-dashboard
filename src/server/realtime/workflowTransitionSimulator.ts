import type { CanonicalStatus } from '../../shared/statusModel.js';
import type { DeliveryRepository } from '../dal/interfaces.js';
import type { WorkflowRealtimeHub } from './workflowRealtimeHub.js';

const SIMULATION_CYCLE: Array<{ workflowId: string; toStatus: CanonicalStatus; reason: string }> = [
  { workflowId: 'wf-1001', toStatus: 'blocked', reason: 'Waiting on QA approval' },
  { workflowId: 'wf-1001', toStatus: 'in_progress', reason: 'Approval received' },
  { workflowId: 'wf-1002', toStatus: 'in_progress', reason: 'Dependency unblocked' },
  { workflowId: 'wf-1003', toStatus: 'in_progress', reason: 'Retrying ingestion' },
  { workflowId: 'wf-1003', toStatus: 'failed', reason: 'Retry failed again' }
];

const STORY_CYCLE: Array<{ storyId: string; toStatus: CanonicalStatus; reason: string }> = [
  { storyId: 'story-301', toStatus: 'in_progress', reason: 'Dependency returned' },
  { storyId: 'story-301', toStatus: 'blocked', reason: 'Dependency unstable again' },
  { storyId: 'story-502', toStatus: 'done', reason: 'UI validation complete' },
  { storyId: 'story-502', toStatus: 'in_progress', reason: 'Follow-up polish started' }
];

export function startWorkflowTransitionSimulator(hub: WorkflowRealtimeHub, deliveryRepository: DeliveryRepository): () => void {
  let index = 0;
  let storyIndex = 0;

  const timer = setInterval(async () => {
    const transition = SIMULATION_CYCLE[index % SIMULATION_CYCLE.length];
    index += 1;

    try {
      await hub.publishTransition({
        workflowId: transition.workflowId,
        toStatus: transition.toStatus,
        actorId: 'simulator',
        reason: transition.reason
      });
    } catch {
      // Simulation should not crash the API process.
    }

    const storyTransition = STORY_CYCLE[storyIndex % STORY_CYCLE.length];
    storyIndex += 1;
    try {
      const change = await deliveryRepository.updateStoryStatus({
        storyId: storyTransition.storyId,
        toStatus: storyTransition.toStatus,
        actorId: 'simulator',
        reason: storyTransition.reason,
        occurredAtUtc: new Date().toISOString()
      });
      await hub.publishStoryStatusChange(change);
    } catch {
      // Simulation should not crash the API process.
    }
  }, 12_000);

  return () => {
    clearInterval(timer);
  };
}
