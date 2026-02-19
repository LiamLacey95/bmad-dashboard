import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../../src/client/App';
import { AppStateProvider, appStateTesting } from '../../src/client/state/appState';

function renderApp(initialEntry = '/workflows') {
  return render(
    <AppStateProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <App />
      </MemoryRouter>
    </AppStateProvider>
  );
}

describe('App shell', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/kanban/board')) {
          return {
            ok: true,
            json: async () => ({
              data: {
                projectId: null,
                readOnly: true,
                editable: false,
                editableModeReason: 'MVP read only',
                generatedAt: '2026-02-19T20:00:00.000Z',
                columns: [
                  { id: 'queued', label: 'Queued', statuses: ['queued'], cards: [] },
                  { id: 'in_progress', label: 'In Progress', statuses: ['in_progress'], cards: [] }
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
                warnings: [],
                checkedAtUtc: '2026-02-19T20:00:00.000Z'
              }
            })
          } as Response;
        }

        if (url.includes('/api/v1/projects')) {
          return {
            ok: true,
            json: async () => ({
              data: {
                items: [],
                total: 0
              }
            })
          } as Response;
        }

        if (url.includes('/transitions')) {
          return {
            ok: true,
            json: async () => ({ data: { items: [], workflowId: 'wf-1001' } })
          } as Response;
        }

        return {
          ok: true,
          json: async () => ({
            data: {
              items: [
                {
                  id: 'wf-1001',
                  name: 'Release QA Pipeline',
                  ownerId: 'alice',
                  status: 'blocked',
                  lastTransitionAt: '2026-02-19T19:45:00.000Z'
                }
              ],
              page: 1,
              pageSize: 50,
              total: 1
            }
          })
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

  it('renders all module nav routes', () => {
    renderApp();

    expect(screen.getByRole('link', { name: 'Workflows' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Costs' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Analytics' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Documents' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kanban' })).toBeInTheDocument();
  });

  it('navigates to module route content', () => {
    renderApp('/kanban');

    expect(screen.getByRole('heading', { name: 'Story Kanban' })).toBeInTheDocument();
  });

  it('toggles theme and persists to localStorage', () => {
    renderApp();

    const button = screen.getByRole('button', { name: /Theme:/i });
    fireEvent.click(button);

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem(appStateTesting.THEME_STORAGE_KEY)).toBe('dark');
  });

  it('shows state-driven stale and sync placeholders', () => {
    renderApp();

    expect(screen.getByText(/Stale modules:/i)).toHaveTextContent('kanban');
    expect(screen.getByText(/Syncing modules:/i)).toHaveTextContent('costs, analytics');
    expect(screen.getByText(/Recovery actions/i)).toBeInTheDocument();
    expect(screen.getByText(/Module: kanban/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Action:/i).length).toBeGreaterThan(0);
  });
});
