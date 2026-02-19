import { createContext, useContext, useEffect, useReducer, type Dispatch, type PropsWithChildren } from 'react';

export type Theme = 'light' | 'dark';

type ModuleSyncState = {
  stale: boolean;
  lastSuccessfulSyncAt: string | null;
  lastSuccessfulUpdateAt: string | null;
  status: 'ok' | 'syncing' | 'error';
};

type ModuleName = 'workflows' | 'projects' | 'costs' | 'analytics' | 'documents' | 'kanban';

export interface AppState {
  theme: Theme;
  modules: Record<ModuleName, ModuleSyncState>;
}

type AppAction =
  | { type: 'TOGGLE_THEME' }
  | { type: 'SET_THEME'; theme: Theme }
  | {
      type: 'SET_MODULE_SYNC';
      module: ModuleName;
      payload: Partial<ModuleSyncState>;
    };

const THEME_STORAGE_KEY = 'bmad-theme';

const initialState: AppState = {
  theme: 'light',
  modules: {
    workflows: { stale: false, lastSuccessfulSyncAt: null, lastSuccessfulUpdateAt: null, status: 'ok' },
    projects: { stale: false, lastSuccessfulSyncAt: null, lastSuccessfulUpdateAt: null, status: 'ok' },
    costs: { stale: false, lastSuccessfulSyncAt: null, lastSuccessfulUpdateAt: null, status: 'syncing' },
    analytics: { stale: false, lastSuccessfulSyncAt: null, lastSuccessfulUpdateAt: null, status: 'syncing' },
    documents: { stale: false, lastSuccessfulSyncAt: null, lastSuccessfulUpdateAt: null, status: 'ok' },
    kanban: { stale: true, lastSuccessfulSyncAt: null, lastSuccessfulUpdateAt: null, status: 'error' }
  }
};

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'light';
  }

  const persisted = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (persisted === 'light' || persisted === 'dark') {
    return persisted;
  }

  return 'light';
}

function syncDocumentTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'TOGGLE_THEME': {
      const nextTheme: Theme = state.theme === 'light' ? 'dark' : 'light';
      syncDocumentTheme(nextTheme);
      return { ...state, theme: nextTheme };
    }
    case 'SET_THEME': {
      syncDocumentTheme(action.theme);
      return { ...state, theme: action.theme };
    }
    case 'SET_MODULE_SYNC': {
      return {
        ...state,
        modules: {
          ...state.modules,
          [action.module]: {
            ...state.modules[action.module],
            ...action.payload
          }
        }
      };
    }
    default:
      return state;
  }
}

const AppStateContext = createContext<{
  state: AppState;
  dispatch: Dispatch<AppAction>;
} | null>(null);

export function AppStateProvider({ children }: PropsWithChildren): JSX.Element {
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    theme: getInitialTheme()
  });

  useEffect(() => {
    syncDocumentTheme(state.theme);
  }, [state.theme]);

  return <AppStateContext.Provider value={{ state, dispatch }}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState must be used within AppStateProvider');
  }
  return context;
}

export const appStateTesting = {
  reducer,
  initialState,
  THEME_STORAGE_KEY
};
