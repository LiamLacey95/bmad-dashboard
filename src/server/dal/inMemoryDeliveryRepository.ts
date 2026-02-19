import type {
  DocumentReference,
  KanbanBoard,
  KanbanCard,
  KanbanColumn,
  ProjectContext,
  ProjectDetail,
  ProjectSummary,
  StorySummary,
  SyncModuleStatus
} from '../../shared/delivery.js';
import type { CanonicalStatus } from '../../shared/statusModel.js';
import type { DeliveryRepository, ProjectQuery, StoryStatusUpdateInput, WorkflowRepository } from './interfaces.js';

type ProjectRow = Omit<ProjectDetail, 'isOverdue'>;

type WorkflowLinkRow = {
  id: string;
  projectId: string;
  storyId: string | null;
  name: string;
  ownerId: string;
};

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
  const column = KANBAN_COLUMN_CONFIG.find((item) => item.statuses.includes(status));
  return column?.id ?? 'queued';
}

function toCard(story: StorySummary, project: ProjectSummary): KanbanCard {
  return {
    id: `${story.projectId}:${story.id}`,
    storyId: story.id,
    title: story.title,
    ownerId: story.ownerId,
    status: story.status,
    projectId: story.projectId,
    projectName: project.name,
    updatedAt: story.updatedAt
  };
}

export class InMemoryDeliveryRepository implements DeliveryRepository {
  private readonly projects = new Map<string, ProjectRow>();
  private readonly stories = new Map<string, StorySummary>();
  private readonly documents = new Map<string, DocumentReference>();
  private readonly workflowLinks = new Map<string, WorkflowLinkRow>();
  private readonly syncStatus = new Map<SyncModuleStatus['module'], SyncModuleStatus>();

  constructor(private readonly workflowRepository: WorkflowRepository, private readonly kanbanEditable = false) {
    this.seed();
  }

  async getProjects(query: ProjectQuery): Promise<{ items: ProjectSummary[]; total: number }> {
    const items = [...this.projects.values()]
      .map((project) => this.buildProjectSummary(project))
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

    return {
      items,
      total: items.length
    };
  }

  async getProjectById(id: string): Promise<ProjectDetail | null> {
    const project = this.projects.get(id);
    if (!project) {
      return null;
    }

    const summary = this.buildProjectSummary(project);
    return {
      ...summary,
      description: project.description
    };
  }

  async getProjectContext(projectId: string): Promise<ProjectContext | null> {
    const project = await this.getProjectById(projectId);
    if (!project) {
      return null;
    }

    const stories = [...this.stories.values()]
      .filter((story) => story.projectId === projectId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    const workflows = await Promise.all(
      [...this.workflowLinks.values()]
        .filter((workflowLink) => workflowLink.projectId === projectId)
        .map(async (workflowLink) => {
          const workflow = await this.workflowRepository.getWorkflowById(workflowLink.id);
          if (!workflow) {
            return null;
          }

          return {
            id: workflow.id,
            projectId: workflowLink.projectId,
            storyId: workflowLink.storyId,
            name: workflow.name,
            ownerId: workflow.ownerId,
            status: workflow.status,
            lastTransitionAt: workflow.lastTransitionAt
          };
        })
    );

    const documents = [...this.documents.values()].filter((document) => document.projectId === projectId);

    return {
      project,
      stories,
      workflows: workflows.filter((workflow): workflow is NonNullable<typeof workflow> => Boolean(workflow)),
      documents
    };
  }

  async getKanbanBoard(projectId?: string): Promise<KanbanBoard> {
    const projects = await this.getProjects({});
    const projectById = new Map(projects.items.map((project) => [project.id, project]));
    const cards = [...this.stories.values()]
      .filter((story) => (projectId ? story.projectId === projectId : true))
      .map((story) => {
        const project = projectById.get(story.projectId);
        if (!project) {
          return null;
        }

        return toCard(story, project);
      })
      .filter((card): card is KanbanCard => Boolean(card))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

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
    const story = this.stories.get(input.storyId);
    if (!story) {
      throw Object.assign(new Error(`Story ${input.storyId} not found`), {
        statusCode: 404,
        code: 'NOT_FOUND'
      });
    }

    const updatedAt = input.occurredAtUtc ?? new Date().toISOString();
    const updatedStory: StorySummary = {
      ...story,
      status: input.toStatus,
      kanbanColumn: getStoryColumn(input.toStatus),
      updatedAt
    };

    this.stories.set(updatedStory.id, updatedStory);

    const project = this.projects.get(updatedStory.projectId);
    if (!project) {
      throw Object.assign(new Error(`Project ${updatedStory.projectId} not found`), {
        statusCode: 404,
        code: 'NOT_FOUND'
      });
    }

    const projectStories = [...this.stories.values()].filter((item) => item.projectId === updatedStory.projectId);
    const updatedProject: ProjectRow = {
      ...project,
      progressPct: toProgress(projectStories),
      status: deriveProjectStatus(projectStories),
      riskFlag: projectStories.some((item) => item.status === 'blocked' || item.status === 'failed'),
      updatedAt
    };

    this.projects.set(updatedProject.id, updatedProject);

    const linkedWorkflows = [...this.workflowLinks.values()].filter((workflow) => workflow.storyId === updatedStory.id);
    const workflowUpdates = (
      await Promise.all(
        linkedWorkflows.map(async (workflowLink) => {
          const workflow = await this.workflowRepository.getWorkflowById(workflowLink.id);
          if (!workflow || workflow.status === input.toStatus) {
            return null;
          }

          return this.workflowRepository.applyWorkflowTransition({
            workflowId: workflowLink.id,
            toStatus: input.toStatus,
            actorId: input.actorId,
            reason: input.reason,
            occurredAtUtc: updatedAt
          });
        })
      )
    ).filter((update): update is NonNullable<typeof update> => Boolean(update));

    await this.setSyncStatus({
      module: 'story',
      status: 'ok',
      lastSuccessfulSyncAtUtc: updatedAt,
      lastAttemptAtUtc: updatedAt,
      errorMessage: null
    });
    await this.setSyncStatus({
      module: 'project',
      status: 'ok',
      lastSuccessfulSyncAtUtc: updatedAt,
      lastAttemptAtUtc: updatedAt,
      errorMessage: null
    });
    await this.setSyncStatus({
      module: 'workflow',
      status: 'ok',
      lastSuccessfulSyncAtUtc: updatedAt,
      lastAttemptAtUtc: updatedAt,
      errorMessage: null
    });

    return {
      story: updatedStory,
      project: this.buildProjectSummary(updatedProject),
      workflowUpdates
    };
  }

  async getSyncStatus(): Promise<SyncModuleStatus[]> {
    return [...this.syncStatus.values()]
      .map((status) => ({ ...status }))
      .sort((a, b) => a.module.localeCompare(b.module));
  }

  async setSyncStatus(status: SyncModuleStatus): Promise<void> {
    this.syncStatus.set(status.module, status);
  }

  private buildProjectSummary(project: ProjectRow): ProjectSummary {
    const stories = [...this.stories.values()].filter((item) => item.projectId === project.id);
    const progressPct = toProgress(stories);
    const status = deriveProjectStatus(stories);
    return {
      id: project.id,
      name: project.name,
      ownerId: project.ownerId,
      status,
      progressPct,
      dueAt: project.dueAt,
      riskFlag: project.riskFlag || stories.some((story) => story.status === 'blocked' || story.status === 'failed'),
      isOverdue: isOverdue(project.dueAt),
      updatedAt: project.updatedAt
    };
  }

  private seed(): void {
    const now = '2026-02-19T21:00:00.000Z';

    const projectRows: ProjectRow[] = [
      {
        id: 'project-core',
        name: 'Core Delivery Controls',
        description: 'Core platform readiness and release reliability workstream.',
        ownerId: 'alice',
        status: 'in_progress',
        progressPct: 50,
        dueAt: '2026-02-22T18:00:00.000Z',
        riskFlag: true,
        updatedAt: now
      },
      {
        id: 'project-billing',
        name: 'Billing Reliability Hardening',
        description: 'Stabilize billing sync and reconciliation workflows.',
        ownerId: 'carol',
        status: 'failed',
        progressPct: 30,
        dueAt: '2026-02-18T18:00:00.000Z',
        riskFlag: true,
        updatedAt: now
      },
      {
        id: 'project-ui',
        name: 'UI Delivery Modernization',
        description: 'Improve dashboard UX quality and consistency.',
        ownerId: 'dylan',
        status: 'in_progress',
        progressPct: 70,
        dueAt: '2026-02-28T18:00:00.000Z',
        riskFlag: false,
        updatedAt: now
      }
    ];

    projectRows.forEach((project) => {
      this.projects.set(project.id, project);
    });

    const storyRows: StorySummary[] = [
      {
        id: 'story-301',
        projectId: 'project-core',
        title: 'Stale signal reliability checks',
        ownerId: 'alice',
        status: 'blocked',
        kanbanColumn: 'blocked',
        updatedAt: '2026-02-19T20:40:00.000Z'
      },
      {
        id: 'story-302',
        projectId: 'project-core',
        title: 'Workflow replay backfill',
        ownerId: 'bob',
        status: 'done',
        kanbanColumn: 'done',
        updatedAt: '2026-02-19T20:20:00.000Z'
      },
      {
        id: 'story-401',
        projectId: 'project-billing',
        title: 'Billing schema migration',
        ownerId: 'carol',
        status: 'failed',
        kanbanColumn: 'failed',
        updatedAt: '2026-02-19T19:55:00.000Z'
      },
      {
        id: 'story-501',
        projectId: 'project-ui',
        title: 'Responsive table accessibility',
        ownerId: 'dylan',
        status: 'done',
        kanbanColumn: 'done',
        updatedAt: '2026-02-19T18:40:00.000Z'
      },
      {
        id: 'story-502',
        projectId: 'project-ui',
        title: 'Kanban read-only indicator',
        ownerId: 'eve',
        status: 'in_progress',
        kanbanColumn: 'in_progress',
        updatedAt: '2026-02-19T20:10:00.000Z'
      }
    ];

    storyRows.forEach((story) => {
      this.stories.set(story.id, story);
    });

    const documents: DocumentReference[] = [
      {
        id: 'doc-100',
        projectId: 'project-core',
        storyId: 'story-301',
        title: 'Reliability test plan',
        mimeType: 'application/pdf'
      },
      {
        id: 'doc-101',
        projectId: 'project-core',
        storyId: null,
        title: 'Incident runbook',
        mimeType: 'text/markdown'
      },
      {
        id: 'doc-200',
        projectId: 'project-billing',
        storyId: 'story-401',
        title: 'Billing schema notes',
        mimeType: 'application/json'
      }
    ];

    documents.forEach((document) => {
      this.documents.set(document.id, document);
    });

    const workflowLinks: WorkflowLinkRow[] = [
      {
        id: 'wf-1001',
        projectId: 'project-core',
        storyId: 'story-302',
        name: 'Release QA Pipeline',
        ownerId: 'alice'
      },
      {
        id: 'wf-1002',
        projectId: 'project-core',
        storyId: 'story-301',
        name: 'Nightly Regression',
        ownerId: 'bob'
      },
      {
        id: 'wf-1003',
        projectId: 'project-billing',
        storyId: 'story-401',
        name: 'Billing Data Sync',
        ownerId: 'carol'
      },
      {
        id: 'wf-1004',
        projectId: 'project-ui',
        storyId: 'story-501',
        name: 'Design Token Export',
        ownerId: 'dylan'
      }
    ];

    workflowLinks.forEach((workflowLink) => {
      this.workflowLinks.set(workflowLink.id, workflowLink);
    });

    const syncSeed: SyncModuleStatus[] = [
      {
        module: 'project',
        status: 'ok',
        lastSuccessfulSyncAtUtc: now,
        lastAttemptAtUtc: now,
        errorMessage: null
      },
      {
        module: 'story',
        status: 'ok',
        lastSuccessfulSyncAtUtc: now,
        lastAttemptAtUtc: now,
        errorMessage: null
      },
      {
        module: 'workflow',
        status: 'ok',
        lastSuccessfulSyncAtUtc: now,
        lastAttemptAtUtc: now,
        errorMessage: null
      }
    ];

    syncSeed.forEach((status) => {
      this.syncStatus.set(status.module, status);
    });
  }
}
