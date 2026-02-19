import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { CanonicalStatus } from '../../../shared/statusModel.js';
import { useAppState } from '../../state/appState';
import { fetchWorkflows, fetchWorkflowTransitions } from './workflowApi';
import { initialWorkflowLiveState, selectFilteredWorkflows, workflowLiveReducer } from './liveState';
import { WorkflowRealtimeClient } from './workflowRealtimeClient';

function getWsUrl(): string {
  if (typeof window === 'undefined') {
    return 'ws://localhost:3001/ws';
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

function statusClass(status: CanonicalStatus): string {
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

function transitionClass(status: CanonicalStatus): string {
  if (status === 'blocked') {
    return 'status-panel-warning';
  }
  if (status === 'failed') {
    return 'status-panel-error';
  }
  return 'border-[var(--border)] bg-[var(--panel)] text-[var(--fg)]';
}

export function WorkflowsPage(): JSX.Element {
  const [state, dispatch] = useReducer(workflowLiveReducer, initialWorkflowLiveState);
  const { dispatch: appDispatch } = useAppState();
  const latestAckEventId = useRef<string | null>(null);

  useEffect(() => {
    latestAckEventId.current = state.lastAckEventId;
  }, [state.lastAckEventId]);

  const loadTransitions = useCallback(async (workflowId: string) => {
    dispatch({ type: 'LOAD_TRANSITIONS_START', workflowId });
    try {
      const transitions = await fetchWorkflowTransitions(workflowId);
      dispatch({ type: 'LOAD_TRANSITIONS_SUCCESS', workflowId, transitions });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load transitions';
      dispatch({ type: 'LOAD_TRANSITIONS_ERROR', workflowId, message });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const workflows = await fetchWorkflows();
        if (cancelled) {
          return;
        }

        dispatch({ type: 'SET_INITIAL_WORKFLOWS', workflows });
        if (workflows.length) {
          dispatch({ type: 'SELECT_WORKFLOW', workflowId: workflows[0].id });
          void loadTransitions(workflows[0].id);
        }
      } catch {
        if (!cancelled) {
          dispatch({ type: 'SET_INITIAL_WORKFLOWS', workflows: [] });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadTransitions]);

  useEffect(() => {
    const client = new WorkflowRealtimeClient({
      wsUrl: getWsUrl(),
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
      getLastAckEventId: () => latestAckEventId.current
    });

    client.connect();

    return () => {
      client.close();
    };
  }, []);

  useEffect(() => {
    appDispatch({
      type: 'SET_MODULE_SYNC',
      module: 'workflows',
      payload: {
        stale: state.stale,
        status: state.isSocketConnected ? 'ok' : 'syncing',
        lastSuccessfulSyncAt: state.lastSuccessfulSyncAt,
        lastSuccessfulUpdateAt: state.lastSuccessfulUpdateAt
      }
    });
  }, [appDispatch, state.isSocketConnected, state.lastSuccessfulSyncAt, state.lastSuccessfulUpdateAt, state.stale]);

  const workflows = useMemo(() => selectFilteredWorkflows(state), [state]);
  const selectedWorkflowId = state.selectedWorkflowId;
  const selectedTransitions = selectedWorkflowId ? state.transitionsByWorkflowId[selectedWorkflowId] ?? [] : [];
  const transitionsLoading = selectedWorkflowId ? state.transitionLoadingByWorkflowId[selectedWorkflowId] : false;
  const transitionsError = selectedWorkflowId ? state.transitionErrorByWorkflowId[selectedWorkflowId] : null;

  return (
    <section className="space-y-4">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Workflow Monitoring</h1>
        <p className="text-sm text-[var(--muted-fg)]">
          Live workflow state with reconnect, heartbeat, and stale-state transparency.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted-fg)]">
          <span>Socket: {state.isSocketConnected ? 'connected' : 'reconnecting'}</span>
          <span>Stale: {state.stale ? 'yes' : 'no'}</span>
          <span>Reconnect attempts: {state.reconnectAttempt}</span>
          <span>Last successful update: {state.lastSuccessfulUpdateAt ?? 'none'}</span>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`rounded-md border px-3 py-2 text-sm ${
            state.filter === 'all' ? 'bg-[var(--accent)] text-[var(--accent-fg)]' : 'bg-[var(--panel)]'
          }`}
          onClick={() => dispatch({ type: 'SET_FILTER', filter: 'all' })}
        >
          All workflows
        </button>
        <button
          type="button"
          className={`rounded-md border px-3 py-2 text-sm ${
            state.filter === 'blocked_failed' ? 'bg-[var(--accent)] text-[var(--accent-fg)]' : 'bg-[var(--panel)]'
          }`}
          onClick={() => dispatch({ type: 'SET_FILTER', filter: 'blocked_failed' })}
        >
          Blocked / Failed
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-lg border border-[var(--border)]">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
            <thead className="bg-[var(--muted)] text-left">
              <tr>
                <th className="px-3 py-2">Workflow</th>
                <th className="px-3 py-2">Owner</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Last transition</th>
              </tr>
            </thead>
            <tbody>
              {workflows.map((workflow) => (
                <tr
                  key={workflow.id}
                  className={`cursor-pointer border-t border-[var(--border)] hover:bg-[var(--muted)] ${
                    selectedWorkflowId === workflow.id ? 'bg-[var(--muted)]' : ''
                  }`}
                  onClick={() => {
                    dispatch({ type: 'SELECT_WORKFLOW', workflowId: workflow.id });
                    if (!state.transitionsByWorkflowId[workflow.id] && !state.transitionLoadingByWorkflowId[workflow.id]) {
                      void loadTransitions(workflow.id);
                    }
                  }}
                >
                  <td className="px-3 py-2">
                    <div className="font-medium">{workflow.name}</div>
                    <div className="text-xs text-[var(--muted-fg)]">{workflow.id}</div>
                  </td>
                  <td className="px-3 py-2">{workflow.ownerId}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-1 text-xs font-medium ${statusClass(workflow.status)}`}>
                      {workflow.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">{new Date(workflow.lastTransitionAt).toLocaleString()}</td>
                </tr>
              ))}
              {!workflows.length && (
                <tr>
                  <td className="px-3 py-8 text-center text-[var(--muted-fg)]" colSpan={4}>
                    No workflows match the selected filter.
                  </td>
                </tr>
              )}
            </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3 rounded-lg border border-[var(--border)] p-3">
          <h2 className="text-lg font-medium">Transition Timeline</h2>

          {!selectedWorkflowId && <p className="text-sm text-[var(--muted-fg)]">Select a workflow to inspect transitions.</p>}

          {selectedWorkflowId && transitionsLoading && (
            <p className="text-sm text-[var(--muted-fg)]">Loading transition history...</p>
          )}

          {selectedWorkflowId && transitionsError && (
            <div className="status-panel-error space-y-2 rounded-md p-3 text-sm">
              <p>Timeline unavailable: {transitionsError}</p>
              <button
                type="button"
                className="rounded border border-[var(--surface-error-border)] bg-[var(--panel)] px-3 py-1"
                onClick={() => {
                  void loadTransitions(selectedWorkflowId);
                }}
              >
                Retry
              </button>
            </div>
          )}

          {selectedWorkflowId && !transitionsLoading && !transitionsError && selectedTransitions.length === 0 && (
            <div className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--muted)] p-3 text-sm">
              <p>No transition records are available for this workflow yet.</p>
              <button
                type="button"
                className="rounded border border-[var(--border)] bg-[var(--panel)] px-3 py-1"
                onClick={() => {
                  void loadTransitions(selectedWorkflowId);
                }}
              >
                Retry
              </button>
            </div>
          )}

          {selectedWorkflowId && !transitionsLoading && !transitionsError && selectedTransitions.length > 0 && (
            <ol className="space-y-2">
              {selectedTransitions.map((transition) => (
                <li key={transition.id} className={`rounded-md border p-2 text-sm ${transitionClass(transition.toStatus)}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {transition.fromStatus ?? 'none'} -&gt; {transition.toStatus}
                    </span>
                    <span className="text-xs">{new Date(transition.occurredAtUtc).toLocaleString()}</span>
                  </div>
                  <div className="text-xs">Actor: {transition.actorId}</div>
                  <div className="text-xs">Reason: {transition.reason ?? 'N/A'}</div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </section>
  );
}
