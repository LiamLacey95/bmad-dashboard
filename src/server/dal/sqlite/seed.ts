import type { DatabaseSync } from 'node:sqlite';
import { inTransaction } from './database.js';

const now = '2026-02-19T21:00:00.000Z';

function rowCount(db: DatabaseSync, table: string): number {
  const row = db.prepare(`SELECT COUNT(1) as total FROM ${table}`).get() as { total: number };
  return row.total;
}

export function seedSqliteDemoData(db: DatabaseSync): void {
  if (rowCount(db, 'projects') > 0) {
    return;
  }

  inTransaction(db, () => {
    const insertUser = db.prepare(
      'INSERT INTO users(id, email, display_name, role, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?)'
    );
    const insertAgent = db.prepare('INSERT INTO agents(id, name, type, owner_team, created_at) VALUES(?, ?, ?, ?, ?)');

    [
      ['alice', 'alice@bmad.dev', 'Alice', 'operator', now, now],
      ['bob', 'bob@bmad.dev', 'Bob', 'operator', now, now],
      ['carol', 'carol@bmad.dev', 'Carol', 'manager', now, now],
      ['dylan', 'dylan@bmad.dev', 'Dylan', 'operator', now, now],
      ['eve', 'eve@bmad.dev', 'Eve', 'viewer', now, now],
      ['ops', 'ops@bmad.dev', 'Operations', 'manager', now, now]
    ].forEach((row) => insertUser.run(...row));

    [
      ['agent-alpha', 'Agent Alpha', 'automation', 'delivery', now],
      ['agent-beta', 'Agent Beta', 'automation', 'delivery', now],
      ['agent-gamma', 'Agent Gamma', 'automation', 'analytics', now]
    ].forEach((row) => insertAgent.run(...row));

    const insertProject = db.prepare(
      'INSERT INTO projects(id, name, owner_id, status, progress_pct, due_at, risk_flag, updated_at, description) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    [
      [
        'project-core',
        'Core Delivery Controls',
        'alice',
        'in_progress',
        50,
        '2026-02-22T18:00:00.000Z',
        1,
        now,
        'Core platform readiness and release reliability workstream.'
      ],
      [
        'project-billing',
        'Billing Reliability Hardening',
        'carol',
        'failed',
        30,
        '2026-02-18T18:00:00.000Z',
        1,
        now,
        'Stabilize billing sync and reconciliation workflows.'
      ],
      [
        'project-ui',
        'UI Delivery Modernization',
        'dylan',
        'in_progress',
        70,
        '2026-02-28T18:00:00.000Z',
        0,
        now,
        'Improve dashboard UX quality and consistency.'
      ]
    ].forEach((row) => insertProject.run(...row));

    const insertStory = db.prepare(
      'INSERT INTO stories(id, project_id, title, owner_id, status, kanban_column, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?)'
    );
    [
      ['story-301', 'project-core', 'Stale signal reliability checks', 'alice', 'blocked', 'blocked', '2026-02-19T20:40:00.000Z'],
      ['story-302', 'project-core', 'Workflow replay backfill', 'bob', 'done', 'done', '2026-02-19T20:20:00.000Z'],
      ['story-401', 'project-billing', 'Billing schema migration', 'carol', 'failed', 'failed', '2026-02-19T19:55:00.000Z'],
      ['story-501', 'project-ui', 'Responsive table accessibility', 'dylan', 'done', 'done', '2026-02-19T18:40:00.000Z'],
      ['story-502', 'project-ui', 'Kanban read-only indicator', 'eve', 'in_progress', 'in_progress', '2026-02-19T20:10:00.000Z']
    ].forEach((row) => insertStory.run(...row));

    const insertWorkflow = db.prepare(
      'INSERT INTO workflows(id, project_id, story_id, name, owner_id, status, last_transition_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)'
    );
    [
      ['wf-1001', 'project-core', 'story-302', 'Release QA Pipeline', 'alice', 'in_progress', '2026-02-19T19:45:00.000Z', now],
      ['wf-1002', 'project-core', 'story-301', 'Nightly Regression', 'bob', 'blocked', '2026-02-19T19:20:00.000Z', now],
      ['wf-1003', 'project-billing', 'story-401', 'Billing Data Sync', 'carol', 'failed', '2026-02-19T18:55:00.000Z', now],
      ['wf-1004', 'project-ui', 'story-501', 'Design Token Export', 'dylan', 'done', '2026-02-19T17:35:00.000Z', now],
      ['wf-empty', 'project-ui', null, 'Sandbox Runner', 'eve', 'queued', '2026-02-19T15:02:00.000Z', now]
    ].forEach((row) => insertWorkflow.run(...row));

    const insertTransition = db.prepare(
      'INSERT INTO workflow_transitions(id, workflow_id, from_status, to_status, occurred_at_utc, actor_id, reason) VALUES(?, ?, ?, ?, ?, ?, ?)'
    );
    [
      ['wt-1', 'wf-1001', 'queued', 'in_progress', '2026-02-19T18:40:00.000Z', 'alice', 'Picked up by runner'],
      ['wt-2', 'wf-1002', 'queued', 'in_progress', '2026-02-19T18:20:00.000Z', 'bob', 'Execution started'],
      ['wt-3', 'wf-1002', 'in_progress', 'blocked', '2026-02-19T19:20:00.000Z', 'bob', 'Waiting on external approval'],
      ['wt-4', 'wf-1003', 'queued', 'in_progress', '2026-02-19T18:30:00.000Z', 'carol', 'Started ingestion'],
      ['wt-5', 'wf-1003', 'in_progress', 'failed', '2026-02-19T18:55:00.000Z', 'carol', 'Schema mismatch'],
      ['wt-6', 'wf-1004', 'in_progress', 'done', '2026-02-19T17:35:00.000Z', 'dylan', 'Artifact published']
    ].forEach((row) => insertTransition.run(...row));

    const insertDocument = db.prepare(
      'INSERT INTO documents(id, project_id, story_id, title, mime_type, storage_path, checksum, created_at, content, content_base64, is_available) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    [
      [
        'doc-100',
        'project-core',
        'story-301',
        'Reliability test plan',
        'application/pdf',
        '/artifacts/project-core/reliability-test-plan.pdf',
        'sha256:8d5f1f2e4e8b0a1a',
        '2026-02-18T18:10:00.000Z',
        null,
        'JVBERi0xLjQKJcTl8uXrPgox',
        1
      ],
      [
        'doc-101',
        'project-core',
        null,
        'Incident runbook',
        'text/markdown',
        '/artifacts/project-core/incident-runbook.md',
        'sha256:c4a5f6a70a24c221',
        '2026-02-18T16:20:00.000Z',
        '# Incident Runbook',
        null,
        1
      ],
      [
        'doc-200',
        'project-billing',
        'story-401',
        'Billing schema notes',
        'application/json',
        '/artifacts/project-billing/billing-schema-notes.json',
        'sha256:b2dd78fa2d4714ad',
        '2026-02-17T12:00:00.000Z',
        '{"migrationId":"billing-2026-02-17"}',
        null,
        1
      ]
    ].forEach((row) => insertDocument.run(...row));

    const insertSync = db.prepare(
      'INSERT INTO sync_state(id, module, last_successful_sync_at_utc, last_attempt_at_utc, status, error_message, stale_reason) VALUES(?, ?, ?, ?, ?, ?, ?)'
    );
    [
      ['sync-project', 'project', now, now, 'ok', null, null],
      ['sync-story', 'story', now, now, 'ok', null, null],
      ['sync-workflow', 'workflow', now, now, 'ok', null, null],
      ['sync-cost', 'cost', now, now, 'syncing', null, 'awaiting_projection_job'],
      ['sync-analytics', 'analytics', now, now, 'syncing', null, 'awaiting_projection_job'],
      ['sync-documents', 'documents', now, now, 'ok', null, null],
      ['sync-kanban', 'kanban', now, now, 'ok', null, null],
      ['sync-sync', 'sync', now, now, 'ok', null, null]
    ].forEach((row) => insertSync.run(...row));

    const insertCost = db.prepare(
      'INSERT INTO cost_events(id, project_id, workflow_id, agent_id, cost_amount, currency, occurred_at_utc, source_event_id) VALUES(?, ?, ?, ?, ?, ?, ?, ?)'
    );
    [
      ['cost-1', 'project-core', 'wf-1001', 'agent-alpha', 42.1, 'USD', '2026-02-19T04:00:00.000Z', null],
      ['cost-2', 'project-core', 'wf-1002', 'agent-beta', 58.4, 'USD', '2026-02-19T10:00:00.000Z', null],
      ['cost-3', 'project-billing', 'wf-1003', 'agent-alpha', 37.25, 'USD', '2026-02-18T13:00:00.000Z', null],
      ['cost-4', 'project-ui', 'wf-1004', 'agent-gamma', 22.5, 'USD', '2026-02-17T15:00:00.000Z', null],
      ['cost-5', 'project-core', 'wf-1002', 'agent-beta', 49.75, 'USD', '2026-02-16T08:00:00.000Z', null],
      ['cost-6', 'project-billing', 'wf-1003', 'agent-alpha', 41.95, 'USD', '2026-02-12T09:00:00.000Z', null]
    ].forEach((row) => insertCost.run(...row));

    const insertMetric = db.prepare(
      'INSERT INTO agent_metrics(id, agent_id, kpi_key, kpi_value, unit, window_start_utc, window_end_utc, lineage_ref) VALUES(?, ?, ?, ?, ?, ?, ?, ?)'
    );
    [
      ['metric-1', 'agent-alpha', 'latency_p95_ms', 320, 'ms', '2026-02-16T00:00:00.000Z', '2026-02-16T23:59:59.000Z', 'lineage:metric:agent-alpha:latency:2026-02-16'],
      ['metric-2', 'agent-alpha', 'latency_p95_ms', 305, 'ms', '2026-02-17T00:00:00.000Z', '2026-02-17T23:59:59.000Z', 'lineage:metric:agent-alpha:latency:2026-02-17'],
      ['metric-3', 'agent-alpha', 'latency_p95_ms', 630, 'ms', '2026-02-18T00:00:00.000Z', '2026-02-18T23:59:59.000Z', 'lineage:outlier:agent-alpha:latency:2026-02-18'],
      ['metric-4', 'agent-alpha', 'success_rate_pct', 96, '%', '2026-02-17T00:00:00.000Z', '2026-02-17T23:59:59.000Z', 'lineage:metric:agent-alpha:success:2026-02-17'],
      ['metric-5', 'agent-beta', 'latency_p95_ms', 410, 'ms', '2026-02-16T00:00:00.000Z', '2026-02-16T23:59:59.000Z', 'lineage:metric:agent-beta:latency:2026-02-16'],
      ['metric-6', 'agent-beta', 'latency_p95_ms', 420, 'ms', '2026-02-17T00:00:00.000Z', '2026-02-17T23:59:59.000Z', 'lineage:metric:agent-beta:latency:2026-02-17'],
      ['metric-7', 'agent-beta', 'latency_p95_ms', 405, 'ms', '2026-02-18T00:00:00.000Z', '2026-02-18T23:59:59.000Z', 'lineage:metric:agent-beta:latency:2026-02-18'],
      ['metric-8', 'agent-beta', 'success_rate_pct', 92, '%', '2026-02-17T00:00:00.000Z', '2026-02-17T23:59:59.000Z', 'lineage:metric:agent-beta:success:2026-02-17'],
      ['metric-9', 'agent-gamma', 'latency_p95_ms', 390, 'ms', '2026-02-18T00:00:00.000Z', '2026-02-18T23:59:59.000Z', 'lineage:metric:agent-gamma:latency:2026-02-18']
    ].forEach((row) => insertMetric.run(...row));

    db.prepare(
      'INSERT INTO agent_outliers(id, agent_metric_id, score, method, flagged_at_utc, lineage_ref) VALUES(?, ?, ?, ?, ?, ?)'
    ).run('outlier-1', 'metric-3', 2.87, 'z_score', '2026-02-18T23:59:59.000Z', 'lineage:outlier:agent-alpha:latency:2026-02-18');

    const insertLineage = db.prepare('INSERT INTO lineage_refs(id, lineage_ref, payload_json, created_at_utc) VALUES(?, ?, ?, ?)');
    insertLineage.run(
      'lineage-1',
      'lineage:outlier:agent-alpha:latency:2026-02-18',
      JSON.stringify({
        lineageRef: 'lineage:outlier:agent-alpha:latency:2026-02-18',
        events: [
          {
            id: 'evt-latency-alpha-2026-02-18-1',
            sourceSystem: 'workflow-runtime',
            occurredAtUtc: '2026-02-18T18:44:12.000Z',
            description: 'Regression run exceeded baseline latency threshold for agent alpha.'
          }
        ],
        artifacts: [{ id: 'wf-1002', type: 'workflow', title: 'Nightly Regression', uri: '/workflows?workflowId=wf-1002' }]
      }),
      now
    );
  });
}
