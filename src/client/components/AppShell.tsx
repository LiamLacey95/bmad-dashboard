import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAppState } from '../state/appState';

const navItems = [
  { to: '/workflows', label: 'Workflows' },
  { to: '/projects', label: 'Projects' },
  { to: '/costs', label: 'Costs' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/documents', label: 'Documents' },
  { to: '/kanban', label: 'Kanban' }
] as const;

export function AppShell(): JSX.Element {
  const { state, dispatch } = useAppState();

  const staleModules = Object.entries(state.modules)
    .filter(([, module]) => module.stale)
    .map(([name]) => name);

  const syncingModules = Object.entries(state.modules)
    .filter(([, module]) => module.status === 'syncing')
    .map(([name]) => name);

  const freshnessLabel = Object.entries(state.modules)
    .filter(([, module]) => module.lastSuccessfulUpdateAt)
    .map(([name, module]) => `${name}: ${module.lastSuccessfulUpdateAt}`)
    .join(' | ');

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--fg)] transition-colors">
      <header className="border-b border-[var(--border)] bg-[var(--panel)]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <Link to="/workflows" className="text-lg font-semibold tracking-tight">
            BMAD Dashboard
          </Link>
          <nav className="flex flex-wrap gap-2 text-sm" aria-label="Primary">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  [
                    'rounded-md px-3 py-2 transition-colors',
                    isActive
                      ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                      : 'hover:bg-[var(--muted)] hover:text-[var(--fg)]'
                  ].join(' ')
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <button
            type="button"
            className="ml-auto rounded-md border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--muted)]"
            onClick={() => dispatch({ type: 'TOGGLE_THEME' })}
          >
            Theme: {state.theme === 'light' ? 'Light' : 'Dark'}
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-2 px-4 py-3">
        <section aria-label="Sync status banners" className="space-y-2">
          <div className="status-panel-warning rounded-md px-3 py-2 text-sm">
            Stale modules: {staleModules.length ? staleModules.join(', ') : 'none'}
          </div>
          <div className="rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-sm text-[var(--fg)]">
            Syncing modules: {syncingModules.length ? syncingModules.join(', ') : 'none'}
          </div>
          <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--muted-fg)]">
            Last successful updates: {freshnessLabel || 'none'}
          </div>
        </section>

        <main className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
