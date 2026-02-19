import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../../src/client/App';
import { AppStateProvider } from '../../src/client/state/appState';

function renderApp(initialEntry: string) {
  return render(
    <AppStateProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <App />
      </MemoryRouter>
    </AppStateProvider>
  );
}

describe('delivery pages', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes('/api/v1/projects/project-core/context')) {
          return {
            ok: true,
            json: async () => ({
              data: {
                project: {
                  id: 'project-core',
                  name: 'Core Delivery Controls',
                  ownerId: 'alice',
                  status: 'blocked',
                  progressPct: 50,
                  dueAt: '2026-02-18T18:00:00.000Z',
                  riskFlag: true,
                  isOverdue: true,
                  updatedAt: '2026-02-19T20:00:00.000Z',
                  description: 'desc'
                },
                stories: [
                  {
                    id: 'story-301',
                    projectId: 'project-core',
                    title: 'Story',
                    ownerId: 'alice',
                    status: 'blocked',
                    kanbanColumn: 'blocked',
                    updatedAt: '2026-02-19T20:00:00.000Z'
                  }
                ],
                workflows: [
                  {
                    id: 'wf-1002',
                    projectId: 'project-core',
                    storyId: 'story-301',
                    name: 'Nightly Regression',
                    ownerId: 'bob',
                    status: 'blocked',
                    lastTransitionAt: '2026-02-19T20:00:00.000Z'
                  }
                ],
                documents: [
                  {
                    id: 'doc-100',
                    projectId: 'project-core',
                    storyId: 'story-301',
                    title: 'Doc',
                    mimeType: 'application/pdf'
                  }
                ]
              }
            })
          } as Response;
        }

        if (url.includes('/api/v1/projects/project-core')) {
          return {
            ok: true,
            json: async () => ({
              data: {
                id: 'project-core',
                name: 'Core Delivery Controls',
                ownerId: 'alice',
                status: 'blocked',
                progressPct: 50,
                dueAt: '2026-02-18T18:00:00.000Z',
                riskFlag: true,
                isOverdue: true,
                updatedAt: '2026-02-19T20:00:00.000Z',
                description: 'desc'
              }
            })
          } as Response;
        }

        if (url.includes('/api/v1/projects')) {
          return {
            ok: true,
            json: async () => ({
              data: {
                items: [
                  {
                    id: 'project-core',
                    name: 'Core Delivery Controls',
                    ownerId: 'alice',
                    status: 'blocked',
                    progressPct: 50,
                    dueAt: '2026-02-18T18:00:00.000Z',
                    riskFlag: true,
                    isOverdue: true,
                    updatedAt: '2026-02-19T20:00:00.000Z'
                  }
                ],
                total: 1
              }
            })
          } as Response;
        }

        if (url.includes('/api/v1/kanban/board')) {
          return {
            ok: true,
            json: async () => ({
              data: {
                projectId: null,
                readOnly: true,
                editable: false,
                editableModeReason: 'Kanban is read-only in MVP.',
                generatedAt: '2026-02-19T20:00:00.000Z',
                columns: [
                  {
                    id: 'blocked',
                    label: 'Blocked',
                    statuses: ['blocked'],
                    cards: [
                      {
                        id: 'project-core:story-301',
                        storyId: 'story-301',
                        title: 'Story',
                        ownerId: 'alice',
                        status: 'blocked',
                        projectId: 'project-core',
                        projectName: 'Core Delivery Controls',
                        updatedAt: '2026-02-19T20:00:00.000Z'
                      }
                    ]
                  }
                ]
              }
            })
          } as Response;
        }

        if (url.includes('/api/v1/sync/status')) {
          return {
            ok: true,
            json: async () => ({
              data: {
                modules: [],
                warnings: [
                  {
                    module: 'workflow',
                    message: 'Story story-301 is blocked while workflow wf-1002 is in_progress',
                    lastSuccessfulSyncAtUtc: '2026-02-19T21:00:00.000Z'
                  }
                ],
                checkedAtUtc: '2026-02-19T21:00:00.000Z'
              }
            })
          } as Response;
        }

        if (url.includes('/api/v1/workflows')) {
          return {
            ok: true,
            json: async () => ({ data: { items: [], page: 1, pageSize: 50, total: 0 } })
          } as Response;
        }

        return {
          ok: true,
          json: async () => ({ data: { items: [] } })
        } as Response;
      })
    );

    class MockWebSocket {
      static OPEN = 1;
      readyState = MockWebSocket.OPEN;
      addEventListener = vi.fn();
      send = vi.fn();
      close = vi.fn();
    }

    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('renders project health list and context details', async () => {
    renderApp('/projects');

    expect(await screen.findByRole('heading', { name: 'Project Health' })).toBeInTheDocument();
    expect(await screen.findByText(/Risk flagged/i)).toBeInTheDocument();
    expect(await screen.findByText(/Overdue/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Related stories/i)).toBeInTheDocument();
      expect(screen.getByText(/Related workflows/i)).toBeInTheDocument();
      expect(screen.getByText(/Related documents/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('link', { name: 'story-301' })).toHaveAttribute(
      'href',
      '/kanban?projectId=project-core&storyId=story-301'
    );
    expect(screen.getByRole('link', { name: 'wf-1002' })).toHaveAttribute(
      'href',
      '/workflows?workflowId=wf-1002'
    );
    expect(screen.getByRole('link', { name: 'doc-100' })).toHaveAttribute(
      'href',
      '/documents?documentId=doc-100'
    );
  });

  it('renders kanban read-only indicator and consistency warning', async () => {
    renderApp('/kanban');

    expect(await screen.findByRole('heading', { name: 'Story Kanban' })).toBeInTheDocument();
    expect(await screen.findByText(/Read-only/i)).toBeInTheDocument();
    expect(await screen.findByText(/Consistency warning/i)).toBeInTheDocument();
  });
});
