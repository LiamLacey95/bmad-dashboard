import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  DocumentContentPayload,
  DocumentDetail,
  DocumentReference,
  KanbanBoard,
  KanbanCard,
  KanbanColumn,
  ProjectContext,
  ProjectDetail,
  ProjectSummary,
  StorySummary,
  SyncModuleStatus
} from '../../../shared/delivery.js';
import type { CanonicalStatus } from '../../../shared/statusModel.js';
import type { WorkflowSummary } from '../../../shared/workflows.js';
import { metricsRegistry } from '../../observability/metrics.js';
import type { DeliveryRepository, ProjectQuery, StoryStatusUpdateInput, WorkflowRepository } from '../interfaces.js';
import { inTransaction, withSqliteRetry } from './database.js';

function isOverdue(dueAt: string): boolean {
  return new Date(dueAt).getTime() < Date.now();
}

function toProgress(stories: StorySummary[]): number {
  if (!stories.length) {
    return 0;
  }
  const completed = stories.filter((story) => story.status === 'done' || story.status === 'canceled').length;
  return Math.round((completed / stories.length) * 100);
}

function deriveProjectStatus(stories: StorySummary[]): CanonicalStatus {
  if (!stories.length) {
    return 'queued';
  }
  if (stories.every((story) => story.status === 'done' || story.status === 'canceled')) {
    return 'done';
  }
  if (stories.some((story) => story.status === 'failed')) {
    return 'failed';
  }
  if (stories.some((story) => story.status === 'blocked')) {
    return 'blocked';
  }
  if (stories.some((story) => story.status === 'in_progress')) {
    return 'in_progress';
  }
  return 'queued';
}

const KANBAN_COLUMN_CONFIG: Array<{ id: string; label: string; statuses: CanonicalStatus[] }> = [
  { id: 'queued', label: 'Queued', statuses: ['queued'] },
  { id: 'in_progress', label: 'In Progress', statuses: ['in_progress'] },
  { id: 'blocked', label: 'Blocked', statuses: ['blocked'] },
  { id: 'failed', label: 'Failed', statuses: ['failed'] },
  { id: 'done', label: 'Done', statuses: ['done', 'canceled'] }
];

function getStoryColumn(status: CanonicalStatus): string {
  return KANBAN_COLUMN_CONFIG.find((item) => item.statuses.includes(status))?.id ?? 'queued';
}

type ProjectRow = {
  id: string;
  name: string;
  owner_id: string;
  status: CanonicalStatus;
  progress_pct: number;
  due_at: string;
  risk_flag: number;
  updated_at: string;
  description: string;
};

type StoryRow = {
  id: string;
  project_id: string;
  title: string;
  owner_id: string;
  status: CanonicalStatus;
  kanban_column: string;
  updated_at: string;
};

type WorkflowLink = {
  id: string;
  project_id: string;
  story_id: string | null;
  name: string;
  owner_id: string;
};

type DocumentRow = {
  id: string;
  project_id: string;
  story_id: string | null;
  title: string;
  mime_type: string;
  storage_path: string;
  checksum: string;
  created_at: string;
  content: string | null;
  content_base64: string | null;
  is_available: number;
};

export class SqliteDeliveryRepository implements DeliveryRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly workflowRepository: WorkflowRepository,
    private readonly kanbanEditable = false
  ) {}

  async getProjects(query: ProjectQuery): Promise<{ items: ProjectSummary[]; total: number }> {
    return withSqliteRetry(() => {
      const rows = this.db
        .prepare('SELECT id, name, owner_id, status, progress_pct, due_at, risk_flag, updated_at, description FROM projects')
        .all() as ProjectRow[];

      const items = rows
        .map((project) => this.toProjectSummary(project))
        .filter((project) => {
          if (query.statuses?.length && !query.statuses.includes(project.status)) {
            return false;
          }
          if (query.ownerId && query.ownerId !== project.ownerId) {
            return false;
          }
          if (query.riskFlag !== undefined && query.riskFlag !== project.riskFlag) {
            return false;
          }
          if (query.overdue !== undefined && query.overdue !== project.isOverdue) {
            return false;
          }
          return true;
        })
        .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());

      return { items, total: items.length };
    });
  }

  async getProjectById(id: string): Promise<ProjectDetail | null> {
    return withSqliteRetry(() => {
      const row = this.db
        .prepare('SELECT id, name, owner_id, status, progress_pct, due_at, risk_flag, updated_at, description FROM projects WHERE id = ? LIMIT 1')
        .get(id) as ProjectRow | undefined;
      if (!row) {
        return null;
      }
      return {
        ...this.toProjectSummary(row),
        description: row.description
      };
    });
  }

  async getProjectContext(projectId: string): Promise<ProjectContext | null> {
    const project = await this.getProjectById(projectId);
    if (!project) {
      return null;
    }

    const storyRows = withSqliteRetry(() =>
      this.db
        .prepare(
          'SELECT id, project_id, title, owner_id, status, kanban_column, updated_at FROM stories WHERE project_id = ? ORDER BY updated_at DESC'
        )
        .all(projectId) as StoryRow[]
    );
    const stories: StorySummary[] = storyRows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      ownerId: row.owner_id,
      status: row.status,
      kanbanColumn: row.kanban_column,
      updatedAt: row.updated_at
    }));

    const workflowRows = withSqliteRetry(() =>
      this.db
        .prepare(
          'SELECT id, project_id, story_id, name, owner_id FROM workflows WHERE project_id = ? ORDER BY last_transition_at DESC'
        )
        .all(projectId) as WorkflowLink[]
    );

    const workflows = (
      await Promise.all(
        workflowRows.map(async (row) => {
          const workflow = await this.workflowRepository.getWorkflowById(row.id);
          if (!workflow) {
            return null;
          }
          return {
            id: workflow.id,
            projectId: row.project_id,
            storyId: row.story_id,
            name: row.name,
            ownerId: row.owner_id,
            status: workflow.status,
            lastTransitionAt: workflow.lastTransitionAt
          };
        })
      )
    ).filter((item): item is NonNullable<typeof item> => Boolean(item));

    const documents = withSqliteRetry(() => {
      const rows = this.db
        .prepare('SELECT id, project_id, story_id, title, mime_type FROM documents WHERE project_id = ? ORDER BY created_at DESC')
        .all(projectId) as Array<{
        id: string;
        project_id: string;
        story_id: string | null;
        title: string;
        mime_type: string;
      }>;

      return rows.map((row) => ({
        id: row.id,
        projectId: row.project_id,
        storyId: row.story_id,
        title: row.title,
        mimeType: row.mime_type
      } satisfies DocumentReference));
    });

    return {
      project,
      stories,
      workflows,
      documents
    };
  }

  async getDocuments(query: { projectId?: string; storyId?: string }): Promise<{ items: DocumentDetail[]; total: number }> {
    return withSqliteRetry(() => {
      const where: string[] = [];
      const params: unknown[] = [];
      if (query.projectId) {
        where.push('project_id = ?');
        params.push(query.projectId);
      }
      if (query.storyId) {
        where.push('story_id = ?');
        params.push(query.storyId);
      }

      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const rows = this.db
        .prepare(
          `SELECT id, project_id, story_id, title, mime_type, storage_path, checksum, created_at, content, content_base64, is_available
           FROM documents
           ${whereClause}
           ORDER BY created_at DESC`
        )
        .all(...params) as DocumentRow[];

      const items = rows.map((row) => this.toDocumentDetail(row));
      return {
        items,
        total: items.length
      };
    });
  }

  async getDocumentById(id: string): Promise<DocumentDetail | null> {
    return withSqliteRetry(() => {
      const row = this.db
        .prepare(
          'SELECT id, project_id, story_id, title, mime_type, storage_path, checksum, created_at, content, content_base64, is_available FROM documents WHERE id = ? LIMIT 1'
        )
        .get(id) as DocumentRow | undefined;
      return row ? this.toDocumentDetail(row) : null;
    });
  }

  async getDocumentContentById(id: string, inlineMimeAllowlist: string[]): Promise<DocumentContentPayload | null> {
    return withSqliteRetry(() => {
      const row = this.db
        .prepare(
          'SELECT id, project_id, story_id, title, mime_type, storage_path, checksum, created_at, content, content_base64, is_available FROM documents WHERE id = ? LIMIT 1'
        )
        .get(id) as DocumentRow | undefined;
      if (!row) {
        return null;
      }

      const detail = this.toDocumentDetail(row);
      if (!inlineMimeAllowlist.includes(row.mime_type)) {
        return {
          document: detail,
          renderMode: 'unsupported',
          safeToRenderInline: false,
          content: null,
          contentBase64: null,
          guidance:
            'This file type is not allowed for inline preview. Download the artifact or update the document MIME allowlist.'
        };
      }

      if (!row.is_available) {
        return {
          document: detail,
          renderMode: 'missing',
          safeToRenderInline: false,
          content: null,
          contentBase64: null,
          guidance: 'The document metadata exists but content is unavailable. Re-sync the source artifact and retry.'
        };
      }

      if (row.mime_type === 'text/markdown') {
        return {
          document: detail,
          renderMode: 'markdown',
          safeToRenderInline: true,
          content: row.content ?? '',
          contentBase64: null,
          guidance: 'Inline markdown preview rendered as plain text for safe display.'
        };
      }

      if (row.mime_type === 'application/json') {
        return {
          document: detail,
          renderMode: 'json',
          safeToRenderInline: true,
          content: row.content ?? '{}',
          contentBase64: null,
          guidance: 'Inline JSON preview is validated and rendered as formatted text.'
        };
      }

      return {
        document: detail,
        renderMode: 'pdf',
        safeToRenderInline: true,
        content: null,
        contentBase64: row.content_base64,
        guidance: 'PDF preview is sandboxed and isolated from inline script execution.'
      };
    });
  }

  async getKanbanBoard(projectId?: string): Promise<KanbanBoard> {
    const projects = await this.getProjects({});
    const projectById = new Map(projects.items.map((project) => [project.id, project]));

    const storyRows = withSqliteRetry(() => {
      if (projectId) {
        return this.db
          .prepare(
            'SELECT id, project_id, title, owner_id, status, kanban_column, updated_at FROM stories WHERE project_id = ? ORDER BY updated_at DESC'
          )
          .all(projectId) as StoryRow[];
      }
      return this.db
        .prepare('SELECT id, project_id, title, owner_id, status, kanban_column, updated_at FROM stories ORDER BY updated_at DESC')
        .all() as StoryRow[];
    });

    const cards = storyRows
      .map((story) => {
        const project = projectById.get(story.project_id);
        if (!project) {
          return null;
        }
        return {
          id: `${story.project_id}:${story.id}`,
          storyId: story.id,
          title: story.title,
          ownerId: story.owner_id,
          status: story.status,
          projectId: story.project_id,
          projectName: project.name,
          updatedAt: story.updated_at
        } satisfies KanbanCard;
      })
      .filter((item): item is KanbanCard => Boolean(item));

    const columns: KanbanColumn[] = KANBAN_COLUMN_CONFIG.map((config) => ({
      id: config.id,
      label: config.label,
      statuses: config.statuses,
      cards: cards.filter((card) => config.statuses.includes(card.status))
    }));

    return {
      projectId: projectId ?? null,
      readOnly: !this.kanbanEditable,
      editable: this.kanbanEditable,
      editableModeReason: this.kanbanEditable
        ? 'Kanban editable mode enabled via feature flag.'
        : 'Kanban is read-only in MVP. Status transitions are disabled until feature flag is enabled.',
      columns,
      generatedAt: new Date().toISOString()
    };
  }

  async updateStoryStatus(input: StoryStatusUpdateInput) {
    const updatedAt = input.occurredAtUtc ?? new Date().toISOString();

    return withSqliteRetry(() => {
      return inTransaction(this.db, () => {
        const story = this.db
          .prepare(
            'SELECT id, project_id, title, owner_id, status, kanban_column, updated_at FROM stories WHERE id = ? LIMIT 1'
          )
          .get(input.storyId) as StoryRow | undefined;

        if (!story) {
          throw Object.assign(new Error(`Story ${input.storyId} not found`), {
            statusCode: 404,
            code: 'NOT_FOUND',
            recoverable: true
          });
        }

        this.db
          .prepare('UPDATE stories SET status = ?, kanban_column = ?, updated_at = ? WHERE id = ?')
          .run(input.toStatus, getStoryColumn(input.toStatus), updatedAt, input.storyId);

        const storiesInProject = this.db
          .prepare(
            'SELECT id, project_id, title, owner_id, status, kanban_column, updated_at FROM stories WHERE project_id = ?'
          )
          .all(story.project_id) as StoryRow[];

        const projectedStories: StorySummary[] = storiesInProject.map((row) => ({
          id: row.id,
          projectId: row.project_id,
          title: row.title,
          ownerId: row.owner_id,
          status: row.id === input.storyId ? input.toStatus : row.status,
          kanbanColumn: row.id === input.storyId ? getStoryColumn(input.toStatus) : row.kanban_column,
          updatedAt: row.id === input.storyId ? updatedAt : row.updated_at
        }));

        const nextStatus = deriveProjectStatus(projectedStories);
        const nextProgress = toProgress(projectedStories);
        const riskFlag = projectedStories.some((item) => item.status === 'blocked' || item.status === 'failed') ? 1 : 0;

        this.db
          .prepare('UPDATE projects SET status = ?, progress_pct = ?, risk_flag = ?, updated_at = ? WHERE id = ?')
          .run(nextStatus, nextProgress, riskFlag, updatedAt, story.project_id);

        const linkedWorkflows = this.db
          .prepare('SELECT id FROM workflows WHERE story_id = ?')
          .all(story.id) as Array<{ id: string }>;

        const workflowUpdates = [] as Array<{
          workflow: WorkflowSummary;
          transition: import('../../../shared/workflows.js').WorkflowTransition;
        }>;

        for (const linkedWorkflow of linkedWorkflows) {
          const workflow = this.db
            .prepare('SELECT status FROM workflows WHERE id = ? LIMIT 1')
            .get(linkedWorkflow.id) as { status: CanonicalStatus } | undefined;
          if (!workflow || workflow.status === input.toStatus) {
            continue;
          }

          const update = withSqliteRetry(() =>
            inTransaction(this.db, () => {
              const transitionId = `wt-${crypto.randomUUID()}`;
              this.db
                .prepare(
                  'INSERT INTO workflow_transitions(id, workflow_id, from_status, to_status, occurred_at_utc, actor_id, reason) VALUES(?, ?, ?, ?, ?, ?, ?)'
                )
                .run(transitionId, linkedWorkflow.id, workflow.status, input.toStatus, updatedAt, input.actorId, input.reason);
              this.db
                .prepare('UPDATE workflows SET status = ?, last_transition_at = ?, updated_at = ? WHERE id = ?')
                .run(input.toStatus, updatedAt, updatedAt, linkedWorkflow.id);
              return transitionId;
            })
          );

          const workflowSummaryRow = this.db
            .prepare('SELECT id, name, owner_id, status, last_transition_at FROM workflows WHERE id = ? LIMIT 1')
            .get(linkedWorkflow.id) as
            | {
                id: string;
                name: string;
                owner_id: string;
                status: CanonicalStatus;
                last_transition_at: string;
              }
            | undefined;
          if (!workflowSummaryRow) {
            continue;
          }
          workflowUpdates.push({
            workflow: {
              id: workflowSummaryRow.id,
              name: workflowSummaryRow.name,
              ownerId: workflowSummaryRow.owner_id,
              status: workflowSummaryRow.status,
              lastTransitionAt: workflowSummaryRow.last_transition_at
            },
            transition: {
              id: update,
              workflowId: linkedWorkflow.id,
              fromStatus: workflow.status,
              toStatus: input.toStatus,
              occurredAtUtc: updatedAt,
              actorId: input.actorId,
              reason: input.reason
            }
          });
        }

        const eventId = `evt-${crypto.randomUUID()}`;
        this.db
          .prepare(
            `INSERT INTO domain_events(
              id, event_type, entity_type, entity_id, project_id, story_id, workflow_id,
              occurred_at_utc, ingested_at_utc, source_system, correlation_id, payload_json
            ) VALUES(?, 'story_status_changed', 'story', ?, ?, ?, NULL, ?, ?, 'api', ?, ?)`
          )
          .run(
            eventId,
            story.id,
            story.project_id,
            story.id,
            updatedAt,
            new Date().toISOString(),
            input.actorId,
            JSON.stringify({
              fromStatus: story.status,
              toStatus: input.toStatus,
              reason: input.reason
            })
          );

        this.setSyncStatusInternal({
          module: 'story',
          status: 'ok',
          lastSuccessfulSyncAtUtc: updatedAt,
          lastAttemptAtUtc: updatedAt,
          errorMessage: null,
          staleReason: null
        });
        this.setSyncStatusInternal({
          module: 'project',
          status: 'ok',
          lastSuccessfulSyncAtUtc: updatedAt,
          lastAttemptAtUtc: updatedAt,
          errorMessage: null,
          staleReason: null
        });
        this.setSyncStatusInternal({
          module: 'workflow',
          status: 'ok',
          lastSuccessfulSyncAtUtc: updatedAt,
          lastAttemptAtUtc: updatedAt,
          errorMessage: null,
          staleReason: null
        });

        const updatedStory = this.db
          .prepare(
            'SELECT id, project_id, title, owner_id, status, kanban_column, updated_at FROM stories WHERE id = ? LIMIT 1'
          )
          .get(story.id) as StoryRow;
        const updatedProject = this.db
          .prepare('SELECT id, name, owner_id, status, progress_pct, due_at, risk_flag, updated_at, description FROM projects WHERE id = ?')
          .get(story.project_id) as ProjectRow;

        return {
          story: {
            id: updatedStory.id,
            projectId: updatedStory.project_id,
            title: updatedStory.title,
            ownerId: updatedStory.owner_id,
            status: updatedStory.status,
            kanbanColumn: updatedStory.kanban_column,
            updatedAt: updatedStory.updated_at
          },
          project: this.toProjectSummary(updatedProject),
          workflowUpdates
        };
      });
    });
  }

  async getSyncStatus(): Promise<SyncModuleStatus[]> {
    return withSqliteRetry(() => {
      const rows = this.db
        .prepare(
          'SELECT module, status, last_successful_sync_at_utc, last_attempt_at_utc, error_message, stale_reason FROM sync_state ORDER BY module ASC'
        )
        .all() as Array<{
        module: SyncModuleStatus['module'];
        status: SyncModuleStatus['status'];
        last_successful_sync_at_utc: string | null;
        last_attempt_at_utc: string | null;
        error_message: string | null;
        stale_reason: string | null;
      }>;

      return rows.map((row) => ({
        module: row.module,
        status: row.status,
        lastSuccessfulSyncAtUtc: row.last_successful_sync_at_utc,
        lastAttemptAtUtc: row.last_attempt_at_utc,
        errorMessage: row.error_message,
        staleReason: row.stale_reason
      }));
    });
  }

  async setSyncStatus(status: SyncModuleStatus): Promise<void> {
    withSqliteRetry(() => this.setSyncStatusInternal(status));
  }

  private setSyncStatusInternal(status: SyncModuleStatus): void {
    this.db
      .prepare(
        `INSERT INTO sync_state(id, module, last_successful_sync_at_utc, last_attempt_at_utc, status, error_message, stale_reason)
         VALUES(?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(module) DO UPDATE SET
           last_successful_sync_at_utc=excluded.last_successful_sync_at_utc,
           last_attempt_at_utc=excluded.last_attempt_at_utc,
           status=excluded.status,
           error_message=excluded.error_message,
           stale_reason=excluded.stale_reason`
      )
      .run(
        `sync-${status.module}`,
        status.module,
        status.lastSuccessfulSyncAtUtc,
        status.lastAttemptAtUtc,
        status.status,
        status.errorMessage,
        status.staleReason
      );

    if (status.status === 'error') {
      metricsRegistry.incrementSyncFailure(status.module);
    }
  }

  private toProjectSummary(project: ProjectRow): ProjectSummary {
    return {
      id: project.id,
      name: project.name,
      ownerId: project.owner_id,
      status: project.status,
      progressPct: project.progress_pct,
      dueAt: project.due_at,
      riskFlag: Boolean(project.risk_flag),
      isOverdue: isOverdue(project.due_at),
      updatedAt: project.updated_at
    };
  }

  private toDocumentDetail(row: DocumentRow): DocumentDetail {
    return {
      id: row.id,
      projectId: row.project_id,
      storyId: row.story_id,
      title: row.title,
      mimeType: row.mime_type,
      storagePath: row.storage_path,
      checksum: row.checksum,
      createdAt: row.created_at
    };
  }
}
