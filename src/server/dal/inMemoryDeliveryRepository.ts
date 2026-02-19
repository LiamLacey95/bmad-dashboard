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

type DocumentRow = DocumentDetail & {
  isAvailable: boolean;
  content: string | null;
  contentBase64: string | null;
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
  private readonly documents = new Map<string, DocumentRow>();
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

    const documents = [...this.documents.values()]
      .filter((document) => document.projectId === projectId)
      .map((document) => this.toDocumentReference(document));

    return {
      project,
      stories,
      workflows: workflows.filter((workflow): workflow is NonNullable<typeof workflow> => Boolean(workflow)),
      documents
    };
  }

  async getDocuments(query: { projectId?: string; storyId?: string }): Promise<{ items: DocumentDetail[]; total: number }> {
    const items = [...this.documents.values()]
      .filter((document) => (query.projectId ? document.projectId === query.projectId : true))
      .filter((document) => (query.storyId ? document.storyId === query.storyId : true))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((document) => this.toDocumentDetail(document));

    return {
      items,
      total: items.length
    };
  }

  async getDocumentById(id: string): Promise<DocumentDetail | null> {
    const document = this.documents.get(id);
    if (!document) {
      return null;
    }

    return this.toDocumentDetail(document);
  }

  async getDocumentContentById(id: string, inlineMimeAllowlist: string[]): Promise<DocumentContentPayload | null> {
    const document = this.documents.get(id);
    if (!document) {
      return null;
    }

    const detail = this.toDocumentDetail(document);
    if (!inlineMimeAllowlist.includes(document.mimeType)) {
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

    if (!document.isAvailable) {
      return {
        document: detail,
        renderMode: 'missing',
        safeToRenderInline: false,
        content: null,
        contentBase64: null,
        guidance: 'The document metadata exists but content is unavailable. Re-sync the source artifact and retry.'
      };
    }

    if (document.mimeType === 'text/markdown') {
      return {
        document: detail,
        renderMode: 'markdown',
        safeToRenderInline: true,
        content: document.content ?? '',
        contentBase64: null,
        guidance: 'Inline markdown preview rendered as plain text for safe display.'
      };
    }

    if (document.mimeType === 'application/json') {
      const content = document.content ?? '{}';
      return {
        document: detail,
        renderMode: 'json',
        safeToRenderInline: true,
        content,
        contentBase64: null,
        guidance: 'Inline JSON preview is validated and rendered as formatted text.'
      };
    }

    return {
      document: detail,
      renderMode: 'pdf',
      safeToRenderInline: true,
      content: null,
      contentBase64: document.contentBase64 ?? null,
      guidance: 'PDF preview is sandboxed and isolated from inline script execution.'
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

  private toDocumentReference(document: DocumentRow): DocumentReference {
    return {
      id: document.id,
      projectId: document.projectId,
      storyId: document.storyId,
      title: document.title,
      mimeType: document.mimeType
    };
  }

  private toDocumentDetail(document: DocumentRow): DocumentDetail {
    return {
      ...this.toDocumentReference(document),
      storagePath: document.storagePath,
      checksum: document.checksum,
      createdAt: document.createdAt
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

    const documents: DocumentRow[] = [
      {
        id: 'doc-100',
        projectId: 'project-core',
        storyId: 'story-301',
        title: 'Reliability test plan',
        mimeType: 'application/pdf',
        storagePath: '/artifacts/project-core/reliability-test-plan.pdf',
        checksum: 'sha256:8d5f1f2e4e8b0a1a',
        createdAt: '2026-02-18T18:10:00.000Z',
        isAvailable: true,
        content: null,
        contentBase64:
          'JVBERi0xLjQKJcTl8uXrPgoxIDAgb2JqPDwvVHlwZS9DYXRhbG9nL1BhZ2VzIDIgMCBSPj5lbmRvYmoKMiAwIG9iajw8L1R5cGUvUGFnZXMvQ291bnQgMS9LaWRzWzMgMCBSXT4+ZW5kb2JqCjMgMCBvYmo8PC9UeXBlL1BhZ2UvUGFyZW50IDIgMCBSL01lZGlhQm94WzAgMCA1OTUgODQyXS9Db250ZW50cyA0IDAgUi9SZXNvdXJjZXM8PC9Gb250PDwvRjEgNSAwIFI+Pj4+PgplbmRvYmoKNCAwIG9iajw8L0xlbmd0aCA2MT4+c3RyZWFtCkJUCi9GMSAxMiBUZgooUmVsaWFiaWxpdHkgdGVzdCBwbGFuIHByZXZpZXcpIFRqCjUwIDc4MCBUZAooU2FuZGJveGVkIHBkZiBwcmV2aWV3KSBUagpFVAplbmRzdHJlYW0KZW5kb2JqCjUgMCBvYmo8PC9UeXBlL0ZvbnQvU3VidHlwZS9UeXBlMS9CYXNlRm9udC9IZWx2ZXRpY2E+PmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYKMDAwMDAwMDAxMCAwMDAwMCBuCjAwMDAwMDAwNjAgMDAwMDAgbgowMDAwMDAwMTE3IDAwMDAwIG4KMDAwMDAwMDI0NCAwMDAwMCBuCjAwMDAwMDAzNTYgMDAwMDAgbgp0cmFpbGVyPDwvU2l6ZSA2L1Jvb3QgMSAwIFI+PgpzdGFydHhyZWYKNDUyCiUlRU9G'
      },
      {
        id: 'doc-101',
        projectId: 'project-core',
        storyId: null,
        title: 'Incident runbook',
        mimeType: 'text/markdown',
        storagePath: '/artifacts/project-core/incident-runbook.md',
        checksum: 'sha256:c4a5f6a70a24c221',
        createdAt: '2026-02-18T16:20:00.000Z',
        isAvailable: true,
        content:
          '# Incident Runbook\n\n- Verify stale-state reason and impacted modules.\n- Trigger resync after heartbeat recovery.\n- Confirm workflow/story state convergence.\n',
        contentBase64: null
      },
      {
        id: 'doc-200',
        projectId: 'project-billing',
        storyId: 'story-401',
        title: 'Billing schema notes',
        mimeType: 'application/json',
        storagePath: '/artifacts/project-billing/billing-schema-notes.json',
        checksum: 'sha256:b2dd78fa2d4714ad',
        createdAt: '2026-02-17T12:00:00.000Z',
        isAvailable: true,
        content: JSON.stringify(
          {
            migrationId: 'billing-2026-02-17',
            owner: 'carol',
            checks: ['column parity', 'nullability constraints', 'roll-forward only']
          },
          null,
          2
        ),
        contentBase64: null
      },
      {
        id: 'doc-300',
        projectId: 'project-ui',
        storyId: 'story-502',
        title: 'Wireframe export',
        mimeType: 'image/png',
        storagePath: '/artifacts/project-ui/wireframe-export.png',
        checksum: 'sha256:fd8a30237994f613',
        createdAt: '2026-02-19T08:00:00.000Z',
        isAvailable: true,
        content: null,
        contentBase64: null
      },
      {
        id: 'doc-301',
        projectId: 'project-ui',
        storyId: null,
        title: 'Theme parity checklist',
        mimeType: 'text/markdown',
        storagePath: '/artifacts/project-ui/theme-parity-checklist.md',
        checksum: 'sha256:73395d99a2fa7741',
        createdAt: '2026-02-19T09:00:00.000Z',
        isAvailable: false,
        content: null,
        contentBase64: null
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
