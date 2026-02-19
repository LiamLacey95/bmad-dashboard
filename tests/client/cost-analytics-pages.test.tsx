import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

describe('cost and analytics pages', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes('/api/v1/costs/summary')) {
          return {
            ok: true,
            json: async () => ({
              data: {
                window: '24h',
                start: '2026-02-18T00:00:00.000Z',
                end: '2026-02-19T00:00:00.000Z',
                aggregate: {
                  totalCost: 100.5,
                  currency: 'USD',
                  availability: 'available'
                },
                projects: [
                  {
                    projectId: 'project-core',
                    projectName: 'Core Delivery Controls',
                    totalCost: 100.5,
                    currency: 'USD',
                    availability: 'available'
                  },
                  {
                    projectId: 'project-ui',
                    projectName: 'UI Delivery Modernization',
                    totalCost: null,
                    currency: 'USD',
                    availability: 'unavailable'
                  }
                ]
              }
            })
          } as Response;
        }

        if (url.includes('/api/v1/costs/timeseries')) {
          return {
            ok: true,
            json: async () => ({
              data: {
                start: '2026-02-18T00:00:00.000Z',
                end: '2026-02-19T00:00:00.000Z',
                bucket: 'hour',
                series: [
                  {
                    scope: 'aggregate',
                    points: [
                      {
                        bucketStart: '2026-02-18T00:00:00.000Z',
                        bucketEnd: '2026-02-18T00:59:59.000Z',
                        totalCost: null,
                        availability: 'unavailable'
                      },
                      {
                        bucketStart: '2026-02-18T01:00:00.000Z',
                        bucketEnd: '2026-02-18T01:59:59.000Z',
                        totalCost: 100.5,
                        availability: 'available'
                      }
                    ]
                  }
                ]
              }
            })
          } as Response;
        }

        if (url.includes('/api/v1/meta/kpis')) {
          return {
            ok: true,
            json: async () => ({
              data: {
                items: [
                  {
                    key: 'latency_p95_ms',
                    label: 'Latency P95',
                    unit: 'ms',
                    definition: '95th percentile completion latency for agent tasks.',
                    directionality: 'lower_is_better',
                    finalized: true
                  },
                  {
                    key: 'success_rate_pct',
                    label: 'Success Rate',
                    unit: '%',
                    definition: 'Success percentage for agent tasks.',
                    directionality: 'higher_is_better',
                    finalized: true
                  }
                ],
                total: 2
              }
            })
          } as Response;
        }

        if (url.includes('/api/v1/analytics/agents/trends')) {
          return {
            ok: true,
            json: async () => ({
              data: {
                start: '2026-02-16T00:00:00.000Z',
                end: '2026-02-19T00:00:00.000Z',
                series: [
                  {
                    agentId: 'agent-alpha',
                    agentName: 'Agent Alpha',
                    kpiKey: 'latency_p95_ms',
                    kpiLabel: 'Latency P95',
                    unit: 'ms',
                    points: [
                      {
                        windowStartUtc: '2026-02-18T00:00:00.000Z',
                        windowEndUtc: '2026-02-18T23:59:59.000Z',
                        value: 630,
                        unit: 'ms',
                        lineageRef: 'lineage:outlier:agent-alpha:latency:2026-02-18'
                      }
                    ]
                  }
                ],
                kpis: [
                  {
                    key: 'latency_p95_ms',
                    label: 'Latency P95',
                    unit: 'ms',
                    definition: '95th percentile completion latency for agent tasks.',
                    directionality: 'lower_is_better',
                    finalized: true
                  }
                ]
              }
            })
          } as Response;
        }

        if (url.includes('/api/v1/analytics/agents/outliers')) {
          return {
            ok: true,
            json: async () => ({
              data: {
                start: '2026-02-16T00:00:00.000Z',
                end: '2026-02-19T00:00:00.000Z',
                kpi: 'latency_p95_ms',
                items: [
                  {
                    agentId: 'agent-alpha',
                    agentName: 'Agent Alpha',
                    kpiKey: 'latency_p95_ms',
                    kpiLabel: 'Latency P95',
                    unit: 'ms',
                    windowEndUtc: '2026-02-18T23:59:59.000Z',
                    value: 630,
                    score: 1.8,
                    method: 'zscore',
                    lineageRef: 'lineage:outlier:agent-alpha:latency:2026-02-18'
                  }
                ],
                unavailable: [
                  {
                    agentId: 'agent-gamma',
                    agentName: 'Agent Gamma',
                    kpiKey: 'latency_p95_ms',
                    reason: 'Outlier calculation requires at least 3 data points in selected window.',
                    sampleSize: 1,
                    minimumRequired: 3
                  }
                ]
              }
            })
          } as Response;
        }

        if (url.includes('/api/v1/analytics/lineage/')) {
          return {
            ok: true,
            json: async () => ({
              data: {
                lineageRef: 'lineage:outlier:agent-alpha:latency:2026-02-18',
                events: [
                  {
                    id: 'evt-1',
                    sourceSystem: 'workflow-runtime',
                    occurredAtUtc: '2026-02-18T18:44:12.000Z',
                    description: 'Regression run exceeded baseline latency threshold.'
                  }
                ],
                artifacts: [
                  {
                    id: 'doc-100',
                    type: 'document',
                    title: 'Reliability test plan',
                    uri: '/documents?documentId=doc-100'
                  }
                ]
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

        if (url.includes('/api/v1/sync/status')) {
          return {
            ok: true,
            json: async () => ({ data: { modules: [], warnings: [], checkedAtUtc: '2026-02-19T00:00:00.000Z' } })
          } as Response;
        }

        if (url.includes('/api/v1/projects')) {
          return {
            ok: true,
            json: async () => ({ data: { items: [], total: 0 } })
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
                editableModeReason: 'read-only',
                generatedAt: '2026-02-19T00:00:00.000Z',
                columns: []
              }
            })
          } as Response;
        }

        return {
          ok: true,
          json: async () => ({ data: { items: [] } })
        } as Response;
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('renders cost summary with unavailable markers', async () => {
    renderApp('/costs');

    expect(await screen.findByRole('heading', { name: 'Cost Tracking' })).toBeInTheDocument();
    expect(await screen.findByText(/Total spend:/i)).toHaveTextContent('$100.50');
    expect((await screen.findAllByText('UI Delivery Modernization')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('Unavailable')).length).toBeGreaterThan(0);
  });

  it('shows custom-window validation feedback', async () => {
    renderApp('/costs');

    await screen.findByRole('heading', { name: 'Cost Tracking' });

    fireEvent.change(screen.getByLabelText('Window'), { target: { value: 'custom' } });

    const startInput = await screen.findByLabelText('Start');
    const endInput = await screen.findByLabelText('End');

    fireEvent.change(startInput, { target: { value: '2026-02-19T10:00' } });
    fireEvent.change(endInput, { target: { value: '2026-02-19T09:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(await screen.findByText('End time must be after start time.')).toBeInTheDocument();
  });

  it('renders trend metadata, outliers, and lineage drilldown', async () => {
    renderApp('/analytics');

    expect(await screen.findByRole('heading', { name: 'Agent Analytics' })).toBeInTheDocument();
    expect(await screen.findByText(/KPI definitions/i)).toBeInTheDocument();
    expect(await screen.findByText(/Unavailable calculations/i)).toBeInTheDocument();
    expect(await screen.findByText(/score 1.8/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'View lineage' }));

    await waitFor(() => {
      expect(screen.getByText(/Lineage Drilldown/i)).toBeInTheDocument();
      expect(screen.getByText(/Source events/i)).toBeInTheDocument();
      expect(screen.getByText(/Artifacts/i)).toBeInTheDocument();
    });
  });
});
