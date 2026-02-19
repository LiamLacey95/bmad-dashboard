# Observability Dashboard and Alerts (Story 007)

## Metrics tracked
- `event_to_ui_latency_ms` (observed in WS gateway on outbound `event` messages).
- `websocket_reconnect_attempts_total` (incremented on WS `resync_request`).
- `cross_view_consistency_failures_total` (incremented during sync consistency checks).
- `sync_failures_total{module}`.
- `stale_state_active_sessions_ratio`.
- `api_request_duration_ms{route,status}`.
- `sqlite_write_lock_wait_ms`.

## Dashboard panels
1. Freshness:
- `event_to_ui_latency_ms` p50/p95/p99
- Target: p95 <= 3000ms

2. Realtime reliability:
- `websocket_reconnect_attempts_total` rate (5m)
- `stale_state_active_sessions_ratio`

3. Sync integrity:
- `sync_failures_total{module}`
- `cross_view_consistency_failures_total`

4. API and persistence:
- `api_request_duration_ms` p95 by route
- `sqlite_write_lock_wait_ms` p95

## Alert rules
- `freshness_slo_breach`:
  - Condition: `event_to_ui_latency_ms` p95 > 3000 for 10m
  - Severity: high

- `stale_session_ratio_high`:
  - Condition: `stale_state_active_sessions_ratio` > 0.20 for 5m
  - Severity: high

- `sync_failures_sustained`:
  - Condition: `sync_failures_total{module}` increases for 10m
  - Severity: high

- `consistency_regression`:
  - Condition: `cross_view_consistency_failures_total` increases for 15m
  - Severity: medium

- `sqlite_lock_contention`:
  - Condition: `sqlite_write_lock_wait_ms` p95 > 200ms for 10m
  - Severity: medium

## Notes
- `event_to_ui_latency_ms` is measured as server dispatch latency (`Date.now - occurredAt`) and is used as MVP freshness proxy.
- `websocket_reconnect_attempts_total` uses `resync_request` as reconnect signal for MVP telemetry.
