import type { CanonicalStatus } from '../../shared/statusModel.js';
import type { WorkflowRealtimeHub } from './workflowRealtimeHub.js';

const SIMULATION_CYCLE: Array<{ workflowId: string; toStatus: CanonicalStatus; reason: string }> = [
  { workflowId: 'wf-1001', toStatus: 'blocked', reason: 'Waiting on QA approval' },
  { workflowId: 'wf-1001', toStatus: 'in_progress', reason: 'Approval received' },
  { workflowId: 'wf-1002', toStatus: 'in_progress', reason: 'Dependency unblocked' },
  { workflowId: 'wf-1003', toStatus: 'in_progress', reason: 'Retrying ingestion' },
  { workflowId: 'wf-1003', toStatus: 'failed', reason: 'Retry failed again' }
];

export function startWorkflowTransitionSimulator(hub: WorkflowRealtimeHub): () => void {
  let index = 0;

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
  }, 12_000);

  return () => {
    clearInterval(timer);
  };
}
