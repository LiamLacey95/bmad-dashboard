import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { ProjectContext, ProjectDetail, ProjectSummary, SyncStatusPayload } from '../../../shared/delivery.js';
import type { ServerToClientMessage } from '../../../shared/workflows.js';
import { useAppState } from '../../state/appState';
import { DeliveryRealtimeClient } from './deliveryRealtimeClient';
import { fetchProjectContext, fetchProjectDetail, fetchProjects, fetchSyncStatus } from './deliveryApi';

interface ProjectsState {
  projects: ProjectSummary[];
  selectedProjectId: string | null;
  selectedDetail: ProjectDetail | null;
  selectedContext: ProjectContext | null;
  loading: boolean;
  contextLoading: boolean;
  error: string | null;
  socketConnected: boolean;
  reconnectAttempt: number;
  stale: boolean;
  lastAckEventId: string | null;
  lastSuccessfulSyncAt: string | null;
  lastSuccessfulUpdateAt: string | null;
  syncWarnings: SyncStatusPayload['warnings'];
}

type ProjectsAction =
  | { type: 'LOAD_START' }
  | { type: 'LOAD_SUCCESS'; projects: ProjectSummary[] }
  | { type: 'LOAD_ERROR'; message: string }
  | { type: 'SELECT_PROJECT'; projectId: string }
  | { type: 'LOAD_CONTEXT_START' }
  | { type: 'LOAD_CONTEXT_SUCCESS'; detail: ProjectDetail; context: ProjectContext }
  | { type: 'LOAD_CONTEXT_ERROR'; message: string }
  | { type: 'SOCKET_OPEN' }
  | { type: 'SOCKET_CLOSE' }
  | { type: 'RECONNECT_SCHEDULED'; attempt: number }
  | { type: 'WS_MESSAGE'; message: ServerToClientMessage }
  | { type: 'SET_SYNC_STATUS'; payload: SyncStatusPayload };

const initialState: ProjectsState = {
  projects: [],
  selectedProjectId: null,
  selectedDetail: null,
  selectedContext: null,
  loading: true,
  contextLoading: false,
  error: null,
  socketConnected: false,
  reconnectAttempt: 0,
  stale: true,
  lastAckEventId: null,
  lastSuccessfulSyncAt: null,
  lastSuccessfulUpdateAt: null,
  syncWarnings: []
};

function getWsUrl(): string {
  if (typeof window === 'undefined') {
    return 'ws://localhost:3001/ws';
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

function syncWarningForProjects(state: ProjectsState): SyncStatusPayload['warnings'] {
  return state.syncWarnings.filter((warning) => warning.module === 'project' || warning.module === 'workflow');
}

function reducer(state: ProjectsState, action: ProjectsAction): ProjectsState {
  switch (action.type) {
    case 'LOAD_START':
      return { ...state, loading: true, error: null };
    case 'LOAD_SUCCESS':
      return {
        ...state,
        loading: false,
        projects: action.projects,
        selectedProjectId: state.selectedProjectId ?? action.projects[0]?.id ?? null
      };
    case 'LOAD_ERROR':
      return { ...state, loading: false, error: action.message };
    case 'SELECT_PROJECT':
      return { ...state, selectedProjectId: action.projectId };
    case 'LOAD_CONTEXT_START':
      return { ...state, contextLoading: true, error: null };
    case 'LOAD_CONTEXT_SUCCESS':
      return {
        ...state,
        contextLoading: false,
        selectedDetail: action.detail,
        selectedContext: action.context
      };
    case 'LOAD_CONTEXT_ERROR':
      return { ...state, contextLoading: false, error: action.message };
    case 'SOCKET_OPEN':
      return { ...state, socketConnected: true, reconnectAttempt: 0, stale: true };
    case 'SOCKET_CLOSE':
      return { ...state, socketConnected: false, stale: true };
    case 'RECONNECT_SCHEDULED':
      return { ...state, reconnectAttempt: action.attempt, stale: true };
    case 'SET_SYNC_STATUS':
      return {
        ...state,
        syncWarnings: action.payload.warnings
      };
    case 'WS_MESSAGE': {
      if (action.message.type === 'event' && action.message.module === 'story') {
        const nextProjects = state.projects.map((project) =>
          project.id === action.message.payload.project.id ? action.message.payload.project : project
        );

        const nextContext = state.selectedContext
          ? {
              ...state.selectedContext,
              stories: state.selectedContext.stories.map((story) =>
                story.id === action.message.payload.story.id ? action.message.payload.story : story
              ),
              project:
                state.selectedContext.project.id === action.message.payload.project.id
                  ? { ...state.selectedContext.project, ...action.message.payload.project }
                  : state.selectedContext.project
            }
          : state.selectedContext;

        return {
          ...state,
          projects: nextProjects,
          selectedContext: nextContext,
          lastAckEventId: action.message.eventId,
          lastSuccessfulUpdateAt: action.message.occurredAt,
          stale: false
        };
      }

      if (action.message.type === 'snapshot' && action.message.module === 'sync') {
        return {
          ...state,
          syncWarnings: action.message.data.warnings
        };
      }

      if (action.message.type === 'sync_status' && (action.message.module === 'sync' || action.message.module === 'story')) {
        return {
          ...state,
          lastSuccessfulSyncAt: action.message.lastSuccessfulSyncAt
        };
      }

      if (action.message.type === 'stale_state' && (action.message.module === 'sync' || action.message.module === 'story')) {
        return {
          ...state,
          stale: action.message.isStale,
          lastSuccessfulUpdateAt: action.message.lastSuccessfulUpdateAt
        };
      }

      return state;
    }
    default:
      return state;
  }
}

function statusPillClass(status: ProjectSummary['status']): string {
  if (status === 'blocked') {
    return 'status-pill status-pill--blocked';
  }
  if (status === 'failed') {
    return 'status-pill status-pill--failed';
  }
  if (status === 'done') {
    return 'status-pill status-pill--done';
  }
  return 'status-pill status-pill--neutral';
}

export function ProjectsPage(): JSX.Element {
  const [state, dispatch] = useReducer(reducer, initialState);
  const lastAckEventId = useRef<string | null>(null);
  const { dispatch: appDispatch } = useAppState();

  useEffect(() => {
    lastAckEventId.current = state.lastAckEventId;
  }, [state.lastAckEventId]);

  const loadProjectContext = useCallback(async (projectId: string) => {
    dispatch({ type: 'LOAD_CONTEXT_START' });
    try {
      const [detail, context] = await Promise.all([fetchProjectDetail(projectId), fetchProjectContext(projectId)]);
      dispatch({ type: 'LOAD_CONTEXT_SUCCESS', detail, context });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load project context';
      dispatch({ type: 'LOAD_CONTEXT_ERROR', message });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      dispatch({ type: 'LOAD_START' });
      try {
        const [projects, syncStatus] = await Promise.all([fetchProjects(), fetchSyncStatus()]);
        if (cancelled) {
          return;
        }
        dispatch({ type: 'LOAD_SUCCESS', projects });
        dispatch({ type: 'SET_SYNC_STATUS', payload: syncStatus });

        if (projects.length) {
          void loadProjectContext(projects[0].id);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : 'Failed to load projects';
        dispatch({ type: 'LOAD_ERROR', message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadProjectContext]);

  useEffect(() => {
    const client = new DeliveryRealtimeClient({
      wsUrl: getWsUrl(),
      topics: ['story', 'sync'],
      onOpen: () => {
        dispatch({ type: 'SOCKET_OPEN' });
      },
      onClose: () => {
        dispatch({ type: 'SOCKET_CLOSE' });
      },
      onReconnectScheduled: (attempt) => {
        dispatch({ type: 'RECONNECT_SCHEDULED', attempt });
      },
      onMessage: (message) => {
        dispatch({ type: 'WS_MESSAGE', message });
      },
      getLastAckEventId: () => lastAckEventId.current
    });

    client.connect();
    return () => {
      client.close();
    };
  }, []);

  useEffect(() => {
    appDispatch({
      type: 'SET_MODULE_SYNC',
      module: 'projects',
      payload: {
        stale: state.stale,
        status: state.socketConnected ? 'ok' : 'syncing',
        lastSuccessfulSyncAt: state.lastSuccessfulSyncAt,
        lastSuccessfulUpdateAt: state.lastSuccessfulUpdateAt
      }
    });
  }, [appDispatch, state.lastSuccessfulSyncAt, state.lastSuccessfulUpdateAt, state.socketConnected, state.stale]);

  const warnings = useMemo(() => syncWarningForProjects(state), [state]);

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Project Health</h1>
        <p className="text-sm text-[var(--muted-fg)]">
          Cross-view project delivery health with due-date risk and linked story/workflow/document context.
        </p>
      </header>

      {warnings.length > 0 && (
        <div className="status-panel-warning space-y-2 rounded-md p-3 text-sm">
          <p className="font-medium">Consistency warning</p>
          {warnings.map((warning) => (
            <p key={`${warning.module}:${warning.message}`}>
              Module: {warning.module} | Last successful sync: {warning.lastSuccessfulSyncAtUtc ?? 'none'} |{' '}
              {warning.message}
            </p>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <section className="rounded-lg border border-[var(--border)]">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
            <thead className="bg-[var(--muted)] text-left">
              <tr>
                <th className="px-3 py-2">Project</th>
                <th className="px-3 py-2">Owner</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Progress</th>
                <th className="px-3 py-2">Due</th>
              </tr>
            </thead>
            <tbody>
              {state.projects.map((project) => (
                <tr
                  key={project.id}
                  className={`cursor-pointer border-t border-[var(--border)] hover:bg-[var(--muted)] ${
                    state.selectedProjectId === project.id ? 'bg-[var(--muted)]' : ''
                  } ${project.isOverdue ? 'status-panel-error' : ''}`}
                  onClick={() => {
                    dispatch({ type: 'SELECT_PROJECT', projectId: project.id });
                    void loadProjectContext(project.id);
                  }}
                >
                  <td className="px-3 py-2">
                    <div className="font-medium">{project.name}</div>
                    <div className="text-xs text-[var(--muted-fg)]">{project.id}</div>
                  </td>
                  <td className="px-3 py-2">{project.ownerId}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-1 text-xs font-medium ${statusPillClass(project.status)}`}>
                      {project.status}
                    </span>
                    {project.riskFlag && <div className="status-text-warning mt-1 text-xs font-medium">Risk flagged</div>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="h-2 rounded bg-[var(--muted)]">
                      <div className="h-2 rounded bg-[var(--accent)]" style={{ width: `${project.progressPct}%` }} />
                    </div>
                    <div className="mt-1 text-xs text-[var(--muted-fg)]">{project.progressPct}%</div>
                  </td>
                  <td className="px-3 py-2">
                    <div>{new Date(project.dueAt).toLocaleDateString()}</div>
                    {project.isOverdue && <div className="status-text-error text-xs font-medium">Overdue</div>}
                  </td>
                </tr>
              ))}
              {!state.projects.length && !state.loading && (
                <tr>
                  <td className="px-3 py-8 text-center text-[var(--muted-fg)]" colSpan={5}>
                    No projects found.
                  </td>
                </tr>
              )}
            </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3 rounded-lg border border-[var(--border)] p-3">
          <h2 className="text-lg font-medium">Project Detail</h2>
          {state.contextLoading && <p className="text-sm text-[var(--muted-fg)]">Loading project context...</p>}
          {state.error && <p className="status-text-error text-sm">{state.error}</p>}

          {state.selectedDetail && state.selectedContext && !state.contextLoading && (
            <div className="space-y-3 text-sm">
              <p>
                <span className="font-medium">{state.selectedDetail.name}</span> | Owner: {state.selectedDetail.ownerId}
              </p>
              <p className="text-[var(--muted-fg)]">{state.selectedDetail.description}</p>

              <div>
                <p className="font-medium">Related stories</p>
                <ul className="space-y-1 text-xs text-[var(--muted-fg)]">
                  {state.selectedContext.stories.map((story) => (
                    <li key={story.id}>
                      <Link
                        to={`/kanban?projectId=${encodeURIComponent(state.selectedContext.project.id)}&storyId=${encodeURIComponent(story.id)}`}
                        className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
                      >
                        {story.id}
                      </Link>{' '}
                      | {story.title} | {story.ownerId} | {story.status}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="font-medium">Related workflows</p>
                <ul className="space-y-1 text-xs text-[var(--muted-fg)]">
                  {state.selectedContext.workflows.map((workflow) => (
                    <li key={workflow.id}>
                      <Link
                        to={`/workflows?workflowId=${encodeURIComponent(workflow.id)}`}
                        className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
                      >
                        {workflow.id}
                      </Link>{' '}
                      | {workflow.name} | {workflow.ownerId} | {workflow.status}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="font-medium">Related documents</p>
                <ul className="space-y-1 text-xs text-[var(--muted-fg)]">
                  {state.selectedContext.documents.map((document) => (
                    <li key={document.id}>
                      <Link
                        to={`/documents?documentId=${encodeURIComponent(document.id)}`}
                        className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
                      >
                        {document.id}
                      </Link>{' '}
                      | {document.title} | {document.mimeType}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
