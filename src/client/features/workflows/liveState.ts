import type {
  ServerToClientMessage,
  WorkflowSummary,
  WorkflowTransition,
  WsEventMessage
} from '../../../shared/workflows.js';

export type WorkflowFilter = 'all' | 'blocked_failed';

export interface WorkflowLiveState {
  workflows: WorkflowSummary[];
  selectedWorkflowId: string | null;
  transitionsByWorkflowId: Record<string, WorkflowTransition[]>;
  transitionLoadingByWorkflowId: Record<string, boolean>;
  transitionErrorByWorkflowId: Record<string, string | null>;
  filter: WorkflowFilter;
  isSocketConnected: boolean;
  reconnectAttempt: number;
  stale: boolean;
  hasSuccessfulSync: boolean;
  requiresFreshEventAfterSync: boolean;
  lastAckEventId: string | null;
  lastSuccessfulSyncAt: string | null;
  lastSuccessfulUpdateAt: string | null;
}

export type WorkflowLiveAction =
  | { type: 'SET_INITIAL_WORKFLOWS'; workflows: WorkflowSummary[] }
  | { type: 'SET_FILTER'; filter: WorkflowFilter }
  | { type: 'SELECT_WORKFLOW'; workflowId: string | null }
  | { type: 'LOAD_TRANSITIONS_START'; workflowId: string }
  | { type: 'LOAD_TRANSITIONS_SUCCESS'; workflowId: string; transitions: WorkflowTransition[] }
  | { type: 'LOAD_TRANSITIONS_ERROR'; workflowId: string; message: string }
  | { type: 'SOCKET_OPEN' }
  | { type: 'SOCKET_CLOSE' }
  | { type: 'RECONNECT_SCHEDULED'; attempt: number }
  | { type: 'WS_MESSAGE'; message: ServerToClientMessage };

const transitionSortAsc = (a: WorkflowTransition, b: WorkflowTransition): number => {
  return new Date(a.occurredAtUtc).getTime() - new Date(b.occurredAtUtc).getTime();
};

const workflowSortDesc = (a: WorkflowSummary, b: WorkflowSummary): number => {
  return new Date(b.lastTransitionAt).getTime() - new Date(a.lastTransitionAt).getTime();
};

export const initialWorkflowLiveState: WorkflowLiveState = {
  workflows: [],
  selectedWorkflowId: null,
  transitionsByWorkflowId: {},
  transitionLoadingByWorkflowId: {},
  transitionErrorByWorkflowId: {},
  filter: 'all',
  isSocketConnected: false,
  reconnectAttempt: 0,
  stale: true,
  hasSuccessfulSync: false,
  requiresFreshEventAfterSync: true,
  lastAckEventId: null,
  lastSuccessfulSyncAt: null,
  lastSuccessfulUpdateAt: null
};

function applyWorkflowEvent(state: WorkflowLiveState, message: WsEventMessage): WorkflowLiveState {
  const nextWorkflows = [...state.workflows];
  const index = nextWorkflows.findIndex((item) => item.id === message.payload.workflow.id);

  if (index >= 0) {
    nextWorkflows[index] = message.payload.workflow;
  } else {
    nextWorkflows.push(message.payload.workflow);
  }

  const workflowTransitions = state.transitionsByWorkflowId[message.payload.workflow.id] ?? [];
  const nextTransitions = [...workflowTransitions, message.payload.transition].sort(transitionSortAsc);

  const staleShouldClear = state.hasSuccessfulSync && state.requiresFreshEventAfterSync;

  return {
    ...state,
    workflows: nextWorkflows.sort(workflowSortDesc),
    transitionsByWorkflowId: {
      ...state.transitionsByWorkflowId,
      [message.payload.workflow.id]: nextTransitions
    },
    stale: staleShouldClear ? false : state.stale,
    requiresFreshEventAfterSync: staleShouldClear ? false : state.requiresFreshEventAfterSync,
    lastAckEventId: message.eventId,
    lastSuccessfulUpdateAt: message.occurredAt
  };
}

export function workflowLiveReducer(state: WorkflowLiveState, action: WorkflowLiveAction): WorkflowLiveState {
  switch (action.type) {
    case 'SET_INITIAL_WORKFLOWS': {
      return {
        ...state,
        workflows: [...action.workflows].sort(workflowSortDesc)
      };
    }
    case 'SET_FILTER': {
      return {
        ...state,
        filter: action.filter
      };
    }
    case 'SELECT_WORKFLOW': {
      return {
        ...state,
        selectedWorkflowId: action.workflowId
      };
    }
    case 'LOAD_TRANSITIONS_START': {
      return {
        ...state,
        transitionLoadingByWorkflowId: {
          ...state.transitionLoadingByWorkflowId,
          [action.workflowId]: true
        },
        transitionErrorByWorkflowId: {
          ...state.transitionErrorByWorkflowId,
          [action.workflowId]: null
        }
      };
    }
    case 'LOAD_TRANSITIONS_SUCCESS': {
      return {
        ...state,
        transitionsByWorkflowId: {
          ...state.transitionsByWorkflowId,
          [action.workflowId]: [...action.transitions].sort(transitionSortAsc)
        },
        transitionLoadingByWorkflowId: {
          ...state.transitionLoadingByWorkflowId,
          [action.workflowId]: false
        },
        transitionErrorByWorkflowId: {
          ...state.transitionErrorByWorkflowId,
          [action.workflowId]: null
        }
      };
    }
    case 'LOAD_TRANSITIONS_ERROR': {
      return {
        ...state,
        transitionLoadingByWorkflowId: {
          ...state.transitionLoadingByWorkflowId,
          [action.workflowId]: false
        },
        transitionErrorByWorkflowId: {
          ...state.transitionErrorByWorkflowId,
          [action.workflowId]: action.message
        }
      };
    }
    case 'SOCKET_OPEN': {
      return {
        ...state,
        isSocketConnected: true,
        reconnectAttempt: 0,
        stale: true,
        requiresFreshEventAfterSync: true
      };
    }
    case 'SOCKET_CLOSE': {
      return {
        ...state,
        isSocketConnected: false,
        stale: true,
        hasSuccessfulSync: false,
        requiresFreshEventAfterSync: true
      };
    }
    case 'RECONNECT_SCHEDULED': {
      return {
        ...state,
        reconnectAttempt: action.attempt,
        stale: true
      };
    }
    case 'WS_MESSAGE': {
      if (action.message.type === 'snapshot' && action.message.module === 'workflow') {
        return {
          ...state,
          workflows: [...action.message.data.workflows].sort(workflowSortDesc)
        };
      }

      if (action.message.type === 'event' && action.message.module === 'workflow') {
        return applyWorkflowEvent(state, action.message);
      }

      if (action.message.type === 'sync_status' && action.message.module === 'workflow') {
        return {
          ...state,
          hasSuccessfulSync: action.message.status === 'ok',
          lastSuccessfulSyncAt: action.message.lastSuccessfulSyncAt
        };
      }

      if (action.message.type === 'stale_state' && action.message.module === 'workflow') {
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

export function selectFilteredWorkflows(state: WorkflowLiveState): WorkflowSummary[] {
  if (state.filter === 'all') {
    return state.workflows;
  }

  return state.workflows.filter((workflow) => workflow.status === 'blocked' || workflow.status === 'failed');
}

export function calculateReconnectDelayMs(attempt: number): number {
  const boundedAttempt = Math.max(1, Math.min(attempt, 10));
  const exponentialMs = Math.min(30_000, Math.pow(2, boundedAttempt) * 500);
  const jitter = Math.round(exponentialMs * 0.2);
  return exponentialMs - jitter + Math.floor(Math.random() * (jitter * 2 + 1));
}
