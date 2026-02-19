import { useEffect, useMemo, useState } from 'react';
import type { CostSummaryPayload, CostTimeseriesPayload } from '../../../shared/costAnalytics.js';
import { useAppState } from '../../state/appState';
import { fetchCostSummary, fetchCostTimeseries } from './costAnalyticsApi';

type WindowPreset = '24h' | '7d' | '30d';
type WindowSelection = WindowPreset | 'custom';

interface ResolvedWindow {
  window: WindowSelection;
  start: string;
  end: string;
}

function resolvePresetWindow(window: WindowPreset): ResolvedWindow {
  const end = new Date();
  const durationMs =
    window === '24h' ? 24 * 60 * 60 * 1000 : window === '7d' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
  const start = new Date(end.getTime() - durationMs);

  return {
    window,
    start: start.toISOString(),
    end: end.toISOString()
  };
}

function toLocalInput(isoDate: string): string {
  const date = new Date(isoDate);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function statusText(total: number | null, availability: string): string {
  if (availability === 'unavailable') {
    return 'Unavailable';
  }
  return `$${total?.toFixed(2) ?? '0.00'}`;
}

export function CostsPage(): JSX.Element {
  const { dispatch: appDispatch } = useAppState();
  const [windowSelection, setWindowSelection] = useState<WindowSelection>('24h');
  const [projectId, setProjectId] = useState<string>('');
  const [appliedWindow, setAppliedWindow] = useState<ResolvedWindow>(() => resolvePresetWindow('24h'));
  const [customStartInput, setCustomStartInput] = useState<string>(() => toLocalInput(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()));
  const [customEndInput, setCustomEndInput] = useState<string>(() => toLocalInput(new Date().toISOString()));
  const [summary, setSummary] = useState<CostSummaryPayload | null>(null);
  const [timeseries, setTimeseries] = useState<CostTimeseriesPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (windowSelection === 'custom') {
      return;
    }

    const nextWindow = resolvePresetWindow(windowSelection);
    setAppliedWindow(nextWindow);
  }, [windowSelection]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);

      try {
        const [summaryResult, timeseriesResult] = await Promise.all([
          fetchCostSummary({
            window: appliedWindow.window,
            start: appliedWindow.window === 'custom' ? appliedWindow.start : undefined,
            end: appliedWindow.window === 'custom' ? appliedWindow.end : undefined,
            projectId: projectId || undefined
          }),
          fetchCostTimeseries({
            bucket: appliedWindow.window === '24h' ? 'hour' : 'day',
            start: appliedWindow.start,
            end: appliedWindow.end,
            projectId: projectId || undefined
          })
        ]);

        if (cancelled) {
          return;
        }

        setSummary(summaryResult);
        setTimeseries(timeseriesResult);
        appDispatch({
          type: 'SET_MODULE_SYNC',
          module: 'costs',
          payload: {
            stale: false,
            status: 'ok',
            lastSuccessfulSyncAt: new Date().toISOString(),
            lastSuccessfulUpdateAt: summaryResult.end
          }
        });
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        const message = loadError instanceof Error ? loadError.message : 'Failed to load cost analytics';
        setError(message);
        appDispatch({
          type: 'SET_MODULE_SYNC',
          module: 'costs',
          payload: {
            stale: true,
            status: 'error'
          }
        });
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [appliedWindow, appDispatch, projectId]);

  const projectOptions = useMemo(() => {
    return summary?.projects.map((project) => ({ id: project.projectId, name: project.projectName })) ?? [];
  }, [summary]);

  const handleApplyCustomWindow = () => {
    const start = new Date(customStartInput).toISOString();
    const end = new Date(customEndInput).toISOString();

    if (new Date(start).getTime() >= new Date(end).getTime()) {
      setValidationError('End time must be after start time.');
      return;
    }

    setValidationError(null);
    setAppliedWindow({
      window: 'custom',
      start,
      end
    });
  };

  const aggregateSeries = timeseries?.series.find((series) => series.scope === 'aggregate');

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Cost Tracking</h1>
        <p className="text-sm text-[var(--muted-fg)]">
          Aggregate and per-project cost visibility with unified time-window controls.
        </p>
      </header>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--muted)] p-3">
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col gap-1">
            Window
            <select
              className="rounded border border-[var(--border)] bg-white px-2 py-1"
              value={windowSelection}
              onChange={(event) => setWindowSelection(event.target.value as WindowSelection)}
            >
              <option value="24h">24h</option>
              <option value="7d">7d</option>
              <option value="30d">30d</option>
              <option value="custom">Custom</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            Project
            <select
              className="rounded border border-[var(--border)] bg-white px-2 py-1"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
            >
              <option value="">All projects</option>
              {projectOptions.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>

          {windowSelection === 'custom' && (
            <>
              <label className="flex flex-col gap-1">
                Start
                <input
                  type="datetime-local"
                  className="rounded border border-[var(--border)] bg-white px-2 py-1"
                  value={customStartInput}
                  onChange={(event) => setCustomStartInput(event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1">
                End
                <input
                  type="datetime-local"
                  className="rounded border border-[var(--border)] bg-white px-2 py-1"
                  value={customEndInput}
                  onChange={(event) => setCustomEndInput(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="rounded border border-[var(--border)] bg-[var(--panel)] px-3 py-1"
                onClick={handleApplyCustomWindow}
              >
                Apply
              </button>
            </>
          )}
        </div>
        <p className="mt-2 text-xs text-[var(--muted-fg)]">
          Active window: {appliedWindow.start} to {appliedWindow.end}
        </p>
        {validationError && <p className="mt-2 text-sm text-rose-700">{validationError}</p>}
      </section>

      {loading && <p className="text-sm text-[var(--muted-fg)]">Loading cost data...</p>}
      {error && <p className="text-sm text-rose-700">{error}</p>}

      {summary && (
        <section className="space-y-3 rounded-lg border border-[var(--border)] p-3">
          <h2 className="text-lg font-medium">Summary</h2>
          <div className="rounded border border-[var(--border)] bg-[var(--muted)] px-3 py-2">
            Total spend: <strong>{statusText(summary.aggregate.totalCost, summary.aggregate.availability)}</strong>
          </div>
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left">
                <th className="px-2 py-1">Project</th>
                <th className="px-2 py-1">Cost</th>
                <th className="px-2 py-1">Availability</th>
              </tr>
            </thead>
            <tbody>
              {summary.projects.map((project) => (
                <tr key={project.projectId} className="border-b border-[var(--border)]">
                  <td className="px-2 py-1">{project.projectName}</td>
                  <td className="px-2 py-1">{statusText(project.totalCost, project.availability)}</td>
                  <td className="px-2 py-1">{project.availability}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {aggregateSeries && (
        <section className="space-y-3 rounded-lg border border-[var(--border)] p-3">
          <h2 className="text-lg font-medium">Timeseries ({timeseries?.bucket})</h2>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {aggregateSeries.points.map((point) => (
              <article key={point.bucketStart} className="rounded border border-[var(--border)] bg-[var(--muted)] p-2 text-xs">
                <p>{point.bucketStart}</p>
                <p className={point.availability === 'unavailable' ? 'text-amber-700' : ''}>
                  {point.availability === 'unavailable' ? 'Unavailable' : `$${point.totalCost?.toFixed(2) ?? '0.00'}`}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
