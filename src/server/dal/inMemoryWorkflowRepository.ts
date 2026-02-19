import type { CanonicalStatus } from '../../shared/statusModel.js';
import type { WorkflowSummary, WorkflowTransition } from '../../shared/workflows.js';
import type { WorkflowQuery, WorkflowRepository } from './interfaces.js';

type WorkflowRow = WorkflowSummary & {
  projectId: string;
  transitionsCorrupt?: boolean;
};

function sortByNewestTransition(a: WorkflowSummary, b: WorkflowSummary): number {
  return new Date(b.lastTransitionAt).getTime() - new Date(a.lastTransitionAt).getTime();
}

function sortTransitionAsc(a: WorkflowTransition, b: WorkflowTransition): number {
  return new Date(a.occurredAtUtc).getTime() - new Date(b.occurredAtUtc).getTime();
}

export class InMemoryWorkflowRepository implements WorkflowRepository {
  private readonly workflows = new Map<string, WorkflowRow>();
  private readonly transitions = new Map<string, WorkflowTransition[]>();
  private transitionSequence = 0;

  constructor() {
    this.seed();
  }

  async getWorkflows(query: WorkflowQuery): Promise<{ items: WorkflowSummary[]; total: number }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    const filtered = [...this.workflows.values()]
      .filter((workflow) => {
        if (query.statuses?.length && !query.statuses.includes(workflow.status)) {
          return false;
        }
        if (query.ownerId && workflow.ownerId !== query.ownerId) {
          return false;
        }
        if (query.projectId && workflow.projectId !== query.projectId) {
          return false;
        }
        return true;
      })
      .sort(sortByNewestTransition)
      .map((workflow) => this.toSummary(workflow));

    const start = (page - 1) * pageSize;

    return {
      items: filtered.slice(start, start + pageSize),
      total: filtered.length
    };
  }

  async getWorkflowById(id: string): Promise<WorkflowSummary | null> {
    const workflow = this.workflows.get(id);
    if (!workflow) {
      return null;
    }

    return this.toSummary(workflow);
  }

  async getWorkflowTransitions(workflowId: string, limit: number): Promise<WorkflowTransition[]> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      return [];
    }

    if (workflow.transitionsCorrupt) {
      const error = new Error('Workflow transition timeline is unavailable due to corrupt data') as Error & {
        statusCode: number;
        code: string;
      };
      error.statusCode = 500;
      error.code = 'INTERNAL_ERROR';
      throw error;
    }

    const allTransitions = this.transitions.get(workflowId) ?? [];
    const sorted = [...allTransitions].sort(sortTransitionAsc);
    if (limit >= sorted.length) {
      return sorted;
    }

    return sorted.slice(sorted.length - limit);
  }

  async applyWorkflowTransition(input: {
    workflowId: string;
    toStatus: CanonicalStatus;
    actorId: string;
    reason: string | null;
    occurredAtUtc?: string;
  }): Promise<{ workflow: WorkflowSummary; transition: WorkflowTransition }> {
    const workflow = this.workflows.get(input.workflowId);
    if (!workflow) {
      throw Object.assign(new Error(`Workflow ${input.workflowId} not found`), {
        statusCode: 404,
        code: 'NOT_FOUND'
      });
    }

    const occurredAtUtc = input.occurredAtUtc ?? new Date().toISOString();

    const transition: WorkflowTransition = {
      id: `wt-${++this.transitionSequence}`,
      workflowId: workflow.id,
      fromStatus: workflow.status,
      toStatus: input.toStatus,
      occurredAtUtc,
      actorId: input.actorId,
      reason: input.reason
    };

    workflow.status = input.toStatus;
    workflow.lastTransitionAt = occurredAtUtc;

    const existing = this.transitions.get(workflow.id) ?? [];
    existing.push(transition);
    this.transitions.set(workflow.id, existing);

    return {
      workflow: this.toSummary(workflow),
      transition
    };
  }

  private toSummary(workflow: WorkflowRow): WorkflowSummary {
    const { id, name, ownerId, status, lastTransitionAt } = workflow;
    return { id, name, ownerId, status, lastTransitionAt };
  }

  private seed(): void {
    const seedRows: WorkflowRow[] = [
      {
        id: 'wf-1001',
        name: 'Release QA Pipeline',
        ownerId: 'alice',
        projectId: 'project-core',
        status: 'in_progress',
        lastTransitionAt: '2026-02-19T19:45:00.000Z'
      },
      {
        id: 'wf-1002',
        name: 'Nightly Regression',
        ownerId: 'bob',
        projectId: 'project-core',
        status: 'blocked',
        lastTransitionAt: '2026-02-19T19:20:00.000Z'
      },
      {
        id: 'wf-1003',
        name: 'Billing Data Sync',
        ownerId: 'carol',
        projectId: 'project-billing',
        status: 'failed',
        lastTransitionAt: '2026-02-19T18:55:00.000Z'
      },
      {
        id: 'wf-1004',
        name: 'Design Token Export',
        ownerId: 'dylan',
        projectId: 'project-ui',
        status: 'done',
        lastTransitionAt: '2026-02-19T17:35:00.000Z'
      },
      {
        id: 'wf-corrupt',
        name: 'Legacy ETL',
        ownerId: 'ops',
        projectId: 'project-legacy',
        status: 'blocked',
        lastTransitionAt: '2026-02-19T16:12:00.000Z',
        transitionsCorrupt: true
      },
      {
        id: 'wf-empty',
        name: 'Sandbox Runner',
        ownerId: 'eve',
        projectId: 'project-labs',
        status: 'queued',
        lastTransitionAt: '2026-02-19T15:02:00.000Z'
      }
    ];

    seedRows.forEach((row) => {
      this.workflows.set(row.id, row);
    });

    this.transitions.set('wf-1001', [
      {
        id: 'wt-1',
        workflowId: 'wf-1001',
        fromStatus: 'queued',
        toStatus: 'in_progress',
        occurredAtUtc: '2026-02-19T18:40:00.000Z',
        actorId: 'alice',
        reason: 'Picked up by runner'
      }
    ]);

    this.transitions.set('wf-1002', [
      {
        id: 'wt-2',
        workflowId: 'wf-1002',
        fromStatus: 'queued',
        toStatus: 'in_progress',
        occurredAtUtc: '2026-02-19T18:20:00.000Z',
        actorId: 'bob',
        reason: 'Execution started'
      },
      {
        id: 'wt-3',
        workflowId: 'wf-1002',
        fromStatus: 'in_progress',
        toStatus: 'blocked',
        occurredAtUtc: '2026-02-19T19:20:00.000Z',
        actorId: 'bob',
        reason: 'Waiting on external approval'
      }
    ]);

    this.transitions.set('wf-1003', [
      {
        id: 'wt-4',
        workflowId: 'wf-1003',
        fromStatus: 'queued',
        toStatus: 'in_progress',
        occurredAtUtc: '2026-02-19T18:30:00.000Z',
        actorId: 'carol',
        reason: 'Started ingestion'
      },
      {
        id: 'wt-5',
        workflowId: 'wf-1003',
        fromStatus: 'in_progress',
        toStatus: 'failed',
        occurredAtUtc: '2026-02-19T18:55:00.000Z',
        actorId: 'carol',
        reason: 'Schema mismatch'
      }
    ]);

    this.transitions.set('wf-1004', [
      {
        id: 'wt-6',
        workflowId: 'wf-1004',
        fromStatus: 'in_progress',
        toStatus: 'done',
        occurredAtUtc: '2026-02-19T17:35:00.000Z',
        actorId: 'dylan',
        reason: 'Artifact published'
      }
    ]);

    this.transitionSequence = 6;
  }
}
