import { useEffect, useMemo, useReducer, useRef } from 'react';
import type { KanbanBoard, SyncStatusPayload } from '../../../shared/delivery.js';
import type { ServerToClientMessage } from '../../../shared/workflows.js';
import { useAppState } from '../../state/appState';
import { DeliveryRealtimeClient } from './deliveryRealtimeClient';
import { fetchKanbanBoard, fetchSyncStatus } from './deliveryApi';

interface KanbanState {
  board: KanbanBoard | null;
  loading: boolean;
  error: string | null;
  socketConnected: boolean;
  stale: boolean;
  reconnectAttempt: number;
  lastAckEventId: string | null;
  lastSuccessfulSyncAt: string | null;
  lastSuccessfulUpdateAt: string | null;
  syncWarnings: SyncStatusPayload['warnings'];
}

type KanbanAction =
  | { type: 'LOAD_START' }
  | { type: 'LOAD_SUCCESS'; board: KanbanBoard; syncWarnings: SyncStatusPayload['warnings'] }
  | { type: 'LOAD_ERROR'; message: string }
  | { type: 'SOCKET_OPEN' }
  | { type: 'SOCKET_CLOSE' }
  | { type: 'RECONNECT_SCHEDULED'; attempt: number }
  | { type: 'WS_MESSAGE'; message: ServerToClientMessage };

const initialState: KanbanState = {
  board: null,
  loading: true,
  error: null,
  socketConnected: false,
  stale: true,
  reconnectAttempt: 0,
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

function reducer(state: KanbanState, action: KanbanAction): KanbanState {
  switch (action.type) {
    case 'LOAD_START':
      return { ...state, loading: true, error: null };
    case 'LOAD_SUCCESS':
      return {
        ...state,
        loading: false,
        board: action.board,
        syncWarnings: action.syncWarnings
      };
    case 'LOAD_ERROR':
      return { ...state, loading: false, error: action.message };
    case 'SOCKET_OPEN':
      return { ...state, socketConnected: true, reconnectAttempt: 0, stale: true };
    case 'SOCKET_CLOSE':
      return { ...state, socketConnected: false, stale: true };
    case 'RECONNECT_SCHEDULED':
      return { ...state, reconnectAttempt: action.attempt, stale: true };
    case 'WS_MESSAGE': {
      if (action.message.type === 'event' && action.message.module === 'story' && state.board) {
        const nextColumns = state.board.columns.map((column) => ({
          ...column,
          cards: column.cards.filter((card) => card.storyId !== action.message.payload.story.id)
        }));

        const targetColumn = nextColumns.find((column) => column.statuses.includes(action.message.payload.story.status));
        if (targetColumn) {
          targetColumn.cards = [
            {
              id: `${action.message.payload.story.projectId}:${action.message.payload.story.id}`,
              storyId: action.message.payload.story.id,
              title: action.message.payload.story.title,
              ownerId: action.message.payload.story.ownerId,
              status: action.message.payload.story.status,
              projectId: action.message.payload.story.projectId,
              projectName: action.message.payload.project.name,
              updatedAt: action.message.payload.story.updatedAt
            },
            ...targetColumn.cards
          ];
        }

        return {
          ...state,
          board: {
            ...state.board,
            columns: nextColumns
          },
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

function warningForKanban(state: KanbanState): SyncStatusPayload['warnings'] {
  return state.syncWarnings.filter((warning) => warning.module === 'story' || warning.module === 'workflow');
}

function statusClass(status: string): string {
  if (status === 'blocked') {
    return 'bg-amber-100 text-amber-800';
  }
  if (status === 'failed') {
    return 'bg-rose-100 text-rose-800';
  }
  if (status === 'done' || status === 'canceled') {
    return 'bg-emerald-100 text-emerald-800';
  }
  return 'bg-slate-100 text-slate-800';
}

export function KanbanPage(): JSX.Element {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { dispatch: appDispatch } = useAppState();
  const lastAckEventId = useRef<string | null>(null);

  useEffect(() => {
    lastAckEventId.current = state.lastAckEventId;
  }, [state.lastAckEventId]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      dispatch({ type: 'LOAD_START' });
      try {
        const [board, syncStatus] = await Promise.all([fetchKanbanBoard(), fetchSyncStatus()]);
        if (cancelled) {
          return;
        }
        dispatch({ type: 'LOAD_SUCCESS', board, syncWarnings: syncStatus.warnings });
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : 'Failed to load Kanban board';
        dispatch({ type: 'LOAD_ERROR', message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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
      module: 'kanban',
      payload: {
        stale: state.stale,
        status: state.socketConnected ? 'ok' : 'syncing',
        lastSuccessfulSyncAt: state.lastSuccessfulSyncAt,
        lastSuccessfulUpdateAt: state.lastSuccessfulUpdateAt
      }
    });
  }, [appDispatch, state.lastSuccessfulSyncAt, state.lastSuccessfulUpdateAt, state.socketConnected, state.stale]);

  const warnings = useMemo(() => warningForKanban(state), [state]);

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Story Kanban</h1>
        <p className="text-sm text-[var(--muted-fg)]">Lifecycle board with live story updates and consistency checks.</p>
      </header>

      {warnings.length > 0 && (
        <div className="space-y-2 rounded-md border border-amber-500/60 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-medium">Consistency warning</p>
          {warnings.map((warning) => (
            <p key={`${warning.module}:${warning.message}`}>
              Module: {warning.module} | Last successful sync: {warning.lastSuccessfulSyncAtUtc ?? 'none'} |{' '}
              {warning.message}
            </p>
          ))}
        </div>
      )}

      {state.board && (
        <div className="rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-sm">
          Mode: {state.board.readOnly ? 'Read-only (MVP default)' : 'Editable'} | {state.board.editableModeReason}
        </div>
      )}

      {state.loading && <p className="text-sm text-[var(--muted-fg)]">Loading board...</p>}
      {state.error && <p className="text-sm text-rose-700">{state.error}</p>}

      {state.board && (
        <div className="grid gap-3 lg:grid-cols-5">
          {state.board.columns.map((column) => (
            <section key={column.id} className="min-h-40 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-3">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-medium">{column.label}</h2>
                <span className="text-xs text-[var(--muted-fg)]">{column.cards.length}</span>
              </div>

              <div className="space-y-2">
                {column.cards.map((card) => (
                  <article key={card.id} className="rounded border border-[var(--border)] bg-white p-2 text-xs shadow-sm">
                    <p className="font-medium text-slate-900">{card.title}</p>
                    <p className="text-slate-600">
                      {card.storyId} | {card.projectName}
                    </p>
                    <p className="text-slate-600">Owner: {card.ownerId}</p>
                    <span className={`inline-block rounded px-2 py-0.5 ${statusClass(card.status)}`}>{card.status}</span>
                  </article>
                ))}
                {!column.cards.length && <p className="text-xs text-[var(--muted-fg)]">No stories.</p>}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
