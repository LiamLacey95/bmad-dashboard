import { useEffect, useState } from 'react';
import type {
  AgentOutliersPayload,
  AgentTrendsPayload,
  KpiDefinition,
  LineagePayload
} from '../../../shared/costAnalytics.js';
import { useAppState } from '../../state/appState';
import { fetchAgentOutliers, fetchAgentTrends, fetchKpis, fetchLineage } from '../costs/costAnalyticsApi';

const agentOptions = [
  { id: 'agent-alpha', name: 'Agent Alpha' },
  { id: 'agent-beta', name: 'Agent Beta' },
  { id: 'agent-gamma', name: 'Agent Gamma' }
];

function toLocalInput(isoDate: string): string {
  const date = new Date(isoDate);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function AnalyticsPage(): JSX.Element {
  const { dispatch: appDispatch } = useAppState();
  const [kpis, setKpis] = useState<KpiDefinition[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<string[]>(['agent-alpha', 'agent-beta']);
  const [selectedKpis, setSelectedKpis] = useState<string[]>([]);
  const [outlierKpi, setOutlierKpi] = useState<string>('');
  const [startInput, setStartInput] = useState<string>(() => toLocalInput(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()));
  const [endInput, setEndInput] = useState<string>(() => toLocalInput(new Date().toISOString()));
  const [trends, setTrends] = useState<AgentTrendsPayload | null>(null);
  const [outliers, setOutliers] = useState<AgentOutliersPayload | null>(null);
  const [lineage, setLineage] = useState<LineagePayload | null>(null);
  const [selectedLineageRef, setSelectedLineageRef] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const kpiItems = await fetchKpis();
        if (cancelled) {
          return;
        }

        setKpis(kpiItems);
        const defaults = kpiItems.slice(0, 2).map((item) => item.key);
        setSelectedKpis(defaults);
        setOutlierKpi(defaults[0] ?? '');
      } catch (loadError) {
        if (cancelled) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : 'Failed to load KPI metadata');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedKpis.length || !outlierKpi) {
      return;
    }

    const start = new Date(startInput).toISOString();
    const end = new Date(endInput).toISOString();
    if (new Date(start).getTime() >= new Date(end).getTime()) {
      setValidationError('End time must be after start time.');
      return;
    }

    setValidationError(null);
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);

      try {
        const [trendData, outlierData] = await Promise.all([
          fetchAgentTrends({
            agentIds: selectedAgents,
            kpis: selectedKpis,
            start,
            end
          }),
          fetchAgentOutliers({
            agentIds: selectedAgents,
            kpi: outlierKpi,
            start,
            end
          })
        ]);

        if (cancelled) {
          return;
        }

        setTrends(trendData);
        setOutliers(outlierData);
        appDispatch({
          type: 'SET_MODULE_SYNC',
          module: 'analytics',
          payload: {
            stale: false,
            status: 'ok',
            lastSuccessfulSyncAt: new Date().toISOString(),
            lastSuccessfulUpdateAt: trendData.end
          }
        });
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : 'Failed to load analytics data');
        appDispatch({
          type: 'SET_MODULE_SYNC',
          module: 'analytics',
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
  }, [appDispatch, endInput, outlierKpi, selectedAgents, selectedKpis, startInput]);

  const loadLineage = async (lineageRef: string) => {
    setSelectedLineageRef(lineageRef);
    try {
      const details = await fetchLineage(lineageRef);
      setLineage(details);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load lineage details');
    }
  };

  const toggleAgent = (agentId: string) => {
    setSelectedAgents((prev) =>
      prev.includes(agentId) ? prev.filter((value) => value !== agentId) : [...prev, agentId]
    );
  };

  const toggleKpi = (kpiKey: string) => {
    setSelectedKpis((prev) => {
      const next = prev.includes(kpiKey) ? prev.filter((value) => value !== kpiKey) : [...prev, kpiKey];
      if (!next.length) {
        return prev;
      }
      if (!next.includes(outlierKpi)) {
        setOutlierKpi(next[0]);
      }
      return next;
    });
  };

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Agent Analytics</h1>
        <p className="text-sm text-[var(--muted-fg)]">
          Compare multi-agent KPI trends, flag outliers, and inspect source lineage evidence.
        </p>
      </header>

      <section className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--muted)] p-3 text-sm">
        <div className="flex flex-wrap gap-4">
          <div>
            <p className="font-medium">Agents</p>
            {agentOptions.map((agent) => (
              <label key={agent.id} className="mr-3 inline-flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={selectedAgents.includes(agent.id)}
                  onChange={() => toggleAgent(agent.id)}
                />
                {agent.name}
              </label>
            ))}
          </div>

          <div>
            <p className="font-medium">KPIs</p>
            {kpis.map((kpi) => (
              <label key={kpi.key} className="mr-3 inline-flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={selectedKpis.includes(kpi.key)}
                  onChange={() => toggleKpi(kpi.key)}
                />
                {kpi.label}
              </label>
            ))}
          </div>

          <label className="flex flex-col gap-1">
            Outlier KPI
            <select
              className="rounded border border-[var(--border)] bg-[var(--panel)] px-2 py-1"
              value={outlierKpi}
              onChange={(event) => setOutlierKpi(event.target.value)}
            >
              {selectedKpis.map((kpiKey) => {
                const kpi = kpis.find((item) => item.key === kpiKey);
                return (
                  <option key={kpiKey} value={kpiKey}>
                    {kpi?.label ?? kpiKey}
                  </option>
                );
              })}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            Start
            <input
              type="datetime-local"
              className="rounded border border-[var(--border)] bg-[var(--panel)] px-2 py-1"
              value={startInput}
              onChange={(event) => setStartInput(event.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1">
            End
            <input
              type="datetime-local"
              className="rounded border border-[var(--border)] bg-[var(--panel)] px-2 py-1"
              value={endInput}
              onChange={(event) => setEndInput(event.target.value)}
            />
          </label>
        </div>

        {validationError && <p className="status-text-error">{validationError}</p>}
      </section>

      {error && <p className="status-text-error text-sm">{error}</p>}
      {loading && <p className="text-sm text-[var(--muted-fg)]">Loading analytics...</p>}

      {trends && (
        <section className="space-y-3 rounded-lg border border-[var(--border)] p-3">
          <h2 className="text-lg font-medium">Trend Comparison</h2>

          <div className="grid gap-3 lg:grid-cols-2">
            {trends.series.map((series) => (
              <article key={`${series.agentId}:${series.kpiKey}`} className="rounded border border-[var(--border)] bg-[var(--muted)] p-2 text-sm">
                <p className="font-medium">
                  {series.agentName} | {series.kpiLabel} ({series.unit})
                </p>
                <ul className="mt-1 space-y-1 text-xs">
                  {series.points.map((point) => (
                    <li key={point.windowEndUtc}>
                      {point.windowEndUtc}: {point.value} {point.unit}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <div className="rounded border border-[var(--border)] bg-[var(--muted)] p-2 text-xs">
            <p className="font-medium">KPI definitions</p>
            {trends.kpis.map((kpi) => (
              <p key={kpi.key}>
                {kpi.label} ({kpi.unit}): {kpi.definition} {kpi.finalized ? '' : '[Pending finalization]'}
              </p>
            ))}
          </div>
        </section>
      )}

      {outliers && (
        <section className="space-y-3 rounded-lg border border-[var(--border)] p-3">
          <h2 className="text-lg font-medium">Outliers</h2>
          {outliers.items.length === 0 && <p className="text-sm text-[var(--muted-fg)]">No outliers in selected window.</p>}

          {outliers.items.map((item) => (
            <article
              key={`${item.agentId}:${item.windowEndUtc}:${item.kpiKey}`}
              className="status-panel-error rounded p-2 text-sm"
            >
              <p className="font-medium">
                {item.agentName} | {item.kpiLabel} | score {item.score}
              </p>
              <p>
                {item.windowEndUtc}: {item.value} {item.unit} ({item.method})
              </p>
              <button
                type="button"
                className="mt-1 rounded border border-[var(--surface-error-border)] bg-[var(--panel)] px-2 py-1 text-xs"
                onClick={() => {
                  void loadLineage(item.lineageRef);
                }}
              >
                View lineage
              </button>
            </article>
          ))}

          {outliers.unavailable.length > 0 && (
            <div className="status-panel-warning rounded p-2 text-sm">
              <p className="font-medium">Unavailable calculations</p>
              {outliers.unavailable.map((item) => (
                <p key={`${item.agentId}:${item.kpiKey}`}>
                  {item.agentName} ({item.kpiKey}): {item.reason} ({item.sampleSize}/{item.minimumRequired})
                </p>
              ))}
            </div>
          )}
        </section>
      )}

      {lineage && (
        <section className="space-y-2 rounded-lg border border-[var(--border)] p-3">
          <h2 className="text-lg font-medium">Lineage Drilldown</h2>
          <p className="text-xs text-[var(--muted-fg)]">Reference: {selectedLineageRef}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded border border-[var(--border)] bg-[var(--muted)] p-2 text-sm">
              <p className="font-medium">Source events</p>
              {lineage.events.map((event) => (
                <p key={event.id} className="text-xs">
                  {event.occurredAtUtc} | {event.sourceSystem} | {event.description}
                </p>
              ))}
            </div>
            <div className="rounded border border-[var(--border)] bg-[var(--muted)] p-2 text-sm">
              <p className="font-medium">Artifacts</p>
              {lineage.artifacts.map((artifact) => (
                <p key={artifact.id} className="text-xs">
                  {artifact.type}: <a href={artifact.uri}>{artifact.title}</a>
                </p>
              ))}
            </div>
          </div>
        </section>
      )}
    </section>
  );
}
