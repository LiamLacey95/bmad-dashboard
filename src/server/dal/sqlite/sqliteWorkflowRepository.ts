import type { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import type { CanonicalStatus } from '../../../shared/statusModel.js';
import type { WorkflowSummary, WorkflowTransition } from '../../../shared/workflows.js';
import type { WorkflowQuery, WorkflowRepository } from '../interfaces.js';
import { inTransaction, withSqliteRetry } from './database.js';

interface WorkflowRow {
  id: string;
  name: string;
  owner_id: string;
  status: CanonicalStatus;
  last_transition_at: string;
}

function toSummary(row: WorkflowRow): WorkflowSummary {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    status: row.status,
    lastTransitionAt: row.last_transition_at
  };
}

function toTransition(row: {
  id: string;
  workflow_id: string;
  from_status: CanonicalStatus | null;
  to_status: CanonicalStatus;
  occurred_at_utc: string;
  actor_id: string;
  reason: string | null;
}): WorkflowTransition {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    occurredAtUtc: row.occurred_at_utc,
    actorId: row.actor_id,
    reason: row.reason
  };
}

export class SqliteWorkflowRepository implements WorkflowRepository {
  constructor(private readonly db: DatabaseSync) {}

  async getWorkflows(query: WorkflowQuery): Promise<{ items: WorkflowSummary[]; total: number }> {
    return withSqliteRetry(() => {
      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? 50;
      const params: unknown[] = [];
      const filters: string[] = [];

      if (query.statuses?.length) {
        filters.push(`status IN (${query.statuses.map(() => '?').join(',')})`);
        params.push(...query.statuses);
      }
      if (query.ownerId) {
        filters.push('owner_id = ?');
        params.push(query.ownerId);
      }
      if (query.projectId) {
        filters.push('project_id = ?');
        params.push(query.projectId);
      }

      const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
      const totalRow = this.db
        .prepare(`SELECT COUNT(1) as total FROM workflows ${whereClause}`)
        .get(...params) as { total: number };

      const items = this.db
        .prepare(
          `SELECT id, name, owner_id, status, last_transition_at
           FROM workflows
           ${whereClause}
           ORDER BY last_transition_at DESC
           LIMIT ? OFFSET ?`
        )
        .all(...params, pageSize, (page - 1) * pageSize) as WorkflowRow[];

      return {
        items: items.map(toSummary),
        total: totalRow.total
      };
    });
  }

  async getWorkflowById(id: string): Promise<WorkflowSummary | null> {
    return withSqliteRetry(() => {
      const row = this.db
        .prepare('SELECT id, name, owner_id, status, last_transition_at FROM workflows WHERE id = ? LIMIT 1')
        .get(id) as WorkflowRow | undefined;
      return row ? toSummary(row) : null;
    });
  }

  async getWorkflowTransitions(workflowId: string, limit: number): Promise<WorkflowTransition[]> {
    return withSqliteRetry(() => {
      const rows = this.db
        .prepare(
          `SELECT id, workflow_id, from_status, to_status, occurred_at_utc, actor_id, reason
           FROM workflow_transitions
           WHERE workflow_id = ?
           ORDER BY occurred_at_utc ASC
           LIMIT ?`
        )
        .all(workflowId, limit) as Array<{
        id: string;
        workflow_id: string;
        from_status: CanonicalStatus | null;
        to_status: CanonicalStatus;
        occurred_at_utc: string;
        actor_id: string;
        reason: string | null;
      }>;

      return rows.map(toTransition);
    });
  }

  async applyWorkflowTransition(input: {
    workflowId: string;
    toStatus: CanonicalStatus;
    actorId: string;
    reason: string | null;
    occurredAtUtc?: string;
  }): Promise<{ workflow: WorkflowSummary; transition: WorkflowTransition }> {
    return withSqliteRetry(() => {
      return inTransaction(this.db, () => {
        const workflow = this.db
          .prepare('SELECT id, name, owner_id, status, last_transition_at, project_id, story_id FROM workflows WHERE id = ? LIMIT 1')
          .get(input.workflowId) as
          | (WorkflowRow & {
              project_id: string;
              story_id: string | null;
            })
          | undefined;

        if (!workflow) {
          const error = Object.assign(new Error(`Workflow ${input.workflowId} not found`), {
            statusCode: 404,
            code: 'NOT_FOUND',
            recoverable: true
          });
          throw error;
        }

        const occurredAtUtc = input.occurredAtUtc ?? new Date().toISOString();
        const transitionId = `wt-${crypto.randomUUID()}`;

        this.db
          .prepare(
            'INSERT INTO workflow_transitions(id, workflow_id, from_status, to_status, occurred_at_utc, actor_id, reason) VALUES(?, ?, ?, ?, ?, ?, ?)'
          )
          .run(transitionId, workflow.id, workflow.status, input.toStatus, occurredAtUtc, input.actorId, input.reason);

        this.db
          .prepare('UPDATE workflows SET status = ?, last_transition_at = ?, updated_at = ? WHERE id = ?')
          .run(input.toStatus, occurredAtUtc, occurredAtUtc, workflow.id);

        const domainEventId = `evt-${crypto.randomUUID()}`;
        this.db
          .prepare(
            `INSERT INTO domain_events(
              id, event_type, entity_type, entity_id, project_id, story_id, workflow_id,
              occurred_at_utc, ingested_at_utc, source_system, correlation_id, payload_json
            ) VALUES(?, 'workflow_transition', 'workflow', ?, ?, ?, ?, ?, ?, 'api', ?, ?)`
          )
          .run(
            domainEventId,
            workflow.id,
            workflow.project_id,
            workflow.story_id,
            workflow.id,
            occurredAtUtc,
            new Date().toISOString(),
            transitionId,
            JSON.stringify({
              workflowId: workflow.id,
              fromStatus: workflow.status,
              toStatus: input.toStatus,
              actorId: input.actorId,
              reason: input.reason
            })
          );

        const nextWorkflow: WorkflowSummary = {
          id: workflow.id,
          name: workflow.name,
          ownerId: workflow.owner_id,
          status: input.toStatus,
          lastTransitionAt: occurredAtUtc
        };

        return {
          workflow: nextWorkflow,
          transition: {
            id: transitionId,
            workflowId: workflow.id,
            fromStatus: workflow.status,
            toStatus: input.toStatus,
            occurredAtUtc,
            actorId: input.actorId,
            reason: input.reason
          }
        };
      });
    });
  }
}
