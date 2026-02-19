import type { ConsistencyWarning, SyncStatusPayload } from '../../shared/delivery.js';
import { metricsRegistry } from '../observability/metrics.js';
import type { ConsistencyMonitor, DeliveryRepository } from '../dal/interfaces.js';

export class DeliveryConsistencyMonitor implements ConsistencyMonitor {
  constructor(private readonly deliveryRepository: DeliveryRepository) {}

  async checkConsistency(): Promise<SyncStatusPayload> {
    const modules = await this.deliveryRepository.getSyncStatus();
    const projects = await this.deliveryRepository.getProjects({});
    const warnings: ConsistencyWarning[] = [];

    for (const project of projects.items) {
      const context = await this.deliveryRepository.getProjectContext(project.id);
      if (!context) {
        continue;
      }

      for (const workflow of context.workflows) {
        if (!workflow.storyId) {
          continue;
        }

        const linkedStory = context.stories.find((story) => story.id === workflow.storyId);
        if (!linkedStory) {
          warnings.push({
            module: 'story',
            message: `Workflow ${workflow.id} references missing story ${workflow.storyId}`,
            lastSuccessfulSyncAtUtc: this.moduleSyncAt(modules, 'story')
          });
          continue;
        }

        if (linkedStory.status !== workflow.status) {
          warnings.push({
            module: 'workflow',
            message: `Story ${linkedStory.id} is ${linkedStory.status} while workflow ${workflow.id} is ${workflow.status}`,
            lastSuccessfulSyncAtUtc: this.moduleSyncAt(modules, 'workflow')
          });
        }
      }
    }

    this.recordFailureMetrics(warnings);

    return {
      modules,
      warnings,
      checkedAtUtc: new Date().toISOString()
    };
  }

  recordFailureMetrics(warnings: ConsistencyWarning[]): void {
    warnings.forEach((warning) => {
      metricsRegistry.incrementCrossViewConsistencyFailure(warning.module);
    });
  }

  private moduleSyncAt(modules: SyncStatusPayload['modules'], module: SyncStatusPayload['modules'][number]['module']) {
    return modules.find((item) => item.module === module)?.lastSuccessfulSyncAtUtc ?? null;
  }
}
